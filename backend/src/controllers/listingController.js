// backend/src/controllers/listingController.js
const pool = require('../config/db');

/* ── Haversine distance (km) between two lat/lng points ────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Score a PG for recommendation (0–100) ─────────────────────── */
function scoreRecommendation(candidate, reference) {
  let score = 0;

  // Same city +30
  if (
    candidate.city?.toLowerCase() === reference.city?.toLowerCase()
  ) score += 30;

  // Same PG type +20
  if (candidate.pg_type === reference.pg_type) score += 20;

  // Price within ±30% of reference min rent +25
  const refRent = parseFloat(reference.min_rent || 0);
  const canRent = parseFloat(candidate.min_rent || 0);
  if (refRent > 0 && canRent > 0) {
    const pctDiff = Math.abs(canRent - refRent) / refRent;
    if (pctDiff <= 0.15) score += 25;
    else if (pctDiff <= 0.30) score += 15;
    else if (pctDiff <= 0.50) score += 8;
  }

  // Shared amenities (up to +20, 2pts each up to 10)
  const refAm = reference.amenities_list || [];
  const canAm = candidate.amenities_list || [];
  const shared = canAm.filter(a => refAm.includes(a)).length;
  score += Math.min(shared * 2, 20);

  // Geographic proximity — if both have lat/lng +5–15
  if (
    candidate.lat && candidate.lng &&
    reference.lat && reference.lng
  ) {
    const dist = haversine(
      parseFloat(reference.lat), parseFloat(reference.lng),
      parseFloat(candidate.lat), parseFloat(candidate.lng)
    );
    if (dist < 2) score += 15;
    else if (dist < 5) score += 10;
    else if (dist < 15) score += 5;
  }

  // Has images +5
  if ((candidate.images?.length || 0) > 0) score += 5;

  return Math.min(score, 100);
}

