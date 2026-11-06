/**
 * Database migration + seed.
 *
 *   npm run migrate                       (development: schema + demo data)
 *   NODE_ENV=production npm run migrate   (schema + master admin only)
 *
 * Guarantees
 *  - Everything runs in ONE transaction: it either fully succeeds or leaves the
 *    database exactly as it was.
 *  - Safe to run any number of times (idempotent); an advisory lock stops two
 *    migrations from running at the same time.
 *  - Never drops/truncates tables or overwrites existing rows. Existing
 *    databases are only extended (see schema.sql).
 *  - Production seeds ONLY the master admin taken from the environment.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");
const bcrypt = require("bcryptjs");

const MIGRATION_LOCK_ID = 724_001; // arbitrary constant for pg_advisory_xact_lock

const REQUIRED_TABLES = [
  "master_admins", "owners", "pgs", "pg_staff", "role_permissions", "rooms",
  "beds", "tenant_profiles", "pg_tenants", "payments", "expenses", "invites",
  "activity_logs",
];
const REQUIRED_TRIGGERS = [
  "trg_owners_upd", "trg_pgs_upd", "trg_pg_staff_upd", "trg_rooms_upd",
  "trg_tenant_profiles_upd", "trg_pg_tenants_upd", "trg_payments_upd", "trg_expenses_upd",
];
const REQUIRED_INDEXES = [
  "idx_pgs_owner", "idx_rooms_pg", "idx_beds_room", "idx_beds_pg", "idx_pg_tenants_pg",
  "idx_pg_tenants_room", "idx_payments_pg", "idx_payments_tenant", "idx_expenses_pg",
  "idx_role_perms", "idx_invites_token", "idx_activity_pg",
];

const PERMS = [
  "view_dashboard", "manage_tenants", "manage_rooms", "record_payments",
  "manage_expenses", "view_reports", "manage_staff", "system_settings",
];
// [can_view, can_create] — same defaults as migrate_v3 / createPG
const DEFAULT_PERMS = {
  manager: {
    view_dashboard: [true, true], manage_tenants: [true, true], manage_rooms: [true, true],
    record_payments: [true, true], manage_expenses: [true, true], view_reports: [true, false],
    manage_staff: [false, false], system_settings: [false, false],
  },
  staff: {
    view_dashboard: [true, false], manage_tenants: [true, false], manage_rooms: [true, false],
    record_payments: [true, true], manage_expenses: [false, false], view_reports: [false, false],
    manage_staff: [false, false], system_settings: [false, false],
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────
const addMonths = (isoFirstOfMonth, n) => {
  const [y, m] = isoFirstOfMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

async function verifySchema(client) {
  const t = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
  );
  const have = new Set(t.rows.map((r) => r.table_name));
  const missingTables = REQUIRED_TABLES.filter((x) => !have.has(x));

  const tr = await client.query(
    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal",
  );
  const haveTr = new Set(tr.rows.map((r) => r.tgname));
  const missingTriggers = REQUIRED_TRIGGERS.filter((x) => !haveTr.has(x));

  const ix = await client.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()",
  );
  const haveIx = new Set(ix.rows.map((r) => r.indexname));
  const missingIndexes = REQUIRED_INDEXES.filter((x) => !haveIx.has(x));

  const fnNames = await client.query(
    "SELECT proname FROM pg_proc WHERE proname IN ('next_receipt_number','update_updated_at')",
  );
  const missingFns = ["next_receipt_number", "update_updated_at"].filter(
    (f) => !fnNames.rows.some((r) => r.proname === f),
  );

  const problems = [
    ...missingTables.map((x) => `table ${x}`),
    ...missingTriggers.map((x) => `trigger ${x}`),
    ...missingIndexes.map((x) => `index ${x}`),
    ...missingFns.map((x) => `function ${x}()`),
  ];
  if (problems.length)
    throw new Error("Schema verification failed, missing: " + problems.join(", "));

  // The function must be callable with no arguments. (Checked through the
  // catalog - calling it would consume a receipt number on every migration.)
  const callable = await client.query(
    "SELECT to_regprocedure('next_receipt_number()') IS NOT NULL AS ok",
  );
  if (!callable.rows[0].ok)
    throw new Error("Schema verification failed: next_receipt_number() is not callable");
}

// ── seeding ──────────────────────────────────────────────────────────────────
async function seedMasterAdmin(client, isProd) {
  const email = isProd ? process.env.MASTER_ADMIN_EMAIL : "admin@pgplatform.com";
  const password = isProd ? process.env.MASTER_ADMIN_PASSWORD : "admin123";
  if (isProd && (!email || !password || password.length < 10))
    throw new Error(
      "In production set MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD (min 10 chars) before running migrate",
    );
  const hash = await bcrypt.hash(password, 12);
  const r = await client.query(
    `INSERT INTO master_admins (name, email, password)
     VALUES ('Master Admin', $1, $2)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash],
  );
  return { email, created: r.rowCount > 0 };
}

async function seedDemo(client) {
  // Owner ---------------------------------------------------------------
  const ownerHash = await bcrypt.hash("owner123", 12);
  await client.query(
    `INSERT INTO owners (name, email, phone, password, invite_accepted, is_active)
     VALUES ('Ravi Kumar', 'ravi@grandpg.com', '9876543210', $1, TRUE, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [ownerHash],
  );
  const ownerId = (await client.query("SELECT id FROM owners WHERE email='ravi@grandpg.com'")).rows[0]?.id;
  if (!ownerId) throw new Error("Could not get demo owner id");

  // PG (select first: pgs has no natural unique key, so ON CONFLICT would never fire)
  let pgId = (await client.query(
    "SELECT id FROM pgs WHERE owner_id=$1 AND name='The Grand PG' ORDER BY created_at LIMIT 1", [ownerId],
  )).rows[0]?.id;
  let freshPg = false;
  if (!pgId) {
    pgId = (await client.query(
      `INSERT INTO pgs (owner_id, name, city, address, phone, email, description, pg_type, amenities_list, is_active)
       VALUES ($1,'The Grand PG','Bangalore','123 MG Road, Bangalore','9876543210','ravi@grandpg.com',
               'Comfortable co-living PG close to MG Road metro.', 'mixed', ARRAY['WIFI','AC','LAUNDRY','FOOD'], TRUE)
       RETURNING id`, [ownerId],
    )).rows[0].id;
    freshPg = true;
  }

  // Permissions ----------------------------------------------------------
  for (const role of ["manager", "staff"])
    for (const perm of PERMS) {
      const [v, c] = DEFAULT_PERMS[role][perm];
      await client.query(
        `INSERT INTO role_permissions (pg_id, role, permission, allowed, can_view, can_create)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (pg_id, role, permission) DO NOTHING`,
        [pgId, role, perm, v, v, c],
      );
    }

  // Demo staff logins ----------------------------------------------------
  const staff = [
    ["Meera Manager", "manager@grandpg.com", "manager123", "manager"],
    ["Sunil Staff", "staff@grandpg.com", "staff12345", "staff"],
  ];
  for (const [name, email, pw, role] of staff)
    await client.query(
      `INSERT INTO pg_staff (pg_id, name, email, password, role) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO NOTHING`,
      [pgId, name, email, await bcrypt.hash(pw, 12), role],
    );

  // Rooms + beds (all start available; occupancy is synced after tenants) ----
  const rooms = [
    ["A-101", 1, "single", 9000, 1, ["AC", "WIFI"]],
    ["A-102", 1, "single", 8000, 1, ["WIFI"]],
    ["A-105", 1, "double", 12000, 2, ["AC", "WIFI"]],
    ["B-201", 2, "double", 12000, 2, ["AC"]],
    ["B-204", 2, "single", 9000, 1, ["AC", "WIFI"]],
    ["C-301", 3, "triple", 18000, 3, ["WIFI"]],
    ["C-302", 3, "deluxe", 22000, 2, ["AC", "WIFI", "ATTACHED_BATH"]],
  ];
  const roomIds = {};
  for (const [number, floor, type, rent, beds, amenities] of rooms) {
    await client.query(
      `INSERT INTO rooms (pg_id, room_number, floor, room_type, monthly_rent, total_beds, amenities, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'available') ON CONFLICT (pg_id, room_number) DO NOTHING`,
      [pgId, number, floor, type, rent, beds, amenities],
    );
    const rid = (await client.query("SELECT id FROM rooms WHERE pg_id=$1 AND room_number=$2", [pgId, number])).rows[0].id;
    roomIds[number] = rid;
    for (const label of ["A", "B", "C", "D"].slice(0, beds))
      await client.query(
        `INSERT INTO beds (room_id, pg_id, bed_label, status) VALUES ($1,$2,$3,'available')
         ON CONFLICT (room_id, bed_label) DO NOTHING`,
        [rid, pgId, label],
      );
  }

  // Dates are relative to "today" so ledgers/dashboards look realistic ------
  const { cur, today } = (await client.query(
    `SELECT to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') AS cur,
            to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`,
  )).rows[0];

  // Tenants --------------------------------------------------------------
  // scenario: paid | partial_current | due_current | missed_previous
  const tenants = [
    { name: "Jordan Smith",    phone: "9111111111", email: "jordan@email.com", gender: "male",   room: "B-204", rent: 9000,  back: 5, scenario: "paid" },
    { name: "Elena Rodriguez", phone: "9111111112", email: "elena@email.com",  gender: "female", room: "A-102", rent: 8000,  back: 4, scenario: "partial_current" },
    { name: "Marcus Thorne",   phone: "9111111113", email: "marcus@email.com", gender: "male",   room: "C-301", rent: 14500, back: 3, scenario: "due_current" },
    { name: "Sarah Jenkins",   phone: "9111111114", email: "sarah@email.com",  gender: "female", room: "A-101", rent: 9000,  back: 2, scenario: "missed_previous" },
    { name: "Rohan Sharma",    phone: "9111111115", email: "rohan@email.com",  gender: "male",   room: "C-302", rent: 14500, back: 6, scenario: "paid" },
  ];
  const tenantRows = [];
  for (const t of tenants) {
    await client.query(
      `INSERT INTO tenant_profiles (name, phone, email, gender, invite_accepted)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (phone) DO NOTHING`,
      [t.name, t.phone, t.email, t.gender],
    );
    const profId = (await client.query("SELECT id FROM tenant_profiles WHERE phone=$1", [t.phone])).rows[0].id;
    const roomId = roomIds[t.room];
    const bedId = (await client.query("SELECT id FROM beds WHERE room_id=$1 AND bed_label='A'", [roomId])).rows[0]?.id;
    const joining = addDays(addMonths(cur, -t.back), 10);
    const ins = await client.query(
      `INSERT INTO pg_tenants (pg_id, tenant_profile_id, name, phone, email, gender, room_id, bed_id,
                               joining_date, monthly_rent, deposit, status, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,10000,'active','due')
       ON CONFLICT (pg_id, phone) DO NOTHING RETURNING id`,
      [pgId, profId, t.name, t.phone, t.email, t.gender, roomId, bedId, joining, t.rent],
    );
    const id = ins.rows[0]?.id
      || (await client.query("SELECT id FROM pg_tenants WHERE pg_id=$1 AND phone=$2", [pgId, t.phone])).rows[0].id;
    tenantRows.push({ ...t, id, joining, isNew: ins.rowCount > 0 });
  }

  // Sync bed / room occupancy with the demo tenants (demo PG only) --------
  await client.query(
    `UPDATE beds SET status = CASE WHEN id IN
        (SELECT bed_id FROM pg_tenants WHERE pg_id=$1 AND status='active' AND bed_id IS NOT NULL)
        THEN 'occupied' ELSE 'available' END
     WHERE pg_id=$1`, [pgId]);
  await client.query(
    `UPDATE rooms r SET status = CASE WHEN EXISTS
        (SELECT 1 FROM beds b WHERE b.room_id=r.id AND b.status='occupied') THEN 'occupied' ELSE 'available' END
     WHERE r.pg_id=$1`, [pgId]);
  await client.query(
    `UPDATE pgs SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE pg_id=$1),
                    total_beds  = (SELECT COUNT(*) FROM beds  WHERE pg_id=$1)
     WHERE id=$1`, [pgId]);

  // Payments: only when the demo PG has none yet (re-runs never duplicate) ---
  const hasPayments = (await client.query("SELECT 1 FROM payments WHERE pg_id=$1 LIMIT 1", [pgId])).rowCount > 0;
  if (!hasPayments) {
    const modes = ["upi", "cash", "bank_transfer"];
    let k = 0;
    for (const t of tenantRows) {
      let currentPaid = 0;
      for (let m = -t.back; m <= 0; m++) {
        const month = addMonths(cur, m);
        let paid = t.rent;
        if (t.scenario === "partial_current" && m === 0) paid = Math.round(t.rent / 2);
        if (t.scenario === "due_current" && m === 0) paid = 0;
        if (t.scenario === "missed_previous" && m === -1) paid = 0;
        if (m === -t.back) paid = t.rent; // first month always paid
        if (m === 0) currentPaid = paid;
        if (paid <= 0) continue;
        let payDate = addDays(month, 4);
        if (payDate > today) payDate = today;
        const receipt = (await client.query("SELECT next_receipt_number() AS r")).rows[0].r;
        await client.query(
          `INSERT INTO payments (pg_id, pg_tenant_id, receipt_number, amount, paid_amount, balance_due,
                                 is_partial, payment_date, month, payment_mode, status)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'settled')`,
          [pgId, t.id, receipt, paid, Math.max(0, t.rent - paid), paid < t.rent, payDate, month, modes[k++ % 3]],
        );
      }
      const status = currentPaid >= t.rent ? "paid" : currentPaid > 0 ? "partial" : "due";
      await client.query("UPDATE pg_tenants SET payment_status=$1 WHERE id=$2", [status, t.id]);
    }
  }

  // Expenses: only when the demo PG has none yet -----------------------------
  const hasExpenses = (await client.query("SELECT 1 FROM expenses WHERE pg_id=$1 LIMIT 1", [pgId])).rowCount > 0;
  if (!hasExpenses) {
    const expenses = [
      ["Electricity Bill", "Invoice #29841", "electricity", 8405.5, 3, "paid"],
      ["Water Supply", "Monthly tanker", "water", 1200, 5, "paid"],
      ["Staff Salaries", "4 Personnel", "salaries", 24000, 8, "processing"],
      ["Kitchen Plumbing Repair", "Unit 402", "repairs", 4500, 10, "paid"],
      ["Housekeeping Supplies", "Bulk purchase", "cleaning", 1850, 12, "paid"],
    ];
    for (const [description, sub, category, amount, daysAgo, status] of expenses)
      await client.query(
        `INSERT INTO expenses (pg_id, description, sub_description, category, amount, expense_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pgId, description, sub, category, amount, addDays(today, -daysAgo), status],
      );
  }

  // Activity log -----------------------------------------------------------
  const hasLog = (await client.query(
    "SELECT 1 FROM activity_logs WHERE pg_id=$1 AND action='System initialized' LIMIT 1", [pgId])).rowCount > 0;
  if (!hasLog)
    await client.query(
      `INSERT INTO activity_logs (pg_id, action, entity_type, performed_by_name, performed_by_role)
       VALUES ($1,'System initialized','system','System','system')`, [pgId]);

  return { freshPg };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function migrate() {
  const isProd = process.env.NODE_ENV === "production";
  const seedDemoData = !isProd && process.env.SEED_DEMO !== "false";
  const schemaPath = path.join(__dirname, "schema.sql");
  if (!fs.existsSync(schemaPath))
    throw new Error(`schema.sql not found at ${schemaPath}`);
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = await pool.connect();
  try {
    console.log(`🚀 Running migration (${isProd ? "production" : "development"})...`);
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);

    await client.query(schemaSql);
    console.log("✅ Schema applied (tables, indexes, triggers, functions)");

    await verifySchema(client);
    console.log("✅ Schema verified");

    const admin = await seedMasterAdmin(client, isProd);
    if (seedDemoData) {
      await seedDemo(client);
      console.log("✅ Demo data ready");
    } else {
      console.log("⏭  Demo data skipped");
    }

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete");
    console.log(`   Master Admin : ${admin.email}${isProd ? "  (password from MASTER_ADMIN_PASSWORD)" : " / admin123"}`);
    if (seedDemoData) {
      console.log("   Owner        : ravi@grandpg.com / owner123");
      console.log("   Manager      : manager@grandpg.com / manager123");
      console.log("   Staff        : staff@grandpg.com / staff12345");
    }
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* connection may be gone */ }
    console.error("\n❌ Migration failed (all changes rolled back):", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error("\n❌ Migration failed:", e.message);
  process.exit(1);
});
