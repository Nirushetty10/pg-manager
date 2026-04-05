require('dotenv').config();
const pool = require('./db');

async function run(client, sql, label) {
  try { await client.query(sql); console.log('✅', label); }
  catch (e) {
    if (['42701','42P07','42710'].includes(e.code)) { console.log('⏭ skip (exists):', label); return; }
    console.error('❌', label, e.message); throw e;
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    // ── payments: partial payment tracking
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2)`, 'payments.paid_amount');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0`, 'payments.balance_due');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE`, 'payments.is_partial');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_month VARCHAR(10)`, 'payments.due_month');

    // ── role_permissions: split allowed → can_view + can_create
    await run(client, `ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_view BOOLEAN DEFAULT FALSE`, 'role_perms.can_view');
    await run(client, `ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT FALSE`, 'role_perms.can_create');
    // Migrate existing 'allowed' → both view and create
    await run(client, `UPDATE role_permissions SET can_view=allowed, can_create=allowed WHERE can_view IS DISTINCT FROM allowed OR can_create IS DISTINCT FROM allowed`, 'migrate existing perms');

    // ── pgs: listing fields, multiple images, lat/lng
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7)`, 'pgs.lat');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7)`, 'pgs.lng');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS description TEXT`, 'pgs.description');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS pg_type VARCHAR(30) DEFAULT 'mixed'`, 'pgs.pg_type');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS amenities_list TEXT[] DEFAULT '{}'`, 'pgs.amenities_list');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'`, 'pgs.images');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS rules TEXT`, 'pgs.rules');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS nearby TEXT`, 'pgs.nearby');

    // ── pg_tenants: payment_status field
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'due'`, 'pg_tenants.payment_status');

    // Refresh default permissions with new granular structure
    console.log('🔄 Refreshing permission structure...');
    const PERMS = ['view_dashboard','manage_tenants','manage_rooms','record_payments','manage_expenses','view_reports','manage_staff','system_settings'];
    const DEFAULTS = {
      manager: {
        view_dashboard:   { view:true,  create:true  },
        manage_tenants:   { view:true,  create:true  },
        manage_rooms:     { view:true,  create:true  },
        record_payments:  { view:true,  create:true  },
        manage_expenses:  { view:true,  create:true  },
        view_reports:     { view:true,  create:false },
        manage_staff:     { view:false, create:false },
        system_settings:  { view:false, create:false },
      },
      staff: {
        view_dashboard:   { view:true,  create:false },
        manage_tenants:   { view:true,  create:false },
        manage_rooms:     { view:true,  create:false },
        record_payments:  { view:true,  create:true  },
        manage_expenses:  { view:false, create:false },
        view_reports:     { view:false, create:false },
        manage_staff:     { view:false, create:false },
        system_settings:  { view:false, create:false },
      },
    };

    // Get all PGs and upsert new permission structure
    const pgs = await client.query('SELECT id FROM pgs');
    for (const pg of pgs.rows) {
      for (const [role, perms] of Object.entries(DEFAULTS)) {
        for (const perm of PERMS) {
          await client.query(`
            INSERT INTO role_permissions (pg_id, role, permission, allowed, can_view, can_create)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (pg_id, role, permission) DO UPDATE
              SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create
          `, [pg.id, role, perm, perms[perm].view, perms[perm].view, perms[perm].create]);
        }
      }
    }

    console.log('\n✅ Migration v3 complete');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