/* ════════════════════════════════════════════════════════════════
   GET /api/listings
   Public — list all PGs with available beds
   Query params:
     q             – free text search (name, city, nearby)
     city          – city filter
     pg_type       – male | female | mixed | co-living
     amenities     – comma-separated list
     min_price     – minimum rent
     max_price     – maximum rent
     lat, lng, radius_km – nearby search
     sort          – price_asc | price_desc | newest | rating
     page, limit
════════════════════════════════════════════════════════════════ */
const getListings = async (req, res) => {
  try {
    const {
      q, city, pg_type, amenities,
      min_price, max_price,
      lat, lng, radius_km = 10,
      sort = 'newest',
      page = 1, limit = 20,
    } = req.query;

    const offset = (page - 1) * limit;

    // Base query — joins for real-time vacancy + rent data
    const baseQuery = `
      WITH pg_stats AS (
        SELECT
          p.id,
          COUNT(b.id) FILTER (WHERE b.status = 'available') AS vacant_beds,
          COUNT(b.id)                                        AS total_beds,
          MIN(r.monthly_rent)                                AS min_rent,
          MAX(r.monthly_rent)                                AS max_rent,
          COUNT(pt.id) FILTER (WHERE pt.status = 'active')  AS active_tenants
        FROM pgs p
        LEFT JOIN rooms r ON r.pg_id = p.id
        LEFT JOIN beds b ON b.pg_id = p.id
        LEFT JOIN pg_tenants pt ON pt.pg_id = p.id
        WHERE p.is_active = TRUE
        GROUP BY p.id
      )
      SELECT
        p.id, p.name, p.city, p.address, p.phone, p.email,
        p.logo_url, p.images, p.description, p.pg_type,
        p.amenities_list, p.rules, p.nearby,
        p.lat, p.lng,
        p.created_at,
        COALESCE(s.vacant_beds, 0)    AS vacant_beds,
        COALESCE(s.total_beds, 0)     AS total_beds,
        COALESCE(s.min_rent, 0)       AS min_rent,
        COALESCE(s.max_rent, 0)       AS max_rent,
        COALESCE(s.active_tenants, 0) AS active_tenants,
        (COALESCE(s.vacant_beds, 0) > 0) AS has_vacancy
      FROM pgs p
      LEFT JOIN pg_stats s ON s.id = p.id
      WHERE p.is_active = TRUE
    `;

    // Collect all results, then filter in JS (for distance calc)
    const allPGs = await pool.query(baseQuery);
    let rows = allPGs.rows;

    // ── Free text search ─────────────────────────────────────────
    if (q) {
      const q_lower = q.toLowerCase();
      rows = rows.filter(pg =>
        pg.name?.toLowerCase().includes(q_lower) ||
        pg.city?.toLowerCase().includes(q_lower) ||
        pg.address?.toLowerCase().includes(q_lower) ||
        pg.description?.toLowerCase().includes(q_lower) ||
        pg.nearby?.toLowerCase().includes(q_lower)
      );
    }

    // ── City filter ──────────────────────────────────────────────
    if (city) {
      rows = rows.filter(pg =>
        pg.city?.toLowerCase() === city.toLowerCase()
      );
    }

    // ── PG Type filter ───────────────────────────────────────────
    if (pg_type && pg_type !== 'all') {
      rows = rows.filter(pg => pg.pg_type === pg_type);
    }

    // ── Price range filter ───────────────────────────────────────
    if (min_price) {
      rows = rows.filter(pg => parseFloat(pg.max_rent) >= parseFloat(min_price));
    }
    if (max_price) {
      rows = rows.filter(pg => parseFloat(pg.min_rent) <= parseFloat(max_price));
    }

    // ── Amenities filter ─────────────────────────────────────────
    if (amenities) {
      const requiredAm = amenities.split(',').map(a => a.trim().toUpperCase());
      rows = rows.filter(pg => {
        const pgAm = (pg.amenities_list || []).map(a => a.toUpperCase());
        return requiredAm.every(am => pgAm.includes(am));
      });
    }

    // ── Nearby (Haversine) ───────────────────────────────────────
    let userLat = null, userLng = null;
    if (lat && lng) {
      userLat = parseFloat(lat);
      userLng = parseFloat(lng);
      const radius = parseFloat(radius_km);
      rows = rows
        .filter(pg => pg.lat && pg.lng)
        .map(pg => ({
          ...pg,
          distance_km: haversine(
            userLat, userLng,
            parseFloat(pg.lat), parseFloat(pg.lng)
          ),
        }))
        .filter(pg => pg.distance_km <= radius);
    }

    // ── Sort ──────────────────────────────────────────────────────
    switch (sort) {
      case 'price_asc':
        rows.sort((a, b) => parseFloat(a.min_rent) - parseFloat(b.min_rent));
        break;
      case 'price_desc':
        rows.sort((a, b) => parseFloat(b.min_rent) - parseFloat(a.min_rent));
        break;
      case 'distance':
        if (userLat) rows.sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999));
        break;
      case 'vacancy':
        rows.sort((a, b) => parseInt(b.vacant_beds) - parseInt(a.vacant_beds));
        break;
      case 'newest':
      default:
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // ── Parse images JSON ─────────────────────────────────────────
    rows = rows.map(pg => ({
      ...pg,
      images: (() => {
        try { return typeof pg.images === 'string' ? JSON.parse(pg.images) : (pg.images || []); }
        catch { return []; }
      })(),
    }));

    // ── Aggregate data for sidebar ────────────────────────────────
    const allCities = [...new Set(allPGs.rows.map(p => p.city).filter(Boolean))].sort();
    const totalCount = rows.length;

    // ── Paginate ──────────────────────────────────────────────────
    const paginated = rows.slice(offset, offset + parseInt(limit));

    // ── PGs with coords for map ───────────────────────────────────
    const mapPGs = rows
      .filter(pg => pg.lat && pg.lng)
      .map(pg => ({
        id: pg.id, name: pg.name, city: pg.city,
        lat: parseFloat(pg.lat), lng: parseFloat(pg.lng),
        min_rent: pg.min_rent, vacant_beds: pg.vacant_beds,
        has_vacancy: pg.has_vacancy, pg_type: pg.pg_type,
        logo_url: pg.logo_url,
      }));

    res.json({
      listings: paginated,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      mapPGs,
      allCities,
    });
  } catch (e) {
    console.error('getListings error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/listings/:pgId
   Public — single PG detail with rooms + vacancy
════════════════════════════════════════════════════════════════ */
const getListingById = async (req, res) => {
  try {
    const { pgId } = req.params;

    const pgRes = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status='available') AS vacant_beds,
        COUNT(DISTINCT b.id)                                      AS total_beds,
        COUNT(DISTINCT pt.id) FILTER (WHERE pt.status='active')  AS active_tenants
      FROM pgs p
      LEFT JOIN beds b ON b.pg_id = p.id
      LEFT JOIN pg_tenants pt ON pt.pg_id = p.id
      WHERE p.id = $1 AND p.is_active = TRUE
      GROUP BY p.id
    `, [pgId]);

    if (!pgRes.rows.length) return res.status(404).json({ message: 'PG not found' });

    // Parse images
    const pg = pgRes.rows[0];
    pg.images = (() => {
      try { return typeof pg.images === 'string' ? JSON.parse(pg.images) : (pg.images || []); }
      catch { return []; }
    })();

    // Rooms with vacancy (don't expose tenant names — public facing)
    const rooms = await pool.query(`
      SELECT r.id, r.room_number, r.floor, r.room_type,
             r.monthly_rent, r.amenities, r.total_beds,
             COUNT(b.id) FILTER (WHERE b.status='available') AS vacant_beds,
             COUNT(b.id)                                      AS total_beds_actual
      FROM rooms r
      LEFT JOIN beds b ON b.room_id = r.id
      WHERE r.pg_id = $1
      GROUP BY r.id
      ORDER BY r.floor, r.room_number
    `, [pgId]);

    // Rent range
    const rents = rooms.rows.map(r => parseFloat(r.monthly_rent));
    const minRent = Math.min(...rents) || 0;
    const maxRent = Math.max(...rents) || 0;

    res.json({
      pg: { ...pg, min_rent: minRent, max_rent: maxRent },
      rooms: rooms.rows,
    });
  } catch (e) {
    console.error('getListingById error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/listings/:pgId/recommended
   Public — similar PGs using scoring algorithm
════════════════════════════════════════════════════════════════ */
const getRecommendations = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { limit = 4 } = req.query;

    // Get reference PG
    const refRes = await pool.query(`
      SELECT p.*,
        MIN(r.monthly_rent) AS min_rent,
        COUNT(b.id) FILTER (WHERE b.status='available') AS vacant_beds
      FROM pgs p
      LEFT JOIN rooms r ON r.pg_id = p.id
      LEFT JOIN beds b ON b.pg_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [pgId]);
    if (!refRes.rows.length) return res.json({ recommendations: [] });
    const reference = refRes.rows[0];
    reference.amenities_list = reference.amenities_list || [];

    // Get all other active PGs with vacancy
    const candidates = await pool.query(`
      SELECT p.*,
        MIN(r.monthly_rent) AS min_rent,
        COUNT(b.id) FILTER (WHERE b.status='available') AS vacant_beds
      FROM pgs p
      LEFT JOIN rooms r ON r.pg_id = p.id
      LEFT JOIN beds b ON b.pg_id = p.id
      WHERE p.id != $1 AND p.is_active = TRUE
      GROUP BY p.id
      HAVING COUNT(b.id) FILTER (WHERE b.status='available') > 0
    `, [pgId]);

    // Score and sort
    const scored = candidates.rows
      .map(pg => {
        pg.amenities_list = pg.amenities_list || [];
        pg.images = (() => {
          try { return typeof pg.images === 'string' ? JSON.parse(pg.images) : (pg.images || []); }
          catch { return []; }
        })();
        return { ...pg, _score: scoreRecommendation(pg, reference) };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, parseInt(limit));

    res.json({ recommendations: scored, referenceId: pgId });
  } catch (e) {
    console.error('getRecommendations error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getListings, getListingById, getRecommendations };
