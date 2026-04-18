// frontend/src/pages/listing/ListingsPage.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, TextField, Button, Chip,
  InputAdornment, Select, MenuItem, FormControl, InputLabel, Slider,
  CircularProgress, Divider, Avatar, IconButton, Drawer, Badge,
  ToggleButtonGroup, ToggleButton, Collapse, Alert, Tooltip
} from '@mui/material';
import {
  Search, LocationOn, FilterList, Map, ViewList, Close, Business,
  KingBed, People, Wifi, AcUnit, LocalParking, Restaurant, Security,
  Power, LocalLaundryService, Tv, Directions, MyLocation, FiberManualRecord,
  Star, ArrowForward, ExpandMore, ExpandLess, SentimentVeryDissatisfied
} from '@mui/icons-material';

const API = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
const LISTING_API = `${API}/api/listings`;

const fm = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const AMENITY_ICONS = {
  'WiFi':         <Wifi sx={{ fontSize: 14 }} />,
  'WIFI':         <Wifi sx={{ fontSize: 14 }} />,
  'AC':           <AcUnit sx={{ fontSize: 14 }} />,
  'Parking':      <LocalParking sx={{ fontSize: 14 }} />,
  'Meals':        <Restaurant sx={{ fontSize: 14 }} />,
  'Security':     <Security sx={{ fontSize: 14 }} />,
  'Power Backup': <Power sx={{ fontSize: 14 }} />,
  'Laundry':      <LocalLaundryService sx={{ fontSize: 14 }} />,
  'TV':           <Tv sx={{ fontSize: 14 }} />,
};
const PG_TYPE_COLOR = {
  male: '#1B3A6B', female: '#BE185D', mixed: '#059669', 'co-living': '#7C3AED'
};
const PG_TYPE_LABEL = {
  male: 'Male', female: 'Female', mixed: 'Co-ed', 'co-living': 'Co-living'
};

