import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, TablePagination,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Grid, LinearProgress, Chip
} from '@mui/material';
import { Add, Close, Download, ElectricBolt, WaterDrop, PeopleAlt, Build, CleaningServices, Wifi, Kitchen, MoreHoriz, TrendingUp, Edit, Delete } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';

const fmtMoney = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) : '-';

const CAT = {
  electricity: { icon:<ElectricBolt sx={{ fontSize:18 }} />, color:'#F59E0B', bg:'#FEF3C7' },
  water:       { icon:<WaterDrop sx={{ fontSize:18 }} />,   color:'#3B82F6', bg:'#DBEAFE' },
  salaries:    { icon:<PeopleAlt sx={{ fontSize:18 }} />,   color:'#8B5CF6', bg:'#EDE9FE' },
  repairs:     { icon:<Build sx={{ fontSize:18 }} />,        color:'#EF4444', bg:'#FEE2E2' },
  cleaning:    { icon:<CleaningServices sx={{ fontSize:18 }} />, color:'#10B981', bg:'#D1FAE5' },
  internet:    { icon:<Wifi sx={{ fontSize:18 }} />,         color:'#6366F1', bg:'#E0E7FF' },
  groceries:   { icon:<Kitchen sx={{ fontSize:18 }} />,     color:'#F97316', bg:'#FFEDD5' },
  other:       { icon:<MoreHoriz sx={{ fontSize:18 }} />,   color:'#6B7280', bg:'#F3F4F6' },
};
const CATS = Object.keys(CAT);
const STATUSES = ['paid','pending','processing'];
const EMPTY = { description:'', sub_description:'', category:'electricity', amount:'', expense_date:new Date().toISOString().split('T')[0], due_date:'', status:'paid', invoice_number:'', vendor:'' };

