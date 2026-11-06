const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Postgres error code for "invalid input syntax" (e.g. malformed UUID in :pgId)
const PG_INVALID_TEXT = "22P02";

const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

// ── Authenticate: verify JWT and make sure the account is still active ─────────
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ message: "No token provided" });

    const token = header.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // A token stays cryptographically valid for days. Re-check the account on
    // every request so a deactivated owner / staff member is locked out at once.
    if (decoded.role === "owner") {
      const r = await pool.query(
        "SELECT is_active FROM owners WHERE id=$1",
        [decoded.id],
      );
      if (!r.rows.length || r.rows[0].is_active === false)
        return res.status(401).json({ message: "Account is deactivated" });
    } else if (decoded.role === "manager" || decoded.role === "staff") {
      const r = await pool.query(
        "SELECT is_active, pg_id FROM pg_staff WHERE id=$1",
        [decoded.id],
      );
      if (!r.rows.length || r.rows[0].is_active === false)
        return res.status(401).json({ message: "Account is deactivated" });
      // Always trust the DB for which PG the staff member belongs to
      decoded.pgId = r.rows[0].pg_id;
    } else if (decoded.role === "master_admin") {
      const r = await pool.query(
        "SELECT is_active FROM master_admins WHERE id=$1",
        [decoded.id],
      );
      if (!r.rows.length || r.rows[0].is_active === false)
        return res.status(401).json({ message: "Account is deactivated" });
    } else {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.actor = decoded; // { id, role, pgId?, ownerId?, name? }
    next();
  } catch (e) {
    console.error("auth middleware error:", e);
    res.status(500).json({ message: "Authentication check failed" });
  }
};

// Only master admins
const requireMasterAdmin = (req, res, next) => {
  if (req.actor.role !== "master_admin")
    return res.status(403).json({ message: "Master admin access required" });
  next();
};

// Owners or master admin
const requireOwner = (req, res, next) => {
  if (!["owner", "master_admin"].includes(req.actor.role))
    return res.status(403).json({ message: "Owner access required" });
  next();
};

/**
 * Role-based permission check for manager / staff.
 *
 * The action is derived from the HTTP method unless forced:
 *   GET/HEAD  -> needs can_view
 *   POST/PUT/PATCH/DELETE -> needs can_create (and can_view)
 *
 * Previously this middleware only checked the legacy `allowed` column
 * (a copy of can_view), so can_create was never enforced on the server.
 */
const requirePermission = (permission, forcedAction) => async (req, res, next) => {
  const { role, pgId } = req.actor;
  if (role === "master_admin" || role === "owner") return next();

  const action =
    forcedAction || (READ_METHODS.includes(req.method) ? "view" : "create");

  try {
    const result = await pool.query(
      "SELECT can_view, can_create FROM role_permissions WHERE pg_id=$1 AND role=$2 AND permission=$3",
      [pgId, role, permission],
    );
    const row = result.rows[0];
    const ok =
      row &&
      (action === "create" ? row.can_view && row.can_create : row.can_view);
    if (ok) return next();
    res.status(403).json({ message: "Permission denied" });
  } catch (e) {
    console.error("requirePermission error:", e);
    res.status(500).json({ message: "Permission check failed" });
  }
};

// Ensure actor has access to this pgId
const requirePGAccess = async (req, res, next) => {
  try {
    const { role, id, pgId } = req.actor;
    const requestedPgId = req.params.pgId || req.body?.pg_id || req.query?.pg_id;

    if (!requestedPgId)
      return res.status(400).json({ message: "pgId is required" });

    if (role === "master_admin") return next();

    if (role === "owner") {
      const r = await pool.query(
        "SELECT id FROM pgs WHERE id=$1 AND owner_id=$2",
        [requestedPgId, id],
      );
      if (r.rows.length === 0)
        return res.status(403).json({ message: "Not your PG" });
      req.actor.pgId = requestedPgId;
      return next();
    }

    if (role === "staff" || role === "manager") {
      if (String(pgId) !== String(requestedPgId))
        return res.status(403).json({ message: "Not your PG" });
      return next();
    }

    res.status(403).json({ message: "Access denied" });
  } catch (e) {
    if (e.code === PG_INVALID_TEXT)
      return res.status(400).json({ message: "Invalid PG id" });
    console.error("requirePGAccess error:", e);
    res.status(500).json({ message: "Access check failed" });
  }
};

module.exports = {
  auth,
  requireMasterAdmin,
  requireOwner,
  requirePGAccess,
  requirePermission,
};
