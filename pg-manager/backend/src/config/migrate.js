require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Running migrations...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ Schema created');

    // Master Admin
    const adminHash = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO master_admins (name, email, password)
      VALUES ('Master Admin', 'admin@pgplatform.com', $1)
      ON CONFLICT (email) DO NOTHING
    `, [adminHash]);

    // Owner
    const ownerHash = await bcrypt.hash('owner123', 12);
    const ownerRes = await client.query(`
      INSERT INTO owners (name, email, phone, password, invite_accepted, is_active)
      VALUES ('Ravi Kumar', 'ravi@grandpg.com', '9876543210', $1, TRUE, TRUE)
      ON CONFLICT (email) DO NOTHING RETURNING id
    `, [ownerHash]);

    let ownerId = ownerRes.rows[0]?.id;
    if (!ownerId) {
      const r = await client.query('SELECT id FROM owners WHERE email=$1', ['ravi@grandpg.com']);
      ownerId = r.rows[0].id;
    }

    // PG 1
    const pg1Res = await client.query(`
      INSERT INTO pgs (owner_id, name, city, address, phone, email, total_rooms, total_beds, is_active)
      VALUES ($1, 'The Grand PG', 'Bangalore', '123 MG Road, Bangalore', '9876543210', 'ravi@grandpg.com', 7, 12, TRUE)
      ON CONFLICT DO NOTHING RETURNING id
    `, [ownerId]);

    let pg1Id = pg1Res.rows[0]?.id;
    if (!pg1Id) {
      const r = await client.query('SELECT id FROM pgs WHERE owner_id=$1 AND name=$2', [ownerId, 'The Grand PG']);
      pg1Id = r.rows[0]?.id;
    }

    if (pg1Id) {
      // Default permissions
      const permissions = [
        'view_dashboard','manage_tenants','manage_rooms','record_payments',
        'manage_expenses','view_reports','manage_staff','system_settings'
      ];
      const roles = ['manager','staff'];
      const defaults = {
        manager: { view_dashboard:true, manage_tenants:true, manage_rooms:true, record_payments:true, manage_expenses:true, view_reports:true, manage_staff:false, system_settings:false },
        staff:   { view_dashboard:true, manage_tenants:false, manage_rooms:false, record_payments:true, manage_expenses:false, view_reports:false, manage_staff:false, system_settings:false },
      };
      for (const role of roles) {
        for (const perm of permissions) {
          await client.query(`
            INSERT INTO role_permissions (pg_id, role, permission, allowed)
            VALUES ($1,$2,$3,$4) ON CONFLICT (pg_id,role,permission) DO NOTHING
          `, [pg1Id, role, perm, defaults[role][perm] || false]);
        }
      }

      // Rooms & beds
      const rooms = [
        { number: 'A-101', floor: 1, type: 'single', rent: 8000, beds: 1, amenities: ['AC','WIFI'] },
        { number: 'A-102', floor: 1, type: 'single', rent: 8000, beds: 1, amenities: ['WIFI'] },
        { number: 'A-105', floor: 1, type: 'double', rent: 12000, beds: 2, amenities: ['AC','WIFI'] },
        { number: 'B-201', floor: 2, type: 'double', rent: 12000, beds: 2, amenities: ['AC'] },
        { number: 'B-204', floor: 2, type: 'single', rent: 9000, beds: 1, amenities: ['AC','WIFI'] },
        { number: 'C-301', floor: 3, type: 'triple', rent: 18000, beds: 3, amenities: ['WIFI'] },
        { number: 'C-302', floor: 3, type: 'deluxe', rent: 22000, beds: 2, amenities: ['AC','WIFI','ATTACHED_BATH'] },
      ];
      const roomIds = {};
      for (const r of rooms) {
        const res = await client.query(`
          INSERT INTO rooms (pg_id,room_number,floor,room_type,monthly_rent,total_beds,amenities,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'occupied') ON CONFLICT (pg_id,room_number) DO NOTHING RETURNING id
        `, [pg1Id, r.number, r.floor, r.type, r.rent, r.beds, r.amenities]);
        let rid = res.rows[0]?.id;
        if (!rid) { const x = await client.query('SELECT id FROM rooms WHERE pg_id=$1 AND room_number=$2',[pg1Id,r.number]); rid = x.rows[0]?.id; }
        if (rid) {
          roomIds[r.number] = rid;
          for (const label of ['A','B','C'].slice(0, r.beds)) {
            await client.query(`INSERT INTO beds (room_id,pg_id,bed_label,status) VALUES ($1,$2,$3,'occupied') ON CONFLICT (room_id,bed_label) DO NOTHING`, [rid, pg1Id, label]);
          }
        }
      }

      // Tenants
      const tenantData = [
        { name: 'Jordan Smith', phone: '9111111111', email: 'jordan@email.com', room: 'B-204', bed: 'A', rent: 9000, joining: '2023-10-12' },
        { name: 'Elena Rodriguez', phone: '9111111112', email: 'elena@email.com', room: 'A-102', bed: 'A', rent: 8000, joining: '2023-10-15' },
        { name: 'Marcus Thorne', phone: '9111111113', email: 'marcus@email.com', room: 'C-301', bed: 'A', rent: 14500, joining: '2024-01-12' },
        { name: 'Sarah Jenkins', phone: '9111111114', email: 'sarah@email.com', room: 'A-101', bed: 'A', rent: 9000, joining: '2023-12-15' },
        { name: 'Rohan Sharma', phone: '9111111115', email: 'rohan@email.com', room: 'C-302', bed: 'A', rent: 14500, joining: '2023-09-01' },
      ];
      for (const t of tenantData) {
        // Global profile
        const profRes = await client.query(`
          INSERT INTO tenant_profiles (name, phone, email, invite_accepted)
          VALUES ($1,$2,$3,TRUE) ON CONFLICT (phone) DO NOTHING RETURNING id
        `, [t.name, t.phone, t.email]);
        let profId = profRes.rows[0]?.id;
        if (!profId) { const x = await client.query('SELECT id FROM tenant_profiles WHERE phone=$1',[t.phone]); profId = x.rows[0]?.id; }
        const roomId = roomIds[t.room];
        let bedId = null;
        if (roomId) { const b = await client.query('SELECT id FROM beds WHERE room_id=$1 AND bed_label=$2',[roomId,t.bed]); bedId = b.rows[0]?.id; }
        await client.query(`
          INSERT INTO pg_tenants (pg_id,tenant_profile_id,name,phone,email,room_id,bed_id,joining_date,monthly_rent,deposit,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,10000,'active') ON CONFLICT (pg_id,phone) DO NOTHING
        `, [pg1Id, profId, t.name, t.phone, t.email, roomId, bedId, t.joining, t.rent]);
      }

      // Payments
      const tenants = await client.query('SELECT id, name FROM pg_tenants WHERE pg_id=$1 LIMIT 5',[pg1Id]);
      let recNum = 9001;
      for (const t of tenants.rows) {
        await client.query(`
          INSERT INTO payments (pg_id,pg_tenant_id,receipt_number,amount,payment_date,month,payment_mode,status)
          VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'upi','settled')
        `, [pg1Id, t.id, `#REC-${recNum++}`, 12000, 'Mar-2025']);
      }

      // Expenses
      for (const e of [
        ['Electricity Bill','Invoice #29841','electricity',840.50,'2025-03-24','paid'],
        ['Water Supply','Monthly','water',120,'2025-03-22','paid'],
        ['Staff Salaries','4 Personnel','salaries',2400,'2025-03-20','processing'],
        ['Kitchen Plumbing Repair','Unit 402','repairs',450,'2025-03-18','paid'],
        ['Housekeeping Supplies','Bulk','cleaning',185,'2025-03-15','paid'],
      ]) {
        await client.query(`INSERT INTO expenses (pg_id,description,sub_description,category,amount,expense_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [pg1Id, ...e]);
      }
    }

    console.log('✅ Seed data inserted');
    console.log('\n📌 Logins:');
    console.log('  Master Admin: admin@pgplatform.com / admin123');
    console.log('  Owner:        ravi@grandpg.com / owner123');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
