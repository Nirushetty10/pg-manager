const pool = require('../config/db');

const getRooms = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { floor, type } = req.query;
    let conds = ['r.pg_id=$1'], params = [pgId], idx = 2;
    if (floor && floor!=='all') { conds.push(`r.floor=$${idx++}`); params.push(parseInt(floor)); }
    if (type && type!=='all') { conds.push(`r.room_type=$${idx++}`); params.push(type); }
    const where = `WHERE ${conds.join(' AND ')}`;

    const rooms = await pool.query(`
      SELECT r.*,
        COUNT(b.id) FILTER (WHERE b.status='available') as available_beds,
        COUNT(b.id) FILTER (WHERE b.status='occupied') as occupied_beds_count
      FROM rooms r LEFT JOIN beds b ON b.room_id=r.id
      ${where} GROUP BY r.id ORDER BY r.floor, r.room_number
    `, params);

    const roomsWithBeds = await Promise.all(rooms.rows.map(async (room) => {
      const beds = await pool.query(`
        SELECT b.*, pt.id as tenant_id, pt.name as tenant_name, pt.joining_date, pt.phone as tenant_phone, pt.monthly_rent as tenant_rent
        FROM beds b LEFT JOIN pg_tenants pt ON pt.bed_id=b.id AND pt.status='active'
        WHERE b.room_id=$1 ORDER BY b.bed_label
      `, [room.id]);
      return { ...room, beds: beds.rows };
    }));

    const stats = await pool.query(`
      SELECT COUNT(*) as total_rooms,
        COUNT(*) FILTER (WHERE status='available') as available_rooms,
        COUNT(*) FILTER (WHERE status='occupied') as occupied_rooms,
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1) as total_beds,
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='available') as available_beds,
        (SELECT COUNT(*) FROM beds WHERE pg_id=$1 AND status='occupied') as occupied_beds
      FROM rooms WHERE pg_id=$1
    `, [pgId]);

    res.json({ rooms: roomsWithBeds, stats: stats.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

const getRoomById = async (req, res) => {
  try {
    const room = await pool.query('SELECT * FROM rooms WHERE id=$1 AND pg_id=$2', [req.params.roomId, req.params.pgId]);
    if (!room.rows.length) return res.status(404).json({ message: 'Room not found' });
    const beds = await pool.query(`
      SELECT b.*, pt.id as tenant_id, pt.name as tenant_name, pt.phone as tenant_phone, pt.joining_date
      FROM beds b LEFT JOIN pg_tenants pt ON pt.bed_id=b.id AND pt.status='active'
      WHERE b.room_id=$1 ORDER BY b.bed_label
    `, [req.params.roomId]);
    res.json({ ...room.rows[0], beds: beds.rows });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const createRoom = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { room_number, floor, room_type, amenities, monthly_rent, total_beds, notes } = req.body;
    if (!room_number || !monthly_rent) return res.status(400).json({ message: 'Room number and rent required' });

    const room = await client.query(`
      INSERT INTO rooms (pg_id,room_number,floor,room_type,amenities,monthly_rent,total_beds,notes,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'available') RETURNING *
    `, [pgId, room_number, floor||1, room_type||'single', amenities||[], monthly_rent, total_beds||1, notes]);

    for (const label of ['A','B','C','D'].slice(0, total_beds||1)) {
      await client.query('INSERT INTO beds (room_id,pg_id,bed_label,status) VALUES ($1,$2,$3,$4)', [room.rows[0].id, pgId, label, 'available']);
    }
    await client.query('COMMIT');
    res.status(201).json(room.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code==='23505') return res.status(400).json({ message: 'Room number already exists' });
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

const updateRoom = async (req, res) => {
  try {
    const { room_number, floor, room_type, amenities, monthly_rent, status, notes } = req.body;
    const r = await pool.query(`
      UPDATE rooms SET room_number=$1,floor=$2,room_type=$3,amenities=$4,monthly_rent=$5,status=$6,notes=$7
      WHERE id=$8 AND pg_id=$9 RETURNING *
    `, [room_number, floor, room_type, amenities, monthly_rent, status, notes, req.params.roomId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Room not found' });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code==='23505') return res.status(400).json({ message: 'Room number already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const hasActive = await pool.query("SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'", [req.params.roomId]);
    if (parseInt(hasActive.rows[0].count)>0) return res.status(400).json({ message: 'Cannot delete room with active tenants' });
    await pool.query('DELETE FROM rooms WHERE id=$1 AND pg_id=$2', [req.params.roomId, req.params.pgId]);
    res.json({ message: 'Room deleted' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const assignBed = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { bed_id, tenant_id } = req.body;

    const bed = await client.query('SELECT * FROM beds WHERE id=$1 AND pg_id=$2', [bed_id, pgId]);
    if (!bed.rows.length) return res.status(404).json({ message: 'Bed not found' });
    if (bed.rows[0].status==='occupied') return res.status(400).json({ message: 'Bed already occupied' });

    // Free old bed if tenant had one
    const tenant = await client.query('SELECT bed_id,room_id FROM pg_tenants WHERE id=$1', [tenant_id]);
    const { bed_id: oldBed, room_id: oldRoom } = tenant.rows[0] || {};
    if (oldBed) await client.query("UPDATE beds SET status='available' WHERE id=$1", [oldBed]);

    await client.query("UPDATE beds SET status='occupied' WHERE id=$1", [bed_id]);
    await client.query("UPDATE rooms SET status='occupied' WHERE id=$1", [bed.rows[0].room_id]);
    await client.query("UPDATE pg_tenants SET bed_id=$1,room_id=$2,status='active' WHERE id=$3", [bed_id, bed.rows[0].room_id, tenant_id]);

    // Check if old room now empty
    if (oldRoom && oldRoom !== bed.rows[0].room_id) {
      const still = await client.query("SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'", [oldRoom]);
      if (parseInt(still.rows[0].count)===0) await client.query("UPDATE rooms SET status='available' WHERE id=$1", [oldRoom]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Bed assigned' });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
};

// ── UNASSIGN BED (make tenant pending) ────────────────────────
const unassignBed = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { tenant_id } = req.body;

    const tenant = await client.query('SELECT bed_id,room_id FROM pg_tenants WHERE id=$1 AND pg_id=$2', [tenant_id, pgId]);
    if (!tenant.rows.length) return res.status(404).json({ message: 'Tenant not found' });
    const { bed_id, room_id } = tenant.rows[0];

    await client.query("UPDATE pg_tenants SET bed_id=NULL,room_id=NULL,status='pending' WHERE id=$1", [tenant_id]);
    if (bed_id) await client.query("UPDATE beds SET status='available' WHERE id=$1", [bed_id]);
    if (room_id) {
      const still = await client.query("SELECT COUNT(*) FROM pg_tenants WHERE room_id=$1 AND status='active'", [room_id]);
      if (parseInt(still.rows[0].count)===0) await client.query("UPDATE rooms SET status='available' WHERE id=$1", [room_id]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Tenant unassigned from bed' });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
};

module.exports = { getRooms, getRoomById, createRoom, updateRoom, deleteRoom, assignBed, unassignBed };