// ── Map component using Leaflet (loaded via CDN) ───────────────────────────
function LeafletMap({ pgs, onSelect, selectedId }) {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    // Load Leaflet CSS + JS from CDN if not loaded
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      initMap();
    }
    return () => { if (leafletRef.current) leafletRef.current.remove(); };
  }, []);

  useEffect(() => {
    if (leafletRef.current && pgs.length > 0) updateMarkers();
  }, [pgs, selectedId]);

  const initMap = () => {
    if (!mapRef.current || leafletRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    leafletRef.current = map;

    // Center on India if no PGs
    const center = pgs.length > 0
      ? [pgs[0].lat, pgs[0].lng]
      : [20.5937, 78.9629];
    map.setView(center, pgs.length > 0 ? 13 : 5);
    updateMarkers();
  };

  const updateMarkers = () => {
    const L = window.L;
    if (!L || !leafletRef.current) return;
    const map = leafletRef.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const bounds = [];
    pgs.forEach(pg => {
      if (!pg.lat || !pg.lng) return;
      const isSelected = String(pg.id) === String(selectedId);
      const color = pg.has_vacancy ? (isSelected ? '#1B3A6B' : '#059669') : '#9CA3AF';

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            background:${color};
            color:#fff;
            padding:4px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:700;
            font-family:Arial;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            border:2px solid ${isSelected ? '#FCD34D' : '#fff'};
            cursor:pointer;
          ">
            ${fm(pg.min_rent)}
          </div>`,
        iconAnchor: [30, 10],
      });

      const marker = L.marker([parseFloat(pg.lat), parseFloat(pg.lng)], { icon })
        .addTo(map)
        .on('click', () => onSelect(pg.id));

      marker.bindPopup(`
        <div style="min-width:180px;font-family:Arial">
          <strong style="font-size:13px">${pg.name}</strong><br/>
          <span style="color:#6B7280;font-size:11px">${pg.city}</span><br/>
          <div style="margin-top:6px;display:flex;justify-content:space-between">
            <span style="color:#1B3A6B;font-weight:700">From ${fm(pg.min_rent)}/mo</span>
            <span style="color:${pg.has_vacancy ? '#059669' : '#DC2626'};font-weight:700;font-size:11px">
              ${pg.has_vacancy ? `${pg.vacant_beds} beds free` : 'Full'}
            </span>
          </div>
        </div>
      `);

      markersRef.current.push(marker);
      bounds.push([parseFloat(pg.lat), parseFloat(pg.lng)]);
    });

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  };

  return <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: 12, zIndex: 0 }} />;
}

// ── Single PG card ─────────────────────────────────────────────────────────
function PGCard({ pg, onSelect, isHighlighted }) {
  const navigate = useNavigate();
  const images = pg.images || [];
  const firstImage = images[0];
  const typeColor = PG_TYPE_COLOR[pg.pg_type] || '#6B7280';

  return (
    <Card
      onClick={() => navigate(`/listings/${pg.id}`)}
      sx={{
        cursor: 'pointer', mb: 2, border: '1px solid',
        borderColor: isHighlighted ? '#1B3A6B' : '#E5E7EB',
        boxShadow: isHighlighted ? '0 0 0 2px #1B3A6B44' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'all 0.18s',
        '&:hover': { borderColor: '#1B3A6B', transform: 'translateY(-1px)', boxShadow: '0 4px 16px rgba(27,58,107,0.12)' },
      }}
    >
      <Box sx={{ display: 'flex', gap: 0 }}>
        {/* Image */}
        <Box sx={{ width: 160, minHeight: 140, flexShrink: 0, position: 'relative', overflow: 'hidden', borderRadius: '12px 0 0 12px' }}>
          {firstImage ? (
            <Box component="img"
              src={firstImage.startsWith('/') ? `${API}${firstImage}` : firstImage}
              alt={pg.name}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Box sx={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1B3A6B,#2952A3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Business sx={{ color: '#ffffff55', fontSize: 48 }} />
            </Box>
          )}
          {/* Vacancy badge overlay */}
          <Box sx={{ position: 'absolute', bottom: 8, left: 8 }}>
            {pg.has_vacancy ? (
              <Chip label={`${pg.vacant_beds} beds free`} size="small"
                sx={{ bgcolor: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            ) : (
              <Chip label="Full" size="small"
                sx={{ bgcolor: '#374151', color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
        </Box>

        {/* Info */}
        <CardContent sx={{ flex: 1, p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>{pg.name}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                <LocationOn sx={{ fontSize: 13, color: '#6B7280' }} />
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>{pg.city}</Typography>
              </Box>
            </Box>
            <Chip label={PG_TYPE_LABEL[pg.pg_type] || pg.pg_type}
              size="small"
              sx={{ bgcolor: `${typeColor}15`, color: typeColor, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
          </Box>

          {/* Rent */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1B3A6B' }}>
              {fm(pg.min_rent)}
            </Typography>
            {pg.max_rent && pg.max_rent !== pg.min_rent && (
              <Typography sx={{ fontSize: '0.82rem', color: '#6B7280' }}>– {fm(pg.max_rent)}</Typography>
            )}
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>/bed/month</Typography>
          </Box>

          {/* Amenities */}
          {(pg.amenities_list?.length > 0) && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {pg.amenities_list.slice(0, 5).map(a => (
                <Chip key={a} label={a}
                  icon={AMENITY_ICONS[a] || <FiberManualRecord sx={{ fontSize: '8px !important' }} />}
                  size="small"
                  sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#F3F4F6', color: '#374151' }} />
              ))}
              {pg.amenities_list.length > 5 && (
                <Chip label={`+${pg.amenities_list.length - 5}`} size="small"
                  sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#EEF2FF', color: '#1B3A6B' }} />
              )}
            </Box>
          )}

          {/* Footer */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {pg.distance_km != null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <Directions sx={{ fontSize: 13, color: '#1B3A6B' }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#1B3A6B', fontWeight: 600 }}>
                  {pg.distance_km < 1 ? `${Math.round(pg.distance_km * 1000)}m` : `${pg.distance_km.toFixed(1)}km`} away
                </Typography>
              </Box>
            )}
            <Typography sx={{ fontSize: '0.72rem', color: '#9CA3AF', ml: 'auto' }}>
              {pg.total_beds} beds total
            </Typography>
          </Box>
        </CardContent>
      </Box>
    </Card>
  );
}

// ── Main Listings Page ─────────────────────────────────────────────────────
export default function ListingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [listings, setListings] = useState([]);
  const [mapPGs, setMapPGs] = useState([]);
  const [allCities, setAllCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // View mode: 'list' | 'map' | 'split'
  const [viewMode, setViewMode] = useState('split');
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Filters
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [pgType, setPgType] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 30000]);
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [sort, setSort] = useState('newest');
  const [userLocation, setUserLocation] = useState(null); // {lat, lng}

  const AMENITY_OPTIONS = ['WiFi','AC','Meals','Parking','Security','Power Backup','Laundry','TV','Hot Water','CCTV'];

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (city) p.set('city', city);
    if (pgType !== 'all') p.set('pg_type', pgType);
    if (priceRange[0] > 0) p.set('min_price', priceRange[0]);
    if (priceRange[1] < 30000) p.set('max_price', priceRange[1]);
    if (selectedAmenities.length) p.set('amenities', selectedAmenities.join(','));
    if (sort !== 'newest') p.set('sort', sort);
    if (userLocation) { p.set('lat', userLocation.lat); p.set('lng', userLocation.lng); p.set('radius_km', 15); }
    p.set('page', page);
    p.set('limit', 20);
    return p.toString();
  }, [q, city, pgType, priceRange, selectedAmenities, sort, userLocation, page]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery();
      const res = await fetch(`${LISTING_API}?${qs}`);
      const data = await res.json();
      setListings(data.listings || []);
      setMapPGs(data.mapPGs || []);
      setAllCities(data.allCities || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  // Search on enter
  const handleSearch = (e) => {
    if (e.key === 'Enter') { setPage(1); fetchListings(); }
  };

  // Get user location
  const getUserLocation = () => {
    setLocationLoading(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort('distance');
        setLocationLoading(false);
        setPage(1);
      },
      () => { setLocationError('Could not get location. Please allow location access.'); setLocationLoading(false); }
    );
  };

  const clearLocation = () => { setUserLocation(null); setSort('newest'); };

  const activeFilterCount = [
    city, pgType !== 'all', priceRange[0] > 0 || priceRange[1] < 30000,
    selectedAmenities.length > 0, userLocation
  ].filter(Boolean).length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F8FAFC' }}>
      {/* ── Top bar ── */}
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 100 }}>
        <Box sx={{ maxWidth: 1400, mx: 'auto', px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Box sx={{ width: 34, height: 34, borderRadius: 2, background: 'linear-gradient(135deg,#1B3A6B,#2952A3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Business sx={{ color: '#fff', fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, color: '#1B3A6B', fontSize: '0.9rem', display: { xs: 'none', sm: 'block' } }}>PG Manager</Typography>
          </Box>

          {/* Search */}
          <TextField
            size="small"
            placeholder="Search PGs by name, city, area..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleSearch}
            sx={{ flex: 1, maxWidth: 500 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search sx={{ color: '#9CA3AF', fontSize: 18 }} /></InputAdornment>,
              endAdornment: q && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => { setQ(''); setPage(1); }}><Close sx={{ fontSize: 16 }} /></IconButton>
                </InputAdornment>
              ),
              sx: { borderRadius: 3, bgcolor: '#F9FAFB' }
            }}
          />

          {/* City quick filter */}
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select value={city} displayEmpty onChange={e => { setCity(e.target.value); setPage(1); }}
              sx={{ borderRadius: 3, fontSize: '0.85rem' }}>
              <MenuItem value="">All Cities</MenuItem>
              {allCities.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Nearby button */}
          <Tooltip title={userLocation ? 'Showing nearby PGs' : 'Find PGs near me'}>
            <Button
              variant={userLocation ? 'contained' : 'outlined'}
              size="small"
              startIcon={locationLoading ? <CircularProgress size={14} color="inherit" /> : <MyLocation sx={{ fontSize: 16 }} />}
              onClick={userLocation ? clearLocation : getUserLocation}
              disabled={locationLoading}
              sx={{ borderRadius: 3, whiteSpace: 'nowrap', fontSize: '0.78rem', px: 1.5 }}
            >
              {userLocation ? 'Nearby ✓' : 'Nearby'}
            </Button>
          </Tooltip>

          {/* Filter button */}
          <Badge badgeContent={activeFilterCount} color="primary">
            <Button variant="outlined" size="small"
              startIcon={<FilterList sx={{ fontSize: 16 }} />}
              onClick={() => setFilterOpen(true)}
              sx={{ borderRadius: 3, fontSize: '0.78rem' }}>
              Filters
            </Button>
          </Badge>

          {/* View toggle */}
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
            <ToggleButton value="list" sx={{ px: 1.5 }}><ViewList sx={{ fontSize: 18 }} /></ToggleButton>
            <ToggleButton value="split" sx={{ px: 1.5 }}><Box sx={{ display:'flex',gap:0.3 }}><ViewList sx={{ fontSize:14 }}/><Map sx={{ fontSize:14 }}/></Box></ToggleButton>
            <ToggleButton value="map" sx={{ px: 1.5 }}><Map sx={{ fontSize: 18 }} /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {locationError && <Alert severity="warning" sx={{ mx: 3, mb: 1, borderRadius: 2 }}>{locationError}</Alert>}
      </Box>

      {/* ── Results bar ── */}
      <Box sx={{ maxWidth: 1400, mx: 'auto', px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          {loading ? 'Searching...' : `${total} PGs found${q ? ` for "${q}"` : ''}${city ? ` in ${city}` : ''}${userLocation ? ' near you' : ''}`}
        </Typography>
        {/* Sort */}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Sort:</Typography>
          {[
            { val: 'newest', label: 'Latest' },
            { val: 'price_asc', label: 'Price ↑' },
            { val: 'price_desc', label: 'Price ↓' },
            { val: 'vacancy', label: 'Most vacancies' },
            ...(userLocation ? [{ val: 'distance', label: 'Nearest' }] : []),
          ].map(s => (
            <Chip key={s.val} label={s.label} size="small" clickable onClick={() => { setSort(s.val); setPage(1); }}
              sx={{ fontSize: '0.72rem', bgcolor: sort === s.val ? '#1B3A6B' : '#F3F4F6', color: sort === s.val ? '#fff' : '#374151', fontWeight: sort === s.val ? 700 : 400 }} />
          ))}
        </Box>
      </Box>

      {/* ── Main content: list | split | map ── */}
      <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 }, pb: 4 }}>

        {/* MAP ONLY */}
        {viewMode === 'map' && (
          <Box sx={{ height: 'calc(100vh - 160px)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <LeafletMap pgs={mapPGs} onSelect={setSelectedMapId} selectedId={selectedMapId} />
            {/* Selected PG mini card */}
            {selectedMapId && (() => {
              const pg = listings.find(p => String(p.id) === String(selectedMapId));
              if (!pg) return null;
              return (
                <Box sx={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: 340, zIndex: 1000 }}>
                  <PGCard pg={pg} onSelect={() => {}} isHighlighted />
                </Box>
              );
            })()}
          </Box>
        )}

        {/* LIST ONLY */}
        {viewMode === 'list' && (
          <Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : listings.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <SentimentVeryDissatisfied sx={{ fontSize: 56, color: '#E5E7EB', mb: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No PGs found</Typography>
                <Typography sx={{ color: '#6B7280' }}>Try adjusting your filters or search term.</Typography>
                <Button sx={{ mt: 2 }} onClick={() => { setQ(''); setCity(''); setPgType('all'); setPriceRange([0,30000]); setSelectedAmenities([]); }}>Clear all filters</Button>
              </Box>
            ) : (
              <>
                <Grid container spacing={2}>
                  {listings.map(pg => (
                    <Grid item xs={12} md={6} lg={4} key={pg.id}>
                      <PGCard pg={pg} onSelect={setSelectedMapId} isHighlighted={String(pg.id) === String(selectedMapId)} />
                    </Grid>
                  ))}
                </Grid>
                {totalPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 4 }}>
                    <Button disabled={page === 1} onClick={() => setPage(p => p - 1)} variant="outlined" sx={{ borderRadius: 2 }}>Previous</Button>
                    <Typography sx={{ alignSelf: 'center', color: '#6B7280', fontSize: '0.85rem' }}>Page {page} of {totalPages}</Typography>
                    <Button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} variant="outlined" sx={{ borderRadius: 2 }}>Next</Button>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {/* SPLIT VIEW */}
        {viewMode === 'split' && (
          <Grid container spacing={2}>
            {/* List panel */}
            <Grid item xs={12} md={5} lg={5} sx={{ maxHeight: 'calc(100vh - 170px)', overflowY: 'auto', pr: 1 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
              ) : listings.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <SentimentVeryDissatisfied sx={{ fontSize: 48, color: '#E5E7EB', mb: 1 }} />
                  <Typography sx={{ color: '#6B7280' }}>No PGs match your filters.</Typography>
                </Box>
              ) : (
                <>
                  {listings.map(pg => (
                    <Box key={pg.id} onClick={() => setSelectedMapId(pg.id)}>
                      <PGCard pg={pg} onSelect={setSelectedMapId} isHighlighted={String(pg.id) === String(selectedMapId)} />
                    </Box>
                  ))}
                  {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2, mb: 2 }}>
                      <Button disabled={page === 1} onClick={() => setPage(p => p - 1)} size="small" variant="outlined" sx={{ borderRadius: 2 }}>Prev</Button>
                      <Typography sx={{ alignSelf: 'center', fontSize: '0.78rem', color: '#6B7280' }}>{page}/{totalPages}</Typography>
                      <Button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} size="small" variant="outlined" sx={{ borderRadius: 2 }}>Next</Button>
                    </Box>
                  )}
                </>
              )}
            </Grid>

            {/* Map panel */}
            <Grid item xs={12} md={7} lg={7} sx={{ position: 'sticky', top: 120, height: 'calc(100vh - 170px)' }}>
              <Box sx={{ height: '100%', borderRadius: 3, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                <LeafletMap pgs={mapPGs} onSelect={(id) => { setSelectedMapId(id); }} selectedId={selectedMapId} />
              </Box>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* ── FILTER DRAWER ── */}
      <Drawer anchor="right" open={filterOpen} onClose={() => setFilterOpen(false)}
        PaperProps={{ sx: { width: 340, p: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Filters</Typography>
          <IconButton onClick={() => setFilterOpen(false)}><Close /></IconButton>
        </Box>

        {/* PG Type */}
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 1 }}>PG Type</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          {['all', 'male', 'female', 'mixed', 'co-living'].map(t => (
            <Chip key={t} label={PG_TYPE_LABEL[t] || 'All'} clickable onClick={() => setPgType(t)}
              sx={{ fontWeight: 600, fontSize: '0.78rem', bgcolor: pgType === t ? (PG_TYPE_COLOR[t] || '#1B3A6B') : '#F3F4F6', color: pgType === t ? '#fff' : '#374151' }} />
          ))}
        </Box>

        {/* Price Range */}
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 1 }}>
          Rent: {fm(priceRange[0])} – {fm(priceRange[1])}
        </Typography>
        <Slider value={priceRange} onChange={(_, v) => setPriceRange(v)} min={0} max={30000} step={500}
          valueLabelDisplay="auto" valueLabelFormat={v => fm(v)} sx={{ mb: 3, color: '#1B3A6B' }} />

        {/* Amenities */}
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 1 }}>Amenities</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          {AMENITY_OPTIONS.map(a => (
            <Chip key={a} label={a} clickable size="small"
              icon={AMENITY_ICONS[a] || undefined}
              onClick={() => setSelectedAmenities(prev =>
                prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
              )}
              sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: selectedAmenities.includes(a) ? '#1B3A6B' : '#F3F4F6', color: selectedAmenities.includes(a) ? '#fff' : '#374151' }} />
          ))}
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" fullWidth sx={{ borderRadius: 2 }} onClick={() => { setPgType('all'); setPriceRange([0,30000]); setSelectedAmenities([]); }}>Reset</Button>
          <Button variant="contained" fullWidth sx={{ borderRadius: 2 }} onClick={() => { setPage(1); setFilterOpen(false); fetchListings(); }}>Apply Filters</Button>
        </Box>
      </Drawer>
    </Box>
  );
}
