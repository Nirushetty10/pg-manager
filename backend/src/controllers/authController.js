const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const signToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── LOGIN (unified: detects master_admin, owner, staff, tenant) ──
const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    const identifier = email?.toLowerCase() || phone;
    if (!identifier || !password)
      return res.status(400).json({ message: 'Email/phone and password required' });

    // 1. Master admin
    const adminRes = await pool.query('SELECT * FROM master_admins WHERE email=$1 AND is_active=TRUE', [identifier]);
    if (adminRes.rows.length > 0) {
      const admin = adminRes.rows[0];
      if (!await bcrypt.compare(password, admin.password))
        return res.status(400).json({ message: 'Invalid credentials' });
      const token = signToken({ id: admin.id, role: 'master_admin' });
      return res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: 'master_admin' } });
    }

    // 2. Owner
    const ownerRes = await pool.query(
      'SELECT * FROM owners WHERE (email=$1 OR phone=$1) AND is_active=TRUE AND invite_accepted=TRUE',
      [identifier]
    );
    if (ownerRes.rows.length > 0) {
      const owner = ownerRes.rows[0];
      if (!await bcrypt.compare(password, owner.password))
        return res.status(400).json({ message: 'Invalid credentials' });
      const pgs = await pool.query('SELECT id,name,city FROM pgs WHERE owner_id=$1 AND is_active=TRUE ORDER BY created_at', [owner.id]);
      const token = signToken({ id: owner.id, role: 'owner', ownerId: owner.id });
      return res.json({
        token,
        user: { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, role: 'owner' },
        pgs: pgs.rows,
        requirePGSelect: pgs.rows.length > 1,
        defaultPgId: pgs.rows.length === 1 ? pgs.rows[0].id : null,
      });
    }

    // 3. PG Staff
    const staffRes = await pool.query(
      'SELECT s.*, p.name as pg_name, p.owner_id FROM pg_staff s JOIN pgs p ON s.pg_id=p.id WHERE s.email=$1 AND s.is_active=TRUE',
      [identifier]
    );
    if (staffRes.rows.length > 0) {
      const staff = staffRes.rows[0];
      if (!await bcrypt.compare(password, staff.password))
        return res.status(400).json({ message: 'Invalid credentials' });
      const token = signToken({ id: staff.id, role: staff.role, pgId: staff.pg_id, ownerId: staff.owner_id });
      return res.json({
        token,
        user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role, pgId: staff.pg_id, pgName: staff.pg_name },
        defaultPgId: staff.pg_id,
      });
    }

    res.status(400).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMe = async (req, res) => {
  const { id, role } = req.actor;
  try {
    let user;
    if (role === 'master_admin') {
      const r = await pool.query('SELECT id,name,email FROM master_admins WHERE id=$1', [id]);
      user = { ...r.rows[0], role };
    } else if (role === 'owner') {
      const r = await pool.query('SELECT id,name,email,phone FROM owners WHERE id=$1', [id]);
      const pgs = await pool.query('SELECT id,name,city FROM pgs WHERE owner_id=$1 AND is_active=TRUE', [id]);
      user = { ...r.rows[0], role, pgs: pgs.rows };
    } else {
      const r = await pool.query('SELECT s.*,p.name as pg_name FROM pg_staff s JOIN pgs p ON s.pg_id=p.id WHERE s.id=$1', [id]);
      user = { ...r.rows[0], role };
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── INVITE OWNER ──────────────────────────────────────────────
const inviteOwner = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ message: 'Name, email, phone required' });

    const emailCheck = await pool.query('SELECT id FROM owners WHERE email=$1', [email.toLowerCase()]);
    if (emailCheck.rows.length) return res.status(400).json({ message: 'Email already registered' });

    const token = crypto.randomBytes(32).toString('hex');
    const owner = await pool.query(`
      INSERT INTO owners (name, email, phone, invite_token)
      VALUES ($1,$2,$3,$4) RETURNING id,name,email,phone
    `, [name, email.toLowerCase(), phone, token]);

    await pool.query(`INSERT INTO invites (type,token,email,phone,name) VALUES ('owner',$1,$2,$3,$4)`, [token, email, phone, name]);

    res.status(201).json({ owner: owner.rows[0], inviteLink: `/invite/owner?token=${token}`, token });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Email or phone already exists' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── OWNER REGISTRATION (from invite link) ────────────────────
const registerOwner = async (req, res) => {
  try {
    const { token, password } = req.body;
    const invite = await pool.query('SELECT * FROM invites WHERE token=$1 AND type=$2 AND is_used=FALSE AND expires_at > NOW()', [token, 'owner']);
    if (!invite.rows.length) return res.status(400).json({ message: 'Invalid or expired invite link' });

    const owner = await pool.query('SELECT * FROM owners WHERE invite_token=$1', [token]);
    if (!owner.rows.length) return res.status(400).json({ message: 'Owner not found' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE owners SET password=$1, invite_accepted=TRUE, invite_token=NULL WHERE id=$2', [hash, owner.rows[0].id]);
    await pool.query('UPDATE invites SET is_used=TRUE WHERE token=$1', [token]);

    res.json({ message: 'Registration successful', owner: { id: owner.rows[0].id, name: owner.rows[0].name, email: owner.rows[0].email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── INVITE TENANT ─────────────────────────────────────────────
const inviteTenant = async (req, res) => {
  try {
    const { pg_id, name, phone, email } = req.body;
    const token = crypto.randomBytes(32).toString('hex');

    // Create minimal pg_tenant record (pending)
    await pool.query(`
      INSERT INTO pg_tenants (pg_id, name, phone, email, status)
      VALUES ($1,$2,$3,$4,'pending') ON CONFLICT (pg_id, phone) DO NOTHING
    `, [pg_id, name, phone, email]);

    await pool.query(`INSERT INTO invites (type,pg_id,token,phone,name,email) VALUES ('tenant',$1,$2,$3,$4,$5)`, [pg_id, token, phone, name, email]);

    res.json({ inviteLink: `/invite/tenant?token=${token}`, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── VALIDATE INVITE TOKEN ────────────────────────────────────
const validateInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await pool.query('SELECT * FROM invites WHERE token=$1 AND is_used=FALSE AND expires_at > NOW()', [token]);
    if (!invite.rows.length) return res.status(400).json({ message: 'Invalid or expired invite link' });
    res.json({ invite: invite.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { login, getMe, inviteOwner, registerOwner, inviteTenant, validateInvite };
