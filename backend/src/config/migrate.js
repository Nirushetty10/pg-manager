require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");
const bcrypt = require("bcryptjs");

// Run a single SQL statement, log errors but continue
async function runSQL(client, sql, label) {
  const stmt = sql.trim();
  if (!stmt) return;
  try {
    await client.query(stmt);
  } catch (err) {
    // Ignore "already exists" type errors for idempotent runs
    if (err.code === "42P07" || err.code === "42710" || err.code === "23505") {
      // duplicate_table, duplicate_object, unique_violation — safe to skip
      return;
    }
    console.error(`❌ Error in [${label}]: ${err.message}`);
    console.error("   SQL:", stmt.substring(0, 120));
    throw err;
  }
}

async function createIndexes(client) {
  const indexes = [
    {
      name: "idx_pgs_owner",
      sql: "CREATE INDEX IF NOT EXISTS idx_pgs_owner ON pgs(owner_id)",
    },
    {
      name: "idx_rooms_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_rooms_pg ON rooms(pg_id)",
    },
    {
      name: "idx_beds_room",
      sql: "CREATE INDEX IF NOT EXISTS idx_beds_room ON beds(room_id)",
    },
    {
      name: "idx_beds_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_beds_pg ON beds(pg_id)",
    },
    {
      name: "idx_pg_tenants_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_pg_tenants_pg ON pg_tenants(pg_id)",
    },
    {
      name: "idx_pg_tenants_room",
      sql: "CREATE INDEX IF NOT EXISTS idx_pg_tenants_room ON pg_tenants(room_id)",
    },
    {
      name: "idx_payments_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_payments_pg ON payments(pg_id)",
    },
    {
      name: "idx_payments_tenant",
      sql: "CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(pg_tenant_id)",
    },
    {
      name: "idx_expenses_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_expenses_pg ON expenses(pg_id)",
    },
    {
      name: "idx_maintenance_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_maintenance_pg ON maintenance_requests(pg_id)",
    },
    {
      name: "idx_role_perms",
      sql: "CREATE INDEX IF NOT EXISTS idx_role_perms ON role_permissions(pg_id, role)",
    },
    {
      name: "idx_invites_token",
      sql: "CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token)",
    },
    {
      name: "idx_activity_pg",
      sql: "CREATE INDEX IF NOT EXISTS idx_activity_pg ON activity_logs(pg_id)",
    },
  ];

  for (const idx of indexes) {
    await runSQL(client, idx.sql, idx.name);
  }
}

