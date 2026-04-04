const pool = require('../config/db');

// ── LIST TENANTS ──────────────────────────────────────────────
const getTenants = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { status, search, page = 1, limit = 15 } = req.query;
    let conds = ['pt.pg_id=$1'], params = [pgId], idx = 2;
    if (status && status !== 'all') { conds.push(`pt.status=$${idx++}`); params.push(status); }
    if (search) { conds.push(`(pt.name ILIKE $${idx} OR pt.phone ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const count = await pool.query(`SELECT COUNT(*) FROM pg_tenants pt ${where}`, params);
    const tenants = await pool.query(`
      SELECT pt.*, r.room_number, r.room_type, b.bed_label
      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id=r.id
      LEFT JOIN beds b ON pt.bed_id=b.id
      ${where} ORDER BY pt.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `, [...params, parseInt(limit), offset]);

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='vacated') as vacated,
        COUNT(*) FILTER (WHERE joining_date >= DATE_TRUNC('month',CURRENT_DATE)) as new_this_month,
        COUNT(*) FILTER (WHERE vacated_date >= DATE_TRUNC('month',CURRENT_DATE)) as vacated_this_month
      FROM pg_tenants WHERE pg_id=$1
    `, [pgId]);

    res.json({ tenants: tenants.rows, total: parseInt(count.rows[0].count), stats: stats.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── TENANT DETAILS ────────────────────────────────────────────
const getTenantById = async (req, res) => {
  try {
    const { pgId, tenantId } = req.params;
    const tenant = await pool.query(`
      SELECT pt.*, r.room_number, r.room_type, b.bed_label
      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id=r.id
      LEFT JOIN beds b ON pt.bed_id=b.id
      WHERE pt.id=$1 AND pt.pg_id=$2
    `, [tenantId, pgId]);
    if (!tenant.rows.length) return res.status(404).json({ message: 'Tenant not found' });

    const payments = await pool.query(
      'SELECT * FROM payments WHERE pg_tenant_id=$1 ORDER BY payment_date DESC',
      [tenantId]
    );
    res.json({ ...tenant.rows[0], payments: payments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CREATE TENANT (manual) ────────────────────────────────────
const createTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { name, phone, email, permanent_address, id_type, id_proof, room_id, bed_id, joining_date, monthly_rent, deposit, rent_due_day } = req.body;

    if (!name || !phone) return res.status(400).json({ message: 'Name and phone required' });

    // Validate bed availability
    if (bed_id) {
      const bedCheck = await client.query('SELECT status FROM beds WHERE id=$1 AND pg_id=$2', [bed_id, pgId]);
      if (bedCheck.rows[0]?.status === 'occupied') return res.status(400).json({ message: 'Bed already occupied' });
    }

    // Create or find global profile
    let profileId = null;
    const existingProfile = await client.query('SELECT id FROM tenant_profiles WHERE phone=$1', [phone]);
    if (existingProfile.rows.length) {
      profileId = existingProfile.rows[0].id;
    } else {
      const profile = await client.query(
        'INSERT INTO tenant_profiles (name,phone,email,permanent_address,id_type) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [name, phone, email, permanent_address, id_type]
      );
      profileId = profile.rows[0].id;
    }

    // PG snapshot
    const tenant = await client.query(`
      INSERT INTO pg_tenants (pg_id,tenant_profile_id,name,phone,email,permanent_address,id_type,id_proof,
        room_id,bed_id,joining_date,monthly_rent,deposit,rent_due_day,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        CASE WHEN $9 IS NOT NULL THEN 'active' ELSE 'pending' END)
      RETURNING *
    `, [pgId, profileId, name, phone, email, permanent_address, id_type, id_proof, room_id||null, bed_id||null, joining_date||null, monthly_rent||0, deposit||0, rent_due_day||1]);

    if (bed_id) await client.query('UPDATE beds SET status=$1 WHERE id=$2', ['occupied', bed_id]);
    if (room_id) await client.query('UPDATE rooms SET status=$1 WHERE id=$2', ['occupied', room_id]);

    await client.query(`INSERT INTO activity_logs (pg_id,action,entity_type,entity_id,performed_by_name,performed_by_role) VALUES ($1,$2,'tenant',$3,$4,$5)`,
      [pgId, `New tenant added: ${name}`, tenant.rows[0].id, req.actor.name || 'Owner', req.actor.role]);

    await client.query('COMMIT');
    res.status(201).json(tenant.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ message: 'Tenant with this phone already exists in this PG' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

// ── ASSIGN ROOM ───────────────────────────────────────────────
const assignRoom = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId, tenantId } = req.params;
    const { room_id, bed_id, joining_date, monthly_rent, deposit, rent_due_day } = req.body;

    // Check bed availability
    if (bed_id) {
      const bedCheck = await client.query('SELECT status FROM beds WHERE id=$1 AND pg_id=$2', [bed_id, pgId]);
      if (bedCheck.rows[0]?.status === 'occupied') return res.status(400).json({ message: 'Bed already occupied' });
    }

    // Free old bed/room if tenant had one
    const old = await client.query('SELECT room_id,bed_id FROM pg_tenants WHERE id=$1', [tenantId]);
    if (old.rows[0]?.bed_id) await client.query('UPDATE beds SET status=$1 WHERE id=$2', ['available', old.rows[0].bed_id]);
    if (old.rows[0]?.room_id) {
      const stillOccupied = await client.query('SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status=$2 AND id!=$3',['active', old.rows[0].room_id, tenantId]);
      if (parseInt(stillOccupied.rows[0].count) === 0)
        await client.query('UPDATE rooms SET status=$1 WHERE id=$2', ['available', old.rows[0].room_id]);
    }

    const tenant = await client.query(`
      UPDATE pg_tenants SET room_id=$1,bed_id=$2,joining_date=$3,monthly_rent=$4,deposit=$5,rent_due_day=$6,status='active'
      WHERE id=$7 AND pg_id=$8 RETURNING *
    `, [room_id, bed_id||null, joining_date, monthly_rent, deposit||0, rent_due_day||1, tenantId, pgId]);

    if (bed_id) await client.query('UPDATE beds SET status=$1 WHERE id=$2', ['occupied', bed_id]);
    if (room_id) await client.query('UPDATE rooms SET status=$1 WHERE id=$2', ['occupied', room_id]);

    await client.query('COMMIT');
    res.json(tenant.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

// ── UPDATE RENT DETAILS ───────────────────────────────────────
const updateRentDetails = async (req, res) => {
  try {
    const { pgId, tenantId } = req.params;
    const { monthly_rent, deposit, rent_due_day } = req.body;
    const r = await pool.query(
      'UPDATE pg_tenants SET monthly_rent=$1,deposit=$2,rent_due_day=$3 WHERE id=$4 AND pg_id=$5 RETURNING *',
      [monthly_rent, deposit, rent_due_day, tenantId, pgId]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── MARK VACATED ──────────────────────────────────────────────
const markVacated = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId, tenantId } = req.params;
    const { vacated_date } = req.body;

    const tenant = await client.query('SELECT room_id,bed_id FROM pg_tenants WHERE id=$1', [tenantId]);
    const { room_id, bed_id } = tenant.rows[0];

    await client.query(
      "UPDATE pg_tenants SET status='vacated',vacated_date=$1,room_id=NULL,bed_id=NULL WHERE id=$2 AND pg_id=$3",
      [vacated_date || new Date(), tenantId, pgId]
    );
    if (bed_id) await client.query('UPDATE beds SET status=$1 WHERE id=$2', ['available', bed_id]);
    if (room_id) {
      const still = await client.query("SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'",[room_id]);
      if (parseInt(still.rows[0].count) === 0)
        await client.query("UPDATE rooms SET status='available' WHERE id=$1",[room_id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Tenant marked as vacated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

// ── DELETE TENANT ─────────────────────────────────────────────
const deleteTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId, tenantId } = req.params;
    const t = await client.query('SELECT room_id,bed_id FROM pg_tenants WHERE id=$1 AND pg_id=$2',[tenantId,pgId]);
    if (!t.rows.length) return res.status(404).json({ message: 'Not found' });
    const { room_id, bed_id } = t.rows[0];
    await client.query('DELETE FROM pg_tenants WHERE id=$1',[tenantId]);
    if (bed_id) await client.query("UPDATE beds SET status='available' WHERE id=$1",[bed_id]);
    if (room_id) { const s = await client.query("SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'",[room_id]); if(parseInt(s.rows[0].count)===0) await client.query("UPDATE rooms SET status='available' WHERE id=$1",[room_id]); }
    await client.query('COMMIT');
    res.json({ message: 'Tenant removed' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

module.exports = { getTenants, getTenantById, createTenant, assignRoom, updateRentDetails, markVacated, deleteTenant };
