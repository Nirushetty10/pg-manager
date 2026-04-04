import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip, Avatar,
  IconButton, CircularProgress, LinearProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Alert
} from '@mui/material';
import { Add, Close, Edit, Delete, Build } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import { PageHeader } from '../../components/common';
import StatusChip from '../../components/common/StatusChip';

const TYPES = ['single','double','triple','deluxe'];
const AMENITIES = ['AC','WIFI','ATTACHED_BATH','TV','FRIDGE'];
const EMPTY = { room_number:'', floor:1, room_type:'single', amenities:[], monthly_rent:'', total_beds:1, notes:'' };

export default function RoomsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const [rooms, setRooms] = useState([]);
  const [stats, setStats] = useState({});
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [floor, setFloor] = useState('all');
  // Dialogs
  const [roomDialog, setRoomDialog] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [maintenanceDialog, setMaintenanceDialog] = useState(false);
  const [maintenance, setMaintenance] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [assignTenantId, setAssignTenantId] = useState('');
  const [mForm, setMForm] = useState({ room_id:'', title:'', description:'', priority:'normal' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const p = floor !== 'all' ? { floor } : {};
      const res = await api.getRooms(p);
      setRooms(res.data.rooms||[]); setStats(res.data.stats||{});
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, floor]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    api.getTenants({ status:'pending', limit:100 }).then(r => setTenants(r.data.tenants||[])).catch(()=>{});
    api.getMaintenance().then(r => setMaintenance(r.data||[])).catch(()=>{});
  }, [pgId]);

  const floors = [...new Set(rooms.map(r => r.floor))].sort();
  const typeColor = (t) => ({ single:'#1B3A6B', double:'#059669', triple:'#D97706', deluxe:'#7C3AED' }[t]||'#6B7280');

  // OPEN ROOM DIALOG
  const openAdd = () => { setEditRoom(null); setForm(EMPTY); setErr(''); setRoomDialog(true); };
  const openEdit = (room) => {
    setEditRoom(room);
    setForm({ room_number:room.room_number, floor:room.floor, room_type:room.room_type, amenities:room.amenities||[], monthly_rent:room.monthly_rent, total_beds:room.total_beds, notes:room.notes||'' });
    setErr(''); setRoomDialog(true);
  };

  const handleSaveRoom = async () => {
    setErr('');
    if (!form.room_number || !form.monthly_rent) return setErr('Room number and rent are required');
    setSaving(true);
    try {
      if (editRoom) await api.updateRoom(editRoom.id, form);
      else await api.createRoom(form);
      setRoomDialog(false); fetch();
    } catch(e) { setErr(e.response?.data?.message||'Failed to save room'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm('Delete this room? This cannot be undone.')) return;
    try { await api.deleteRoom(roomId); fetch(); }
    catch(e) { alert(e.response?.data?.message||'Failed to delete room'); }
  };

  // ASSIGN BED
  const openAssignBed = (bed) => { setSelectedBed(bed); setAssignTenantId(''); setErr(''); setAssignDialog(true); };
  const handleAssignBed = async () => {
    setErr('');
    if (!assignTenantId) return setErr('Please select a tenant');
    setSaving(true);
    try { await api.assignBed({ bed_id: selectedBed.id, tenant_id: assignTenantId }); setAssignDialog(false); fetch(); }
    catch(e) { setErr(e.response?.data?.message||'Failed to assign bed'); }
    finally { setSaving(false); }
  };

  // MAINTENANCE
  const handleMaintenance = async () => {
    setErr('');
    if (!mForm.title) return setErr('Title is required');
    setSaving(true);
    try { await api.createMaintenance(mForm); setMaintenanceDialog(false); setMForm({ room_id:'', title:'', description:'', priority:'normal' }); api.getMaintenance().then(r => setMaintenance(r.data||[])); }
    catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const handleMaintUpdate = async (id, status) => {
    await api.updateMaintenance(id, { status });
    api.getMaintenance().then(r => setMaintenance(r.data||[]));
  };

  return (
    <Box>
      <PageHeader title="Rooms & Beds" subtitle="Manage room occupancy and bed assignments." actionLabel="Add Room" onAction={openAdd} />

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb:3 }}>
        {[
          { label:'Total Beds', value:`${stats.occupied_beds||0}/${stats.total_beds||0}`, sub:'Occupied', color:'#1B3A6B', bg:'#EEF2FF', prog: stats.total_beds>0?(stats.occupied_beds/stats.total_beds)*100:0 },
          { label:'Available Beds', value:stats.available_beds||0, color:'#059669', bg:'#D1FAE5' },
          { label:'Total Rooms', value:stats.total_rooms||0, sub:`${stats.occupied_rooms||0} occupied`, color:'#D97706', bg:'#FEF3C7' },
          { label:'Maintenance Open', value:maintenance.filter(m=>m.status==='open').length, color:'#DC2626', bg:'#FEE2E2' },
        ].map(s => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card><CardContent sx={{ p:2 }}>
              <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</Typography>
              <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color:s.color, my:0.3 }}>{s.value}</Typography>
              {s.sub && <Typography sx={{ fontSize:'0.75rem', color:'#9CA3AF' }}>{s.sub}</Typography>}
              {s.prog !== undefined && <LinearProgress variant="determinate" value={s.prog} sx={{ mt:1, height:4, borderRadius:2, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor:s.color } }} />}
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      {/* Floor filter + actions */}
      <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2.5, flexWrap:'wrap' }}>
        {['all', ...floors].map(f => (
          <Chip key={f} label={f==='all'?'All Floors':`Floor ${f}`} clickable onClick={() => setFloor(f==='all'?'all':f)}
            sx={{ fontWeight:600, cursor:'pointer', bgcolor: floor===f?'#1B3A6B':'#F3F4F6', color: floor===f?'#fff':'#374151' }} />
        ))}
        <Box sx={{ ml:'auto' }}>
          <Button size="small" variant="outlined" startIcon={<Build sx={{ fontSize:15 }} />} onClick={() => { setErr(''); setMaintenanceDialog(true); }} sx={{ fontSize:'0.78rem', borderRadius:2 }}>
            Add Maintenance
          </Button>
        </Box>
      </Box>

      {/* Maintenance alerts */}
      {maintenance.filter(m=>m.status==='open').length > 0 && (
        <Card sx={{ mb:2.5, border:'1px solid #FCA5A5', bgcolor:'#FEF2F2' }}>
          <CardContent sx={{ p:2 }}>
            <Typography sx={{ fontWeight:700, fontSize:'0.82rem', color:'#DC2626', mb:1 }}>⚠️ Open Maintenance Requests</Typography>
            <Box sx={{ display:'flex', gap:1, flexWrap:'wrap' }}>
              {maintenance.filter(m=>m.status==='open').map(m => (
                <Box key={m.id} sx={{ display:'flex', alignItems:'center', gap:1, p:1, bgcolor:'#fff', borderRadius:2, border:'1px solid #FCA5A5' }}>
                  <Typography sx={{ fontSize:'0.78rem', fontWeight:600 }}>{m.room_number||'Common'} — {m.title}</Typography>
                  <StatusChip status={m.priority} />
                  <Button size="small" sx={{ fontSize:'0.68rem', py:0.2, px:1 }} onClick={() => handleMaintUpdate(m.id,'resolved')}>Resolve</Button>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box> : (
        <Grid container spacing={2}>
          {rooms.map(room => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={room.id}>
              <Card sx={{ height:'100%', transition:'all 0.18s ease', '&:hover':{ transform:'translateY(-2px)', boxShadow:'0 6px 20px rgba(0,0,0,0.1)' } }}>
                <CardContent sx={{ p:2 }}>
                  <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:1 }}>
                    <Box>
                      <Typography sx={{ fontSize:'0.68rem', color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em' }}>ROOM</Typography>
                      <Typography sx={{ fontSize:'1.5rem', fontWeight:800, lineHeight:1.1 }}>{room.room_number}</Typography>
                    </Box>
                    <Box sx={{ display:'flex', gap:0.3 }}>
                      <IconButton size="small" sx={{ color:'#6B7280' }} onClick={() => openEdit(room)}><Edit sx={{ fontSize:15 }} /></IconButton>
                      <IconButton size="small" sx={{ color:'#DC2626' }} onClick={() => handleDelete(room.id)}><Delete sx={{ fontSize:15 }} /></IconButton>
                    </Box>
                  </Box>

                  <Box sx={{ display:'flex', gap:0.5, mb:1.5, flexWrap:'wrap' }}>
                    <Chip label={room.room_type?.toUpperCase()} size="small" sx={{ fontSize:'0.65rem', fontWeight:700, bgcolor:`${typeColor(room.room_type)}18`, color:typeColor(room.room_type) }} />
                    <Chip label={`Floor ${room.floor}`} size="small" sx={{ fontSize:'0.65rem', bgcolor:'#F3F4F6', color:'#374151' }} />
                    {(room.amenities||[]).map(a => <Chip key={a} label={a} size="small" sx={{ fontSize:'0.62rem', bgcolor:'#F3F4F6', color:'#374151' }} />)}
                  </Box>

                  <Typography sx={{ fontSize:'0.75rem', fontWeight:700, color:'#059669', mb:1 }}>₹{Number(room.monthly_rent).toLocaleString('en-IN')}/mo</Typography>

                  {(room.beds||[]).map(bed => (
                    <Box key={bed.id} sx={{ display:'flex', alignItems:'center', gap:1.5, mb:0.8, p:1, borderRadius:1.5, bgcolor: bed.status==='occupied'?'#F5F7FF':'#F9FAFB' }}>
                      {bed.status==='occupied' ? (
                        <Avatar sx={{ width:26, height:26, fontSize:'0.68rem', bgcolor:'#1B3A6B' }}>{bed.tenant_name?.charAt(0)||'?'}</Avatar>
                      ) : (
                        <Box sx={{ width:26, height:26, borderRadius:'50%', border:'1.5px dashed #D1D5DB', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Add sx={{ fontSize:13, color:'#9CA3AF' }} />
                        </Box>
                      )}
                      <Box sx={{ flex:1, minWidth:0 }}>
                        {bed.status==='occupied' ? (
                          <>
                            <Typography sx={{ fontSize:'0.75rem', fontWeight:600 }} noWrap>{bed.tenant_name}</Typography>
                            <Typography sx={{ fontSize:'0.68rem', color:'#6B7280' }}>Bed {bed.bed_label} · Since {bed.joining_date ? new Date(bed.joining_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '-'}</Typography>
                          </>
                        ) : (
                          <>
                            <Typography sx={{ fontSize:'0.75rem', color:'#1B3A6B', fontWeight:600 }}>Vacant</Typography>
                            <Typography sx={{ fontSize:'0.68rem', color:'#9CA3AF' }}>Bed {bed.bed_label} · Available</Typography>
                          </>
                        )}
                      </Box>
                      {bed.status==='available' && (
                        <Button size="small" variant="contained" sx={{ py:0.2, px:1, fontSize:'0.65rem', borderRadius:1.5, minWidth:'auto' }} onClick={() => openAssignBed(bed)}>Assign</Button>
                      )}
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Add room card */}
          <Grid item xs={12} sm={6} md={4} lg={3}>
            <Card onClick={openAdd} sx={{ minHeight:180, cursor:'pointer', border:'2px dashed #D1D5DB', boxShadow:'none', display:'flex', alignItems:'center', justifyContent:'center', '&:hover':{ borderColor:'#1B3A6B', bgcolor:'#F9FAFB' }, transition:'all 0.18s' }}>
              <Box sx={{ textAlign:'center', p:3 }}>
                <Box sx={{ width:40, height:40, borderRadius:'50%', border:'2px dashed #D1D5DB', display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', mb:1.5 }}>
                  <Add sx={{ color:'#9CA3AF', fontSize:20 }} />
                </Box>
                <Typography sx={{ fontWeight:600, color:'#6B7280' }}>Add New Room</Typography>
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ADD/EDIT ROOM DIALOG */}
      <Dialog open={roomDialog} onClose={() => { if(!saving) setRoomDialog(false); }} maxWidth="sm" fullWidth keepMounted={false}
        TransitionProps={{ onExited:() => { setForm(EMPTY); setErr(''); setEditRoom(null); } }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>{editRoom ? 'Edit Room' : 'Add New Room'}</Typography>
          <IconButton onClick={() => setRoomDialog(false)} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={6}><TextField fullWidth label="Room Number *" size="small" value={form.room_number} onChange={e => setForm(f=>({...f,room_number:e.target.value}))} placeholder="e.g. A-101" /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Floor" size="small" type="number" value={form.floor} onChange={e => setForm(f=>({...f,floor:parseInt(e.target.value)||1}))} InputProps={{ inputProps:{ min:1,max:20 } }} /></Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small"><InputLabel>Room Type</InputLabel>
                <Select value={form.room_type} label="Room Type" onChange={e => setForm(f=>({...f,room_type:e.target.value}))}>
                  {TYPES.map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth label="Total Beds" size="small" type="number" value={form.total_beds} onChange={e => setForm(f=>({...f,total_beds:parseInt(e.target.value)||1}))} InputProps={{ inputProps:{ min:1,max:4 } }} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Monthly Rent (₹) *" size="small" type="number" value={form.monthly_rent} onChange={e => setForm(f=>({...f,monthly_rent:e.target.value}))} /></Grid>
            <Grid item xs={12}>
              <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>Amenities</Typography>
              <Box sx={{ display:'flex', gap:1, flexWrap:'wrap' }}>
                {AMENITIES.map(a => (
                  <Chip key={a} label={a} size="small" clickable
                    onClick={() => setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x=>x!==a) : [...f.amenities,a] }))}
                    sx={{ fontWeight:600, fontSize:'0.75rem', bgcolor: form.amenities.includes(a)?'#1B3A6B':'#F3F4F6', color: form.amenities.includes(a)?'#fff':'#374151' }}
                  />
                ))}
              </Box>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" size="small" multiline rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={() => setRoomDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSaveRoom} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : editRoom ? 'Save Changes' : 'Create Room'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ASSIGN BED DIALOG */}
      <Dialog open={assignDialog} onClose={() => { if(!saving) setAssignDialog(false); }} maxWidth="xs" fullWidth keepMounted={false}
        TransitionProps={{ onExited:() => { setAssignTenantId(''); setErr(''); } }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Box>
            <Typography sx={{ fontWeight:700 }}>Assign Bed</Typography>
            <Typography sx={{ fontSize:'0.78rem', color:'#6B7280' }}>Bed {selectedBed?.bed_label} — Room {selectedBed?.room_id?.toString().slice(-4)}</Typography>
          </Box>
          <IconButton onClick={() => setAssignDialog(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <FormControl fullWidth size="small" sx={{ mt:1 }}>
            <InputLabel>Select Tenant (Pending)</InputLabel>
            <Select value={assignTenantId} label="Select Tenant (Pending)" onChange={e => setAssignTenantId(e.target.value)}>
              {tenants.map(t => <MenuItem key={t.id} value={t.id}>{t.name} — {t.phone}</MenuItem>)}
            </Select>
          </FormControl>
          {tenants.length === 0 && <Typography sx={{ fontSize:'0.78rem', color:'#9CA3AF', mt:1 }}>No pending tenants. Add a tenant first.</Typography>}
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={() => setAssignDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleAssignBed} variant="contained" disabled={saving||!assignTenantId} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Assign Bed'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* MAINTENANCE DIALOG */}
      <Dialog open={maintenanceDialog} onClose={() => { if(!saving) setMaintenanceDialog(false); }} maxWidth="xs" fullWidth keepMounted={false}
        TransitionProps={{ onExited:() => { setMForm({ room_id:'', title:'', description:'', priority:'normal' }); setErr(''); } }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>Add Maintenance Request</Typography>
          <IconButton onClick={() => setMaintenanceDialog(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Room (Optional)</InputLabel>
                <Select value={mForm.room_id} label="Room (Optional)" onChange={e => setMForm(f=>({...f,room_id:e.target.value}))}>
                  <MenuItem value="">None / Common Area</MenuItem>
                  {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.room_number}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Issue Title *" size="small" value={mForm.title} onChange={e => setMForm(f=>({...f,title:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Description" size="small" multiline rows={2} value={mForm.description} onChange={e => setMForm(f=>({...f,description:e.target.value}))} /></Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Priority</InputLabel>
                <Select value={mForm.priority} label="Priority" onChange={e => setMForm(f=>({...f,priority:e.target.value}))}>
                  {['low','normal','high','urgent'].map(p => <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={() => setMaintenanceDialog(false)} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleMaintenance} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
