require('dotenv').config();
const pool = require('./db');

async function run(client, sql, label) {
  try {
    await client.query(sql);
    console.log('✅', label);
  } catch(e) {
    if (['42701','42710'].includes(e.code)) { console.log('⏭  skip (exists):', label); return; }
    console.error('❌', label, '→', e.message); throw e;
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Running migrations v2 + v3...\n');

    // ── tenant_profiles new columns ──────────────────────────
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20)`, 'tenant_profiles.gender');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS father_name VARCHAR(100)`, 'tenant_profiles.father_name');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20)`, 'tenant_profiles.parent_phone');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)`, 'tenant_profiles.occupation');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100)`, 'tenant_profiles.emergency_contact_name');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`, 'tenant_profiles.emergency_contact_phone');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10)`, 'tenant_profiles.blood_group');
    await run(client, `ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE`, 'tenant_profiles.date_of_birth');

    // ── pg_tenants new columns ───────────────────────────────
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS gender VARCHAR(20)`, 'pg_tenants.gender');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS father_name VARCHAR(100)`, 'pg_tenants.father_name');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20)`, 'pg_tenants.parent_phone');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)`, 'pg_tenants.occupation');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100)`, 'pg_tenants.emergency_contact_name');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`, 'pg_tenants.emergency_contact_phone');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10)`, 'pg_tenants.blood_group');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS date_of_birth DATE`, 'pg_tenants.date_of_birth');
    await run(client, `ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'due'`, 'pg_tenants.payment_status');

    // ── payments partial tracking ────────────────────────────
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2)`, 'payments.paid_amount');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0`, 'payments.balance_due');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE`, 'payments.is_partial');
    await run(client, `ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_month VARCHAR(10)`, 'payments.due_month');

    // ── role_permissions granular view/create ────────────────
    await run(client, `ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_view BOOLEAN DEFAULT FALSE`, 'role_permissions.can_view');
    await run(client, `ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT FALSE`, 'role_permissions.can_create');
    await run(client, `UPDATE role_permissions SET can_view=allowed, can_create=allowed WHERE can_view IS DISTINCT FROM allowed`, 'migrate perms allowed→can_view/can_create');

    // ── pgs listing/location fields ──────────────────────────
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7)`, 'pgs.lat');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7)`, 'pgs.lng');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS description TEXT`, 'pgs.description');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS pg_type VARCHAR(30) DEFAULT 'mixed'`, 'pgs.pg_type');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS amenities_list TEXT[] DEFAULT '{}'`, 'pgs.amenities_list');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'`, 'pgs.images');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS rules TEXT`, 'pgs.rules');
    await run(client, `ALTER TABLE pgs ADD COLUMN IF NOT EXISTS nearby TEXT`, 'pgs.nearby');

    // ── Refresh default permissions for all PGs ──────────────
    const PERMS = ['view_dashboard','manage_tenants','manage_rooms','record_payments','manage_expenses','view_reports','manage_staff','system_settings'];
    const DEFAULTS = {
      manager: { view_dashboard:[true,true], manage_tenants:[true,true], manage_rooms:[true,true], record_payments:[true,true], manage_expenses:[true,true], view_reports:[true,false], manage_staff:[false,false], system_settings:[false,false] },
      staff:   { view_dashboard:[true,false], manage_tenants:[true,false], manage_rooms:[true,false], record_payments:[true,true], manage_expenses:[false,false], view_reports:[false,false], manage_staff:[false,false], system_settings:[false,false] },
    };
    const pgs = await client.query('SELECT id FROM pgs');
    for (const pg of pgs.rows) {
      for (const [role, perms] of Object.entries(DEFAULTS)) {
        for (const perm of PERMS) {
          const [v, c] = perms[perm];
          await client.query(`
            INSERT INTO role_permissions (pg_id, role, permission, allowed, can_view, can_create)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (pg_id, role, permission) DO UPDATE
              SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create
          `, [pg.id, role, perm, v, v, c]);
        }
      }
    }
    console.log('✅ Permissions updated for all PGs');

    console.log('\n✅ All migrations complete!');
  } catch(e) {
    console.error('\n❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
