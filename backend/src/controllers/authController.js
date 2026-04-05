const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

// ── LOGIN ─────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    const identifier = email?.toLowerCase().trim() || phone?.trim();
    if (!identifier || !password)
      return res
        .status(400)
        .json({ message: "Email/phone and password required" });

    // 1. Master Admin
    const adminRes = await pool.query(
      "SELECT * FROM master_admins WHERE email=$1 AND is_active=TRUE",
      [identifier],
    );
    if (adminRes.rows.length) {
      const admin = adminRes.rows[0];
      if (!(await bcrypt.compare(password, admin.password)))
        return res.status(400).json({ message: "Invalid credentials" });
      const token = signToken({ id: admin.id, role: "master_admin" });
      return res.json({
        token,
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: "master_admin",
        },
      });
    }

    // 2. Owner
    const ownerRes = await pool.query(
      "SELECT * FROM owners WHERE (email=$1 OR phone=$1) AND is_active=TRUE AND invite_accepted=TRUE",
      [identifier],
    );
    if (ownerRes.rows.length) {
      const owner = ownerRes.rows[0];
      if (!owner.password)
        return res.status(400).json({
          message: "Account setup not complete. Please use your invite link.",
        });
      if (!(await bcrypt.compare(password, owner.password)))
        return res.status(400).json({ message: "Invalid credentials" });
      const pgs = await pool.query(
        "SELECT id,name,city FROM pgs WHERE owner_id=$1 AND is_active=TRUE ORDER BY created_at",
        [owner.id],
      );
      const token = signToken({
        id: owner.id,
        role: "owner",
        ownerId: owner.id,
      });
      return res.json({
        token,
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          role: "owner",
        },
        pgs: pgs.rows,
        requirePGSelect: pgs.rows.length > 1,
        defaultPgId: pgs.rows.length === 1 ? pgs.rows[0].id : null,
      });
    }

    // 3. PG Staff
    const staffRes = await pool.query(
      `SELECT s.*, p.name AS pg_name, p.owner_id
       FROM pg_staff s JOIN pgs p ON s.pg_id=p.id
       WHERE s.email=$1 AND s.is_active=TRUE`,
      [identifier],
    );
    if (staffRes.rows.length) {
      const staff = staffRes.rows[0];
      if (!(await bcrypt.compare(password, staff.password)))
        return res.status(400).json({ message: "Invalid credentials" });
      const token = signToken({
        id: staff.id,
        role: staff.role,
        pgId: staff.pg_id,
        ownerId: staff.owner_id,
      });
      return res.json({
        token,
        user: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          pgId: staff.pg_id,
          pgName: staff.pg_name,
        },
        defaultPgId: staff.pg_id,
      });
    }

    res.status(400).json({ message: "Invalid credentials" });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── GET ME ────────────────────────────────────────────────────
