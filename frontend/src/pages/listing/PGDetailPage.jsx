// frontend/src/pages/listing/PGDetailPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip, Avatar,
  CircularProgress, Divider, IconButton, Tooltip, Alert, Tab, Tabs
} from '@mui/material';
import {
  LocationOn, Phone, Email, KingBed, People, ArrowBack, Business,
  Wifi, AcUnit, LocalParking, Restaurant, Security, Power,
  LocalLaundryService, Tv, WaterDrop, Videocam, FiberManualRecord,
  CheckCircle, Star, ArrowForward, Share, Bookmark
} from '@mui/icons-material';

const API = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
const LISTING_API = `${API}/api/listings`;

const fm = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const PG_TYPE_COLOR = { male:'#1B3A6B', female:'#BE185D', mixed:'#059669', 'co-living':'#7C3AED' };
const PG_TYPE_LABEL = { male:'Male Only', female:'Female Only', mixed:'Co-ed', 'co-living':'Co-living' };
const ROOM_TYPE_COLOR = { single:'#1B3A6B', double:'#059669', triple:'#D97706', deluxe:'#7C3AED' };

const AMENITY_ICONS = {
  'WiFi': <Wifi sx={{ fontSize:16 }}/>, 'WIFI': <Wifi sx={{ fontSize:16 }}/>,
  'AC': <AcUnit sx={{ fontSize:16 }}/>,
  'Parking': <LocalParking sx={{ fontSize:16 }}/>,
  'Meals': <Restaurant sx={{ fontSize:16 }}/>,
  'Security': <Security sx={{ fontSize:16 }}/>,
  'Power Backup': <Power sx={{ fontSize:16 }}/>,
  'Laundry': <LocalLaundryService sx={{ fontSize:16 }}/>,
  'TV': <Tv sx={{ fontSize:16 }}/>,
  'Hot Water': <WaterDrop sx={{ fontSize:16 }}/>,
  'CCTV': <Videocam sx={{ fontSize:16 }}/>,
  'ATTACHED_BATH': <WaterDrop sx={{ fontSize:16 }}/>,
  'FRIDGE': <AcUnit sx={{ fontSize:16 }}/>,
  'GEYSER': <WaterDrop sx={{ fontSize:16 }}/>,
};
const AMENITY_LABEL = {
  'ATTACHED_BATH':'Attached Bath','FRIDGE':'Refrigerator','GEYSER':'Geyser',
  'WIFI':'WiFi','AC':'AC','TV':'TV',
};

