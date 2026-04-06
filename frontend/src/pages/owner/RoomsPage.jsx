import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip, Avatar,
  IconButton, CircularProgress, LinearProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Alert, Tabs, Tab, Tooltip
} from '@mui/material';
import { Add, Close, Edit, Delete, KingBed, MeetingRoom,
  People, Warning, CheckCircle } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import { PageHeader } from '../../components/common';
import { usePermissions } from '../../hooks/usePermissions';

const TYPES    = ['single','double','triple','deluxe'];
const AMENITIES = ['AC','WIFI','ATTACHED_BATH','TV','FRIDGE','GEYSER'];
const EMPTY    = { room_number:'', floor:1, room_type:'single', amenities:[], monthly_rent:'', total_beds:1 };
const ERRORS   = { room_number:'', floor:'', monthly_rent:'', total_beds:'' };

const typeColor = t => ({ single:'#1B3A6B', double:'#059669', triple:'#D97706', deluxe:'#7C3AED' }[t]||'#6B7280');
const fm = n => `₹${Number(n||0).toLocaleString('en-IN')}`;

export default function RoomsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can('manage_rooms','create');

  const [rooms,    setRooms]    = useState([]);
  const [stats,    setStats]    = useState({});
  const [tenants,  setTenants]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  // Tabs: 'all' | 'vacant' | floor numbers
  const [viewTab,  setViewTab]  = useState('all');

  // Dialogs
  const [roomDialog,     setRoomDialog]     = useState(false);
  const [editRoom,       setEditRoom]       = useState(null);
  const [assignDialog,   setAssignDialog]   = useState(false);
  const [selectedBed,    setSelectedBed]    = useState(null);
  const [unassignDialog, setUnassignDialog] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState(null);

  // Form
  const [form,   setForm]   = useState(EMPTY);
  const [errors, setErrors] = useState(ERRORS);
  const [assignTenantId, setAssignTenantId] = useState('');
  const [err,    setErr]    = useState('');
  const [saving, setSaving] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRooms();
      setRooms(r.data.rooms||[]); setStats(r.data.stats||{});
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    api.getTenants({ status:'pending', limit:100 })
      .then(r => setTenants(r.data.tenants||[]))
      .catch(() => {});
  }, [pgId]);

  // ── Derived data ─────────────────────────────────────────────
  const floors = [...new Set(rooms.map(r => r.floor))].sort((a,b)=>a-b);

  const filteredRooms = rooms.filter(room => {
    if (viewTab === 'all')    return true;
    if (viewTab === 'vacant') return parseInt(room.available_beds) > 0;
    return room.floor === parseInt(viewTab);
  });

  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    const e = { room_number:'', floor:'', monthly_rent:'', total_beds:'' };
    let valid = true;

    if (!form.room_number.trim()) {
      e.room_number = 'Room number is required'; valid = false;
    } else if (!/^[A-Za-z0-9\-\/]+$/.test(form.room_number.trim())) {
      e.room_number = 'Use letters, numbers, hyphens only (e.g. A-101)'; valid = false;
    }
    if (!form.floor || isNaN(form.floor) || form.floor < 1 || form.floor > 20) {
      e.floor = 'Floor must be between 1 and 20'; valid = false;
    }
    if (!form.monthly_rent || isNaN(form.monthly_rent) || parseFloat(form.monthly_rent) <= 0) {
      e.monthly_rent = 'Enter a valid rent amount'; valid = false;
    }
    if (!form.total_beds || form.total_beds < 1 || form.total_beds > 4) {
      e.total_beds = 'Beds must be between 1 and 4'; valid = false;
    }

    setErrors(e);
    return valid;
  };

  // ── Handlers ─────────────────────────────────────────────────
  const openAdd = () => {
    setEditRoom(null); setForm(EMPTY); setErrors(ERRORS); setErr(''); setRoomDialog(true);
  };
  const openEdit = room => {
    setEditRoom(room);
    setForm({ room_number:room.room_number, floor:room.floor, room_type:room.room_type, amenities:room.amenities||[], monthly_rent:room.monthly_rent, total_beds:room.total_beds });
    setErrors(ERRORS); setErr(''); setRoomDialog(true);
  };

  const handleSaveRoom = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editRoom) await api.updateRoom(editRoom.id, form);
      else          await api.createRoom(form);
      setRoomDialog(false); fetch();
    } catch(e) { setErr(e.response?.data?.message||'Failed to save room'); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this room? This cannot be undone.')) return;
    try { await api.deleteRoom(id); fetch(); }
    catch(e) { alert(e.response?.data?.message||'Failed'); }
  };

  const openAssign = bed => { setSelectedBed(bed); setAssignTenantId(''); setErr(''); setAssignDialog(true); };
  const handleAssign = async () => {
    setErr('');
    if (!assignTenantId) return setErr('Please select a tenant');
    setSaving(true);
    try {
      await api.assignBed({ bed_id:selectedBed.id, tenant_id:assignTenantId });
      setAssignDialog(false); fetch();
      api.getTenants({ status:'pending', limit:100 }).then(r=>setTenants(r.data.tenants||[]));
    } catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const openUnassign = bed => {
    setUnassignTarget({ tenantId:bed.tenant_id, tenantName:bed.tenant_name, bedLabel:bed.bed_label });
    setUnassignDialog(true);
  };
  const handleUnassign = async () => {
    setSaving(true);
    try {
      await api.unassignBed({ tenant_id: unassignTarget.tenantId });
      setUnassignDialog(false); fetch();
      api.getTenants({ status:'pending', limit:100 }).then(r=>setTenants(r.data.tenants||[]));
    } catch(e) { alert(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  // ── Inline field change with per-field error clear ───────────
  const setField = (k, v) => {
    setForm(f => ({ ...f, [k]:v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]:'' }));
  };
  const toggleAmenity = a => setForm(f => ({
    ...f,
    amenities: f.amenities.includes(a) ? f.amenities.filter(x=>x!==a) : [...f.amenities,a]
  }));

  const occupancyPct = parseFloat(stats.occupancy_pct||0);

  return (
    <Box>
      <PageHeader title="Rooms & Beds" subtitle="Manage room occupancy and bed assignments."
        actionLabel={canCreate ? 'Add Room' : null} onAction={openAdd} />

      {/* ── Stat cards ─────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb:3 }}>

        {/* Occupancy rate */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%' }}>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1 }}>
                <Box sx={{ width:40, height:40, borderRadius:2, bgcolor:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <KingBed sx={{ color:'#1B3A6B', fontSize:21 }} />
                </Box>
                <Chip
                  label={`${occupancyPct}%`}
                  size="small"
                  sx={{ fontWeight:800, fontSize:'0.75rem',
                    bgcolor: occupancyPct>=85?'#FEE2E2':occupancyPct>=60?'#FEF3C7':'#D1FAE5',
                    color:   occupancyPct>=85?'#991B1B':occupancyPct>=60?'#92400E':'#065F46'
                  }}
                />
              </Box>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Bed Occupancy</Typography>
              <Typography sx={{ fontSize:'1.9rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2, mt:0.3 }}>
                {stats.occupied_beds||0}
                <Typography component="span" sx={{ fontSize:'1rem', color:'#9CA3AF', fontWeight:500 }}>/{stats.total_beds||0}</Typography>
              </Typography>
              <LinearProgress variant="determinate" value={occupancyPct}
                sx={{ mt:1.2, height:6, borderRadius:3, bgcolor:'#E5E7EB',
                  '& .MuiLinearProgress-bar':{ bgcolor: occupancyPct>=85?'#DC2626':occupancyPct>=60?'#D97706':'#059669' } }} />
              <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.5 }}>
                {stats.available_beds||0} beds available
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Vacant beds — clickable → switches to vacant tab */}
        <Grid item xs={6} sm={3} lg={2}>
          <Card onClick={() => setViewTab('vacant')} sx={{ height:'100%', cursor:'pointer', border:'1px solid', borderColor:viewTab==='vacant'?'#059669':'#E5E7EB', '&:hover':{ borderColor:'#059669', bgcolor:'#F0FDF4' }, transition:'all 0.15s' }}>
            <CardContent sx={{ p:2 }}>
              <Box sx={{ width:36, height:36, borderRadius:2, bgcolor:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', mb:1 }}>
                <CheckCircle sx={{ color:'#059669', fontSize:19 }} />
              </Box>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Vacant Beds</Typography>
              <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color:'#059669', lineHeight:1.2 }}>{stats.available_beds||0}</Typography>
              <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3 }}>{stats.available_rooms||0} rooms available</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total rooms */}
        <Grid item xs={6} sm={3} lg={2}>
          <Card sx={{ height:'100%' }}>
            <CardContent sx={{ p:2 }}>
              <Box sx={{ width:36, height:36, borderRadius:2, bgcolor:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', mb:1 }}>
                <MeetingRoom sx={{ color:'#D97706', fontSize:19 }} />
              </Box>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Total Rooms</Typography>
              <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2 }}>{stats.total_rooms||0}</Typography>
              <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3 }}>{stats.occupied_rooms||0} occupied</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Pending tenants */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%', border:'1px solid', borderColor: parseInt(stats.pending_tenants)>0?'#FCA5A5':'#E5E7EB', bgcolor: parseInt(stats.pending_tenants)>0?'#FFF5F5':'#fff' }}>
            <CardContent sx={{ p:2 }}>
              <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1 }}>
                <Box sx={{ width:36, height:36, borderRadius:2, bgcolor:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <People sx={{ color:'#DC2626', fontSize:19 }} />
                </Box>
                {parseInt(stats.pending_tenants)>0 && (
                  <Chip icon={<Warning sx={{ fontSize:'13px !important' }} />} label="Needs room" size="small"
                    sx={{ bgcolor:'#FEE2E2', color:'#991B1B', fontWeight:700, fontSize:'0.68rem' }} />
                )}
              </Box>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Pending Tenants</Typography>
              <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color: parseInt(stats.pending_tenants)>0?'#DC2626':'#059669', lineHeight:1.2 }}>
                {stats.pending_tenants||0}
              </Typography>
              <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3 }}>
                {parseInt(stats.pending_tenants)>0 ? 'Waiting for bed assignment' : 'All tenants assigned ✓'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Revenue potential */}
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height:'100%', bgcolor:'#F5F7FF', border:'1px solid #E0E7FF' }}>
            <CardContent sx={{ p:2 }}>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', mb:1 }}>Vacant Revenue Lost</Typography>
              <Typography sx={{ fontSize:'1.1rem', fontWeight:800, color:'#DC2626', lineHeight:1.2 }}>
                {fm(rooms.reduce((sum, r) => sum + (parseInt(r.available_beds||0) * parseFloat(r.monthly_rent||0)), 0))}
              </Typography>
              <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3 }}>/month potential</Typography>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* ── Tabs: All / Vacant / Floor N ───────────────────── */}
      <Box sx={{ borderBottom:'1px solid #E5E7EB', mb:2.5 }}>
        <Tabs value={viewTab} onChange={(_,v)=>setViewTab(v)}
          sx={{ '& .MuiTab-root':{ fontSize:'0.82rem', fontWeight:600, minHeight:42, textTransform:'none', px:2 },
               '& .MuiTab-root.Mui-selected':{ color:'#1B3A6B' },
               '& .MuiTabs-indicator':{ bgcolor:'#1B3A6B' } }}>
          <Tab label="All Rooms" value="all" />
          <Tab
            label={
              <Box sx={{ display:'flex', alignItems:'center', gap:0.7 }}>
                Vacant Beds
                {parseInt(stats.available_beds)>0 && (
                  <Chip label={stats.available_beds} size="small"
                    sx={{ height:18, fontSize:'0.65rem', fontWeight:800, bgcolor:'#D1FAE5', color:'#065F46', ml:0.3 }} />
                )}
              </Box>
            }
            value="vacant"
          />
          {floors.map(f => (
            <Tab key={f} label={`Floor ${f}`} value={String(f)} />
          ))}
        </Tabs>
      </Box>

      {/* ── Room grid ──────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>
      ) : filteredRooms.length === 0 ? (
        <Box sx={{ textAlign:'center', py:8 }}>
          <KingBed sx={{ fontSize:56, color:'#E5E7EB', mb:1.5 }} />
          <Typography sx={{ fontWeight:700, color:'#6B7280', mb:0.5 }}>
            {viewTab==='vacant' ? 'No vacant beds right now' : 'No rooms found'}
          </Typography>
          <Typography sx={{ fontSize:'0.82rem', color:'#9CA3AF' }}>
            {viewTab==='vacant' ? 'All beds are currently occupied.' : 'Add a room to get started.'}
          </Typography>
          {viewTab==='vacant' && (
            <Button variant="outlined" sx={{ mt:2, borderRadius:2 }} onClick={()=>setViewTab('all')}>View All Rooms</Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={2} alignItems="stretch">
          {filteredRooms.map(room => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={room.id} sx={{ display:'flex' }}>
              <Card sx={{ width:'100%', display:'flex', flexDirection:'column',
                transition:'all 0.18s', border:'1px solid #E5E7EB',
                '&:hover':{ transform:'translateY(-2px)', boxShadow:'0 6px 24px rgba(0,0,0,0.09)', borderColor:'#C7D2FE' } }}>
                <CardContent sx={{ p:2, flex:1, display:'flex', flexDirection:'column' }}>

                  {/* Header row */}
                  <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1 }}>
                    <Box>
                      <Typography sx={{ fontSize:'0.65rem', color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em' }}>ROOM</Typography>
                      <Typography sx={{ fontSize:'1.45rem', fontWeight:800, lineHeight:1.1, color:'#1A1F36' }}>{room.room_number}</Typography>
                    </Box>
                    <Box sx={{ display:'flex', gap:0.2, alignItems:'center' }}>
                      {/* Vacancy badge */}
                      {parseInt(room.available_beds) > 0 && (
                        <Chip label={`${room.available_beds} free`} size="small"
                          sx={{ bgcolor:'#D1FAE5', color:'#065F46', fontWeight:700, fontSize:'0.65rem', height:20 }} />
                      )}
                      {canCreate && <>
                        <IconButton size="small" sx={{ color:'#6B7280', '&:hover':{ color:'#1B3A6B' } }} onClick={()=>openEdit(room)}><Edit sx={{ fontSize:14 }} /></IconButton>
                        <IconButton size="small" sx={{ color:'#6B7280', '&:hover':{ color:'#DC2626' } }} onClick={()=>handleDelete(room.id)}><Delete sx={{ fontSize:14 }} /></IconButton>
                      </>}
                    </Box>
                  </Box>

                  {/* Type + floor chips */}
                  <Box sx={{ display:'flex', gap:0.5, mb:1.2, flexWrap:'wrap' }}>
                    <Chip label={room.room_type?.toUpperCase()} size="small"
                      sx={{ fontSize:'0.62rem', fontWeight:700, bgcolor:`${typeColor(room.room_type)}18`, color:typeColor(room.room_type) }} />
                    <Chip label={`Floor ${room.floor}`} size="small" sx={{ fontSize:'0.62rem', bgcolor:'#F3F4F6', color:'#374151' }} />
                    {(room.amenities||[]).slice(0,2).map(a => (
                      <Chip key={a} label={a} size="small" sx={{ fontSize:'0.6rem', bgcolor:'#F3F4F6', color:'#374151' }} />
                    ))}
                    {(room.amenities||[]).length > 2 && (
                      <Chip label={`+${room.amenities.length-2}`} size="small" sx={{ fontSize:'0.6rem', bgcolor:'#F3F4F6', color:'#6B7280' }} />
                    )}
                  </Box>

                  {/* Rent */}
                  <Typography sx={{ fontSize:'0.8rem', fontWeight:700, color:'#059669', mb:1.2 }}>
                    {fm(room.monthly_rent)}<Typography component="span" sx={{ fontSize:'0.68rem', color:'#9CA3AF', fontWeight:400 }}>/bed/mo</Typography>
                  </Typography>

                  {/* Beds — flex:1 keeps all cards equal height */}
                  <Box sx={{ flex:1 }}>
                    {(room.beds||[]).map(bed => (
                      <Box key={bed.id} sx={{
                        display:'flex', alignItems:'center', gap:1, mb:0.7, p:0.9,
                        borderRadius:1.5, minHeight:44,
                        bgcolor: bed.status==='occupied' ? '#F0F4FF' : '#F9FAFB',
                        border: '1px solid', borderColor: bed.status==='occupied' ? '#C7D2FE' : '#E5E7EB'
                      }}>
                        {bed.status==='occupied' ? (
                          <Avatar sx={{ width:26, height:26, fontSize:'0.65rem', bgcolor:'#1B3A6B', flexShrink:0 }}>
                            {bed.tenant_name?.charAt(0)}
                          </Avatar>
                        ) : (
                          <Box sx={{ width:26, height:26, borderRadius:'50%', border:'1.5px dashed #D1D5DB',
                            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <Add sx={{ fontSize:13, color:'#9CA3AF' }} />
                          </Box>
                        )}

                        <Box sx={{ flex:1, minWidth:0 }}>
                          {bed.status==='occupied' ? (
                            <>
                              <Typography sx={{ fontSize:'0.72rem', fontWeight:600, color:'#1A1F36' }} noWrap>{bed.tenant_name}</Typography>
                              <Typography sx={{ fontSize:'0.64rem', color:'#6B7280' }}>
                                Bed {bed.bed_label} · Since {bed.joining_date ? new Date(bed.joining_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}
                              </Typography>
                            </>
                          ) : (
                            <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF' }}>Bed {bed.bed_label} — Vacant</Typography>
                          )}
                        </Box>

                        {bed.status==='available' && canCreate && (
                          <Button size="small" variant="contained"
                            sx={{ py:0.2, px:0.8, fontSize:'0.62rem', borderRadius:1.2, minWidth:'auto', flexShrink:0 }}
                            onClick={() => openAssign(bed)}>
                            Assign
                          </Button>
                        )}
                        {bed.status==='occupied' && canCreate && bed.tenant_id && (
                          <Tooltip title="Remove tenant from this bed">
                            <Button size="small" variant="outlined" color="warning"
                              sx={{ py:0.2, px:0.7, fontSize:'0.62rem', borderRadius:1.2, minWidth:'auto', flexShrink:0 }}
                              onClick={() => openUnassign(bed)}>
                              Remove
                            </Button>
                          </Tooltip>
                        )}
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Add room card */}
          {canCreate && viewTab!=='vacant' && (
            <Grid item xs={12} sm={6} md={4} lg={3} sx={{ display:'flex' }}>
              <Card onClick={openAdd} sx={{ width:'100%', minHeight:180, cursor:'pointer', border:'2px dashed #D1D5DB', boxShadow:'none',
                display:'flex', alignItems:'center', justifyContent:'center',
                '&:hover':{ borderColor:'#1B3A6B', bgcolor:'#F5F7FF' }, transition:'all 0.18s' }}>
                <Box sx={{ textAlign:'center' }}>
                  <Box sx={{ width:42, height:42, borderRadius:'50%', border:'2px dashed #D1D5DB',
                    display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', mb:1 }}>
                    <Add sx={{ color:'#9CA3AF', fontSize:22 }} />
                  </Box>
                  <Typography sx={{ fontWeight:600, color:'#6B7280', fontSize:'0.875rem' }}>Add New Room</Typography>
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* ── ADD / EDIT ROOM DIALOG ──────────────────────────── */}
      <Dialog open={roomDialog} onClose={()=>{ if(!saving) setRoomDialog(false); }}
        maxWidth="sm" fullWidth keepMounted={false}
        TransitionProps={{ onExited:()=>{ setForm(EMPTY); setErrors(ERRORS); setErr(''); setEditRoom(null); } }}
        PaperProps={{ sx:{ borderRadius:3 } }}>

        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Box>
            <Typography sx={{ fontWeight:700 }}>{editRoom ? 'Edit Room' : 'Add New Room'}</Typography>
            <Typography sx={{ fontSize:'0.75rem', color:'#6B7280' }}>Fields marked * are required</Typography>
          </Box>
          <IconButton onClick={()=>setRoomDialog(false)} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}

          <Grid container spacing={2}>
            {/* Room Number */}
            <Grid item xs={6}>
              <TextField
                fullWidth label="Room Number *" size="small"
                value={form.room_number}
                onChange={e => setField('room_number', e.target.value)}
                error={!!errors.room_number}
                helperText={errors.room_number || 'e.g. A-101, 204'}
                inputProps={{ maxLength:10 }}
              />
            </Grid>

            {/* Floor */}
            <Grid item xs={6}>
              <TextField
                fullWidth label="Floor *" size="small" type="number"
                value={form.floor}
                onChange={e => setField('floor', parseInt(e.target.value)||'')}
                error={!!errors.floor}
                helperText={errors.floor || 'Ground = 1'}
                inputProps={{ min:1, max:20 }}
              />
            </Grid>

            {/* Room Type */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Room Type *</InputLabel>
                <Select value={form.room_type} label="Room Type *"
                  onChange={e => setForm(f=>({...f, room_type:e.target.value}))}>
                  {TYPES.map(t => (
                    <MenuItem key={t} value={t}>
                      <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                        <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:typeColor(t) }} />
                        {t.charAt(0).toUpperCase()+t.slice(1)}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Total Beds */}
            <Grid item xs={6}>
              <TextField
                fullWidth label="Total Beds *" size="small" type="number"
                value={form.total_beds}
                onChange={e => setField('total_beds', parseInt(e.target.value)||'')}
                error={!!errors.total_beds}
                helperText={errors.total_beds || '1 to 4 beds per room'}
                inputProps={{ min:1, max:4 }}
              />
            </Grid>

            {/* Monthly Rent */}
            <Grid item xs={12}>
              <TextField
                fullWidth label="Monthly Rent per Bed (₹) *" size="small" type="number"
                value={form.monthly_rent}
                onChange={e => setField('monthly_rent', e.target.value)}
                error={!!errors.monthly_rent}
                helperText={errors.monthly_rent || (form.monthly_rent && form.total_beds ? `Total room revenue: ₹${(parseFloat(form.monthly_rent)*parseInt(form.total_beds)).toLocaleString('en-IN')}/mo when full` : '')}
                InputProps={{ startAdornment:<Typography sx={{ mr:0.5, color:'#6B7280', fontSize:'0.9rem' }}>₹</Typography> }}
              />
            </Grid>

            {/* Amenities */}
            <Grid item xs={12}>
              <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1, color:'#374151' }}>Amenities</Typography>
              <Box sx={{ display:'flex', gap:1, flexWrap:'wrap' }}>
                {AMENITIES.map(a => (
                  <Chip key={a} label={a} size="small" clickable onClick={() => toggleAmenity(a)}
                    sx={{ fontWeight:600, fontSize:'0.75rem',
                      bgcolor: form.amenities.includes(a)?'#1B3A6B':'#F3F4F6',
                      color:   form.amenities.includes(a)?'#fff':'#374151',
                      border:  form.amenities.includes(a)?'1.5px solid #1B3A6B':'1.5px solid transparent',
                      '&:hover':{ bgcolor: form.amenities.includes(a)?'#2952A3':'#E5E7EB' }
                    }} />
                ))}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px:3, py:2, gap:1 }}>
          <Button onClick={()=>setRoomDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSaveRoom} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : editRoom ? 'Save Changes' : 'Create Room'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── ASSIGN BED DIALOG ───────────────────────────────── */}
      <Dialog open={assignDialog} onClose={()=>{ if(!saving) setAssignDialog(false); }}
        maxWidth="xs" fullWidth keepMounted={false}
        TransitionProps={{ onExited:()=>{ setAssignTenantId(''); setErr(''); } }}
        PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Box>
            <Typography sx={{ fontWeight:700 }}>Assign Tenant to Bed</Typography>
            <Typography sx={{ fontSize:'0.78rem', color:'#6B7280' }}>Bed {selectedBed?.bed_label}</Typography>
          </Box>
          <IconButton onClick={()=>setAssignDialog(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          {tenants.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius:2 }}>
              No pending tenants. Add a tenant first from the Tenants page.
            </Alert>
          ) : (
            <FormControl fullWidth size="small" sx={{ mt:1 }}>
              <InputLabel>Select Pending Tenant</InputLabel>
              <Select value={assignTenantId} label="Select Pending Tenant"
                onChange={e => setAssignTenantId(e.target.value)}>
                {tenants.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    <Box>
                      <Typography sx={{ fontSize:'0.875rem', fontWeight:600 }}>{t.name}</Typography>
                      <Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{t.phone}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={()=>setAssignDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleAssign} variant="contained" disabled={saving||!assignTenantId} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── UNASSIGN BED DIALOG ─────────────────────────────── */}
      <Dialog open={unassignDialog} onClose={()=>{ if(!saving) setUnassignDialog(false); }}
        maxWidth="xs" fullWidth keepMounted={false}
        PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle><Typography sx={{ fontWeight:700 }}>Remove from Bed</Typography></DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius:2 }}>
            Remove <strong>{unassignTarget?.tenantName}</strong> from Bed {unassignTarget?.bedLabel}?
            They will become <strong>Pending</strong> and need to be re-assigned.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={()=>setUnassignDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleUnassign} variant="contained" color="warning" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Remove from Bed'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