const getMe = async (req, res) => {
  const { id, role } = req.actor;
  try {
    let user;
    if (role === "master_admin") {
      const r = await pool.query(
        "SELECT id,name,email FROM master_admins WHERE id=$1",
        [id],
      );
      user = { ...r.rows[0], role };
    } else if (role === "owner") {
      const r = await pool.query(
        "SELECT id,name,email,phone FROM owners WHERE id=$1",
        [id],
      );
      const pgs = await pool.query(
        "SELECT id,name,city FROM pgs WHERE owner_id=$1 AND is_active=TRUE",
        [id],
      );
      user = { ...r.rows[0], role, pgs: pgs.rows };
    } else {
      const r = await pool.query(
        "SELECT s.*,p.name AS pg_name FROM pg_staff s JOIN pgs p ON s.pg_id=p.id WHERE s.id=$1",
        [id],
      );
      user = { ...r.rows[0], role };
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ── INVITE OWNER ──────────────────────────────────────────────
const inviteOwner = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone)
      return res
        .status(400)
        .json({ message: "Name, email and phone are required" });

    const emailLower = email.toLowerCase().trim();

    // Check if already registered and active
    const existing = await pool.query(
      "SELECT id, invite_accepted FROM owners WHERE email=$1 OR phone=$2",
      [emailLower, phone],
    );
    if (existing.rows.length && existing.rows[0].invite_accepted) {
      return res
        .status(400)
        .json({ message: "Owner already registered with this email/phone" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let ownerId;
    if (existing.rows.length) {
      // Re-invite: update token
      ownerId = existing.rows[0].id;
      await pool.query(
        "UPDATE owners SET invite_token=$1, name=$2 WHERE id=$3",
        [token, name, ownerId],
      );
      // Invalidate previous invites for this owner
      await pool.query(
        "UPDATE invites SET is_used=TRUE WHERE type='owner' AND email=$1 AND is_used=FALSE",
        [emailLower],
      );
    } else {
      // New invite
      const ownerRes = await pool.query(
        "INSERT INTO owners (name, email, phone, invite_token) VALUES ($1,$2,$3,$4) RETURNING id",
        [name, emailLower, phone, token],
      );
      ownerId = ownerRes.rows[0].id;
    }

    // Insert into invites table
    await pool.query(
      `INSERT INTO invites (type, token, email, phone, name, expires_at)
       VALUES ('owner', $1, $2, $3, $4, $5)`,
      [token, emailLower, phone, name, expiresAt],
    );

    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/owner?token=${token}`;
    res.status(201).json({
      message: "Invite sent successfully",
      inviteLink,
      token,
      expiresAt,
    });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ message: "Email or phone already exists" });
    console.error("inviteOwner error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── VALIDATE INVITE TOKEN ─────────────────────────────────────
// Used by frontend to show invite details before form submission
const validateInvite = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: "Token is required" });

    // ── Strategy: check BOTH the invites table AND the owners.invite_token field
    // This handles cases where one source is ahead of the other

    // 1. Check invites table
    const inviteRes = await pool.query(
      `SELECT * FROM invites
       WHERE token=$1 AND is_used=FALSE AND expires_at > NOW()
       AND type IN ('owner','tenant')`,
      [token],
    );

    if (inviteRes.rows.length) {
      return res.json({ invite: inviteRes.rows[0] });
    }

    // 2. Fallback: check owners.invite_token directly
    // (handles case where invite row wasn't created but token was set on owner)
    const ownerRes = await pool.query(
      "SELECT id, name, email, phone FROM owners WHERE invite_token=$1 AND invite_accepted=FALSE",
      [token],
    );

    if (ownerRes.rows.length) {
      const owner = ownerRes.rows[0];
      return res.json({
        invite: {
          type: "owner",
          token,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          is_used: false,
        },
      });
    }

    // 3. Check if already registered (so we can show a better error)
    const usedInvite = await pool.query(
      "SELECT is_used FROM invites WHERE token=$1",
      [token],
    );
    if (usedInvite.rows.length && usedInvite.rows[0].is_used) {
      return res.status(400).json({
        message:
          "This invite link has already been used. Please log in instead.",
        code: "ALREADY_USED",
      });
    }

    return res.status(400).json({
      message: "Invalid or expired invite link. Please ask for a new invite.",
      code: "INVALID",
    });
  } catch (err) {
    console.error("validateInvite error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── REGISTER OWNER (from invite link) ─────────────────────────
const registerOwner = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { token, password } = req.body;
    if (!token) return res.status(400).json({ message: "Token is required" });
    if (!password || password.length < 6)
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });

    // ── Find the owner by invite_token (most reliable source)
    const ownerRes = await client.query(
      "SELECT * FROM owners WHERE invite_token=$1 AND invite_accepted=FALSE",
      [token],
    );

    if (!ownerRes.rows.length) {
      // Maybe already registered?
      const completedOwner = await client.query(
        "SELECT id FROM owners WHERE invite_accepted=TRUE AND email=(SELECT email FROM invites WHERE token=$1 LIMIT 1)",
        [token],
      );
      if (completedOwner.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Account already registered. Please log in instead.",
          code: "ALREADY_REGISTERED",
        });
      }
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Invalid or expired invite link. Please request a new invite.",
        code: "INVALID",
      });
    }

    const owner = ownerRes.rows[0];

    // Hash password and activate account
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      "UPDATE owners SET password=$1, invite_accepted=TRUE, invite_token=NULL WHERE id=$2",
      [hash, owner.id],
    );

    // Mark invite as used (don't fail if invite row doesn't exist)
    await client.query("UPDATE invites SET is_used=TRUE WHERE token=$1", [
      token,
    ]);

    await client.query("COMMIT");

    res.json({
      message: "Account created successfully",
      owner: { id: owner.id, name: owner.name, email: owner.email },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("registerOwner error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  } finally {
    client.release();
  }
};

// REGISTER TENANT
const registerTenant = async (req, res) => {
  const client = await pool.connect();
  try {
    const { token, password } = req.body;

    if (!password || password.length < 6) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    // 1. Validate invite
    const inviteRes = await client.query(
      `SELECT * FROM invites 
       WHERE token=$1 AND type='tenant' AND is_used=FALSE AND expires_at > NOW()`,
      [token],
    );

    if (!inviteRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Invalid or expired invite link",
      });
    }

    const invite = inviteRes.rows[0];

    // 2. Create/update tenant profile
    let profileId;
    const existing = await client.query(
      "SELECT id FROM tenant_profiles WHERE phone=$1",
      [invite.phone],
    );

    const hashedPassword = await bcrypt.hash(password, 12);

    if (existing.rows.length) {
      profileId = existing.rows[0].id;

      const updateRes = await client.query(
        "UPDATE tenant_profiles SET name=$1, email=$2, password=$3 WHERE id=$4",
        [invite.name, invite.email || null, hashedPassword, profileId],
      );
    } else {
      const profile = await client.query(
        `INSERT INTO tenant_profiles (name, phone, email, password)
        VALUES ($1,$2,$3,$4)
        RETURNING id`,
        [invite.name, invite.phone, invite.email || null, hashedPassword],
      );
      profileId = profile.rows[0].id;
    }

    // 3. Create/update pg tenant
    const tenant = await client.query(
      `INSERT INTO pg_tenants (pg_id, tenant_profile_id, name, phone, email, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       ON CONFLICT (pg_id, phone) DO UPDATE 
       SET tenant_profile_id=$2, status='active'
       RETURNING *`,
      [invite.pg_id, profileId, invite.name, invite.phone, invite.email],
    );

    // 4. Mark invite used
    await client.query("UPDATE invites SET is_used=TRUE WHERE token=$1", [
      token,
    ]);

    await client.query("COMMIT");

    res.json({
      message: "Tenant account created successfully",
      tenant: tenant.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ── INVITE TENANT (from tenant controller, also exposed here) ─
const inviteTenant = async (req, res) => {
  try {
    const { pg_id, name, phone, email } = req.body;
    if (!name || !phone)
      return res.status(400).json({ message: "Name and phone required" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO invites (type, pg_id, token, phone, name, email, expires_at)
       VALUES ('tenant', $1, $2, $3, $4, $5, $6)`,
      [pg_id, token, phone, name, email, expiresAt],
    );

    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/tenant?token=${token}`;
    res.json({ inviteLink, token, expiresAt });
  } catch (err) {
    console.error("inviteTenant error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  login,
  getMe,
  inviteOwner,
  registerOwner,
  validateInvite,
  inviteTenant,
  registerTenant,
};