export default function ExpensesPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState({});
  const [dist, setDist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [catFilter, setCatFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getExpenses({ page:page+1, limit:15, category: catFilter==='all'?undefined:catFilter });
      setExpenses(res.data.expenses||[]); setTotal(res.data.total||0); setStats(res.data.stats||{}); setDist(res.data.distribution||[]);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [pgId, page, catFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const openAdd = () => { setEditExpense(null); setForm(EMPTY); setErr(''); setDialogOpen(true); };
  const openEdit = (exp) => { setEditExpense(exp); setForm({ description:exp.description, sub_description:exp.sub_description||'', category:exp.category, amount:exp.amount, expense_date:exp.expense_date?.split('T')[0]||'', due_date:exp.due_date?.split('T')[0]||'', status:exp.status, invoice_number:exp.invoice_number||'', vendor:exp.vendor||'' }); setErr(''); setDialogOpen(true); };
  const handleClose = () => { if(saving) return; setDialogOpen(false); };
  const handleExited = () => { setForm(EMPTY); setErr(''); setEditExpense(null); };

  const handleSubmit = async () => {
    setErr('');
    if (!form.description||!form.amount||!form.expense_date) return setErr('Description, amount and date required');
    setSaving(true);
    try {
      if (editExpense) await api.updateExpense(editExpense.id, form);
      else await api.createExpense(form);
      setDialogOpen(false); fetch();
    } catch(e) { setErr(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    await api.deleteExpense(id); fetch();
  };

  const distTotal = dist.reduce((s,d) => s+parseFloat(d.total||0), 0);

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:3 }}>
        <Box>
          <Typography sx={{ fontSize:'0.75rem', color:'#6B7280', fontWeight:600, mb:0.3 }}>Overview</Typography>
          <Typography variant="h4" sx={{ fontWeight:800 }}>Financial Health</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd} sx={{ px:2.5 }}>Add Expense</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb:3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', mb:1 }}>Total Expenses This Month</Typography>
            <Box sx={{ display:'flex', alignItems:'baseline', gap:1 }}>
              <Typography sx={{ fontSize:'1.8rem', fontWeight:800 }}>{fmtMoney(stats.total_this_month)}</Typography>
              <Chip icon={<TrendingUp sx={{ fontSize:'13px !important' }} />} label="+12%" size="small" sx={{ bgcolor:'#FEE2E2', color:'#991B1B', fontWeight:700, fontSize:'0.68rem' }} />
            </Box>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor:'#FFF7ED', border:'1px solid #FED7AA' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:1 }}><Typography sx={{ fontSize:18 }}>❕</Typography><Typography sx={{ fontSize:'0.82rem', fontWeight:600, color:'#92400E' }}>Upcoming Bills</Typography></Box>
            <Typography sx={{ fontSize:'1.8rem', fontWeight:800 }}>{fmtMoney(stats.upcoming_bills)}</Typography>
            <Typography sx={{ fontSize:'0.75rem', color:'#D97706', fontWeight:600, mt:0.3 }}>Due in next 7 days</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor:'#F5F3FF', border:'1px solid #DDD6FE' }}><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontSize:'0.82rem', fontWeight:600, mb:1 }}>Maintenance Cap</Typography>
            <Typography sx={{ fontSize:'1.8rem', fontWeight:800 }}>85%</Typography>
            <LinearProgress variant="determinate" value={85} sx={{ mt:1, height:7, borderRadius:4, bgcolor:'#DDD6FE', '& .MuiLinearProgress-bar':{ bgcolor:'#7C3AED' } }} />
          </CardContent></Card>
        </Grid>
      </Grid>

      <Card sx={{ mb:2.5 }}>
        <CardContent sx={{ p:0 }}>
          <Box sx={{ px:2.5, py:2, display:'flex', gap:1.5, flexWrap:'wrap', alignItems:'center', borderBottom:'1px solid #E5E7EB' }}>
            <Typography variant="h6" sx={{ fontWeight:700, flex:1 }}>Recent Transactions</Typography>
            <FormControl size="small" sx={{ minWidth:140 }}>
              <Select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <MenuItem value="all">All Categories</MenuItem>
                {CATS.map(c => <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" startIcon={<Download />} sx={{ borderRadius:2, fontSize:'0.78rem' }}>Export PDF</Button>
          </Box>

          {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:5 }}><CircularProgress /></Box> : (
            <Box sx={{ overflowX:'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>{['Description','Category','Date','Amount','Status','Actions'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {expenses.map(exp => {
                    const c = CAT[exp.category]||CAT.other;
                    return (
                      <TableRow key={exp.id} hover>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                            <Box sx={{ width:34, height:34, borderRadius:2, bgcolor:c.bg, display:'flex', alignItems:'center', justifyContent:'center', color:c.color }}>{c.icon}</Box>
                            <Box><Typography sx={{ fontSize:'0.875rem', fontWeight:600 }}>{exp.description}</Typography><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{exp.sub_description}</Typography></Box>
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={exp.category} size="small" sx={{ bgcolor:c.bg, color:c.color, fontWeight:700, fontSize:'0.68rem' }} /></TableCell>
                        <TableCell>{fmtDate(exp.expense_date)}</TableCell>
                        <TableCell><Typography sx={{ fontWeight:700 }}>{fmtMoney(exp.amount)}</Typography></TableCell>
                        <TableCell><StatusChip status={exp.status} /></TableCell>
                        <TableCell>
                          <Box sx={{ display:'flex', gap:0.3 }}>
                            <IconButton size="small" sx={{ color:'#1B3A6B' }} onClick={() => openEdit(exp)}><Edit sx={{ fontSize:15 }} /></IconButton>
                            <IconButton size="small" sx={{ color:'#DC2626' }} onClick={() => handleDelete(exp.id)}><Delete sx={{ fontSize:15 }} /></IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {expenses.length===0 && <TableRow><TableCell colSpan={6} sx={{ textAlign:'center', py:5, color:'#9CA3AF' }}>No expenses found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box sx={{ px:2, py:1, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Showing {expenses.length} of {total}</Typography>
            <TablePagination component="div" count={total} page={page} onPageChange={(_,p)=>setPage(p)} rowsPerPage={15} rowsPerPageOptions={[]} sx={{ border:'none' }} />
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Card><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:2 }}>Expense Distribution</Typography>
            {dist.map(d => {
              const c = CAT[d.category]||CAT.other;
              return (
                <Box key={d.category} sx={{ mb:1.5 }}>
                  <Box sx={{ display:'flex', justifyContent:'space-between', mb:0.5 }}>
                    <Typography sx={{ fontSize:'0.85rem', fontWeight:600, textTransform:'capitalize' }}>{d.category}</Typography>
                    <Typography sx={{ fontSize:'0.85rem', fontWeight:700, color:'#1B3A6B' }}>{fmtMoney(d.total)}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={distTotal>0?(d.total/distTotal)*100:0}
                    sx={{ height:7, borderRadius:4, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor:c.color } }} />
                </Box>
              );
            })}
            {dist.length===0 && <Typography sx={{ color:'#9CA3AF', fontSize:'0.82rem' }}>No expense data this month</Typography>}
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ bgcolor:'#F5F7FF', border:'1px solid #E0E7FF', height:'100%' }}>
            <CardContent sx={{ p:2.5, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', justifyContent:'center', minHeight:200 }}>
              <Typography sx={{ fontSize:36, mb:1.5 }}>💡</Typography>
              <Typography sx={{ fontWeight:700, mb:1 }}>Smart Suggestion</Typography>
              <Typography sx={{ fontSize:'0.82rem', color:'#6B7280', mb:2 }}>Switching to LED fixtures in common areas could reduce electricity costs by up to 15% next month.</Typography>
              <Button size="small" sx={{ fontWeight:700, fontSize:'0.78rem', color:'#1B3A6B' }}>View Energy Report</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ADD/EDIT DIALOG */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth keepMounted={false} TransitionProps={{ onExited:handleExited }} PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>{editExpense ? 'Edit Expense' : 'Add Expense'}</Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{err}</Alert>}
          <Grid container spacing={2} sx={{ mt:0 }}>
            <Grid item xs={12}><TextField fullWidth label="Description *" size="small" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Sub-description" size="small" placeholder="e.g. Invoice #29841" value={form.sub_description} onChange={e => setForm(f=>({...f,sub_description:e.target.value}))} /></Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small"><InputLabel>Category *</InputLabel>
                <Select value={form.category} label="Category *" onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                  {CATS.map(c => <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small"><InputLabel>Status</InputLabel>
                <Select value={form.status} label="Status" onChange={e => setForm(f=>({...f,status:e.target.value}))}>
                  {STATUSES.map(s => <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth label="Amount (₹) *" size="small" type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Expense Date *" size="small" type="date" InputLabelProps={{ shrink:true }} value={form.expense_date} onChange={e => setForm(f=>({...f,expense_date:e.target.value}))} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Due Date" size="small" type="date" InputLabelProps={{ shrink:true }} value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Invoice Number" size="small" value={form.invoice_number} onChange={e => setForm(f=>({...f,invoice_number:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Vendor" size="small" value={form.vendor} onChange={e => setForm(f=>({...f,vendor:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:3, gap:1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : editExpense ? 'Save Changes' : 'Add Expense'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
