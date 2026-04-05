const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const getPG = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM pgs WHERE id=$1', [req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'PG not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const createPG = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, city, address, phone, email, total_rooms, total_beds } = req.body;
    const pg = await client.query(`
      INSERT INTO pgs (owner_id,name,city,address,phone,email,total_rooms,total_beds)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.actor.id, name, city, address, phone, email, total_rooms||0, total_beds||0]);
    const PERMS = ['view_dashboard','manage_tenants','manage_rooms','record_payments','manage_expenses','view_reports','manage_staff','system_settings'];
    const DEFAULTS = {
      manager: { view_dashboard:[true,true],  manage_tenants:[true,true], manage_rooms:[true,true], record_payments:[true,true], manage_expenses:[true,true], view_reports:[true,false], manage_staff:[false,false], system_settings:[false,false] },
      staff:   { view_dashboard:[true,false], manage_tenants:[true,false], manage_rooms:[true,false], record_payments:[true,true], manage_expenses:[false,false], view_reports:[false,false], manage_staff:[false,false], system_settings:[false,false] },
    };
    for (const [role, perms] of Object.entries(DEFAULTS)) {
      for (const perm of PERMS) {
        const [v, c] = perms[perm];
        await client.query(`INSERT INTO role_permissions (pg_id,role,permission,allowed,can_view,can_create) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [pg.rows[0].id, role, perm, v, v, c]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json(pg.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
};

const updatePG = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { name, city, address, phone, email, gstin, lat, lng, description, pg_type, amenities_list, rules, nearby, images } = req.body;

    let logoUrl = null;
    if (req.files?.logo?.[0]) logoUrl = `/uploads/photos/${req.files.logo[0].filename}`;

    let imagesArr = [];
    try { imagesArr = typeof images === 'string' ? JSON.parse(images) : (Array.isArray(images) ? images : []); } catch {}
    if (req.files?.pg_images?.length) {
      imagesArr = [...imagesArr, ...req.files.pg_images.map(f => `/uploads/photos/${f.filename}`)];
    }

    const r = await pool.query(`
      UPDATE pgs SET name=$1,city=$2,address=$3,phone=$4,email=$5,gstin=$6,
        lat=$7,lng=$8,description=$9,pg_type=$10,
        amenities_list=$11,rules=$12,nearby=$13,
        logo_url=COALESCE($14,logo_url), images=$15
      WHERE id=$16 RETURNING *
    `, [name,city,address,phone,email,gstin,lat||null,lng||null,description,pg_type||'mixed',
        amenities_list||[],rules,nearby,logoUrl,JSON.stringify(imagesArr),pgId]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

const removePGImage = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { imageUrl } = req.body;
    const pg = await pool.query('SELECT images FROM pgs WHERE id=$1', [pgId]);
    let images = [];
    try { images = JSON.parse(pg.rows[0]?.images || '[]'); } catch {}
    images = images.filter(img => img !== imageUrl);
    await pool.query('UPDATE pgs SET images=$1 WHERE id=$2', [JSON.stringify(images), pgId]);
    if (imageUrl?.startsWith('/uploads/')) {
      const fp = path.join(__dirname, '../../', imageUrl);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ images });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getPGDashboard = async (req, res) => {
  try {
    const { pgId } = req.params;
    const [stats, revenue, expChart, expStats, bedByFloor, payStatus, topTenants] = await Promise.all([
      pool.query(`SELECT
          (SELECT COUNT(*) FROM beds WHERE pg_id=$1) as total_beds,
          (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='occupied') as occupied_beds,
          (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='available') as vacant_beds,
          (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='active') as active_tenants,
          (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='pending') as pending_tenants,
          (SELECT COALESCE(SUM(monthly_rent),0) FROM pg_tenants WHERE pg_id=$1 AND status='active') as total_monthly_rent,
          (SELECT COALESCE(SUM(amount),0) FROM payments WHERE pg_id=$1 AND status='settled' AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)) as collected_mtd,
          (SELECT COALESCE(SUM(balance_due),0) FROM payments WHERE pg_id=$1 AND is_partial=TRUE AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)) as partial_dues,
          (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)) as expenses_mtd
      `, [pgId]),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',payment_date),'Mon') as month, DATE_TRUNC('month',payment_date) as md,
          COALESCE(SUM(amount) FILTER (WHERE status='settled'),0) as income
        FROM payments WHERE pg_id=$1 AND payment_date>=NOW()-INTERVAL '6 months'
        GROUP BY md ORDER BY md`, [pgId]),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',expense_date),'Mon') as month, DATE_TRUNC('month',expense_date) as md,
          COALESCE(SUM(amount),0) as expense
        FROM expenses WHERE pg_id=$1 AND expense_date>=NOW()-INTERVAL '6 months'
        GROUP BY md ORDER BY md`, [pgId]),
      pool.query(`SELECT category, SUM(amount) as total FROM expenses WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE) GROUP BY category ORDER BY total DESC LIMIT 5`, [pgId]),
      pool.query(`SELECT floor, COUNT(*) as total, COUNT(*) FILTER (WHERE status='occupied') as occupied, COUNT(*) FILTER (WHERE status='available') as available FROM rooms WHERE pg_id=$1 GROUP BY floor ORDER BY floor`, [pgId]),
      pool.query(`SELECT
          COUNT(*) FILTER (WHERE payment_status='paid') as paid,
          COUNT(*) FILTER (WHERE payment_status='due') as due,
          COUNT(*) FILTER (WHERE payment_status='partial') as partial
        FROM pg_tenants WHERE pg_id=$1 AND status='active'`, [pgId]),
      pool.query(`SELECT pt.name, pt.monthly_rent, pt.payment_status, r.room_number, b.bed_label
        FROM pg_tenants pt LEFT JOIN rooms r ON pt.room_id=r.id LEFT JOIN beds b ON pt.bed_id=b.id
        WHERE pt.pg_id=$1 AND pt.status='active' AND pt.payment_status IN ('due','partial')
        ORDER BY pt.monthly_rent DESC LIMIT 5`, [pgId]),
    ]);
    res.json({
      stats: stats.rows[0],
      revenueChart: revenue.rows,
      expenseChart: expChart.rows,
      expenseStats: expStats.rows,
      bedByFloor: bedByFloor.rows,
      paymentStatus: payStatus.rows[0],
      duetenants: topTenants.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

const getStaff = async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,role,is_active,created_at FROM pg_staff WHERE pg_id=$1 ORDER BY created_at', [req.params.pgId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const createStaff = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query('INSERT INTO pg_staff (pg_id,name,email,password,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,is_active,created_at',
      [req.params.pgId, name, email, hash, role||'staff']);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code==='23505') return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: 'Server error' });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { name, role, is_active } = req.body;
    const r = await pool.query('UPDATE pg_staff SET name=$1,role=$2,is_active=$3 WHERE id=$4 AND pg_id=$5 RETURNING id,name,email,role,is_active',
      [name, role, is_active, req.params.staffId, req.params.pgId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const resetStaffPassword = async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.new_password, 12);
    await pool.query('UPDATE pg_staff SET password=$1 WHERE id=$2 AND pg_id=$3', [hash, req.params.staffId, req.params.pgId]);
    res.json({ message: 'Password reset' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getPermissions = async (req, res) => {
  try {
    const r = await pool.query('SELECT role,permission,can_view,can_create FROM role_permissions WHERE pg_id=$1 ORDER BY role,permission', [req.params.pgId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const updatePermissions = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of req.body.permissions) {
      await client.query(`
        INSERT INTO role_permissions (pg_id,role,permission,allowed,can_view,can_create)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (pg_id,role,permission) DO UPDATE SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, allowed=EXCLUDED.can_view
      `, [req.params.pgId, p.role, p.permission, p.can_view, p.can_view, p.can_create]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Permissions updated' });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
};

const getLogs = async (req, res) => {
  try {
    const { page=1, limit=20 } = req.query;
    const r = await pool.query('SELECT * FROM activity_logs WHERE pg_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.params.pgId, parseInt(limit), (page-1)*limit]);
    const c = await pool.query('SELECT COUNT(*) FROM activity_logs WHERE pg_id=$1', [req.params.pgId]);
    res.json({ logs: r.rows, total: parseInt(c.rows[0].count) });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getOwnerPGs = async (req, res) => {
  try {
    const ownerId = req.actor.role==='master_admin' ? req.params.ownerId : req.actor.id;
    const r = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='active') as active_tenants,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='available') as vacant_beds
      FROM pgs p LEFT JOIN pg_tenants pt ON pt.pg_id=p.id LEFT JOIN beds b ON b.pg_id=p.id
      WHERE p.owner_id=$1 GROUP BY p.id ORDER BY p.created_at
    `, [ownerId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getReports = async (req, res) => {
  try {
    const { pgId } = req.params;
    const year = req.query.year || new Date().getFullYear();
    const [pnl, kpi, expBreakdown] = await Promise.all([
      pool.query(`SELECT m.month_num, TO_CHAR(TO_DATE(m.month_num::text,'MM'),'Mon') as month, COALESCE(p.income,0) as income, COALESCE(e.expense,0) as expense, COALESCE(p.income,0)-COALESCE(e.expense,0) as profit
        FROM generate_series(1,12) AS m(month_num)
        LEFT JOIN (SELECT EXTRACT(MONTH FROM payment_date)::int as mn, SUM(amount) as income FROM payments WHERE pg_id=$1 AND EXTRACT(YEAR FROM payment_date)=$2 AND status='settled' GROUP BY mn) p ON p.mn=m.month_num
        LEFT JOIN (SELECT EXTRACT(MONTH FROM expense_date)::int as mn, SUM(amount) as expense FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2 GROUP BY mn) e ON e.mn=m.month_num
        ORDER BY m.month_num`, [pgId, year]),
      pool.query(`SELECT
          (SELECT COALESCE(SUM(amount),0) FROM payments WHERE pg_id=$1 AND status='settled' AND EXTRACT(YEAR FROM payment_date)=$2) as total_revenue,
          (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2) as total_expense,
          (SELECT COUNT(*) FROM pg_tenants WHERE pg_id=$1 AND status='active') as active_tenants,
          (SELECT ROUND(COUNT(*) FILTER(WHERE status='occupied')::numeric/NULLIF(COUNT(*),0)*100,1) FROM beds WHERE pg_id=$1) as occupancy_rate
      `, [pgId, year]),
      pool.query(`SELECT category, SUM(amount) as total FROM expenses WHERE pg_id=$1 AND EXTRACT(YEAR FROM expense_date)=$2 GROUP BY category ORDER BY total DESC`, [pgId, year]),
    ]);
    res.json({ pnl: pnl.rows, kpi: kpi.rows[0], expBreakdown: expBreakdown.rows, year: parseInt(year), totalProfit: pnl.rows.reduce((s,m)=>s+parseFloat(m.profit||0),0) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

module.exports = { getPG, createPG, updatePG, removePGImage, getPGDashboard, getStaff, createStaff, updateStaff, resetStaffPassword, getPermissions, updatePermissions, getLogs, getOwnerPGs, getReports };
