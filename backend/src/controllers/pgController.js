const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// ── GET PG INFO ───────────────────────────────────────────────
const getPG = async (req, res) => {
  try {
    const { pgId } = req.params;
    const r = await pool.query('SELECT * FROM pgs WHERE id=$1', [pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'PG not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── CREATE PG ─────────────────────────────────────────────────
const createPG = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, city, address, phone, email, total_rooms, total_beds } = req.body;
    const ownerId = req.actor.id;

    const pg = await client.query(`
      INSERT INTO pgs (owner_id,name,city,address,phone,email,total_rooms,total_beds)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [ownerId, name, city, address, phone, email, total_rooms || 0, total_beds || 0]);

    // Default permissions
    const perms = ['view_dashboard','manage_tenants','manage_rooms','record_payments','manage_expenses','view_reports','manage_staff','system_settings'];
    for (const role of ['manager','staff']) {
      for (const perm of perms) {
        const allowed = role==='manager' ? !['manage_staff','system_settings'].includes(perm) : perm==='view_dashboard'||perm==='record_payments';
        await client.query(`INSERT INTO role_permissions (pg_id,role,permission,allowed) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [pg.rows[0].id, role, perm, allowed]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(pg.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

// ── UPDATE PG SETTINGS ────────────────────────────────────────
const updatePG = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { name, city, address, phone, email, gstin, currency, rent_due_day, late_fee_percent, security_deposit_months, logo_url, cover_url } = req.body;
    const r = await pool.query(`
      UPDATE pgs SET name=$1,city=$2,address=$3,phone=$4,email=$5,gstin=$6,
        currency=$7,rent_due_day=$8,late_fee_percent=$9,security_deposit_months=$10,
        logo_url=$11,cover_url=$12
      WHERE id=$13 RETURNING *
    `, [name,city,address,phone,email,gstin,currency,rent_due_day,late_fee_percent,security_deposit_months,logo_url,cover_url,pgId]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── PG DASHBOARD ──────────────────────────────────────────────
const getPGDashboard = async (req, res) => {
  try {
    const { pgId } = req.params;

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1) as total_beds,
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='occupied') as occupied_beds,
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='available') as vacant_beds,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE pg_id=$1 AND status='settled' AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)) as rent_collected,
        (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='pending') as pending_tenants,
        (SELECT COUNT(*) FROM maintenance_requests WHERE pg_id=$1 AND status='open') as open_maintenance,
        (SELECT COUNT(*) FROM maintenance_requests WHERE pg_id=$1 AND status='open' AND priority='urgent') as urgent_maintenance
    `, [pgId]);

    const revenueChart = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',payment_date),'Mon') as month,
        DATE_TRUNC('month',payment_date) as month_date,
        COALESCE(SUM(amount) FILTER (WHERE status='settled'),0) as income
      FROM payments WHERE pg_id=$1 AND payment_date>=NOW()-INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month',payment_date) ORDER BY month_date
    `, [pgId]);

    const expenseChart = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',expense_date),'Mon') as month,
        DATE_TRUNC('month',expense_date) as month_date,
        COALESCE(SUM(amount),0) as expense
      FROM expenses WHERE pg_id=$1 AND expense_date>=NOW()-INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month',expense_date) ORDER BY month_date
    `, [pgId]);

    const recentTenants = await pool.query(`
      SELECT pt.id, pt.name, pt.phone, pt.status, pt.joining_date,
        r.room_number, b.bed_label
      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id=r.id
      LEFT JOIN beds b ON pt.bed_id=b.id
      WHERE pt.pg_id=$1 ORDER BY pt.created_at DESC LIMIT 8
    `, [pgId]);

    const maintenance = await pool.query(`
      SELECT mr.*, r.room_number FROM maintenance_requests mr
      LEFT JOIN rooms r ON mr.room_id=r.id
      WHERE mr.pg_id=$1 AND mr.status='open'
      ORDER BY CASE mr.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, mr.created_at DESC LIMIT 3
    `, [pgId]);

    const roomAvailability = await pool.query(`
      SELECT room_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='occupied') as occupied
      FROM rooms WHERE pg_id=$1 GROUP BY room_type
    `, [pgId]);

    res.json({ stats: stats.rows[0], revenueChart: revenueChart.rows, expenseChart: expenseChart.rows, recentTenants: recentTenants.rows, maintenance: maintenance.rows, roomAvailability: roomAvailability.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── STAFF MANAGEMENT ──────────────────────────────────────────
const getStaff = async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,role,is_active,created_at FROM pg_staff WHERE pg_id=$1 ORDER BY created_at', [req.params.pgId]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

const createStaff = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(`
      INSERT INTO pg_staff (pg_id,name,email,password,role) VALUES ($1,$2,$3,$4,$5)
      RETURNING id,name,email,role,is_active,created_at
    `, [req.params.pgId, name, email, hash, role || 'staff']);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Email already exists in this PG' });
    res.status(500).json({ message: 'Server error' });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { name, role, is_active } = req.body;
    const r = await pool.query(
      'UPDATE pg_staff SET name=$1,role=$2,is_active=$3 WHERE id=$4 AND pg_id=$5 RETURNING id,name,email,role,is_active',
      [name, role, is_active, req.params.staffId, req.params.pgId]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

const resetStaffPassword = async (req, res) => {
  try {
    const { new_password } = req.body;
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE pg_staff SET password=$1 WHERE id=$2 AND pg_id=$3', [hash, req.params.staffId, req.params.pgId]);
    res.json({ message: 'Password reset' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── ROLE PERMISSIONS ──────────────────────────────────────────
const getPermissions = async (req, res) => {
  try {
    const r = await pool.query('SELECT role,permission,allowed FROM role_permissions WHERE pg_id=$1 ORDER BY role,permission', [req.params.pgId]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

const updatePermissions = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { permissions } = req.body; // [{role, permission, allowed}]
    for (const p of permissions) {
      await client.query(`
        INSERT INTO role_permissions (pg_id,role,permission,allowed) VALUES ($1,$2,$3,$4)
        ON CONFLICT (pg_id,role,permission) DO UPDATE SET allowed=EXCLUDED.allowed
      `, [req.params.pgId, p.role, p.permission, p.allowed]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Permissions updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

// ── ACTIVITY LOGS ─────────────────────────────────────────────
const getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const r = await pool.query('SELECT * FROM activity_logs WHERE pg_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.params.pgId, parseInt(limit), offset]);
    const c = await pool.query('SELECT COUNT(*) FROM activity_logs WHERE pg_id=$1', [req.params.pgId]);
    res.json({ logs: r.rows, total: parseInt(c.rows[0].count) });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── OWNER PGS LIST ────────────────────────────────────────────
const getOwnerPGs = async (req, res) => {
  try {
    const ownerId = req.actor.role === 'master_admin' ? req.params.ownerId : req.actor.id;
    const r = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='active') as active_tenants,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='available') as vacant_beds
      FROM pgs p
      LEFT JOIN pg_tenants pt ON pt.pg_id=p.id
      LEFT JOIN beds b ON b.pg_id=p.id
      WHERE p.owner_id=$1 GROUP BY p.id ORDER BY p.created_at
    `, [ownerId]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── REPORTS ───────────────────────────────────────────────────
const getReports = async (req, res) => {
  try {
    const { pgId } = req.params;
    const year = req.query.year || new Date().getFullYear();

    const pnl = await pool.query(`
      SELECT m.month_num,
        TO_CHAR(TO_DATE(m.month_num::text,'MM'),'Mon') as month,
        COALESCE(p.income,0) as income,
        COALESCE(e.expense,0) as expense,
        COALESCE(p.income,0)-COALESCE(e.expense,0) as profit
      FROM generate_series(1,12) AS m(month_num)
      LEFT JOIN (SELECT EXTRACT(MONTH FROM payment_date)::int as mn, SUM(amount) as income FROM payments WHERE pg_id=$1 AND EXTRACT(YEAR FROM payment_date)=$2 AND status='settled' GROUP BY mn) p ON p.mn=m.month_num
      LEFT JOIN (SELECT EXTRACT(MONTH FROM expense_date)::int as mn, SUM(amount) as expense FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2 GROUP BY mn) e ON e.mn=m.month_num
      ORDER BY m.month_num
    `, [pgId, year]);

    const kpi = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE pg_id=$1 AND status='settled' AND EXTRACT(YEAR FROM payment_date)=$2) as total_revenue,
        (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2) as total_expense,
        (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='active') as active_tenants,
        (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='pending') as pending_tenants,
        (SELECT ROUND(COUNT(*) FILTER(WHERE status='occupied')::numeric/NULLIF(COUNT(*),0)*100,1) FROM beds WHERE pg_id=$1) as occupancy_rate
    `, [pgId, year]);

    const expBreakdown = await pool.query(`
      SELECT category, SUM(amount) as total FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2
      GROUP BY category ORDER BY total DESC
    `, [pgId, year]);

    res.json({ pnl: pnl.rows, kpi: kpi.rows[0], expBreakdown: expBreakdown.rows, year: parseInt(year) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getPG, createPG, updatePG, getPGDashboard, getStaff, createStaff, updateStaff, resetStaffPassword, getPermissions, updatePermissions, getLogs, getOwnerPGs, getReports };
