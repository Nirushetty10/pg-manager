const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Attach user to req from JWT
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ message: 'No token provided' });

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.actor = decoded; // { id, role: 'master_admin'|'owner'|'staff', pgId?, ownerId? }
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Only master admins
const requireMasterAdmin = (req, res, next) => {
  if (req.actor.role !== 'master_admin')
    return res.status(403).json({ message: 'Master admin access required' });
  next();
};

// Owners or master admin
const requireOwner = (req, res, next) => {
  if (!['owner', 'master_admin'].includes(req.actor.role))
    return res.status(403).json({ message: 'Owner access required' });
  next();
};

// Check role-based permission for staff
const requirePermission = (permission) => async (req, res, next) => {
  const { role, pgId } = req.actor;
  if (role === 'master_admin' || role === 'owner') return next();

  try {
    const result = await pool.query(
      'SELECT allowed FROM role_permissions WHERE pg_id=$1 AND role=$2 AND permission=$3',
      [pgId, role, permission]
    );
    if (result.rows[0]?.allowed) return next();
    res.status(403).json({ message: 'Permission denied' });
  } catch (e) {
    res.status(500).json({ message: 'Permission check failed' });
  }
};

// Ensure actor has access to this pgId
const requirePGAccess = async (req, res, next) => {
  const { role, id, pgId } = req.actor;
  const requestedPgId = req.params.pgId || req.body.pg_id || req.query.pg_id;

  if (role === 'master_admin') return next();

  if (role === 'owner') {
    const r = await pool.query('SELECT id FROM pgs WHERE id=$1 AND owner_id=$2', [requestedPgId, id]);
    if (r.rows.length === 0) return res.status(403).json({ message: 'Not your PG' });
    req.actor.pgId = requestedPgId;
    return next();
  }

  if (role === 'staff' || role === 'manager') {
    if (pgId !== requestedPgId) return res.status(403).json({ message: 'Not your PG' });
    return next();
  }

  res.status(403).json({ message: 'Access denied' });
};

module.exports = { auth, requireMasterAdmin, requireOwner, requirePGAccess, requirePermission };
