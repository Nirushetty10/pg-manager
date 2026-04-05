import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, TextField, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Divider, Tab, Tabs,
  InputAdornment, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import {
  People, Settings, BarChart, History, Add, Edit, Key, Close,
  CheckCircle, Cancel, Download, AdminPanelSettings, Phone, Email,
  LocationOn, Receipt, Visibility, VisibilityOff, CloudUpload,
  Business, DeleteOutline, ChevronLeft, ChevronRight
} from '@mui/icons-material';
import {
  BarChart as ReBarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { pgAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const fm = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const timeAgo = (ts) => { const s=Math.floor((Date.now()-new Date(ts))/1000); if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return fmtDate(ts); };
const PIE_COLORS = ['#1B3A6B','#FF6B35','#059669','#7C3AED','#D97706','#0891B2'];
const EMPTY_STAFF = { name:'', email:'', password:'', role:'staff' };
const API_BASE = import.meta.env.VITE_API_URL?.replace('/api','') || '';

const ALL_PERMISSIONS = [
  { key:'manage_tenants',  label:'Tenants' },
  { key:'manage_rooms',    label:'Rooms & Beds' },
  { key:'record_payments', label:'Payments' },
  { key:'manage_expenses', label:'Expenses' },
  { key:'view_reports',    label:'Reports' },
  { key:'manage_staff',    label:'Manage Staff' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const { pgId } = useParams();
  const [tab, setTab] = useState(0);

  if (user?.role !== 'owner') {
    return (
      <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:2 }}>
        <AdminPanelSettings sx={{ fontSize:64, color:'#DC2626' }} />
        <Typography variant="h5" sx={{ fontWeight:700 }}>Access Denied</Typography>
        <Typography sx={{ color:'#6B7280' }}>Only property owners can access this panel.</Typography>
      </Box>
    );
  }

  const tabs = [
    { label:'Staff', icon:<People sx={{ fontSize:17 }} /> },
    { label:'Permissions', icon:<AdminPanelSettings sx={{ fontSize:17 }} /> },
    { label:'PG Settings', icon:<Settings sx={{ fontSize:17 }} /> },
    { label:'Reports', icon:<BarChart sx={{ fontSize:17 }} /> },
    { label:'Activity', icon:<History sx={{ fontSize:17 }} /> },
  ];

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', gap:2, mb:3 }}>
        <Box sx={{ width:46, height:46, borderRadius:2, background:'linear-gradient(135deg,#1B3A6B,#2952A3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <AdminPanelSettings sx={{ color:'#fff', fontSize:24 }} />
        </Box>
        <Box>
          <Typography variant="h4" sx={{ fontWeight:800 }}>Admin Panel</Typography>
          <Typography sx={{ fontSize:'0.875rem', color:'#6B7280' }}>Staff, permissions, settings, reports</Typography>
        </Box>
      </Box>

      <Box sx={{ borderBottom:'1px solid #E5E7EB', mb:3 }}>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{ '& .MuiTab-root':{ fontWeight:600, fontSize:'0.85rem', minHeight:46, textTransform:'none' } }}>
          {tabs.map((t,i)=><Tab key={i} label={t.label} icon={t.icon} iconPosition="start" />)}
        </Tabs>
      </Box>

      {tab===0 && <StaffTab pgId={pgId} />}
      {tab===1 && <PermissionsTab pgId={pgId} />}
      {tab===2 && <SettingsTab pgId={pgId} />}
      {tab===3 && <ReportsTab pgId={pgId} />}
      {tab===4 && <ActivityTab pgId={pgId} />}
    </Box>
  );
}

// ── STAFF ─────────────────────────────────────────────────────
function StaffTab({ pgId }) {
  const api = pgAPI(pgId);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState(EMPTY_STAFF);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async()=>{ setLoading(true); try { const r=await api.getStaff(); setStaff(r.data); } catch(e){} finally { setLoading(false); } }, [pgId]);
  useEffect(()=>{ fetch(); },[fetch]);

  const openAdd = () => { setEditStaff(null); setForm(EMPTY_STAFF); setErr(''); setShowPass(false); setDialogOpen(true); };
  const openEdit = (s) => { setEditStaff(s); setForm({ name:s.name, email:s.email, password:'', role:s.role }); setErr(''); setShowPass(false); setDialogOpen(true); };
  const handleClose = () => { if(saving) return; setDialogOpen(false); };
  const handleExited = () => { setEditStaff(null); setForm(EMPTY_STAFF); setErr(''); };

  const handleSubmit = async () => {
    setErr('');
    if (!form.name||!form.email||(!editStaff&&!form.password)) return setErr('All fields required');
    setSaving(true);
    try {
      if (editStaff) await api.updateStaff(editStaff.id, { name:form.name, role:form.role, is_active:editStaff.is_active });
      else await api.createStaff(form);
      setDialogOpen(false); fetch();
    } catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (s) => {
    try { await api.updateStaff(s.id, { name:s.name, role:s.role, is_active:!s.is_active }); fetch(); } catch(e) {}
  };
  const handleReset = async () => {
    if (!newPass||newPass.length<6) return;
    try { await api.resetStaffPassword(resetId, { new_password:newPass }); setResetOpen(false); } catch(e) {}
  };

  const roleChip = (role) => {
    const cfg = { manager:{ bg:'#DBEAFE', color:'#1E40AF' }, staff:{ bg:'#D1FAE5', color:'#065F46' } }[role]||{ bg:'#F3F4F6', color:'#374151' };
    return <Chip label={role.charAt(0).toUpperCase()+role.slice(1)} size="small" sx={{ bgcolor:cfg.bg, color:cfg.color, fontWeight:700, fontSize:'0.68rem' }} />;
  };

  return (
    <Box>
      <Card>
        <CardContent sx={{ p:0 }}>
          <Box sx={{ px:2.5, py:2, display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #E5E7EB' }}>
            <Typography sx={{ fontWeight:700 }}>Staff Accounts</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={openAdd} sx={{ borderRadius:2 }}>Add Staff</Button>
          </Box>
          {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:5 }}><CircularProgress /></Box> : (
            <Table>
              <TableHead><TableRow>{['Staff','Role','Status','Joined','Actions'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {staff.map(s=>(
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                        <Avatar sx={{ width:34, height:34, bgcolor:'#1B3A6B', fontSize:'0.82rem' }}>{s.name?.charAt(0)}</Avatar>
                        <Box><Typography sx={{ fontWeight:600, fontSize:'0.875rem' }}>{s.name}</Typography><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{s.email}</Typography></Box>
                      </Box>
                    </TableCell>
                    <TableCell>{roleChip(s.role)}</TableCell>
                    <TableCell>
                      <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                        <Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor:s.is_active?'#059669':'#9CA3AF' }} />
                        <Typography sx={{ fontSize:'0.82rem', color:s.is_active?'#059669':'#9CA3AF', fontWeight:600 }}>{s.is_active?'Active':'Inactive'}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{fmtDate(s.created_at)}</TableCell>
                    <TableCell>
                      <Box sx={{ display:'flex', gap:0.3 }}>
                        <Tooltip title="Edit"><IconButton size="small" sx={{ color:'#1B3A6B' }} onClick={()=>openEdit(s)}><Edit fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Reset Password"><IconButton size="small" sx={{ color:'#D97706' }} onClick={()=>{ setResetId(s.id); setNewPass(''); setShowPass(false); setResetOpen(true); }}><Key fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title={s.is_active?'Deactivate':'Activate'}>
                          <IconButton size="small" sx={{ color:s.is_active?'#DC2626':'#059669' }} onClick={()=>handleToggle(s)}>
                            {s.is_active?<Cancel fontSize="small"/>:<CheckCircle fontSize="small"/>}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {staff.length===0 && <TableRow><TableCell colSpan={5} sx={{ textAlign:'center', py:5, color:'#9CA3AF' }}>No staff added yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth keepMounted={false} TransitionProps={{ onExited:handleExited }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>{editStaff?'Edit Staff':'Add Staff'}</Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={12}><TextField fullWidth label="Full Name *" size="small" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Email *" size="small" type="email" value={form.email} disabled={!!editStaff} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></Grid>
            {!editStaff && <Grid item xs={12}><TextField fullWidth label="Password *" size="small" type={showPass?'text':'password'} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} InputProps={{ endAdornment:<InputAdornment position="end"><IconButton size="small" onClick={()=>setShowPass(!showPass)}>{showPass?<VisibilityOff/>:<Visibility/>}</IconButton></InputAdornment> }} /></Grid>}
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Role</InputLabel>
                <Select value={form.role} label="Role" onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                  <MenuItem value="manager">Manager</MenuItem>
                  <MenuItem value="staff">Staff</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving?<CircularProgress size={20} color="inherit"/>:editStaff?'Save':'Add Staff'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetOpen} onClose={()=>setResetOpen(false)} maxWidth="xs" fullWidth keepMounted={false} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>Reset Password</Typography>
          <IconButton onClick={()=>setResetOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField fullWidth label="New Password" size="small" sx={{ mt:1 }} type={showPass?'text':'password'} value={newPass} onChange={e=>setNewPass(e.target.value)} helperText="Min 6 characters"
            InputProps={{ endAdornment:<InputAdornment position="end"><IconButton size="small" onClick={()=>setShowPass(!showPass)}>{showPass?<VisibilityOff/>:<Visibility/>}</IconButton></InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={()=>setResetOpen(false)} variant="outlined" sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleReset} variant="contained" sx={{ borderRadius:2, flex:2 }}>Reset Password</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── PERMISSIONS (granular can_view + can_create) ───────────────
function PermissionsTab({ pgId }) {
  const api = pgAPI(pgId);
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getPermissions().then(r => {
      const map = {};
      r.data.forEach(p => {
        if (!map[p.role]) map[p.role] = {};
        map[p.role][p.permission] = { view:p.can_view, create:p.can_create };
      });
      setPerms(map);
    }).catch(console.error).finally(()=>setLoading(false));
  }, [pgId]);

  // If you check create, auto-check view
  const toggle = (role, perm, field) => {
    setPerms(prev => {
      const cur = prev[role]?.[perm] || { view:false, create:false };
      let next = { ...cur, [field]: !cur[field] };
      // Auto-check view if create is checked
      if (field==='create' && next.create) next.view = true;
      // Auto-uncheck create if view is unchecked
      if (field==='view' && !next.view) next.create = false;
      return { ...prev, [role]: { ...prev[role], [perm]: next } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const permissions = [];
      for (const role of ['manager','staff']) {
        for (const perm of ALL_PERMISSIONS) {
          const p = perms[role]?.[perm.key] || { view:false, create:false };
          permissions.push({ role, permission:perm.key, can_view:p.view, can_create:p.create });
        }
      }
      await api.updatePermissions({ permissions });
      setSuccess(true); setTimeout(()=>setSuccess(false), 2500);
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;

  return (
    <Box>
      {success && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>Permissions saved!</Alert>}
      <Card>
        <CardContent sx={{ p:2.5 }}>
          <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
            <Box>
              <Typography sx={{ fontWeight:700 }}>Role Permissions</Typography>
              <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Checking "Create" auto-enables "View". Unchecking "View" auto-disables "Create".</Typography>
            </Box>
            <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ borderRadius:2 }}>
              {saving?<CircularProgress size={18} color="inherit"/>:'Save'}
            </Button>
          </Box>
          <Box sx={{ overflowX:'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth:160 }}>Permission</TableCell>
                  <TableCell align="center" colSpan={2} sx={{ color:'#1B3A6B !important', fontWeight:'800 !important' }}>Manager</TableCell>
                  <TableCell align="center" colSpan={2} sx={{ color:'#059669 !important', fontWeight:'800 !important' }}>Staff</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell />
                  {['View','Create','View','Create'].map((h,i)=>(
                    <TableCell key={i} align="center" sx={{ fontSize:'0.7rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', py:0.5 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {ALL_PERMISSIONS.map(perm=>(
                  <TableRow key={perm.key} hover>
                    <TableCell sx={{ fontWeight:500, fontSize:'0.875rem' }}>{perm.label}</TableCell>
                    {['manager','staff'].map(role=>(['view','create'].map(field=>(
                      <TableCell key={`${role}-${field}`} align="center" sx={{ py:0.8 }}>
                        <IconButton size="small" onClick={()=>toggle(role,perm.key,field)}
                          sx={{ color:perms[role]?.[perm.key]?.[field]?'#059669':'#D1D5DB', '&:hover':{ bgcolor:'transparent' } }}>
                          {perms[role]?.[perm.key]?.[field] ? <CheckCircle sx={{ fontSize:22 }} /> : <Cancel sx={{ fontSize:22 }} />}
                        </IconButton>
                      </TableCell>
                    ))))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ── PG SETTINGS (no financial, lat/lng, image slider) ─────────
function SettingsTab({ pgId }) {
  const api = pgAPI(pgId);
  const logoRef = useRef();
  const imagesRef = useRef();
  const [settings, setSettings] = useState({ name:'', city:'', address:'', phone:'', email:'', gstin:'', lat:'', lng:'', description:'', pg_type:'mixed', amenities_list:[], rules:'', nearby:'', logo_url:'', images:[] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState('');
  const [sliderIdx, setSliderIdx] = useState(0);

  const s = (k,v) => setSettings(prev=>({...prev,[k]:v}));

  useEffect(() => {
    api.get().then(r => {
      if (r.data) {
        const d = r.data;
        let imgs = [];
        try { imgs = typeof d.images==='string' ? JSON.parse(d.images) : (Array.isArray(d.images)?d.images:[]); } catch {}
        setSettings(prev=>({...prev,...d, images:imgs, amenities_list:d.amenities_list||[] }));
      }
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [pgId]);

  const handleLogoChange = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => s('logo_url', e.target.result);
    reader.readAsDataURL(file);
    s('_logo_file', file);
  };

  const handleImagesChange = (files) => {
    if (!files?.length) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        setSettings(prev => ({ ...prev, images: [...prev.images, e.target.result], _new_images: [...(prev._new_images||[]), file] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = async (imgUrl) => {
    // If it's a local preview (base64), just remove from state
    if (imgUrl.startsWith('data:')) {
      setSettings(prev => ({ ...prev, images: prev.images.filter(i=>i!==imgUrl) }));
      return;
    }
    try { await api.removeImage(imgUrl); setSettings(prev=>({ ...prev, images:prev.images.filter(i=>i!==imgUrl) })); }
    catch(e) { console.error(e); }
  };

  const handleSave = async () => {
    setErr(''); setSaving(true); setSuccess(false);
    try {
      const fd = new FormData();
      const fields = ['name','city','address','phone','email','gstin','lat','lng','description','pg_type','rules','nearby'];
      fields.forEach(k => { if(settings[k]!==null&&settings[k]!==undefined) fd.append(k, settings[k]); });
      fd.append('amenities_list', JSON.stringify(settings.amenities_list||[]));
      // Existing server images (filter out base64)
      const serverImages = (settings.images||[]).filter(i=>!i.startsWith('data:'));
      fd.append('images', JSON.stringify(serverImages));
      if (settings._logo_file) fd.append('logo', settings._logo_file);
      if (settings._new_images?.length) settings._new_images.forEach(f=>fd.append('pg_images', f));
      await api.update(fd);
      setSuccess(true); setTimeout(()=>setSuccess(false), 3000);
      s('_logo_file', null); s('_new_images', null);
    } catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const PG_TYPES = ['male','female','mixed','co-living'];
  const AMENITIES_OPTS = ['WiFi','AC','Hot Water','Laundry','Meals','Parking','CCTV','Security','Power Backup','Cleaning','TV','Refrigerator'];

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;

  return (
    <Box>
      {success && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>Settings saved!</Alert>}
      {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}

      <Grid container spacing={3}>
        {/* Logo + Images */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Typography sx={{ fontWeight:700, mb:2 }}>PG Logo & Photos</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>Logo</Typography>
                  <Box sx={{ width:120, height:120, borderRadius:3, border:'2px dashed #E5E7EB', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', '&:hover':{ borderColor:'#1B3A6B' } }} onClick={()=>logoRef.current?.click()}>
                    {settings.logo_url ? <img src={settings.logo_url.startsWith('data:')?settings.logo_url:`${API_BASE}${settings.logo_url}`} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <Box sx={{ textAlign:'center', p:2 }}><CloudUpload sx={{ color:'#9CA3AF', fontSize:28 }} /><Typography sx={{ fontSize:'0.7rem', color:'#9CA3AF', mt:0.5 }}>Upload Logo</Typography></Box>}
                    <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>handleLogoChange(e.target.files[0])} />
                  </Box>
                </Grid>
                <Grid item xs={12} md={9}>
                  <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>PG Photos (displayed as slider)</Typography>
                  {/* Image slider */}
                  {settings.images?.length > 0 ? (
                    <Box sx={{ position:'relative', mb:1 }}>
                      <Box sx={{ height:160, borderRadius:2, overflow:'hidden', position:'relative' }}>
                        <img src={settings.images[sliderIdx]?.startsWith('data:')?settings.images[sliderIdx]:`${API_BASE}${settings.images[sliderIdx]}`}
                          alt={`Photo ${sliderIdx+1}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        <Box sx={{ position:'absolute', top:'50%', left:0, transform:'translateY(-50%)', display:'flex', justifyContent:'space-between', width:'100%', px:1 }}>
                          <IconButton size="small" sx={{ bgcolor:'rgba(0,0,0,0.4)', color:'#fff' }} onClick={()=>setSliderIdx(i=>Math.max(0,i-1))} disabled={sliderIdx===0}><ChevronLeft /></IconButton>
                          <IconButton size="small" sx={{ bgcolor:'rgba(0,0,0,0.4)', color:'#fff' }} onClick={()=>setSliderIdx(i=>Math.min(settings.images.length-1,i+1))} disabled={sliderIdx===settings.images.length-1}><ChevronRight /></IconButton>
                        </Box>
                        <Box sx={{ position:'absolute', top:6, right:6 }}>
                          <IconButton size="small" sx={{ bgcolor:'rgba(220,38,38,0.85)', color:'#fff' }} onClick={()=>{ removeImage(settings.images[sliderIdx]); setSliderIdx(i=>Math.max(0,i-1)); }}><DeleteOutline sx={{ fontSize:16 }} /></IconButton>
                        </Box>
                        <Box sx={{ position:'absolute', bottom:6, left:'50%', transform:'translateX(-50%)', display:'flex', gap:0.5 }}>
                          {settings.images.map((_,i)=><Box key={i} sx={{ width:6, height:6, borderRadius:'50%', bgcolor:i===sliderIdx?'#fff':'rgba(255,255,255,0.5)' }} />)}
                        </Box>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ height:100, borderRadius:2, bgcolor:'#F9FAFB', border:'2px dashed #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', mb:1 }}>
                      <Typography sx={{ color:'#9CA3AF', fontSize:'0.82rem' }}>No photos added yet</Typography>
                    </Box>
                  )}
                  <Button variant="outlined" startIcon={<CloudUpload />} size="small" sx={{ borderRadius:2, fontSize:'0.78rem' }} onClick={()=>imagesRef.current?.click()}>
                    Add Photos
                  </Button>
                  <input ref={imagesRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e=>handleImagesChange(e.target.files)} />
                  <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.5 }}>Upload up to 10 photos. Shown as slider to tenants.</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Property Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}><Business sx={{ color:'#1B3A6B', fontSize:19 }} /><Typography sx={{ fontWeight:700 }}>Property Information</Typography></Box>
              <Grid container spacing={2}>
                <Grid item xs={12}><TextField fullWidth label="PG Name" size="small" value={settings.name||''} onChange={e=>s('name',e.target.value)} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="City" size="small" value={settings.city||''} onChange={e=>s('city',e.target.value)} /></Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small"><InputLabel>PG Type</InputLabel>
                    <Select value={settings.pg_type||'mixed'} label="PG Type" onChange={e=>s('pg_type',e.target.value)}>
                      {PG_TYPES.map(t=><MenuItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}><TextField fullWidth label="Address" size="small" multiline rows={2} value={settings.address||''} onChange={e=>s('address',e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><LocationOn sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Phone" size="small" value={settings.phone||''} onChange={e=>s('phone',e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><Phone sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Email" size="small" value={settings.email||''} onChange={e=>s('email',e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><Email sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={12}><TextField fullWidth label="GSTIN" size="small" value={settings.gstin||''} onChange={e=>s('gstin',e.target.value)} /></Grid>
                <Grid item xs={12}><TextField fullWidth label="Description (for listing)" size="small" multiline rows={3} value={settings.description||''} onChange={e=>s('description',e.target.value)} /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Location + Listing */}
        <Grid item xs={12} md={6}>
          <Card sx={{ mb:2 }}>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}><LocationOn sx={{ color:'#059669', fontSize:19 }} /><Typography sx={{ fontWeight:700 }}>Location (for listing)</Typography></Box>
              <Grid container spacing={2}>
                <Grid item xs={6}><TextField fullWidth label="Latitude" size="small" type="number" value={settings.lat||''} onChange={e=>s('lat',e.target.value)} helperText="e.g. 12.9716" /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Longitude" size="small" type="number" value={settings.lng||''} onChange={e=>s('lng',e.target.value)} helperText="e.g. 77.5946" /></Grid>
                <Grid item xs={12}><TextField fullWidth label="Nearby Landmarks" size="small" value={settings.nearby||''} onChange={e=>s('nearby',e.target.value)} placeholder="e.g. Near Metro Station, 2km from City Mall" /></Grid>
                <Grid item xs={12}><TextField fullWidth label="House Rules" size="small" multiline rows={3} value={settings.rules||''} onChange={e=>s('rules',e.target.value)} placeholder="e.g. No smoking, Visitors allowed till 9 PM..." /></Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Typography sx={{ fontWeight:700, mb:1.5 }}>Amenities (for listing)</Typography>
              <Box sx={{ display:'flex', flexWrap:'wrap', gap:1 }}>
                {AMENITIES_OPTS.map(a=>(
                  <Chip key={a} label={a} size="small" clickable
                    onClick={()=>s('amenities_list', settings.amenities_list?.includes(a) ? settings.amenities_list.filter(x=>x!==a) : [...(settings.amenities_list||[]),a])}
                    sx={{ fontWeight:600, fontSize:'0.75rem', bgcolor:(settings.amenities_list||[]).includes(a)?'#1B3A6B':'#F3F4F6', color:(settings.amenities_list||[]).includes(a)?'#fff':'#374151' }} />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt:3, display:'flex', justifyContent:'flex-end' }}>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving} sx={{ px:5, borderRadius:2.5 }}>
          {saving?<CircularProgress size={22} color="inherit"/>:'Save Settings'}
        </Button>
      </Box>
    </Box>
  );
}

// ── REPORTS ───────────────────────────────────────────────────
function ReportsTab({ pgId }) {
  const api = pgAPI(pgId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const fetch = useCallback(async()=>{ setLoading(true); try { const r=await api.getReports({ year }); setData(r.data); } catch(e){} finally { setLoading(false); } }, [pgId,year]);
  useEffect(()=>{ fetch(); },[fetch]);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;
  if (!data) return null;
  const { pnl=[], kpi={}, expBreakdown=[], totalProfit=0 } = data;

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', mb:3 }}>
        <Box sx={{ display:'flex', gap:1 }}>
          {[new Date().getFullYear()-1,new Date().getFullYear()].map(y=>(
            <Chip key={y} label={y} clickable onClick={()=>setYear(y)} sx={{ fontWeight:700, bgcolor:year===y?'#1B3A6B':'#F3F4F6', color:year===y?'#fff':'#374151' }} />
          ))}
        </Box>
      </Box>
      <Grid container spacing={2} sx={{ mb:3 }}>
        {[
          { label:'Total Revenue', value:fm(kpi.total_revenue), color:'#059669', icon:'💰' },
          { label:'Total Expenses', value:fm(kpi.total_expense), color:'#DC2626', icon:'📉' },
          { label:'Net Profit', value:fm(totalProfit), color:totalProfit>=0?'#1B3A6B':'#DC2626', icon:totalProfit>=0?'📈':'⚠️' },
          { label:'Occupancy Rate', value:`${kpi.occupancy_rate||0}%`, color:'#D97706', icon:'🏠' },
          { label:'Active Tenants', value:kpi.active_tenants||0, color:'#1B3A6B', icon:'👥' },
        ].map(k=>(
          <Grid item xs={6} md={4} lg={2.4} key={k.label}>
            <Card><CardContent sx={{ p:2, textAlign:'center' }}>
              <Typography sx={{ fontSize:'1.3rem', mb:0.5 }}>{k.icon}</Typography>
              <Typography sx={{ fontSize:'1.1rem', fontWeight:800, color:k.color }}>{k.value}</Typography>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>{k.label}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:2 }}>Monthly P&L — {year}</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <ReBarChart data={pnl} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                <RTooltip formatter={v=>[fm(v)]} contentStyle={{ borderRadius:8, border:'1px solid #E5E7EB' }} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="income" name="Income" fill="#1B3A6B" radius={[4,4,0,0]} />
                <Bar dataKey="expense" name="Expense" fill="#FF6B35" radius={[4,4,0,0]} />
                <Bar dataKey="profit" name="Profit" fill="#059669" radius={[4,4,0,0]} />
              </ReBarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:2 }}>Expense Breakdown</Typography>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={expBreakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={70}>
                {expBreakdown.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
              </Pie><RTooltip formatter={v=>[fm(v)]} /></PieChart>
            </ResponsiveContainer>
            {expBreakdown.slice(0,4).map((d,i)=>(
              <Box key={d.category} sx={{ display:'flex', justifyContent:'space-between', mb:0.5 }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1 }}><Box sx={{ width:9, height:9, borderRadius:1.5, bgcolor:PIE_COLORS[i%PIE_COLORS.length] }} /><Typography sx={{ fontSize:'0.78rem', textTransform:'capitalize' }}>{d.category}</Typography></Box>
                <Typography sx={{ fontSize:'0.78rem', fontWeight:700 }}>{fm(d.total)}</Typography>
              </Box>
            ))}
          </CardContent></Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── ACTIVITY ──────────────────────────────────────────────────
function ActivityTab({ pgId }) {
  const api = pgAPI(pgId);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async()=>{ setLoading(true); try { const r=await api.getLogs({ page:page+1, limit:20 }); setLogs(r.data.logs||[]); setTotal(r.data.total||0); } catch(e){} finally { setLoading(false); } }, [pgId,page]);
  useEffect(()=>{ fetch(); },[fetch]);
  const dotColor = t => ({ tenant:'#1B3A6B', payment:'#059669', expense:'#D97706', room:'#D97706' }[t]||'#6B7280');

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', mb:2 }}>
        <Typography sx={{ fontWeight:700, fontSize:'1rem' }}>Activity Log</Typography>
        <Chip label={`${total} events`} size="small" sx={{ fontWeight:700, bgcolor:'#EEF2FF', color:'#1B3A6B' }} />
      </Box>
      <Card><CardContent sx={{ p:0 }}>
        {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box> : (
          <Box>
            {logs.map((log,i)=>(
              <Box key={log.id}>
                <Box sx={{ px:2.5, py:1.8, display:'flex', alignItems:'center', gap:2, '&:hover':{ bgcolor:'#F9FAFB' } }}>
                  <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:dotColor(log.entity_type), flexShrink:0 }} />
                  <Avatar sx={{ width:30, height:30, fontSize:'0.75rem', bgcolor:dotColor(log.entity_type), flexShrink:0 }}>{log.performed_by_name?.charAt(0)||'S'}</Avatar>
                  <Box sx={{ flex:1, minWidth:0 }}>
                    <Typography sx={{ fontSize:'0.85rem', fontWeight:500 }}>{log.action}</Typography>
                    <Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>By {log.performed_by_name||'System'}</Typography>
                  </Box>
                  {log.entity_type && <Chip label={log.entity_type} size="small" sx={{ fontSize:'0.62rem', fontWeight:700, bgcolor:`${dotColor(log.entity_type)}15`, color:dotColor(log.entity_type), textTransform:'capitalize', flexShrink:0 }} />}
                  <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', whiteSpace:'nowrap', flexShrink:0 }}>{timeAgo(log.created_at)}</Typography>
                </Box>
                {i<logs.length-1 && <Divider sx={{ borderColor:'#F3F4F6' }} />}
              </Box>
            ))}
            {logs.length===0 && <Box sx={{ py:6, textAlign:'center', color:'#9CA3AF' }}><Typography>No activity yet</Typography></Box>}
          </Box>
        )}
        <Box sx={{ px:2.5, py:1.5, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{logs.length} of {total}</Typography>
          <Box sx={{ display:'flex', gap:1 }}>
            <Button size="small" variant="outlined" disabled={page===0} onClick={()=>setPage(p=>p-1)} sx={{ borderRadius:1.5, minWidth:80 }}>Previous</Button>
            <Button size="small" variant="outlined" disabled={(page+1)*20>=total} onClick={()=>setPage(p=>p+1)} sx={{ borderRadius:1.5, minWidth:80 }}>Next</Button>
          </Box>
        </Box>
      </CardContent></Card>
    </Box>
  );
}