async function createTriggers(client) {
  // Create the function first
  await runSQL(
    client,
    `
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql
  `,
    "update_updated_at_fn",
  );

  // Drop and recreate triggers (compatible with PG 12+)
  const tables = ["owners", "pgs", "rooms", "pg_tenants", "expenses"];
  for (const t of tables) {
    // Drop if exists (safe), then create
    await runSQL(
      client,
      `DROP TRIGGER IF EXISTS trg_${t}_upd ON ${t}`,
      `drop_trigger_${t}`,
    );
    await runSQL(
      client,
      `CREATE TRIGGER trg_${t}_upd BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
      `trigger_${t}`,
    );
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🚀 Running migrations...");

    // Read and split schema into individual statements
    const schemaSql = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8",
    );

    // Split on semicolons, filter empty lines and comments
    await client.query("BEGIN");

    await client.query(schemaSql);

    console.log("✅ Tables created");

    // Create indexes separately
    await createIndexes(client);
    console.log("✅ Indexes created");

    // Create triggers separately
    await createTriggers(client);
    console.log("✅ Triggers created");

    // ── SEED DATA ────────────────────────────────────────────
    console.log("🌱 Seeding data...");

    // Master Admin
    const adminHash = await bcrypt.hash("admin123", 12);
    await client.query(
      `
      INSERT INTO master_admins (name, email, password)
      VALUES ('Master Admin', 'admin@pgplatform.com', $1)
      ON CONFLICT (email) DO NOTHING
    `,
      [adminHash],
    );

    // Owner
    const ownerHash = await bcrypt.hash("owner123", 12);
    const ownerRes = await client.query(
      `
      INSERT INTO owners (name, email, phone, password, invite_accepted, is_active)
      VALUES ('Ravi Kumar', 'ravi@grandpg.com', '9876543210', $1, TRUE, TRUE)
      ON CONFLICT (email) DO NOTHING RETURNING id
    `,
      [ownerHash],
    );

    let ownerId = ownerRes.rows[0]?.id;
    if (!ownerId) {
      const r = await client.query(
        `SELECT id FROM owners WHERE email = 'ravi@grandpg.com'`,
      );
      ownerId = r.rows[0]?.id;
    }
    if (!ownerId) throw new Error("Could not get owner id");

    // PG
    const pgRes = await client.query(
      `
      INSERT INTO pgs (owner_id, name, city, address, phone, email, total_rooms, total_beds, is_active)
      VALUES ($1, 'The Grand PG', 'Bangalore', '123 MG Road, Bangalore', '9876543210', 'ravi@grandpg.com', 7, 14, TRUE)
      ON CONFLICT DO NOTHING RETURNING id
    `,
      [ownerId],
    );

    let pgId = pgRes.rows[0]?.id;
    if (!pgId) {
      const r = await client.query(
        `SELECT id FROM pgs WHERE owner_id = $1 ORDER BY created_at LIMIT 1`,
        [ownerId],
      );
      pgId = r.rows[0]?.id;
    }
    if (!pgId) throw new Error("Could not get pg id");

    // Default permissions
    const PERMS = [
      "view_dashboard",
      "manage_tenants",
      "manage_rooms",
      "record_payments",
      "manage_expenses",
      "view_reports",
      "manage_staff",
      "system_settings",
    ];
    const DEFAULTS = {
      manager: {
        view_dashboard: true,
        manage_tenants: true,
        manage_rooms: true,
        record_payments: true,
        manage_expenses: true,
        view_reports: true,
        manage_staff: false,
        system_settings: false,
      },
      staff: {
        view_dashboard: true,
        manage_tenants: false,
        manage_rooms: false,
        record_payments: true,
        manage_expenses: false,
        view_reports: false,
        manage_staff: false,
        system_settings: false,
      },
    };
    for (const role of ["manager", "staff"]) {
      for (const perm of PERMS) {
        await client.query(
          `
          INSERT INTO role_permissions (pg_id, role, permission, allowed)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (pg_id, role, permission) DO NOTHING
        `,
          [pgId, role, perm, DEFAULTS[role][perm] || false],
        );
      }
    }

    // Rooms
    const roomsData = [
      {
        number: "A-101",
        floor: 1,
        type: "single",
        rent: 8000,
        beds: 1,
        amenities: ["AC", "WIFI"],
      },
      {
        number: "A-102",
        floor: 1,
        type: "single",
        rent: 8000,
        beds: 1,
        amenities: ["WIFI"],
      },
      {
        number: "A-105",
        floor: 1,
        type: "double",
        rent: 12000,
        beds: 2,
        amenities: ["AC", "WIFI"],
      },
      {
        number: "B-201",
        floor: 2,
        type: "double",
        rent: 12000,
        beds: 2,
        amenities: ["AC"],
      },
      {
        number: "B-204",
        floor: 2,
        type: "single",
        rent: 9000,
        beds: 1,
        amenities: ["AC", "WIFI"],
      },
      {
        number: "C-301",
        floor: 3,
        type: "triple",
        rent: 18000,
        beds: 3,
        amenities: ["WIFI"],
      },
      {
        number: "C-302",
        floor: 3,
        type: "deluxe",
        rent: 22000,
        beds: 2,
        amenities: ["AC", "WIFI", "ATTACHED_BATH"],
      },
    ];

    const roomIds = {};
    for (const r of roomsData) {
      const res = await client.query(
        `
        INSERT INTO rooms (pg_id, room_number, floor, room_type, monthly_rent, total_beds, amenities, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'occupied')
        ON CONFLICT (pg_id, room_number) DO NOTHING RETURNING id
      `,
        [pgId, r.number, r.floor, r.type, r.rent, r.beds, r.amenities],
      );

      let rid = res.rows[0]?.id;
      if (!rid) {
        const x = await client.query(
          `SELECT id FROM rooms WHERE pg_id=$1 AND room_number=$2`,
          [pgId, r.number],
        );
        rid = x.rows[0]?.id;
      }
      if (rid) {
        roomIds[r.number] = rid;
        for (const label of ["A", "B", "C"].slice(0, r.beds)) {
          await client.query(
            `
            INSERT INTO beds (room_id, pg_id, bed_label, status)
            VALUES ($1,$2,$3,'occupied')
            ON CONFLICT (room_id, bed_label) DO NOTHING
          `,
            [rid, pgId, label],
          );
        }
      }
    }

    // Tenants
    const tenantsData = [
      {
        name: "Jordan Smith",
        phone: "9111111111",
        email: "jordan@email.com",
        room: "B-204",
        bed: "A",
        rent: 9000,
        joining: "2023-10-12",
      },
      {
        name: "Elena Rodriguez",
        phone: "9111111112",
        email: "elena@email.com",
        room: "A-102",
        bed: "A",
        rent: 8000,
        joining: "2023-10-15",
      },
      {
        name: "Marcus Thorne",
        phone: "9111111113",
        email: "marcus@email.com",
        room: "C-301",
        bed: "A",
        rent: 14500,
        joining: "2024-01-12",
      },
      {
        name: "Sarah Jenkins",
        phone: "9111111114",
        email: "sarah@email.com",
        room: "A-101",
        bed: "A",
        rent: 9000,
        joining: "2023-12-15",
      },
      {
        name: "Rohan Sharma",
        phone: "9111111115",
        email: "rohan@email.com",
        room: "C-302",
        bed: "A",
        rent: 14500,
        joining: "2023-09-01",
      },
    ];

    for (const t of tenantsData) {
      // Global profile
      const profRes = await client.query(
        `
        INSERT INTO tenant_profiles (name, phone, email, invite_accepted)
        VALUES ($1,$2,$3,TRUE)
        ON CONFLICT (phone) DO NOTHING RETURNING id
      `,
        [t.name, t.phone, t.email],
      );

      let profId = profRes.rows[0]?.id;
      if (!profId) {
        const x = await client.query(
          `SELECT id FROM tenant_profiles WHERE phone=$1`,
          [t.phone],
        );
        profId = x.rows[0]?.id;
      }

      const roomId = roomIds[t.room];
      let bedId = null;
      if (roomId) {
        const b = await client.query(
          `SELECT id FROM beds WHERE room_id=$1 AND bed_label=$2`,
          [roomId, t.bed],
        );
        bedId = b.rows[0]?.id;
      }

      await client.query(
        `
        INSERT INTO pg_tenants (pg_id, tenant_profile_id, name, phone, email, room_id, bed_id, joining_date, monthly_rent, deposit, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,10000,'active')
        ON CONFLICT (pg_id, phone) DO NOTHING
      `,
        [
          pgId,
          profId,
          t.name,
          t.phone,
          t.email,
          roomId,
          bedId,
          t.joining,
          t.rent,
        ],
      );
    }

    // Payments
    const allTenants = await client.query(
      `SELECT id FROM pg_tenants WHERE pg_id=$1 LIMIT 5`,
      [pgId],
    );
    let recNum = 9001;
    for (const t of allTenants.rows) {
      await client.query(
        `
        INSERT INTO payments (pg_id, pg_tenant_id, receipt_number, amount, payment_date, month, payment_mode, status)
        VALUES ($1,$2,$3,$4,CURRENT_DATE,'Mar-2025','upi','settled')
      `,
        [pgId, t.id, `#REC-${recNum++}`, 12000],
      );
    }

    // Expenses
    const expensesData = [
      [
        "Electricity Bill",
        "Invoice #29841",
        "electricity",
        840.5,
        "2025-03-24",
        "paid",
      ],
      ["Water Supply", "Monthly", "water", 120, "2025-03-22", "paid"],
      [
        "Staff Salaries",
        "4 Personnel",
        "salaries",
        2400,
        "2025-03-20",
        "processing",
      ],
      [
        "Kitchen Plumbing Repair",
        "Unit 402",
        "repairs",
        450,
        "2025-03-18",
        "paid",
      ],
      [
        "Housekeeping Supplies",
        "Bulk Purchase",
        "cleaning",
        185,
        "2025-03-15",
        "paid",
      ],
    ];
    for (const e of expensesData) {
      await client.query(
        `
        INSERT INTO expenses (pg_id, description, sub_description, category, amount, expense_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
        [pgId, ...e],
      );
    }

    // Maintenance
    await client.query(
      `
      INSERT INTO maintenance_requests (pg_id, title, priority, status)
      VALUES ($1,'AC Unit - Water Leakage','urgent','open'), ($1,'Faulty Light Fixture','normal','open')
    `,
      [pgId],
    );

    // Activity log
    await client.query(
      `
      INSERT INTO activity_logs (pg_id, action, entity_type, performed_by_name, performed_by_role)
      VALUES ($1,'System initialized','system','System','system')
    `,
      [pgId],
    );

    console.log("✅ Seed data inserted");
    console.log("\n📌 Login Credentials:");
    console.log("   Master Admin : admin@pgplatform.com / admin123");
    console.log("   Owner        : ravi@grandpg.com / owner123");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
