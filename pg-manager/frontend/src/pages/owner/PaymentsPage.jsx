import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, TextField, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, TablePagination,
  InputAdornment, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Grid, Chip
} from '@mui/material';
import { Search, Add, Download, Close, Receipt } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';

const fmtMoney = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) : '-';
const METHODS = ['cash','upi','bank_transfer','cheque','online'];
const METHOD_ICONS = { cash:'💵', upi:'📱', bank_transfer:'🏦', cheque:'📃', online:'💻' };
const EMPTY = { pg_tenant_id:'', amount:'', payment_date: new Date().toISOString().split('T')[0], payment_mode:'cash', transaction_ref:'', month:'', notes:'' };

export default function PaymentsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ search:'', method:'all', start_date:'', end_date:'' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const p = { page:page+1, limit:15, ...filters };
      if (p.method === 'all') delete p.method;
      const res = await api.getPayments(p);
      setPayments(res.data.payments||[]); setTotal(res.data.total||0); setStats(res.data.stats||{}); setLogs(res.data.logs||[]);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, page, filters]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { api.getTenants({ status:'active', limit:100 }).then(r => setTenants(r.data.tenants||[])).catch(()=>{}); }, [pgId]);

  const handleOpen = () => { setForm(EMPTY); setErr(''); setDialogOpen(true); };
  const handleClose = () => { if(saving) return; setDialogOpen(false); };
  const handleExited = () => { setForm(EMPTY); setErr(''); };

  const handleSubmit = async () => {
    setErr('');
    if (!form.pg_tenant_id||!form.amount||!form.payment_date) return setErr('Tenant, amount and date are required');
    setSaving(true);
    try { await api.createPayment(form); setDialogOpen(false); fetch(); }
    catch(e) { setErr(e.response?.data?.message||'Failed to record payment'); }
    finally { setSaving(false); }
  };

  const logDot = (i) => ['#1B3A6B','#059669','#D97706'][i%3];

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:3, flexWrap:'wrap', gap:2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight:800 }}>Payment History</Typography>
          <Typography sx={{ color:'#6B7280', fontSize:'0.875rem' }}>Comprehensive ledger of all transactions.</Typography>
        </Box>
        <Box sx={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          <Box sx={{ textAlign:'right' }}>
            <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>Total Collected (MTD)</Typography>
            <Typography sx={{ fontSize:'1.5rem', fontWeight:800, color:'#1B3A6B' }}>{fmtMoney(stats.total_collected)}</Typography>
          </Box>
          <Box sx={{ textAlign:'right' }}>
            <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>Avg. Transaction</Typography>
            <Typography sx={{ fontSize:'1.5rem', fontWeight:800, color:'#1A1F36' }}>{fmtMoney(stats.avg_transaction)}</Typography>
          </Box>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb:2.5 }}>
        <CardContent sx={{ p:2 }}>
          <Box sx={{ display:'flex', gap:2, flexWrap:'wrap', alignItems:'center' }}>
            <Box sx={{ display:'flex', gap:1, alignItems:'center' }}>
              <Typography sx={{ fontSize:'0.75rem', color:'#6B7280', fontWeight:600, whiteSpace:'nowrap' }}>Date</Typography>
              <TextField size="small" type="date" value={filters.start_date} onChange={e => setFilters(f=>({...f,start_date:e.target.value}))} sx={{ width:145 }} InputLabelProps={{ shrink:true }} />
              <Typography sx={{ color:'#6B7280' }}>–</Typography>
              <TextField size="small" type="date" value={filters.end_date} onChange={e => setFilters(f=>({...f,end_date:e.target.value}))} sx={{ width:145 }} InputLabelProps={{ shrink:true }} />
            </Box>
            <TextField size="small" placeholder="Search tenant..." value={filters.search} onChange={e => setFilters(f=>({...f,search:e.target.value}))} sx={{ width:180 }}
              InputProps={{ startAdornment:<InputAdornment position="start"><Search sx={{ fontSize:16, color:'#9CA3AF' }} /></InputAdornment> }} />
            <FormControl size="small" sx={{ minWidth:140 }}>
              <Select value={filters.method} onChange={e => setFilters(f=>({...f,method:e.target.value}))}>
                <MenuItem value="all">All Methods</MenuItem>
                {METHODS.map(m => <MenuItem key={m} value={m}>{m.replace('_',' ').toUpperCase()}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ ml:'auto', display:'flex', gap:1 }}>
              <Button variant="outlined" size="small" startIcon={<Download />} sx={{ borderRadius:2, fontSize:'0.78rem' }}>Export CSV</Button>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={handleOpen} sx={{ borderRadius:2 }}>Record Payment</Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent sx={{ p:0 }}>
          {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box> : (
            <Box sx={{ overflowX:'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>{['Receipt No.','Tenant','Date','Amount','Method','Status','Actions'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id} hover>
                      <TableCell><Typography sx={{ fontSize:'0.82rem', color:'#1B3A6B', fontWeight:600 }}>{p.receipt_number}</Typography></TableCell>
                      <TableCell>
                        <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                          <Avatar sx={{ width:30, height:30, fontSize:'0.75rem', bgcolor:'#1B3A6B' }}>{p.tenant_name?.substring(0,2).toUpperCase()}</Avatar>
                          <Box><Typography sx={{ fontSize:'0.85rem', fontWeight:600 }}>{p.tenant_name}</Typography><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{p.room_number}</Typography></Box>
                        </Box>
                      </TableCell>
                      <TableCell><Typography sx={{ fontSize:'0.82rem' }}>{fmtDate(p.payment_date)}</Typography></TableCell>
                      <TableCell><Typography sx={{ fontSize:'0.875rem', fontWeight:700 }}>{fmtMoney(p.amount)}</Typography></TableCell>
                      <TableCell>
                        <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                          <span style={{ fontSize:14 }}>{METHOD_ICONS[p.payment_mode]||'💳'}</span>
                          <Typography sx={{ fontSize:'0.78rem', textTransform:'capitalize' }}>{p.payment_mode?.replace('_',' ')}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell><StatusChip status={p.status} /></TableCell>
                      <TableCell><IconButton size="small" sx={{ color:'#6B7280' }}><Download fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                  {payments.length===0 && <TableRow><TableCell colSpan={7} sx={{ textAlign:'center', py:5, color:'#9CA3AF' }}>No payments found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box sx={{ px:2, py:1, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Showing {payments.length} of {total}</Typography>
            <TablePagination component="div" count={total} page={page} onPageChange={(_,p) => setPage(p)} rowsPerPage={15} rowsPerPageOptions={[]} sx={{ border:'none' }} />
          </Box>
        </CardContent>
      </Card>

      {/* Bottom row */}
      <Grid container spacing={2.5} sx={{ mt:0.5 }}>
        <Grid item xs={12} md={7}>
          <Card sx={{ bgcolor:'#EFF6FF', border:'1px solid #BFDBFE' }}>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', gap:1.5 }}>
                <Typography sx={{ fontSize:20 }}>💡</Typography>
                <Box><Typography sx={{ fontWeight:700, mb:0.5 }}>Note for Admin</Typography>
                  <Typography sx={{ fontSize:'0.82rem', color:'#374151' }}>Financial reconciliation occurs every Friday at 11:59 PM. Bank Transfer payments auto-verify via webhook.</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ p:2 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:1.5 }}><Receipt sx={{ fontSize:16, color:'#1B3A6B' }} /><Typography sx={{ fontWeight:700, fontSize:'0.875rem' }}>Recent Logs</Typography></Box>
              {logs.slice(0,3).map((log,i) => (
                <Box key={log.id} sx={{ display:'flex', alignItems:'center', gap:1.5, mb:1 }}>
                  <Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor:logDot(i), flexShrink:0 }} />
                  <Box sx={{ flex:1 }}><Typography sx={{ fontSize:'0.78rem', fontWeight:600 }} noWrap>{log.action}</Typography><Typography sx={{ fontSize:'0.68rem', color:'#9CA3AF' }}>By {log.performed_by_name||'System'}</Typography></Box>
                </Box>
              ))}
              {logs.length===0 && <Typography sx={{ fontSize:'0.78rem', color:'#9CA3AF' }}>No recent activity</Typography>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* RECORD PAYMENT DIALOG */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth keepMounted={false} TransitionProps={{ onExited:handleExited }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>Record Payment</Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Select Tenant *</InputLabel>
                <Select value={form.pg_tenant_id} label="Select Tenant *" onChange={e => setForm(f=>({...f,pg_tenant_id:e.target.value}))}>
                  {tenants.map(t => <MenuItem key={t.id} value={t.id}>{t.name} — {t.room_number||'No room'} (₹{Number(t.monthly_rent||0).toLocaleString('en-IN')})</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth label="Amount (₹) *" size="small" type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Payment Date *" size="small" type="date" InputLabelProps={{ shrink:true }} value={form.payment_date} onChange={e => setForm(f=>({...f,payment_date:e.target.value}))} /></Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small"><InputLabel>Payment Method *</InputLabel>
                <Select value={form.payment_mode} label="Payment Method *" onChange={e => setForm(f=>({...f,payment_mode:e.target.value}))}>
                  {METHODS.map(m => <MenuItem key={m} value={m}>{METHOD_ICONS[m]} {m.replace('_',' ').toUpperCase()}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth label="Month" size="small" placeholder="e.g. Mar-2025" value={form.month} onChange={e => setForm(f=>({...f,month:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Transaction Reference" size="small" value={form.transaction_ref} onChange={e => setForm(f=>({...f,transaction_ref:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" size="small" multiline rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
