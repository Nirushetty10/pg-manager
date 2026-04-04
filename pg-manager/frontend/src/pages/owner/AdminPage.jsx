import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, TextField, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Switch, Divider, Tooltip,
  LinearProgress, Tab, Tabs, InputAdornment
} from '@mui/material';
import {
  People, Settings, BarChart, History, Add, Edit, Key,
  Close, CheckCircle, Cancel, Download, AdminPanelSettings,
  Phone, Email, LocationOn, Receipt, Notifications, AttachMoney,
  Warning, Visibility, VisibilityOff, CloudUpload, Business
} from '@mui/icons-material';
import {
  BarChart as ReBarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { pgAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const fmtMoney = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) : '-';
const timeAgo = (ts) => { const s=Math.floor((Date.now()-new Date(ts))/1000); if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return fmtDate(ts); };
const PIE_COLORS = ['#1B3A6B','#FF6B35','#059669','#7C3AED','#D97706','#0891B2','#9D174D'];
const EMPTY_STAFF = { name:'', email:'', password:'', role:'staff' };

const ALL_PERMISSIONS = [
  { key:'view_dashboard',   label:'View Dashboard' },
  { key:'manage_tenants',   label:'Manage Tenants' },
  { key:'manage_rooms',     label:'Manage Rooms & Beds' },
  { key:'record_payments',  label:'Record Payments' },
  { key:'manage_expenses',  label:'Manage Expenses' },
  { key:'view_reports',     label:'View Reports' },
  { key:'manage_staff',     label:'Manage Staff' },
  { key:'system_settings',  label:'System Settings' },
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
          <Typography sx={{ fontSize:'0.875rem', color:'#6B7280' }}>Manage staff, permissions, settings, and reports</Typography>
        </Box>
        <Chip label="OWNER" sx={{ ml:'auto', bgcolor:'#EEF2FF', color:'#1B3A6B', fontWeight:800, fontSize:'0.72rem' }} />
      </Box>

      <Box sx={{ borderBottom:'1px solid #E5E7EB', mb:3 }}>
        <Tabs value={tab} onChange={(_,v) => setTab(v)}
          sx={{ '& .MuiTab-root':{ fontWeight:600, fontSize:'0.85rem', minHeight:46, textTransform:'none' } }}>
          {tabs.map((t,i) => <Tab key={i} label={t.label} icon={t.icon} iconPosition="start" />)}
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

// ── STAFF TAB ─────────────────────────────────────────────────
function StaffTab({ pgId }) {
  const api = pgAPI(pgId);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState(EMPTY_STAFF);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getStaff(); setStaff(r.data); }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId]);

  useEffect(() => { fetch(); }, [fetch]);

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
    try { await api.updateStaff(s.id, { name:s.name, role:s.role, is_active:!s.is_active }); fetch(); }
    catch(e) { console.error(e); }
  };

  const handleReset = async () => {
    if (!newPass||newPass.length<6) return;
    try { await api.resetStaffPassword(resetId, { new_password: newPass }); setResetDialogOpen(false); }
    catch(e) { console.error(e); }
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
              <TableHead>
                <TableRow>{['Staff Member','Role','Status','Joined','Actions'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {staff.map(s => (
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
                        <Tooltip title="Edit"><IconButton size="small" sx={{ color:'#1B3A6B' }} onClick={() => openEdit(s)}><Edit fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Reset Password"><IconButton size="small" sx={{ color:'#D97706' }} onClick={() => { setResetId(s.id); setNewPass(''); setShowPass(false); setResetDialogOpen(true); }}><Key fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title={s.is_active?'Deactivate':'Activate'}>
                          <IconButton size="small" sx={{ color:s.is_active?'#DC2626':'#059669' }} onClick={() => handleToggle(s)}>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth keepMounted={false} TransitionProps={{ onExited:handleExited }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>{editStaff?'Edit Staff':'Add Staff Member'}</Typography>
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
                  <MenuItem value="manager">Manager — Operational access</MenuItem>
                  <MenuItem value="staff">Staff — Limited access</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving?<CircularProgress size={20} color="inherit"/>:editStaff?'Save Changes':'Add Staff'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)} maxWidth="xs" fullWidth keepMounted={false} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>Reset Password</Typography>
          <IconButton onClick={() => setResetDialogOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField fullWidth label="New Password" size="small" sx={{ mt:1 }} type={showPass?'text':'password'} value={newPass} onChange={e=>setNewPass(e.target.value)} helperText="Min. 6 characters"
            InputProps={{ endAdornment:<InputAdornment position="end"><IconButton size="small" onClick={()=>setShowPass(!showPass)}>{showPass?<VisibilityOff/>:<Visibility/>}</IconButton></InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={() => setResetDialogOpen(false)} variant="outlined" sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleReset} variant="contained" sx={{ borderRadius:2, flex:2 }}>Reset Password</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── PERMISSIONS TAB ───────────────────────────────────────────
function PermissionsTab({ pgId }) {
  const api = pgAPI(pgId);
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getPermissions().then(r => {
      const map = {};
      r.data.forEach(p => { if (!map[p.role]) map[p.role] = {}; map[p.role][p.permission] = p.allowed; });
      setPerms(map);
    }).catch(console.error).finally(() => setLoading(false));
  }, [pgId]);

  const toggle = (role, perm) => {
    setPerms(prev => ({ ...prev, [role]: { ...prev[role], [perm]: !prev[role]?.[perm] } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const permissions = [];
      for (const role of ['manager','staff']) {
        for (const perm of ALL_PERMISSIONS) {
          permissions.push({ role, permission:perm.key, allowed: perms[role]?.[perm.key]||false });
        }
      }
      await api.updatePermissions({ permissions });
      setSuccess(true); setTimeout(() => setSuccess(false), 2500);
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;

  return (
    <Box>
      {success && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>Permissions saved successfully!</Alert>}
      <Card>
        <CardContent sx={{ p:2.5 }}>
          <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
            <Box>
              <Typography sx={{ fontWeight:700 }}>Role Permissions Matrix</Typography>
              <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Click checkmarks to toggle access for each role</Typography>
            </Box>
            <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ borderRadius:2 }}>
              {saving?<CircularProgress size={18} color="inherit"/>:'Save Permissions'}
            </Button>
          </Box>
          <Box sx={{ overflowX:'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth:200 }}>Permission</TableCell>
                  <TableCell align="center" sx={{ color:'#1B3A6B !important', fontWeight:'800 !important' }}>Manager</TableCell>
                  <TableCell align="center" sx={{ color:'#059669 !important', fontWeight:'800 !important' }}>Staff</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ALL_PERMISSIONS.map(perm => (
                  <TableRow key={perm.key} hover>
                    <TableCell sx={{ fontWeight:500, fontSize:'0.875rem' }}>{perm.label}</TableCell>
                    {['manager','staff'].map(role => (
                      <TableCell key={role} align="center">
                        <IconButton size="small" onClick={() => toggle(role, perm.key)} sx={{ color: perms[role]?.[perm.key]?'#059669':'#D1D5DB', '&:hover':{ bgcolor:'transparent' } }}>
                          {perms[role]?.[perm.key] ? <CheckCircle sx={{ fontSize:22 }} /> : <Cancel sx={{ fontSize:22 }} />}
                        </IconButton>
                      </TableCell>
                    ))}
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

// ── PG SETTINGS TAB ───────────────────────────────────────────
function SettingsTab({ pgId }) {
  const api = pgAPI(pgId);
  const logoRef = useRef();
  const coverRef = useRef();
  const [settings, setSettings] = useState({ name:'', city:'', address:'', phone:'', email:'', gstin:'', currency:'₹', rent_due_day:1, late_fee_percent:0, security_deposit_months:2, logo_url:'', cover_url:'' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState('');
  const s = (k,v) => setSettings(prev => ({ ...prev, [k]:v }));

  useEffect(() => { api.get().then(r => { if(r.data) setSettings(prev => ({ ...prev, ...r.data })); }).catch(()=>{}).finally(() => setLoading(false)); }, [pgId]);

  // Image to base64 for preview
  const handleImageUpload = (key, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => s(key, e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setErr(''); setSaving(true); setSuccess(false);
    try { await api.update(settings); setSuccess(true); setTimeout(() => setSuccess(false), 3000); }
    catch(e) { setErr(e.response?.data?.message||'Failed to save settings'); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;

  return (
    <Box>
      {success && <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>Settings saved!</Alert>}
      {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}

      <Grid container spacing={3}>
        {/* Cover & Logo Upload */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Typography sx={{ fontWeight:700, mb:2 }}>PG Branding</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>Logo</Typography>
                  <Box sx={{ width:120, height:120, borderRadius:3, border:'2px dashed #E5E7EB', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', '&:hover':{ borderColor:'#1B3A6B' }, position:'relative' }} onClick={() => logoRef.current?.click()}>
                    {settings.logo_url ? <img src={settings.logo_url} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Box sx={{ textAlign:'center', p:2 }}><CloudUpload sx={{ color:'#9CA3AF', fontSize:28, mb:0.5 }} /><Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF' }}>Upload Logo</Typography></Box>}
                    <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleImageUpload('logo_url', e.target.files[0])} />
                  </Box>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>Cover Image</Typography>
                  <Box sx={{ width:'100%', height:120, borderRadius:3, border:'2px dashed #E5E7EB', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', '&:hover':{ borderColor:'#1B3A6B' } }} onClick={() => coverRef.current?.click()}>
                    {settings.cover_url ? <img src={settings.cover_url} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Box sx={{ textAlign:'center' }}><CloudUpload sx={{ color:'#9CA3AF', fontSize:28, mb:0.5 }} /><Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF' }}>Upload Cover Image</Typography></Box>}
                    <input ref={coverRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleImageUpload('cover_url', e.target.files[0])} />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Property Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}><Business sx={{ color:'#1B3A6B', fontSize:19 }} /><Typography sx={{ fontWeight:700 }}>Property Info</Typography></Box>
              <Grid container spacing={2}>
                <Grid item xs={12}><TextField fullWidth label="PG Name" size="small" value={settings.name} onChange={e => s('name', e.target.value)} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="City" size="small" value={settings.city||''} onChange={e => s('city', e.target.value)} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="GSTIN" size="small" value={settings.gstin||''} onChange={e => s('gstin', e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><Receipt sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={12}><TextField fullWidth label="Address" size="small" multiline rows={2} value={settings.address||''} onChange={e => s('address', e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><LocationOn sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Phone" size="small" value={settings.phone||''} onChange={e => s('phone', e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><Phone sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Email" size="small" value={settings.email||''} onChange={e => s('email', e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><Email sx={{ fontSize:15, color:'#9CA3AF' }} /></InputAdornment> }} /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Financial */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}><AttachMoney sx={{ color:'#059669', fontSize:19 }} /><Typography sx={{ fontWeight:700 }}>Financial Config</Typography></Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small"><InputLabel>Currency</InputLabel>
                    <Select value={settings.currency||'₹'} label="Currency" onChange={e => s('currency', e.target.value)}>
                      {['₹','$','€','£','¥'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}><TextField fullWidth label="Rent Due Day (1–28)" size="small" type="number" value={settings.rent_due_day||1} onChange={e => s('rent_due_day', parseInt(e.target.value)||1)} InputProps={{ inputProps:{ min:1,max:28 } }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Late Fee %" size="small" type="number" value={settings.late_fee_percent||0} onChange={e => s('late_fee_percent', parseFloat(e.target.value)||0)} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Security Deposit (months)" size="small" type="number" value={settings.security_deposit_months||2} onChange={e => s('security_deposit_months', parseInt(e.target.value)||2)} InputProps={{ inputProps:{ min:1,max:12 } }} /></Grid>
              </Grid>
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

// ── REPORTS TAB ───────────────────────────────────────────────
function ReportsTab({ pgId }) {
  const api = pgAPI(pgId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getReports({ year }); setData(r.data); }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, year]);

  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box>;
  if (!data) return null;

  const { pnl=[], kpi={}, expBreakdown=[] } = data;
  const totalProfit = pnl.reduce((s,m) => s+parseFloat(m.profit||0), 0);

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:3 }}>
        <Box sx={{ display:'flex', gap:1 }}>
          {[new Date().getFullYear()-1, new Date().getFullYear()].map(y => (
            <Chip key={y} label={y} clickable onClick={()=>setYear(y)} sx={{ fontWeight:700, bgcolor:year===y?'#1B3A6B':'#F3F4F6', color:year===y?'#fff':'#374151' }} />
          ))}
        </Box>
        <Button variant="outlined" startIcon={<Download />} sx={{ borderRadius:2 }}>Export PDF</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb:3 }}>
        {[
          { label:'Total Revenue', value:fmtMoney(kpi.total_revenue), color:'#059669', icon:'💰' },
          { label:'Total Expenses', value:fmtMoney(kpi.total_expense), color:'#DC2626', icon:'📉' },
          { label:'Net Profit', value:fmtMoney(totalProfit), color:totalProfit>=0?'#1B3A6B':'#DC2626', icon:totalProfit>=0?'📈':'⚠️' },
          { label:'Occupancy Rate', value:`${kpi.occupancy_rate||0}%`, color:'#D97706', icon:'🏠' },
          { label:'Active Tenants', value:kpi.active_tenants||0, color:'#1B3A6B', icon:'👥' },
          { label:'Pending', value:kpi.pending_tenants||0, color:'#D97706', icon:'⏳' },
        ].map(k => (
          <Grid item xs={6} md={4} lg={2} key={k.label}>
            <Card><CardContent sx={{ p:2, textAlign:'center' }}>
              <Typography sx={{ fontSize:'1.3rem', mb:0.5 }}>{k.icon}</Typography>
              <Typography sx={{ fontSize:'1.2rem', fontWeight:800, color:k.color }}>{k.value}</Typography>
              <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>{k.label}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:0.5 }}>Monthly P&L — {year}</Typography>
            <Typography sx={{ fontSize:'0.78rem', color:'#6B7280', mb:2 }}>Income vs Expenses vs Net Profit</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <ReBarChart data={pnl} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <RTooltip formatter={v => [fmtMoney(v)]} contentStyle={{ borderRadius:8, border:'1px solid #E5E7EB' }} />
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
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={expBreakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={75}>
                {expBreakdown.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
              </Pie><RTooltip formatter={v=>[fmtMoney(v)]} /></PieChart>
            </ResponsiveContainer>
            {expBreakdown.slice(0,5).map((d,i) => (
              <Box key={d.category} sx={{ display:'flex', justifyContent:'space-between', mb:0.5 }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                  <Box sx={{ width:9, height:9, borderRadius:1.5, bgcolor:PIE_COLORS[i%PIE_COLORS.length] }} />
                  <Typography sx={{ fontSize:'0.78rem', textTransform:'capitalize' }}>{d.category}</Typography>
                </Box>
                <Typography sx={{ fontSize:'0.78rem', fontWeight:700 }}>{fmtMoney(d.total)}</Typography>
              </Box>
            ))}
          </CardContent></Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── ACTIVITY TAB ──────────────────────────────────────────────
function ActivityTab({ pgId }) {
  const api = pgAPI(pgId);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getLogs({ page:page+1, limit:20 }); setLogs(r.data.logs||[]); setTotal(r.data.total||0); }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, page]);

  useEffect(() => { fetch(); }, [fetch]);

  const dotColor = (type) => ({ tenant:'#1B3A6B', payment:'#059669', expense:'#D97706', room:'#D97706', maintenance:'#DC2626' }[type]||'#6B7280');

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
        <Box><Typography sx={{ fontWeight:700, fontSize:'1rem' }}>System Activity Log</Typography><Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Complete audit trail</Typography></Box>
        <Chip label={`${total} events`} size="small" sx={{ fontWeight:700, bgcolor:'#EEF2FF', color:'#1B3A6B' }} />
      </Box>
      <Card><CardContent sx={{ p:0 }}>
        {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box> : (
          <Box>
            {logs.map((log,i) => (
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
            {logs.length===0 && <Box sx={{ py:6, textAlign:'center', color:'#9CA3AF' }}><History sx={{ fontSize:48, color:'#E5E7EB', mb:1 }} /><Typography>No activity yet</Typography></Box>}
          </Box>
        )}
        <Box sx={{ px:2.5, py:1.5, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{logs.length} of {total} events</Typography>
          <Box sx={{ display:'flex', gap:1 }}>
            <Button size="small" variant="outlined" disabled={page===0} onClick={()=>setPage(p=>p-1)} sx={{ borderRadius:1.5, minWidth:80 }}>Previous</Button>
            <Button size="small" variant="outlined" disabled={(page+1)*20>=total} onClick={()=>setPage(p=>p+1)} sx={{ borderRadius:1.5, minWidth:80 }}>Next</Button>
          </Box>
        </Box>
      </CardContent></Card>
    </Box>
  );
}