// ── Image Slider ──────────────────────────────────────────────────────────
function ImageSlider({ images, name }) {
  const [idx, setIdx] = useState(0);
  if (!images?.length) {
    return (
      <Box sx={{ height: 360, background: 'linear-gradient(135deg,#1B3A6B,#2952A3)', borderRadius: 3, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Business sx={{ color:'#ffffff33', fontSize: 96 }} />
      </Box>
    );
  }
  return (
    <Box sx={{ position:'relative', height: 360, borderRadius: 3, overflow:'hidden' }}>
      <Box component="img"
        src={images[idx].startsWith('/') ? `${API}${images[idx]}` : images[idx]}
        alt={`${name} ${idx+1}`}
        sx={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
      />
      {images.length > 1 && (
        <>
          {/* Prev */}
          <IconButton onClick={() => setIdx(i => (i - 1 + images.length) % images.length)}
            sx={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', bgcolor:'rgba(0,0,0,0.45)', color:'#fff', '&:hover':{ bgcolor:'rgba(0,0,0,0.65)' } }}>
            ‹
          </IconButton>
          {/* Next */}
          <IconButton onClick={() => setIdx(i => (i + 1) % images.length)}
            sx={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', bgcolor:'rgba(0,0,0,0.45)', color:'#fff', '&:hover':{ bgcolor:'rgba(0,0,0,0.65)' } }}>
            ›
          </IconButton>
          {/* Dots */}
          <Box sx={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', display:'flex', gap:0.6 }}>
            {images.map((_, i) => (
              <Box key={i} onClick={() => setIdx(i)} sx={{ width: i===idx?20:8, height:8, borderRadius:4, bgcolor: i===idx?'#fff':'rgba(255,255,255,0.5)', cursor:'pointer', transition:'all 0.2s' }} />
            ))}
          </Box>
          {/* Counter */}
          <Box sx={{ position:'absolute', top:12, right:12, bgcolor:'rgba(0,0,0,0.5)', color:'#fff', fontSize:'0.75rem', fontWeight:600, px:1.2, py:0.4, borderRadius:10 }}>
            {idx+1} / {images.length}
          </Box>
        </>
      )}
    </Box>
  );
}

// ── Leaflet mini map (single point) ─────────────────────────────────────
function MiniMap({ lat, lng, name }) {
  const mapRef = useRef(null);
  useEffect(() => {
    if (!lat || !lng) return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const init = () => {
      if (!mapRef.current || mapRef.current._leaflet_id) return;
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, dragging: true }).setView([parseFloat(lat), parseFloat(lng)], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap' }).addTo(map);
      const icon = L.divIcon({
        className:'',
        html:`<div style="background:#1B3A6B;color:#fff;padding:6px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff">${name}</div>`,
        iconAnchor:[40,10],
      });
      L.marker([parseFloat(lat),parseFloat(lng)],{icon}).addTo(map);
    };
    if (!window.L) {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = init;
      document.head.appendChild(s);
    } else init();
  }, [lat, lng]);
  if (!lat || !lng) return null;
  return <div ref={mapRef} style={{ height:200, borderRadius:12, overflow:'hidden', border:'1px solid #E5E7EB' }} />;
}

// ── Recommendation card ──────────────────────────────────────────────────
function RecommendCard({ pg }) {
  const navigate = useNavigate();
  const images = pg.images || [];
  const typeColor = PG_TYPE_COLOR[pg.pg_type] || '#6B7280';
  return (
    <Card onClick={() => navigate(`/listings/${pg.id}`)} sx={{ cursor:'pointer', transition:'all 0.18s', '&:hover':{ transform:'translateY(-2px)', boxShadow:'0 6px 20px rgba(27,58,107,0.12)', borderColor:'#1B3A6B' }, border:'1px solid #E5E7EB' }}>
      {/* Image */}
      <Box sx={{ height:140, overflow:'hidden', borderRadius:'12px 12px 0 0', position:'relative' }}>
        {images[0] ? (
          <Box component="img"
            src={images[0].startsWith('/') ? `${API}${images[0]}` : images[0]}
            alt={pg.name}
            sx={{ width:'100%', height:'100%', objectFit:'cover' }}
          />
        ) : (
          <Box sx={{ height:'100%', background:'linear-gradient(135deg,#1B3A6B,#2952A3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Business sx={{ color:'#ffffff44', fontSize:40 }} />
          </Box>
        )}
        <Chip label={parseInt(pg.vacant_beds) > 0 ? `${pg.vacant_beds} beds free` : 'Full'} size="small"
          sx={{ position:'absolute', bottom:8, left:8, bgcolor: parseInt(pg.vacant_beds)>0 ? '#059669':'#374151', color:'#fff', fontWeight:700, fontSize:'0.62rem', height:20 }} />
        {pg._score && (
          <Chip label={`${pg._score}% match`} size="small"
            sx={{ position:'absolute', top:8, right:8, bgcolor:'#FEF3C7', color:'#92400E', fontWeight:700, fontSize:'0.62rem', height:20 }} />
        )}
      </Box>
      <CardContent sx={{ p:1.5, '&:last-child':{pb:1.5} }}>
        <Typography sx={{ fontWeight:700, fontSize:'0.9rem', mb:0.2 }} noWrap>{pg.name}</Typography>
        <Box sx={{ display:'flex', alignItems:'center', gap:0.4, mb:0.8 }}>
          <LocationOn sx={{ fontSize:12, color:'#6B7280' }} />
          <Typography sx={{ fontSize:'0.75rem', color:'#6B7280' }} noWrap>{pg.city}</Typography>
          <Chip label={PG_TYPE_LABEL[pg.pg_type]||pg.pg_type} size="small"
            sx={{ ml:'auto', bgcolor:`${typeColor}15`, color:typeColor, fontWeight:700, fontSize:'0.6rem', height:16 }} />
        </Box>
        <Typography sx={{ fontWeight:800, fontSize:'1rem', color:'#1B3A6B' }}>
          {fm(pg.min_rent)}<Typography component="span" sx={{ fontWeight:400, fontSize:'0.72rem', color:'#9CA3AF' }}>/mo</Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── Main Detail Page ─────────────────────────────────────────────────────
export default function PGDetailPage() {
  const { pgId } = useParams();
  const navigate = useNavigate();
  const [pg, setPg] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${LISTING_API}/${pgId}`).then(r => r.json()),
      fetch(`${LISTING_API}/${pgId}/recommended?limit=4`).then(r => r.json()),
    ]).then(([detail, recs]) => {
      setPg(detail.pg);
      setRooms(detail.rooms || []);
      setRecommendations(recs.recommendations || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [pgId]);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', height:'60vh' }}><CircularProgress /></Box>;
  if (!pg) return <Box sx={{ textAlign:'center', py:10 }}><Typography>PG not found.</Typography><Button onClick={() => navigate('/listings')}>Back to listings</Button></Box>;

  const images = pg.images || [];
  const amenities = pg.amenities_list || [];
  const hasVacancy = parseInt(pg.vacant_beds) > 0;
  const typeColor = PG_TYPE_COLOR[pg.pg_type] || '#6B7280';

  const roomsByFloor = rooms.reduce((acc, r) => {
    const f = r.floor || 1;
    if (!acc[f]) acc[f] = [];
    acc[f].push(r);
    return acc;
  }, {});

  return (
    <Box sx={{ minHeight:'100vh', bgcolor:'#F8FAFC' }}>
      {/* ── Sticky header ── */}
      <Box sx={{ bgcolor:'#fff', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0, zIndex:100, px:3, py:1.5, display:'flex', alignItems:'center', gap:2 }}>
        <IconButton onClick={() => navigate('/listings')} sx={{ mr:1 }}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ flex:1 }}>
          <Typography sx={{ fontWeight:700, fontSize:'1rem' }}>{pg.name}</Typography>
          <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
            <LocationOn sx={{ fontSize:13, color:'#6B7280' }} />
            <Typography sx={{ fontSize:'0.78rem', color:'#6B7280' }}>{pg.city}</Typography>
          </Box>
        </Box>
        <Chip
          label={hasVacancy ? `${pg.vacant_beds} beds available` : '🔒 Fully Occupied'}
          sx={{ fontWeight:700, fontSize:'0.75rem', bgcolor: hasVacancy?'#D1FAE5':'#FEE2E2', color: hasVacancy?'#065F46':'#991B1B' }}
        />
      </Box>

      <Box sx={{ maxWidth:1200, mx:'auto', px:{ xs:2, md:3 }, py:3 }}>
        <Grid container spacing={3}>
          {/* ── LEFT COLUMN ── */}
          <Grid item xs={12} lg={8}>
            {/* Image Slider */}
            <ImageSlider images={images} name={pg.name} />

            {/* PG Identity row */}
            <Box sx={{ display:'flex', alignItems:'flex-start', gap:2, mt:2.5, mb:2 }}>
              {pg.logo_url && (
                <Box component="img" src={pg.logo_url.startsWith('/') ? `${API}${pg.logo_url}` : pg.logo_url}
                  alt="logo" sx={{ width:56, height:56, borderRadius:2, objectFit:'cover', border:'2px solid #E5E7EB', flexShrink:0 }} />
              )}
              <Box sx={{ flex:1 }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1, flexWrap:'wrap' }}>
                  <Typography variant="h5" sx={{ fontWeight:800 }}>{pg.name}</Typography>
                  <Chip label={PG_TYPE_LABEL[pg.pg_type]||pg.pg_type} size="small"
                    sx={{ bgcolor:`${typeColor}18`, color:typeColor, fontWeight:700 }} />
                </Box>
                <Box sx={{ display:'flex', gap:2, mt:0.5, flexWrap:'wrap' }}>
                  <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                    <LocationOn sx={{ fontSize:14, color:'#6B7280' }} />
                    <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{pg.address || pg.city}</Typography>
                  </Box>
                  {pg.phone && (
                    <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                      <Phone sx={{ fontSize:14, color:'#6B7280' }} />
                      <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{pg.phone}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>

            {/* Tabs */}
            <Box sx={{ borderBottom:'1px solid #E5E7EB', mb:2.5 }}>
              <Tabs value={tab} onChange={(_,v) => setTab(v)}
                sx={{ '& .MuiTab-root':{ fontSize:'0.82rem', fontWeight:600, textTransform:'none', minHeight:42 }, '& .MuiTabs-indicator':{ bgcolor:'#1B3A6B' }, '& .MuiTab-root.Mui-selected':{ color:'#1B3A6B' } }}>
                <Tab label="Overview" />
                <Tab label={`Rooms (${rooms.length})`} />
                <Tab label="Amenities" />
                <Tab label="Location" />
              </Tabs>
            </Box>

            {/* Tab 0: Overview */}
            {tab === 0 && (
              <Box>
                {/* Stat chips */}
                <Box sx={{ display:'flex', gap:2, flexWrap:'wrap', mb:3 }}>
                  {[
                    { icon:<KingBed sx={{ fontSize:18, color:'#1B3A6B' }}/>, label:`${pg.total_beds} total beds`, sub:`${pg.vacant_beds} available`, color:'#EEF2FF' },
                    { icon:<People sx={{ fontSize:18, color:'#059669' }}/>, label:`${pg.active_tenants} tenants`, sub:'currently staying', color:'#D1FAE5' },
                  ].map(s => (
                    <Card key={s.label} sx={{ flex:1, minWidth:150, border:'1px solid #E5E7EB', boxShadow:'none' }}>
                      <CardContent sx={{ p:2, '&:last-child':{pb:2} }}>
                        <Box sx={{ width:36, height:36, borderRadius:2, bgcolor:s.color, display:'flex', alignItems:'center', justifyContent:'center', mb:1 }}>{s.icon}</Box>
                        <Typography sx={{ fontWeight:700, fontSize:'0.9rem' }}>{s.label}</Typography>
                        <Typography sx={{ fontSize:'0.75rem', color:'#6B7280' }}>{s.sub}</Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Box>

                {/* Description */}
                {pg.description && (
                  <Box sx={{ mb:3 }}>
                    <Typography sx={{ fontWeight:700, mb:1 }}>About this PG</Typography>
                    <Typography sx={{ color:'#374151', lineHeight:1.7, fontSize:'0.9rem' }}>{pg.description}</Typography>
                  </Box>
                )}

                {/* Amenity quick chips */}
                {amenities.length > 0 && (
                  <Box sx={{ mb:3 }}>
                    <Typography sx={{ fontWeight:700, mb:1.2 }}>Amenities</Typography>
                    <Box sx={{ display:'flex', gap:1, flexWrap:'wrap' }}>
                      {amenities.slice(0,8).map(a => (
                        <Chip key={a}
                          icon={AMENITY_ICONS[a] || <FiberManualRecord sx={{ fontSize:'8px !important' }} />}
                          label={AMENITY_LABEL[a] || a}
                          sx={{ bgcolor:'#F3F4F6', color:'#374151', fontWeight:600, fontSize:'0.78rem' }} />
                      ))}
                      {amenities.length > 8 && <Chip label={`+${amenities.length-8} more`} onClick={() => setTab(2)} sx={{ bgcolor:'#EEF2FF', color:'#1B3A6B', fontWeight:600, fontSize:'0.78rem', cursor:'pointer' }} />}
                    </Box>
                  </Box>
                )}

                {/* Rules */}
                {pg.rules && (
                  <Box sx={{ mb:3 }}>
                    <Typography sx={{ fontWeight:700, mb:1 }}>House Rules</Typography>
                    <Box sx={{ bgcolor:'#FFFBF5', border:'1px solid #FCD34D', borderRadius:2, p:2 }}>
                      <Typography sx={{ color:'#78350F', fontSize:'0.875rem', lineHeight:1.7 }}>{pg.rules}</Typography>
                    </Box>
                  </Box>
                )}

                {/* Nearby */}
                {pg.nearby && (
                  <Box sx={{ mb:2 }}>
                    <Typography sx={{ fontWeight:700, mb:1 }}>📍 Nearby Landmarks</Typography>
                    <Typography sx={{ color:'#374151', fontSize:'0.875rem' }}>{pg.nearby}</Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Tab 1: Rooms */}
            {tab === 1 && (
              <Box>
                {rooms.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius:2 }}>No rooms listed for this PG yet.</Alert>
                ) : (
                  Object.entries(roomsByFloor).sort(([a],[b]) => parseInt(a)-parseInt(b)).map(([floor, floorRooms]) => (
                    <Box key={floor} sx={{ mb:3 }}>
                      <Typography sx={{ fontWeight:700, fontSize:'0.8rem', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', mb:1.5 }}>
                        Floor {floor}
                      </Typography>
                      <Grid container spacing={2}>
                        {floorRooms.map(room => {
                          const vacBeds = parseInt(room.vacant_beds || 0);
                          const rtColor = ROOM_TYPE_COLOR[room.room_type] || '#6B7280';
                          const roomAm = room.amenities || [];
                          return (
                            <Grid item xs={12} sm={6} key={room.id}>
                              <Card sx={{ border:'1px solid', borderColor: vacBeds>0 ? '#E5E7EB':'#F3F4F6', bgcolor: vacBeds===0 ? '#FAFAFA':'#fff', boxShadow:'none' }}>
                                <CardContent sx={{ p:2, '&:last-child':{pb:2} }}>
                                  <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1 }}>
                                    <Box>
                                      <Typography sx={{ fontWeight:700, fontSize:'0.95rem' }}>Room {room.room_number}</Typography>
                                      <Chip label={room.room_type?.toUpperCase()} size="small"
                                        sx={{ bgcolor:`${rtColor}18`, color:rtColor, fontWeight:700, fontSize:'0.65rem', height:18, mt:0.3 }} />
                                    </Box>
                                    <Box sx={{ textAlign:'right' }}>
                                      <Typography sx={{ fontWeight:800, fontSize:'1rem', color:'#1B3A6B' }}>{fm(room.monthly_rent)}</Typography>
                                      <Typography sx={{ fontSize:'0.68rem', color:'#9CA3AF' }}>/bed/month</Typography>
                                    </Box>
                                  </Box>

                                  {/* Bed availability */}
                                  <Box sx={{ display:'flex', gap:1, mb:1, flexWrap:'wrap', alignItems:'center' }}>
                                    <Box sx={{ display:'flex', alignItems:'center', gap:0.4 }}>
                                      <KingBed sx={{ fontSize:13, color:'#6B7280' }} />
                                      <Typography sx={{ fontSize:'0.75rem', color:'#6B7280' }}>{room.total_beds_actual || room.total_beds} beds</Typography>
                                    </Box>
                                    {vacBeds > 0 ? (
                                      <Chip label={`${vacBeds} available`} size="small"
                                        sx={{ bgcolor:'#D1FAE5', color:'#065F46', fontWeight:700, fontSize:'0.65rem', height:18 }} />
                                    ) : (
                                      <Chip label="Full" size="small"
                                        sx={{ bgcolor:'#F3F4F6', color:'#6B7280', fontWeight:700, fontSize:'0.65rem', height:18 }} />
                                    )}
                                  </Box>

                                  {/* Room amenities */}
                                  {roomAm.length > 0 && (
                                    <Box sx={{ display:'flex', gap:0.5, flexWrap:'wrap' }}>
                                      {roomAm.map(a => (
                                        <Chip key={a} label={AMENITY_LABEL[a]||a} size="small"
                                          icon={AMENITY_ICONS[a] || undefined}
                                          sx={{ bgcolor:'#F9FAFB', fontSize:'0.65rem', height:18 }} />
                                      ))}
                                    </Box>
                                  )}
                                </CardContent>
                              </Card>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Box>
                  ))
                )}
              </Box>
            )}

            {/* Tab 2: All Amenities */}
            {tab === 2 && (
              <Box>
                {amenities.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius:2 }}>No amenities listed.</Alert>
                ) : (
                  <Grid container spacing={1.5}>
                    {amenities.map(a => (
                      <Grid item xs={6} sm={4} key={a}>
                        <Box sx={{ display:'flex', alignItems:'center', gap:1.2, p:1.5, bgcolor:'#F9FAFB', borderRadius:2, border:'1px solid #E5E7EB' }}>
                          <Box sx={{ width:32, height:32, borderRadius:2, bgcolor:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', color:'#1B3A6B' }}>
                            {AMENITY_ICONS[a] || <CheckCircle sx={{ fontSize:16 }} />}
                          </Box>
                          <Typography sx={{ fontWeight:600, fontSize:'0.82rem' }}>{AMENITY_LABEL[a]||a}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            )}

            {/* Tab 3: Location */}
            {tab === 3 && (
              <Box>
                <Box sx={{ mb:2 }}>
                  <Typography sx={{ fontWeight:600, mb:0.5 }}>Address</Typography>
                  <Typography sx={{ color:'#374151', fontSize:'0.875rem' }}>{pg.address || 'Address not specified'}</Typography>
                  <Typography sx={{ color:'#6B7280', fontSize:'0.82rem' }}>{pg.city}</Typography>
                </Box>
                {pg.nearby && (
                  <Box sx={{ mb:2 }}>
                    <Typography sx={{ fontWeight:600, mb:0.5 }}>Nearby Landmarks</Typography>
                    <Typography sx={{ color:'#374151', fontSize:'0.875rem' }}>{pg.nearby}</Typography>
                  </Box>
                )}
                <MiniMap lat={pg.lat} lng={pg.lng} name={pg.name} />
                {pg.lat && pg.lng && (
                  <Button
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pg.lat},${pg.lng}`}
                    target="_blank" rel="noopener"
                    variant="outlined" startIcon={<LocationOn />}
                    sx={{ mt:2, borderRadius:2 }}>
                    Get Directions on Google Maps
                  </Button>
                )}
              </Box>
            )}
          </Grid>

          {/* ── RIGHT COLUMN — sticky booking card ── */}
          <Grid item xs={12} lg={4}>
            <Box sx={{ position:{ lg:'sticky' }, top:{ lg:90 } }}>
              {/* Booking card */}
              <Card sx={{ border:`2px solid ${hasVacancy?'#1B3A6B':'#E5E7EB'}`, mb:2.5, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                <CardContent sx={{ p:2.5 }}>
                  {/* Rent range */}
                  <Box sx={{ mb:2 }}>
                    <Typography sx={{ fontSize:'0.75rem', color:'#6B7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Starting from</Typography>
                    <Typography sx={{ fontWeight:800, fontSize:'2rem', color:'#1B3A6B', lineHeight:1.1 }}>
                      {fm(pg.min_rent)}
                    </Typography>
                    {pg.max_rent && pg.max_rent !== pg.min_rent && (
                      <Typography sx={{ fontSize:'0.85rem', color:'#6B7280' }}>up to {fm(pg.max_rent)} / bed / month</Typography>
                    )}
                  </Box>

                  <Divider sx={{ mb:2 }} />

                  {/* Vacancy status */}
                  <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:2, p:1.5, borderRadius:2, bgcolor: hasVacancy?'#D1FAE5':'#FEE2E2' }}>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                      <KingBed sx={{ color: hasVacancy?'#059669':'#DC2626', fontSize:20 }} />
                      <Box>
                        <Typography sx={{ fontWeight:700, fontSize:'0.875rem', color: hasVacancy?'#065F46':'#991B1B' }}>
                          {hasVacancy ? `${pg.vacant_beds} Beds Available` : 'Fully Occupied'}
                        </Typography>
                        <Typography sx={{ fontSize:'0.72rem', color: hasVacancy?'#059669':'#DC2626' }}>
                          {hasVacancy ? `out of ${pg.total_beds} total beds` : 'All beds taken currently'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* CTA buttons */}
                  <Button fullWidth variant="contained" size="large" disabled={!hasVacancy}
                    sx={{ mb:1.2, py:1.4, borderRadius:2.5, fontSize:'0.95rem', fontWeight:700,
                      bgcolor:'#1B3A6B', '&:hover':{ bgcolor:'#2952A3' },
                      '&.Mui-disabled':{ bgcolor:'#E5E7EB', color:'#9CA3AF' } }}>
                    {hasVacancy ? '🔑 Book a Room' : '🔒 No Vacancies'}
                  </Button>
                  {pg.phone && (
                    <Button fullWidth variant="outlined" size="large"
                      href={`tel:${pg.phone}`}
                      startIcon={<Phone />}
                      sx={{ borderRadius:2.5, fontWeight:600, borderColor:'#1B3A6B', color:'#1B3A6B' }}>
                      Call Now
                    </Button>
                  )}

                  {!hasVacancy && (
                    <Alert severity="warning" sx={{ mt:1.5, borderRadius:2, fontSize:'0.78rem' }}>
                      This PG is currently fully occupied. Call to join the waitlist.
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Contact card */}
              {(pg.phone || pg.email) && (
                <Card sx={{ border:'1px solid #E5E7EB', mb:2.5, boxShadow:'none' }}>
                  <CardContent sx={{ p:2 }}>
                    <Typography sx={{ fontWeight:700, mb:1.5, fontSize:'0.9rem' }}>Contact</Typography>
                    {pg.phone && (
                      <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:1 }}>
                        <Box sx={{ width:32, height:32, borderRadius:2, bgcolor:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Phone sx={{ fontSize:16, color:'#059669' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize:'0.75rem', color:'#9CA3AF' }}>Phone</Typography>
                          <Typography sx={{ fontWeight:600, fontSize:'0.875rem' }}>{pg.phone}</Typography>
                        </Box>
                      </Box>
                    )}
                    {pg.email && (
                      <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                        <Box sx={{ width:32, height:32, borderRadius:2, bgcolor:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Email sx={{ fontSize:16, color:'#1B3A6B' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize:'0.75rem', color:'#9CA3AF' }}>Email</Typography>
                          <Typography sx={{ fontWeight:600, fontSize:'0.875rem' }}>{pg.email}</Typography>
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Mini map in sidebar */}
              {pg.lat && pg.lng && (
                <Card sx={{ border:'1px solid #E5E7EB', boxShadow:'none', overflow:'hidden' }}>
                  <MiniMap lat={pg.lat} lng={pg.lng} name={pg.name} />
                  <CardContent sx={{ p:1.5, pt:1 }}>
                    <Typography sx={{ fontSize:'0.75rem', color:'#6B7280', textAlign:'center' }}>{pg.city}</Typography>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Grid>
        </Grid>

        {/* ── Recommendations ── */}
        {recommendations.length > 0 && (
          <Box sx={{ mt:5 }}>
            <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2.5 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight:800 }}>Similar PGs you might like</Typography>
                <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Based on location, price range and amenities</Typography>
              </Box>
              <Button endIcon={<ArrowForward />} onClick={() => navigate('/listings')} sx={{ color:'#1B3A6B', fontWeight:600, fontSize:'0.82rem' }}>
                View all
              </Button>
            </Box>
            <Grid container spacing={2.5}>
              {recommendations.map(rec => (
                <Grid item xs={12} sm={6} md={3} key={rec.id}>
                  <RecommendCard pg={rec} />
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Box>
    </Box>
  );
}
