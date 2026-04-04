const pool = require('../config/db');

// ── MASTER DASHBOARD ─────────────────────────────────────────
const getMasterDashboard = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM owners WHERE is_active=TRUE) as active_owners,
        (SELECT COUNT(*) FROM owners WHERE is_active=FALSE) as inactive_owners,
        (SELECT COUNT(*) FROM owners) as total_owners,
        (SELECT COUNT(*) FROM pgs WHERE is_active=TRUE) as total_pgs,
        (SELECT COUNT(*) FROM pg_tenants WHERE status='active') as active_tenants,
        (SELECT COUNT(*) FROM pg_tenants) as total_tenants,
        (SELECT COUNT(*) FROM beds) as total_beds,
        (SELECT COUNT(*) FROM beds WHERE status='occupied') as occupied_beds,
        (SELECT COUNT(*) FROM beds WHERE status='available') as vacant_beds,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='settled' AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)) as monthly_revenue
    `);

    const recentOwners = await pool.query(`
      SELECT o.id, o.name, o.email, o.phone, o.is_active, o.created_at,
        COUNT(p.id) as pg_count
      FROM owners o LEFT JOIN pgs p ON p.owner_id=o.id
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 5
    `);

    const pgGrowth = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',created_at),'Mon') as month,
        COUNT(*) as new_pgs
      FROM pgs WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month',created_at) ORDER BY DATE_TRUNC('month',created_at)
    `);

    res.json({ stats: stats.rows[0], recentOwners: recentOwners.rows, pgGrowth: pgGrowth.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── OWNERS LIST ───────────────────────────────────────────────
const getOwners = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let conds = [], params = [], idx = 1;
    if (search) { conds.push(`(o.name ILIKE $${idx} OR o.email ILIKE $${idx} OR o.phone ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status === 'active') { conds.push(`o.is_active=TRUE`); }
    if (status === 'inactive') { conds.push(`o.is_active=FALSE`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const count = await pool.query(`SELECT COUNT(*) FROM owners o ${where}`, params);
    const owners = await pool.query(`
      SELECT o.id, o.name, o.email, o.phone, o.is_active, o.invite_accepted, o.created_at,
        COUNT(DISTINCT p.id) as pg_count
      FROM owners o LEFT JOIN pgs p ON p.owner_id=o.id
      ${where} GROUP BY o.id ORDER BY o.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `, [...params, parseInt(limit), offset]);

    res.json({ owners: owners.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── OWNER DETAILS ─────────────────────────────────────────────
const getOwnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const owner = await pool.query('SELECT id,name,email,phone,is_active,created_at FROM owners WHERE id=$1', [id]);
    if (!owner.rows.length) return res.status(404).json({ message: 'Owner not found' });

    const pgs = await pool.query(`
      SELECT p.*, 
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='active') as active_tenants,
        COUNT(DISTINCT pt.id) as total_tenants,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='occupied') as occupied_beds,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='available') as vacant_beds
      FROM pgs p
      LEFT JOIN pg_tenants pt ON pt.pg_id=p.id
      LEFT JOIN beds b ON b.pg_id=p.id
      WHERE p.owner_id=$1 GROUP BY p.id ORDER BY p.created_at
    `, [id]);

    res.json({ owner: owner.rows[0], pgs: pgs.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── TOGGLE OWNER STATUS ───────────────────────────────────────
const toggleOwnerStatus = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE owners SET is_active = NOT is_active WHERE id=$1 RETURNING id,name,is_active',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── PG DETAILS MODAL ──────────────────────────────────────────
const getPGDetails = async (req, res) => {
  try {
    const pg = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='active') as active_tenants,
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='vacated') as vacated_tenants,
        COUNT(DISTINCT pt.id) as total_tenants,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='occupied') as occupied_beds,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='available') as vacant_beds
      FROM pgs p
      LEFT JOIN pg_tenants pt ON pt.pg_id=p.id
      LEFT JOIN beds b ON b.pg_id=p.id
      WHERE p.id=$1 GROUP BY p.id
    `, [req.params.pgId]);
    if (!pg.rows.length) return res.status(404).json({ message: 'PG not found' });
    res.json(pg.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getMasterDashboard, getOwners, getOwnerById, toggleOwnerStatus, getPGDetails };
