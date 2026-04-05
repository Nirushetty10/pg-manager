const pool = require("../config/db");
const crypto = require("crypto");
const { getFileUrl } = require("../middleware/upload");

// ── LIST TENANTS ──────────────────────────────────────────────
const getTenants = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { status, search, page = 1, limit = 15 } = req.query;
    let conds = ["pt.pg_id=$1"],
      params = [pgId],
      idx = 2;
    if (status && status !== "all") {
      conds.push(`pt.status=$${idx++}`);
      params.push(status);
    }
    if (search) {
      conds.push(
        `(pt.name ILIKE $${idx} OR pt.phone ILIKE $${idx} OR pt.email ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx++;
    }
    const where = `WHERE ${conds.join(" AND ")}`;
    const offset = (page - 1) * limit;

    const count = await pool.query(
      `SELECT COUNT(*) FROM pg_tenants pt ${where}`,
      params,
    );
    const tenants = await pool.query(
      `
      SELECT pt.*, r.room_number, r.room_type, b.bed_label
      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id = r.id
      LEFT JOIN beds b ON pt.bed_id = b.id
      ${where} ORDER BY pt.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `,
      [...params, parseInt(limit), offset],
    );

    const stats = await pool.query(
      `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='vacated') as vacated,
        COUNT(*) FILTER (WHERE joining_date >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month,
        COUNT(*) FILTER (WHERE vacated_date >= DATE_TRUNC('month', CURRENT_DATE)) as vacated_this_month
      FROM pg_tenants WHERE pg_id = $1
    `,
      [pgId],
    );

    res.json({
      tenants: tenants.rows,
      total: parseInt(count.rows[0].count),
      stats: stats.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── TENANT DETAILS ────────────────────────────────────────────
const getTenantById = async (req, res) => {
  try {
    const { pgId, tenantId } = req.params;
    const tenant = await pool.query(
      `
      SELECT pt.*, r.room_number, r.room_type, b.bed_label, r.monthly_rent as room_rent
      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id = r.id
      LEFT JOIN beds b ON pt.bed_id = b.id
      WHERE pt.id = $1 AND pt.pg_id = $2
    `,
      [tenantId, pgId],
    );

    if (!tenant.rows.length)
      return res.status(404).json({ message: "Tenant not found" });

    const payments = await pool.query(
      "SELECT * FROM payments WHERE pg_tenant_id = $1 ORDER BY payment_date DESC",
      [tenantId],
    );
    res.json({ ...tenant.rows[0], payments: payments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── CREATE TENANT ─────────────────────────────────────────────
const createTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId } = req.params;
    const {
      name,
      phone,
      email,
      gender,
      father_name,
      parent_phone,
      occupation,
      date_of_birth,
      emergency_contact_name,
      emergency_contact_phone,
      permanent_address,
      id_type,
      room_id,
      bed_id,
      joining_date,
      monthly_rent,
      deposit,
      rent_due_day,
    } = req.body;

    if (!name || !phone)
      return res.status(400).json({ message: "Name and phone are required" });

    const profile_photo = req.files?.profile_photo?.[0]
      ? getFileUrl(req, req.files.profile_photo[0])
      : null;
    const id_proof = req.files?.id_proof?.[0]
      ? getFileUrl(req, req.files.id_proof[0])
      : null;

    if (bed_id) {
      const bedCheck = await client.query(
        "SELECT status FROM beds WHERE id=$1 AND pg_id=$2",
        [bed_id, pgId],
      );
      if (bedCheck.rows[0]?.status === "occupied")
        return res.status(400).json({ message: "Bed already occupied" });
    }

    // Upsert global profile
    const existingProf = await client.query(
      "SELECT id FROM tenant_profiles WHERE phone=$1",
      [phone],
    );
    let profId;
    if (existingProf.rows.length) {
      profId = existingProf.rows[0].id;
      await client.query(
        `
        UPDATE tenant_profiles SET
          name=$1, email=$2, gender=$3, father_name=$4, parent_phone=$5,
          occupation=$6, date_of_birth=$7,
          emergency_contact_name=$8, emergency_contact_phone=$9,
          permanent_address=$10, id_type=$11,
          profile_photo=COALESCE($12, profile_photo),
          id_proof=COALESCE($13, id_proof)
        WHERE id=$14
      `,
        [
          name,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
          profId,
        ],
      );
    } else {
      const prof = await client.query(
        `
        INSERT INTO tenant_profiles
          (name, phone, email, gender, father_name, parent_phone, occupation,
           date_of_birth, emergency_contact_name, emergency_contact_phone,
           permanent_address, id_type, profile_photo, id_proof, invite_accepted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)
        RETURNING id
      `,
        [
          name,
          phone,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
        ],
      );
      profId = prof.rows[0].id;
    }

    const status = room_id && bed_id && joining_date ? "active" : "pending";

    const tenant = await client.query(
      `
      INSERT INTO pg_tenants (
        pg_id, tenant_profile_id, name, phone, email, gender, father_name,
        parent_phone, occupation, date_of_birth,
        emergency_contact_name, emergency_contact_phone,
        permanent_address, id_type, profile_photo, id_proof,
        room_id, bed_id, joining_date, monthly_rent, deposit, rent_due_day, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `,
      [
        pgId,
        profId,
        name,
        phone,
        email,
        gender,
        father_name,
        parent_phone,
        occupation,
        date_of_birth || null,
        emergency_contact_name,
        emergency_contact_phone,
        permanent_address,
        id_type,
        profile_photo,
        id_proof,
        room_id || null,
        bed_id || null,
        joining_date || null,
        monthly_rent || 0,
        deposit || 0,
        rent_due_day || 1,
        status,
      ],
    );

    if (bed_id)
      await client.query("UPDATE beds SET status='occupied' WHERE id=$1", [
        bed_id,
      ]);
    if (room_id)
      await client.query("UPDATE rooms SET status='occupied' WHERE id=$1", [
        room_id,
      ]);

    await client.query(
      `
      INSERT INTO activity_logs (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
      VALUES ($1,$2,'tenant',$3,$4,$5)
    `,
      [
        pgId,
        `Tenant added: ${name}`,
        tenant.rows[0].id,
        req.actor?.name || "Owner",
        req.actor?.role || "owner",
      ],
    );

    await client.query("COMMIT");
    res.status(201).json(tenant.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505")
      return res
        .status(400)
        .json({ message: "Tenant with this phone already exists in this PG" });
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── UPDATE TENANT ─────────────────────────────────────────────
const updateTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId, tenantId } = req.params;
    const {
      name,
      phone,
      email,
      gender,
      father_name,
      parent_phone,
      occupation,
      date_of_birth,
      emergency_contact_name,
      emergency_contact_phone,
      permanent_address,
      id_type,
    } = req.body;

    const profile_photo = req.files?.profile_photo?.[0]
      ? getFileUrl(req, req.files.profile_photo[0])
      : null;
    const id_proof = req.files?.id_proof?.[0]
      ? getFileUrl(req, req.files.id_proof[0])
      : null;

    const result = await client.query(
      `
      UPDATE pg_tenants SET
        name=$1, phone=$2, email=$3, gender=$4, father_name=$5,
        parent_phone=$6, occupation=$7, date_of_birth=$8,
        emergency_contact_name=$9, emergency_contact_phone=$10,
        permanent_address=$11, id_type=$12,
        profile_photo=COALESCE($13, profile_photo),
        id_proof=COALESCE($14, id_proof)
      WHERE id=$15 AND pg_id=$16 RETURNING *
    `,
      [
        name,
        phone,
        email,
        gender,
        father_name,
        parent_phone,
        occupation,
        date_of_birth || null,
        emergency_contact_name,
        emergency_contact_phone,
        permanent_address,
        id_type,
        profile_photo,
        id_proof,
        tenantId,
        pgId,
      ],
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "Tenant not found" });

    if (result.rows[0].tenant_profile_id) {
      await client.query(
        `
        UPDATE tenant_profiles SET
          name=$1, email=$2, gender=$3, father_name=$4, parent_phone=$5,
          occupation=$6, date_of_birth=$7,
          emergency_contact_name=$8, emergency_contact_phone=$9,
          permanent_address=$10, id_type=$11,
          profile_photo=COALESCE($12, profile_photo),
          id_proof=COALESCE($13, id_proof)
        WHERE id=$14
      `,
        [
          name,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
          result.rows[0].tenant_profile_id,
        ],
      );
    }

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── ASSIGN ROOM ───────────────────────────────────────────────
const assignRoom = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId, tenantId } = req.params;
    const {
      room_id,
      bed_id,
      joining_date,
      monthly_rent,
      deposit,
      rent_due_day,
    } = req.body;

    if (bed_id) {
      const bedCheck = await client.query(
        "SELECT status FROM beds WHERE id=$1 AND pg_id=$2",
        [bed_id, pgId],
      );
      if (bedCheck.rows[0]?.status === "occupied")
        return res.status(400).json({ message: "Bed already occupied" });
    }

    const old = await client.query(
      "SELECT room_id, bed_id FROM pg_tenants WHERE id=$1",
      [tenantId],
    );
    const { room_id: oldRoom, bed_id: oldBed } = old.rows[0] || {};
    if (oldBed)
      await client.query("UPDATE beds SET status='available' WHERE id=$1", [
        oldBed,
      ]);
    if (oldRoom) {
      const still = await client.query(
        "SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active' AND id!=$2",
        [oldRoom, tenantId],
      );
      if (parseInt(still.rows[0].count) === 0)
        await client.query("UPDATE rooms SET status='available' WHERE id=$1", [
          oldRoom,
        ]);
    }

    const tenant = await client.query(
      `
      UPDATE pg_tenants SET
        room_id=$1, bed_id=$2, joining_date=$3, monthly_rent=$4,
        deposit=$5, rent_due_day=$6, status='active'
      WHERE id=$7 AND pg_id=$8 RETURNING *
    `,
      [
        room_id,
        bed_id || null,
        joining_date,
        monthly_rent,
        deposit || 0,
        rent_due_day || 1,
        tenantId,
        pgId,
      ],
    );

    if (bed_id)
      await client.query("UPDATE beds SET status='occupied' WHERE id=$1", [
        bed_id,
      ]);
    if (room_id)
      await client.query("UPDATE rooms SET status='occupied' WHERE id=$1", [
        room_id,
      ]);

    await client.query("COMMIT");
    res.json(tenant.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── UPDATE RENT DETAILS ───────────────────────────────────────
const updateRentDetails = async (req, res) => {
  try {
    const { pgId, tenantId } = req.params;
    const { monthly_rent, deposit, rent_due_day } = req.body;
    const r = await pool.query(
      "UPDATE pg_tenants SET monthly_rent=$1, deposit=$2, rent_due_day=$3 WHERE id=$4 AND pg_id=$5 RETURNING *",
      [monthly_rent, deposit, rent_due_day, tenantId, pgId],
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ── MARK VACATED ──────────────────────────────────────────────
const markVacated = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId, tenantId } = req.params;
    const { vacated_date } = req.body;

    const t = await client.query(
      "SELECT room_id, bed_id FROM pg_tenants WHERE id=$1",
      [tenantId],
    );
    const { room_id, bed_id } = t.rows[0] || {};

    await client.query(
      "UPDATE pg_tenants SET status='vacated', vacated_date=$1, room_id=NULL, bed_id=NULL WHERE id=$2 AND pg_id=$3",
      [vacated_date || new Date(), tenantId, pgId],
    );
    if (bed_id)
      await client.query("UPDATE beds SET status='available' WHERE id=$1", [
        bed_id,
      ]);
    if (room_id) {
      const still = await client.query(
        "SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'",
        [room_id],
      );
      if (parseInt(still.rows[0].count) === 0)
        await client.query("UPDATE rooms SET status='available' WHERE id=$1", [
          room_id,
        ]);
    }

    await client.query(
      `
      INSERT INTO activity_logs (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
      VALUES ($1,$2,'tenant',$3,$4,$5)
    `,
      [
        pgId,
        `Tenant vacated: ${tenantId}`,
        tenantId,
        req.actor?.name || "Owner",
        req.actor?.role || "owner",
      ],
    );

    await client.query("COMMIT");
    res.json({ message: "Tenant marked as vacated" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── DELETE TENANT ─────────────────────────────────────────────
const deleteTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId, tenantId } = req.params;
    const t = await client.query(
      "SELECT room_id, bed_id FROM pg_tenants WHERE id=$1 AND pg_id=$2",
      [tenantId, pgId],
    );
    if (!t.rows.length) return res.status(404).json({ message: "Not found" });
    const { room_id, bed_id } = t.rows[0];

    await client.query("DELETE FROM pg_tenants WHERE id=$1", [tenantId]);
    if (bed_id)
      await client.query("UPDATE beds SET status='available' WHERE id=$1", [
        bed_id,
      ]);
    if (room_id) {
      const s = await client.query(
        "SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'",
        [room_id],
      );
      if (parseInt(s.rows[0].count) === 0)
        await client.query("UPDATE rooms SET status='available' WHERE id=$1", [
          room_id,
        ]);
    }
    await client.query("COMMIT");
    res.json({ message: "Tenant removed" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── INVITE TENANT ─────────────────────────────────────────────
const inviteTenant = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { name, phone, email } = req.body;
    if (!name || !phone)
      return res.status(400).json({ message: "Name and phone required" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO pg_tenants (pg_id, name, phone, email, status)
      VALUES ($1,$2,$3,$4,'pending') ON CONFLICT (pg_id, phone) DO NOTHING
    `,
      [pgId, name, phone, email],
    );

    await pool.query(
      `
      INSERT INTO invites (type, pg_id, token, phone, name, email, expires_at)
      VALUES ('tenant',$1,$2,$3,$4,$5,$6) ON CONFLICT (token) DO NOTHING
    `,
      [pgId, token, phone, name, email, expiresAt],
    );

    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/tenant?token=${token}`;
    res.json({ inviteLink, token, expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── QR CODE ───────────────────────────────────────────────────
const getQRCode = async (req, res) => {
  try {
    const { pgId } = req.params;
    const pg = await pool.query("SELECT name, city FROM pgs WHERE id=$1", [
      pgId,
    ]);
    if (!pg.rows.length)
      return res.status(404).json({ message: "PG not found" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO invites (type, pg_id, token, name, expires_at)
      VALUES ('tenant',$1,$2,'QR Invite',$3)
    `,
      [pgId, token, expiresAt],
    );

    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/tenant?token=${token}`;
    res.json({
      inviteLink,
      token,
      pgName: pg.rows[0].name,
      pgCity: pg.rows[0].city,
      expiresAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── TENANT SELF-REGISTRATION (public, no login) ───────────────
const submitTenantInvite = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      token,
      name,
      phone,
      email,
      gender,
      father_name,
      parent_phone,
      occupation,
      date_of_birth,
      emergency_contact_name,
      emergency_contact_phone,
      permanent_address,
      id_type,
    } = req.body;

    if (!token) return res.status(400).json({ message: "Token required" });

    const invite = await client.query(
      `SELECT * FROM invites WHERE token=$1 AND type='tenant' AND is_used=FALSE AND expires_at > NOW()`,
      [token],
    );
    if (!invite.rows.length)
      return res
        .status(400)
        .json({ message: "Invalid or expired invite link" });

    const pgId = invite.rows[0].pg_id;
    const profile_photo = req.files?.profile_photo?.[0]
      ? getFileUrl(req, req.files.profile_photo[0])
      : null;
    const id_proof = req.files?.id_proof?.[0]
      ? getFileUrl(req, req.files.id_proof[0])
      : null;

    // Upsert global profile
    let profId;
    const existingProf = await client.query(
      "SELECT id FROM tenant_profiles WHERE phone=$1",
      [phone],
    );
    if (existingProf.rows.length) {
      profId = existingProf.rows[0].id;
      await client.query(
        `
        UPDATE tenant_profiles SET
          name=$1, email=$2, gender=$3, father_name=$4, parent_phone=$5,
          occupation=$6, date_of_birth=$7,
          emergency_contact_name=$8, emergency_contact_phone=$9,
          permanent_address=$10, id_type=$11,
          profile_photo=COALESCE($12, profile_photo),
          id_proof=COALESCE($13, id_proof),
          invite_accepted=TRUE
        WHERE id=$14
      `,
        [
          name,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
          profId,
        ],
      );
    } else {
      const prof = await client.query(
        `
        INSERT INTO tenant_profiles
          (name, phone, email, gender, father_name, parent_phone, occupation,
           date_of_birth, emergency_contact_name, emergency_contact_phone,
           permanent_address, id_type, profile_photo, id_proof, invite_accepted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE) RETURNING id
      `,
        [
          name,
          phone,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
        ],
      );
      profId = prof.rows[0].id;
    }

    // Upsert pg_tenant
    const existTenant = await client.query(
      "SELECT id FROM pg_tenants WHERE pg_id=$1 AND phone=$2",
      [pgId, phone],
    );
    let tenantId;
    if (existTenant.rows.length) {
      tenantId = existTenant.rows[0].id;
      await client.query(
        `
        UPDATE pg_tenants SET
          tenant_profile_id=$1, name=$2, email=$3, gender=$4,
          father_name=$5, parent_phone=$6, occupation=$7, date_of_birth=$8,
          emergency_contact_name=$9, emergency_contact_phone=$10,
          permanent_address=$11, id_type=$12,
          profile_photo=COALESCE($13, profile_photo),
          id_proof=COALESCE($14, id_proof), status='pending'
        WHERE id=$15
      `,
        [
          profId,
          name,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
          tenantId,
        ],
      );
    } else {
      const t = await client.query(
        `
        INSERT INTO pg_tenants (
          pg_id, tenant_profile_id, name, phone, email, gender,
          father_name, parent_phone, occupation, date_of_birth,
          emergency_contact_name, emergency_contact_phone,
          permanent_address, id_type, profile_photo, id_proof, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending') RETURNING id
      `,
        [
          pgId,
          profId,
          name,
          phone,
          email,
          gender,
          father_name,
          parent_phone,
          occupation,
          date_of_birth || null,
          emergency_contact_name,
          emergency_contact_phone,
          permanent_address,
          id_type,
          profile_photo,
          id_proof,
        ],
      );
      tenantId = t.rows[0].id;
    }

    await client.query("UPDATE invites SET is_used=TRUE WHERE token=$1", [
      token,
    ]);
    await client.query("COMMIT");
    res.json({
      message:
        "Registration successful! The PG manager will assign your room shortly.",
      tenantId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505")
      return res
        .status(400)
        .json({ message: "You are already registered in this PG" });
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

module.exports = {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  assignRoom,
  updateRentDetails,
  markVacated,
  deleteTenant,
  inviteTenant,
  getQRCode,
  submitTenantInvite,
};
