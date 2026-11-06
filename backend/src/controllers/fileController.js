const path = require("path");
const pool = require("../config/db");
const { UPLOAD_DIR } = require("../middleware/upload");

/**
 * GET /api/files/id-proofs/:filename   (login required)
 *
 * ID proofs (Aadhaar / PAN / DL scans) are sensitive personal documents and
 * must never be served as public static files. This endpoint only returns a
 * file when it belongs to a tenant of a PG the caller is allowed to access.
 */
const serveIdProof = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!/^[A-Za-z0-9._-]+$/.test(filename))
      return res.status(400).json({ message: "Invalid file name" });

    const { role, id, pgId } = req.actor;
    const fileUrl = `/uploads/id-proofs/${filename}`;
    let allowed = false;

    if (role === "master_admin") {
      const r = await pool.query(
        "SELECT 1 FROM pg_tenants WHERE id_proof=$1 LIMIT 1",
        [fileUrl],
      );
      allowed = r.rows.length > 0;
    } else if (role === "owner") {
      const r = await pool.query(
        `SELECT 1 FROM pg_tenants t JOIN pgs p ON p.id=t.pg_id
         WHERE t.id_proof=$1 AND p.owner_id=$2 LIMIT 1`,
        [fileUrl, id],
      );
      allowed = r.rows.length > 0;
    } else if (role === "manager" || role === "staff") {
      const perm = await pool.query(
        `SELECT can_view FROM role_permissions
         WHERE pg_id=$1 AND role=$2 AND permission='manage_tenants'`,
        [pgId, role],
      );
      if (perm.rows[0]?.can_view) {
        const r = await pool.query(
          "SELECT 1 FROM pg_tenants WHERE id_proof=$1 AND pg_id=$2 LIMIT 1",
          [fileUrl, pgId],
        );
        allowed = r.rows.length > 0;
      }
    }

    if (!allowed) return res.status(404).json({ message: "File not found" });

    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(path.join(UPLOAD_DIR, "id-proofs", filename), (err) => {
      if (err && !res.headersSent)
        res.status(404).json({ message: "File not found" });
    });
  } catch (e) {
    console.error("serveIdProof error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { serveIdProof };
