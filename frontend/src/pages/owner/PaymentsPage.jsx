import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, TextField, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, TablePagination,
  InputAdornment, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Chip, LinearProgress, Tooltip
} from '@mui/material';
import { Search, Add, Download, Close, Warning, CheckCircle } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';
import { usePermissions } from '../../hooks/usePermissions';

const fm = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const METHODS = ['cash','upi','bank_transfer','cheque','online'];
const METHOD_ICONS = { cash:'💵', upi:'📱', bank_transfer:'🏦', cheque:'📃', online:'💻' };

const EMPTY_FORM = {
  pg_tenant_id:'', amount:'', payment_date:new Date().toISOString().split('T')[0],
  payment_mode:'cash', transaction_ref:'', month:'', notes:'', status:'settled'
};

export default function PaymentsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can('record_payments','create');

  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({});
  const [prevDues, setPrevDues] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ search:'', method:'all', start_date:'', end_date:'' });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPayment, setEditPayment] = useState(null); // null = new, object = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Tenant with prev due highlight
  const [selectedTenantDue, setSelectedTenantDue] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const p = { page:page+1, limit:15, ...filters };
      if (p.method==='all') delete p.method;
      const res = await api.getPayments(p);
      setPayments(res.data.payments||[]);
      setTotal(res.data.total||0);
      setSummary(res.data.summary||{});
      setPrevDues(res.data.prevDues||[]);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, page, filters]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    api.getTenants({ status:'active', limit:200 }).then(r=>setTenants(r.data.tenants||[])).catch(()=>{});
  }, [pgId]);

  // When tenant is selected in form, check for prev dues
  const handleTenantSelect = (tenantId) => {
    setForm(f=>({ ...f, pg_tenant_id:tenantId }));
    const due = prevDues.find(d=>d.id===tenantId);
    setSelectedTenantDue(due||null);
    // Pre-fill amount with monthly rent
    const t = tenants.find(t=>t.id===tenantId);
    if (t) setForm(f=>({ ...f, pg_tenant_id:tenantId, amount:t.monthly_rent||'' }));
  };

  const openAdd = () => {
    setEditPayment(null);
    setForm({ ...EMPTY_FORM, month: new Date().toLocaleString('en',{month:'short'})+'-'+new Date().getFullYear() });
    setSelectedTenantDue(null);
    setErr('');
    setDialogOpen(true);
  };

  const openEdit = (payment) => {
    setEditPayment(payment);
    setForm({
      pg_tenant_id: payment.pg_tenant_id||'',
      amount: payment.amount||'',
      payment_date: payment.payment_date?.split('T')[0]||'',
      payment_mode: payment.payment_mode||'cash',
      transaction_ref: payment.transaction_ref||'',
      month: payment.month||'',
      notes: payment.notes||'',
      status: payment.status||'settled',
    });
    setErr('');
    setDialogOpen(true);
  };

  const handleClose = () => { if(saving) return; setDialogOpen(false); };
  const handleExited = () => { setForm(EMPTY_FORM); setErr(''); setEditPayment(null); setSelectedTenantDue(null); };

  const handleSubmit = async () => {
    setErr('');
    if (!form.pg_tenant_id||!form.amount||!form.payment_date) return setErr('Tenant, amount and date required');
    setSaving(true);
    try {
      if (editPayment) await api.updatePayment(editPayment.id, form);
      else await api.createPayment(form);
      setDialogOpen(false);
      fetch();
    } catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  // Export CSV
  const handleExport = async () => {
    try {
      const res = await api.exportPaymentsCSV(filters.start_date ? { start_date:filters.start_date, end_date:filters.end_date } : {});
      const url = URL.createObjectURL(new Blob([res.data], { type:'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert('Export failed: '+e.message); }
  };

  // Calculate partial display for a payment
  const isPartial = (p) => p.is_partial || (p.balance_due && parseFloat(p.balance_due)>0);
  const paidPct = (p) => { const t=parseFloat(p.tenant_rent||p.amount); return t>0 ? Math.min(100,Math.round(parseFloat(p.paid_amount||p.amount)/t*100)) : 100; };

  const collectedPct = summary.total_monthly_rent > 0
    ? Math.round(parseFloat(summary.total_paid||0)/parseFloat(summary.total_monthly_rent)*100) : 0;

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:3, flexWrap:'wrap', gap:2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight:800 }}>Payments</Typography>
          <Typography sx={{ color:'#6B7280', fontSize:'0.875rem' }}>Track rent collection and payment history.</Typography>
        </Box>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb:3 }}>
        {[
          { label:'Total Monthly Rent', value:fm(summary.total_monthly_rent), color:'#1B3A6B', bg:'#EEF2FF', sub:'' },
          { label:'Collected (MTD)', value:fm(summary.total_paid), color:'#059669', bg:'#D1FAE5', sub:`${collectedPct}% of total` },
          { label:'Partial Payments', value:fm(summary.total_partial), color:'#D97706', bg:'#FEF3C7', sub:'Balance pending' },
          { label:'Pending / Due', value:fm(summary.total_due), color:'#DC2626', bg:'#FEE2E2', sub:`${prevDues.length} tenant${prevDues.length!==1?'s':''} have prev dues` },
        ].map(s=>(
          <Grid item xs={6} lg={3} key={s.label}>
            <Card sx={{ height:'100%', border:`1px solid ${s.bg==='#FEE2E2'&&parseFloat(summary.total_due)>0?'#FCA5A5':'#E5E7EB'}` }}>
              <CardContent sx={{ p:2.5 }}>
                <Box sx={{ width:38, height:38, borderRadius:2, bgcolor:s.bg, display:'flex', alignItems:'center', justifyContent:'center', mb:1.5 }}>
                  <Typography sx={{ fontSize:'1.1rem' }}>{['💰','✅','⚡','⚠️'][['Total Monthly Rent','Collected (MTD)','Partial Payments','Pending / Due'].indexOf(s.label)]}</Typography>
                </Box>
                <Typography sx={{ fontSize:'0.68rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</Typography>
                <Typography sx={{ fontSize:'1.6rem', fontWeight:800, color:s.color, lineHeight:1.2 }}>{s.value}</Typography>
                {s.sub && <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3 }}>{s.sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Collection progress bar */}
      <Card sx={{ mb:2.5 }}>
        <CardContent sx={{ p:2 }}>
          <Box sx={{ display:'flex', justifyContent:'space-between', mb:0.8 }}>
            <Typography sx={{ fontSize:'0.82rem', fontWeight:600 }}>Monthly Collection Progress</Typography>
            <Typography sx={{ fontSize:'0.82rem', fontWeight:700, color:'#1B3A6B' }}>{collectedPct}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={collectedPct}
            sx={{ height:10, borderRadius:5, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor: collectedPct>=80?'#059669':collectedPct>=50?'#D97706':'#DC2626', borderRadius:5 } }} />
          <Box sx={{ display:'flex', justifyContent:'space-between', mt:0.8 }}>
            <Typography sx={{ fontSize:'0.72rem', color:'#059669' }}>Collected: {fm(summary.total_paid)}</Typography>
            <Typography sx={{ fontSize:'0.72rem', color:'#DC2626' }}>Remaining: {fm(parseFloat(summary.total_monthly_rent||0)-parseFloat(summary.total_paid||0))}</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card sx={{ mb:2.5 }}>
        <CardContent sx={{ p:2 }}>
          <Box sx={{ display:'flex', gap:2, flexWrap:'wrap', alignItems:'center' }}>
            <TextField size="small" placeholder="Search tenant..." value={filters.search}
              onChange={e=>setFilters(f=>({...f,search:e.target.value}))} sx={{ width:180 }}
              InputProps={{ startAdornment:<InputAdornment position="start"><Search sx={{ fontSize:16, color:'#9CA3AF' }} /></InputAdornment> }} />
            <TextField size="small" type="date" value={filters.start_date} onChange={e=>setFilters(f=>({...f,start_date:e.target.value}))} sx={{ width:145 }} InputLabelProps={{ shrink:true }} label="From" />
            <TextField size="small" type="date" value={filters.end_date} onChange={e=>setFilters(f=>({...f,end_date:e.target.value}))} sx={{ width:145 }} InputLabelProps={{ shrink:true }} label="To" />
            <FormControl size="small" sx={{ minWidth:140 }}>
              <Select value={filters.method} onChange={e=>setFilters(f=>({...f,method:e.target.value}))}>
                <MenuItem value="all">All Methods</MenuItem>
                {METHODS.map(m=><MenuItem key={m} value={m}>{m.replace('_',' ').toUpperCase()}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ ml:'auto', display:'flex', gap:1 }}>
              <Button variant="outlined" size="small" startIcon={<Download />} onClick={handleExport} sx={{ borderRadius:2, fontSize:'0.78rem' }}>Export CSV</Button>
              {canCreate && <Button variant="contained" size="small" startIcon={<Add />} onClick={openAdd} sx={{ borderRadius:2 }}>Record Payment</Button>}
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
                  <TableRow>{['Receipt','Tenant','Date','Paid','Rent','Balance','Method','Status'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {payments.map(p => {
                    const partial = isPartial(p);
                    return (
                      <TableRow key={p.id} hover onClick={()=>{ if(canCreate) openEdit(p); }}
                        sx={{ cursor:canCreate?'pointer':'default', '&:hover':{ bgcolor:'#F5F7FF' }, bgcolor:partial?'#FFFBF5':undefined }}>
                        <TableCell><Typography sx={{ fontSize:'0.82rem', color:'#1B3A6B', fontWeight:600 }}>{p.receipt_number}</Typography></TableCell>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                            <Avatar sx={{ width:28, height:28, fontSize:'0.72rem', bgcolor:'#1B3A6B' }}>{p.tenant_name?.substring(0,2).toUpperCase()}</Avatar>
                            <Box>
                              <Typography sx={{ fontSize:'0.82rem', fontWeight:600 }}>{p.tenant_name}</Typography>
                              <Typography sx={{ fontSize:'0.7rem', color:'#6B7280' }}>{p.room_number}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{fmtDate(p.payment_date)}</TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight:700, fontSize:'0.85rem' }}>{fm(p.paid_amount||p.amount)}</Typography>
                          {partial && <LinearProgress variant="determinate" value={paidPct(p)} sx={{ height:3, borderRadius:2, bgcolor:'#E5E7EB', mt:0.3, width:60, '& .MuiLinearProgress-bar':{ bgcolor:'#D97706' } }} />}
                        </TableCell>
                        <TableCell><Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{fm(p.tenant_rent)}</Typography></TableCell>
                        <TableCell>
                          {partial
                            ? <Chip label={fm(p.balance_due)} size="small" sx={{ bgcolor:'#FEF3C7', color:'#92400E', fontWeight:700, fontSize:'0.68rem' }} />
                            : <Typography sx={{ fontSize:'0.75rem', color:'#9CA3AF' }}>—</Typography>
                          }
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                            <span style={{ fontSize:13 }}>{METHOD_ICONS[p.payment_mode]||'💳'}</span>
                            <Typography sx={{ fontSize:'0.75rem' }}>{p.payment_mode?.replace('_',' ')}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><StatusChip status={partial?'pending':p.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                  {payments.length===0 && <TableRow><TableCell colSpan={8} sx={{ textAlign:'center', py:5, color:'#9CA3AF' }}>No payments found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box sx={{ px:2, py:1, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Showing {payments.length} of {total}</Typography>
            <TablePagination component="div" count={total} page={page} onPageChange={(_,p)=>setPage(p)} rowsPerPage={15} rowsPerPageOptions={[]} sx={{ border:'none' }} />
          </Box>
        </CardContent>
      </Card>

      {/* RECORD / EDIT PAYMENT DIALOG */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth keepMounted={false}
        TransitionProps={{ onExited:handleExited }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>{editPayment ? 'Edit Payment' : 'Record Payment'}</Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}

          {/* Previous month due warning */}
          {selectedTenantDue && (
            <Alert severity="warning" icon={<Warning />} sx={{ mb:2, borderRadius:2 }}>
              <Typography sx={{ fontWeight:700, fontSize:'0.85rem' }}>Previous month balance: {fm(selectedTenantDue.prev_due)}</Typography>
              <Typography sx={{ fontSize:'0.78rem' }}>Consider adding {fm(parseFloat(selectedTenantDue.monthly_rent)+parseFloat(selectedTenantDue.prev_due))} to clear all dues.</Typography>
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Select Tenant *</InputLabel>
                <Select value={form.pg_tenant_id} label="Select Tenant *" onChange={e=>handleTenantSelect(e.target.value)} disabled={!!editPayment}>
                  {tenants.map(t => {
                    const hasDue = prevDues.some(d=>d.id===t.id);
                    return (
                      <MenuItem key={t.id} value={t.id}>
                        <Box sx={{ display:'flex', alignItems:'center', gap:1, width:'100%' }}>
                          <Typography sx={{ flex:1 }}>{t.name} — {t.room_number} (₹{Number(t.monthly_rent||0).toLocaleString('en-IN')})</Typography>
                          {hasDue && <Chip label="PREV DUE" size="small" sx={{ bgcolor:'#FEF3C7', color:'#92400E', fontWeight:700, fontSize:'0.62rem' }} />}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Amount Paid (₹) *" size="small" type="number" value={form.amount}
                onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                helperText={(() => {
                  const t = tenants.find(t=>t.id===form.pg_tenant_id);
                  if (!t) return '';
                  const bal = parseFloat(t.monthly_rent||0) - parseFloat(form.amount||0);
                  return bal > 0 ? `Balance: ₹${bal.toLocaleString('en-IN')} (partial)` : bal < 0 ? `Overpayment: ₹${Math.abs(bal).toLocaleString('en-IN')}` : 'Full payment';
                })()}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Payment Date *" size="small" type="date" InputLabelProps={{ shrink:true }}
                value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))} />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small"><InputLabel>Method *</InputLabel>
                <Select value={form.payment_mode} label="Method *" onChange={e=>setForm(f=>({...f,payment_mode:e.target.value}))}>
                  {METHODS.map(m=><MenuItem key={m} value={m}>{METHOD_ICONS[m]} {m.replace('_',' ').toUpperCase()}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Month" size="small" placeholder="e.g. Jun-2025" value={form.month} onChange={e=>setForm(f=>({...f,month:e.target.value}))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Transaction Reference" size="small" value={form.transaction_ref} onChange={e=>setForm(f=>({...f,transaction_ref:e.target.value}))} />
            </Grid>
            {editPayment && (
              <Grid item xs={6}>
                <FormControl fullWidth size="small"><InputLabel>Status</InputLabel>
                  <Select value={form.status} label="Status" onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {['settled','pending','failed'].map(s=><MenuItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}><TextField fullWidth label="Notes" size="small" multiline rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving?<CircularProgress size={20} color="inherit"/>:editPayment?'Save Changes':'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
