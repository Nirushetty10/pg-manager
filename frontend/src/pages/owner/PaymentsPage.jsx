import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button, TextField, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, TablePagination,
  InputAdornment, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Chip, LinearProgress, Tooltip, Divider, Collapse, Stack, Badge
} from '@mui/material';
import {
  Search, Add, Download, Close, Warning, ExpandMore, ExpandLess,
  AccountBalanceWallet, CheckCircle, HourglassEmpty, ErrorOutline, TrendingUp,
  DeleteOutline
} from '@mui/icons-material';
import { useContext } from 'react';
import { pgAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';
import { usePermissions } from '../../hooks/usePermissions';
import { AuthContext } from '../../context/AuthContext';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fm   = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const safeNum = (v) => parseFloat(v) || 0;

const METHODS = ['cash', 'upi', 'bank_transfer', 'cheque', 'online'];
const METHOD_LABELS = { cash:'Cash', upi:'UPI', bank_transfer:'Bank Transfer', cheque:'Cheque', online:'Online' };
const METHOD_ICONS  = { cash:'💵', upi:'📱', bank_transfer:'🏦', cheque:'📃', online:'💻' };

// Generate month options — current month + past 11 months
const MONTH_OPTIONS = (() => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('en-IN', { month: 'short' }) + '-' + d.getFullYear();
    opts.push(label);
  }
  return opts;
})();

const EMPTY_FORM = {
  pg_tenant_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0],
  payment_mode: 'cash', transaction_ref: '', month: MONTH_OPTIONS[0], notes: '', status: 'settled',
};

const EMPTY_ERRORS = {
  pg_tenant_id: '', amount: '', payment_date: '', payment_mode: '', month: '',
};

/* ─── sub-component: attention list (partial + due tenants) ───────────────── */
function AttentionList({ prevDues, tenants, onRecord, canCreate }) {
  const [open, setOpen] = useState(true);

  // Build list: tenants whose payment_status is 'due' or 'partial'
  const attentionTenants = tenants
    .filter(t => t.payment_status === 'due' || t.payment_status === 'partial')
    .map(t => {
      const due = prevDues.find(d => String(d.id) === String(t.id));
      return { ...t, prev_due: safeNum(due?.prev_due) };
    })
    .sort((a, b) => {
      // Sort: due > partial, then by amount desc
      if (a.payment_status !== b.payment_status) return a.payment_status === 'due' ? -1 : 1;
      return safeNum(b.monthly_rent) - safeNum(a.monthly_rent);
    });

  if (!attentionTenants.length) return null;

  return (
    <Card sx={{ mb: 2.5, border: '1px solid #FCA5A5' }}>
      <CardContent sx={{ p: 0 }}>
        <Box
          onClick={() => setOpen(o => !o)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, cursor: 'pointer',
            bgcolor: '#FFF5F5', borderRadius: open ? '12px 12px 0 0' : 2 }}
        >
          <ErrorOutline sx={{ color: '#DC2626', fontSize: 18 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#991B1B', flex: 1 }}>
            Needs Attention — {attentionTenants.length} tenant{attentionTenants.length !== 1 ? 's' : ''} with outstanding dues
          </Typography>
          <Chip
            label={fm(attentionTenants.reduce((s, t) => {
              const currentOwed = t.payment_status === 'partial' && safeNum(t.balance_due) > 0
                ? safeNum(t.balance_due) : safeNum(t.monthly_rent);
              return s + currentOwed + safeNum(t.prev_due);
            }, 0)) + ' total'}
            size="small" sx={{ bgcolor: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: '0.7rem' }}
          />
          {open ? <ExpandLess sx={{ color: '#991B1B', fontSize: 18 }} /> : <ExpandMore sx={{ color: '#991B1B', fontSize: 18 }} />}
        </Box>
        <Collapse in={open}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#FFF5F5' }}>
                  {['Tenant', 'Room', 'Rent / Balance', 'Prev Balance', 'Total Owed', 'Status', canCreate && 'Action'].filter(Boolean).map(h => (
                    <TableCell key={h} sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', py: 1 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {attentionTenants.map(t => {
                  // For partial tenants, the "owed" is the remaining balance, not full rent again
                  const currentOwed = t.payment_status === 'partial' && safeNum(t.balance_due) > 0
                    ? safeNum(t.balance_due)
                    : safeNum(t.monthly_rent);
                  const totalOwed = currentOwed + safeNum(t.prev_due);
                  return (
                    <TableRow key={t.id} sx={{ '&:hover': { bgcolor: '#FFF5F5' } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 26, height: 26, fontSize: '0.68rem', bgcolor: '#FCA5A5', color: '#991B1B' }}>
                            {t.name?.substring(0, 2).toUpperCase()}
                          </Avatar>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{t.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>{t.room_number}{t.bed_label ? ` · ${t.bed_label}` : ''}</Typography>
                      </TableCell>
                      <TableCell>
                        {t.payment_status === 'partial' && safeNum(t.balance_due) > 0 ? (
                          <Box>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#D97706' }}>{fm(t.balance_due)}</Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: '#9CA3AF' }}>of {fm(t.monthly_rent)} rent</Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{fm(t.monthly_rent)}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {safeNum(t.prev_due) > 0
                          ? <Chip label={fm(t.prev_due)} size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: '0.68rem' }} />
                          : <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: '#DC2626' }}>{fm(totalOwed)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t.payment_status === 'due' ? 'DUE' : 'PARTIAL'}
                          size="small"
                          sx={{
                            bgcolor: t.payment_status === 'due' ? '#FEE2E2' : '#FEF3C7',
                            color: t.payment_status === 'due' ? '#991B1B' : '#92400E',
                            fontWeight: 700, fontSize: '0.68rem',
                          }}
                        />
                      </TableCell>
                      {canCreate && (
                        <TableCell>
                          <Button size="small" variant="outlined" onClick={() => onRecord(t)}
                            sx={{ fontSize: '0.72rem', py: 0.3, px: 1, borderRadius: 1.5, borderColor: '#DC2626', color: '#DC2626',
                              '&:hover': { bgcolor: '#FEE2E2', borderColor: '#DC2626' } }}>
                            Record
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

/* ─── main page ───────────────────────────────────────────────────────────── */
export default function PaymentsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can('record_payments', 'create');
  const { user } = useContext(AuthContext);
  const isOwner = user?.role === 'owner' || user?.role === 'master_admin';

  const [payments,  setPayments]  = useState([]);
  const [summary,   setSummary]   = useState({});
  const [prevDues,  setPrevDues]  = useState([]);
  const [tenants,   setTenants]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(0);
  const [total,     setTotal]     = useState(0);
  const [filters,   setFilters]   = useState({ search: '', method: 'all', start_date: '', end_date: '', payment_status: 'all' });

  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [editPayment,   setEditPayment]   = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [errors,        setErrors]        = useState(EMPTY_ERRORS);
  const [err,           setErr]           = useState('');
  const [saving,        setSaving]        = useState(false);
  const [selectedTenantDue, setSelectedTenantDue] = useState(null);

  // Delete confirmation state
  const [deleteTarget,  setDeleteTarget]  = useState(null); // payment object to delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteErr,     setDeleteErr]     = useState('');

  /* fetch payments */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = { page: page + 1, limit: 15, ...filters };
      if (p.method === 'all') delete p.method;
      if (p.payment_status === 'all') delete p.payment_status;
      const res = await api.getPayments(p);
      setPayments(res.data.payments || []);
      setTotal(res.data.total || 0);
      setSummary(res.data.summary || {});
      setPrevDues(res.data.prevDues || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [pgId, page, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* fetch tenants for dialog — also called after each payment to keep balance_due fresh */
  const fetchTenants = useCallback(() => {
    api.getTenants({ status: 'active', limit: 200 })
      .then(r => setTenants(r.data.tenants || []))
      .catch(() => {});
  }, [pgId]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  /* ── derived summary values ──────────────────────────────────────────────
   * Backend summary fields are unreliable across partial/due states, so we
   * compute authoritative values directly from the tenants list + prevDues:
   *
   *   totalRent    = sum of monthly_rent for all active tenants
   *   totalPaid    = sum of (monthly_rent − balance_due) for paid/partial
   *                  i.e. how much has actually been received this month
   *   totalPartial = sum of outstanding balance_due on partial tenants
   *   totalDue     = sum of full monthly_rent for fully-unpaid (due) tenants
   *                  + any prevDues balance
   *
   * We use summary fields as a fallback when tenants haven't loaded yet.
   * ──────────────────────────────────────────────────────────────────────── */
  const totalRent = tenants.length > 0
    ? tenants.reduce((s, t) => s + safeNum(t.monthly_rent), 0)
    : safeNum(summary.total_monthly_rent);

  const totalPaid = tenants.length > 0
    ? tenants.reduce((s, t) => {
        if (t.payment_status === 'paid') return s + safeNum(t.monthly_rent);
        if (t.payment_status === 'partial') return s + (safeNum(t.monthly_rent) - safeNum(t.balance_due));
        return s;
      }, 0)
    : safeNum(summary.total_paid);

  const totalPartial = tenants.length > 0
    ? tenants.filter(t => t.payment_status === 'partial').reduce((s, t) => s + safeNum(t.balance_due), 0)
    : safeNum(summary.total_partial);

  // "Due" = fully unpaid tenants' rent + everyone's prevDue balances
  const totalDue = tenants.length > 0
    ? tenants.reduce((s, t) => {
        const base = t.payment_status === 'due' ? safeNum(t.monthly_rent) : 0;
        const prev = safeNum(prevDues.find(d => String(d.id) === String(t.id))?.prev_due);
        return s + base + prev;
      }, 0)
    : safeNum(summary.total_due);

  const collectedPct   = totalRent > 0 ? Math.min(100, Math.round((totalPaid / totalRent) * 100)) : 0;
  // Count tenants who still owe something (due or partial)
  const dueTenantCount = tenants.filter(t => t.payment_status === 'due' || t.payment_status === 'partial').length;

  /* ── form helpers ── */
  const handleTenantSelect = (tenantId) => {
    const t   = tenants.find(t => String(t.id) === String(tenantId));
    const due = prevDues.find(d => String(d.id) === String(tenantId));
    // For partial tenants, pre-fill with the remaining balance, not full rent
    // This prevents the owner from accidentally recording a double-payment
    const prefillAmount = t?.payment_status === 'partial' && safeNum(t.balance_due) > 0
      ? t.balance_due
      : t?.monthly_rent || '';
    setForm(f => ({ ...f, pg_tenant_id: tenantId, amount: prefillAmount }));
    setSelectedTenantDue(due || null);
    setErrors(e => ({ ...e, pg_tenant_id: '' }));
  };

  const validate = () => {
    const errs = { ...EMPTY_ERRORS };
    let ok = true;
    if (!form.pg_tenant_id)                          { errs.pg_tenant_id = 'Please select a tenant';                      ok = false; }
    if (!form.amount || safeNum(form.amount) <= 0)   { errs.amount = 'Enter a valid amount greater than 0';               ok = false; }
    if (form.amount && safeNum(form.amount) > 999999){ errs.amount = 'Amount seems too large — please verify';            ok = false; }
    if (!form.payment_date)                          { errs.payment_date = 'Payment date is required';                    ok = false; }
    if (!form.payment_mode)                          { errs.payment_mode = 'Select a payment method';                     ok = false; }
    if (!form.month)                                 { errs.month = 'Select the month this payment covers';               ok = false; }
    // Overpayment hard guard — strictly block anything above what's owed
    // Uses the CURRENT tenants list which is refreshed after every payment
    if (form.pg_tenant_id && form.amount && !editPayment) {
      const t = tenants.find(t => String(t.id) === String(form.pg_tenant_id));
      if (t) {
        const currentMax = t.payment_status === 'partial' && safeNum(t.balance_due) > 0
          ? safeNum(t.balance_due)
          : safeNum(t.monthly_rent);
        const prevDue = safeNum(prevDues.find(d => String(d.id) === String(t.id))?.prev_due);
        const hardMax = currentMax + prevDue;
        if (safeNum(form.amount) > hardMax) {
          errs.amount = `Cannot exceed ${fm(hardMax)}${t.payment_status === 'partial' ? ` — only ${fm(currentMax)} balance remaining this month` : ' (rent + prev dues)'}`;
          ok = false;
        }
      }
    }
    setErrors(errs);
    return ok;
  };

  const openAdd = (prefillTenant = null) => {
    setEditPayment(null);
    const base = { ...EMPTY_FORM, month: MONTH_OPTIONS[0] };
    if (prefillTenant) {
      base.pg_tenant_id = String(prefillTenant.id);
      // For partial tenants use balance_due; for due tenants use full rent
      base.amount = prefillTenant.payment_status === 'partial' && safeNum(prefillTenant.balance_due) > 0
        ? prefillTenant.balance_due
        : prefillTenant.monthly_rent || '';
      const due = prevDues.find(d => String(d.id) === String(prefillTenant.id));
      setSelectedTenantDue(due || null);
    } else {
      setSelectedTenantDue(null);
    }
    setForm(base);
    setErrors(EMPTY_ERRORS);
    setErr('');
    setDialogOpen(true);
  };

  const openEdit = (payment) => {
    setEditPayment(payment);
    setForm({
      pg_tenant_id:    String(payment.pg_tenant_id || ''),
      amount:          payment.paid_amount || payment.amount || '',
      payment_date:    payment.payment_date?.split('T')[0] || '',
      payment_mode:    payment.payment_mode || 'cash',
      transaction_ref: payment.transaction_ref || '',
      month:           payment.month || MONTH_OPTIONS[0],
      notes:           payment.notes || '',
      status:          payment.status || 'settled',
    });
    setErrors(EMPTY_ERRORS);
    setErr('');
    setDialogOpen(true);
  };

  const handleClose  = () => { if (saving) return; setDialogOpen(false); };
  const handleExited = () => { setForm(EMPTY_FORM); setErrors(EMPTY_ERRORS); setErr(''); setEditPayment(null); setSelectedTenantDue(null); };

  const handleSubmit = async () => {
    if (!validate()) return;
    setErr('');
    setSaving(true);
    try {
      if (editPayment) await api.updatePayment(editPayment.id, form);
      else             await api.createPayment(form);
      setDialogOpen(false);
      // Refresh BOTH payments list AND tenants so balance_due is current for next dialog open
      await Promise.all([fetchData(), fetchTenants()]);
    } catch (e) { setErr(e.response?.data?.message || 'Failed to save payment'); }
    finally { setSaving(false); }
  };

  /* Export CSV */
  const handleExport = async () => {
    try {
      const params = filters.start_date ? { start_date: filters.start_date, end_date: filters.end_date } : {};
      const res = await api.exportPaymentsCSV(params);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + e.message); }
  };

  /* Delete payment */
  const openDeleteConfirm = (e, payment) => {
    e.stopPropagation(); // prevent row click from opening edit dialog
    setDeleteTarget(payment);
    setDeleteErr('');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteErr('');
    try {
      await api.deletePayment(deleteTarget.id);
      setDeleteConfirmOpen(false);
      await Promise.all([fetchData(), fetchTenants()]);
    } catch (e) {
      setDeleteErr(e.response?.data?.message || 'Failed to delete payment. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setDeleteErr('');
  };
  const isPartial = (p) => p.is_partial || safeNum(p.balance_due) > 0;
  const paidPct   = (p) => {
    const rent = safeNum(p.tenant_rent || p.monthly_rent);
    const paid = safeNum(p.paid_amount || p.amount);
    return rent > 0 ? Math.min(100, Math.round((paid / rent) * 100)) : 100;
  };

  /* Amount field helpers */
  const selectedTenant  = tenants.find(t => String(t.id) === String(form.pg_tenant_id));
  const amountNum       = safeNum(form.amount);
  const rentNum         = safeNum(selectedTenant?.monthly_rent);
  const prevDueNum      = safeNum(selectedTenantDue?.prev_due);
  // For partial tenants: the "full amount due" is the remaining balance, not the full rent again
  const isPartialTenant = selectedTenant?.payment_status === 'partial' && safeNum(selectedTenant.balance_due) > 0;
  const balanceDueNum   = safeNum(selectedTenant?.balance_due); // existing unpaid balance
  // What the owner still needs to pay for THIS month
  const amountExpected  = isPartialTenant ? balanceDueNum : rentNum;
  // How much will remain after this payment
  const remainingAfter  = amountExpected - amountNum;
  const totalOwed       = amountExpected + prevDueNum;

  const amountHelperText = () => {
    if (!selectedTenant) return '';
    if (!form.amount) {
      if (isPartialTenant) return `Remaining balance: ${fm(balanceDueNum)} (₹${(rentNum - balanceDueNum).toLocaleString('en-IN')} already paid)`;
      return `Monthly rent: ${fm(rentNum)}`;
    }
    if (amountNum > amountExpected + prevDueNum) return `Overpayment of ${fm(amountNum - amountExpected - prevDueNum)} — please verify`;
    if (remainingAfter > 0) return `Partial — ${fm(remainingAfter)} balance will remain after this payment`;
    return '✓ Fully settled';
  };
  const amountHelperColor = () => {
    if (!selectedTenant || !form.amount) return '#9CA3AF';
    if (amountNum > amountExpected + prevDueNum) return '#DC2626';
    if (remainingAfter > 0) return '#D97706';
    return '#059669';
  };
  // balance used in the summary box
  const balance = remainingAfter;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Payments</Typography>
          <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>Track rent collection and payment history.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" startIcon={<Download />} onClick={handleExport} sx={{ borderRadius: 2, fontSize: '0.78rem' }}>
            Export CSV
          </Button>
          {canCreate && (
            <Button variant="contained" size="small" startIcon={<Add />} onClick={() => openAdd()} sx={{ borderRadius: 2 }}>
              Record Payment
            </Button>
          )}
        </Box>
      </Box>

      {/* ── Summary cards ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Total Monthly Rent',
            value: fm(totalRent),
            sub: `${tenants.filter(t => t.status === 'active').length} active tenants`,
            color: '#1B3A6B', bg: '#EEF2FF', icon: <AccountBalanceWallet sx={{ fontSize: 18, color: '#1B3A6B' }} />,
          },
          {
            label: 'Collected (MTD)',
            value: fm(totalPaid),
            sub: `${collectedPct}% of total rent`,
            color: '#059669', bg: '#D1FAE5', icon: <CheckCircle sx={{ fontSize: 18, color: '#059669' }} />,
          },
          {
            label: 'Partial Payments',
            value: fm(totalPartial),
            sub: 'Balance still pending',
            color: '#D97706', bg: '#FEF3C7', icon: <HourglassEmpty sx={{ fontSize: 18, color: '#D97706' }} />,
          },
          {
            label: 'Pending / Due',
            value: fm(totalDue),
            sub: `${dueTenantCount} tenant${dueTenantCount !== 1 ? 's' : ''} with prev dues`,
            color: '#DC2626', bg: '#FEE2E2', icon: <ErrorOutline sx={{ fontSize: 18, color: '#DC2626' }} />,
            highlight: totalDue > 0,
          },
        ].map(s => (
          <Grid item xs={6} lg={3} key={s.label} sx={{ display: 'flex' }}>
            <Card sx={{
              width: '100%', display: 'flex', flexDirection: 'column',
              border: s.highlight ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
            }}>
              <CardContent sx={{ p: 2.5, flex: 1 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
                  {s.icon}
                </Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {s.label}
                </Typography>
                <Typography sx={{ fontSize: '1.55rem', fontWeight: 800, color: s.color, lineHeight: 1.2, mt: 0.3 }}>
                  {s.value}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#9CA3AF', mt: 0.4 }}>{s.sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Collection progress bar ── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUp sx={{ fontSize: 16, color: '#1B3A6B' }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Monthly Collection Progress</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                {fm(totalPaid)} collected of {fm(totalRent)}
              </Typography>
              <Chip
                label={`${collectedPct}%`}
                size="small"
                sx={{
                  fontWeight: 800, fontSize: '0.75rem',
                  bgcolor: collectedPct >= 80 ? '#D1FAE5' : collectedPct >= 50 ? '#FEF3C7' : '#FEE2E2',
                  color:   collectedPct >= 80 ? '#059669' : collectedPct >= 50 ? '#D97706' : '#DC2626',
                }}
              />
            </Box>
          </Box>
          <LinearProgress
            variant="determinate"
            value={collectedPct}
            sx={{
              height: 10, borderRadius: 5, bgcolor: '#E5E7EB',
              '& .MuiLinearProgress-bar': {
                bgcolor: collectedPct >= 80 ? '#059669' : collectedPct >= 50 ? '#D97706' : '#DC2626',
                borderRadius: 5,
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.8 }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#059669' }}>Collected: {fm(totalPaid)}</Typography>
            {totalPartial > 0 && (
              <Typography sx={{ fontSize: '0.72rem', color: '#D97706' }}>Partial: {fm(totalPartial)}</Typography>
            )}
            <Typography sx={{ fontSize: '0.72rem', color: '#DC2626' }}>
              Remaining: {fm(Math.max(0, totalRent - totalPaid))}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* ── Attention list: due + partial tenants ── */}
      <AttentionList
        prevDues={prevDues}
        tenants={tenants}
        onRecord={openAdd}
        canCreate={canCreate}
      />

      {/* ── Filters ── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small" placeholder="Search tenant..." value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} sx={{ width: 180 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: '#9CA3AF' }} /></InputAdornment> }}
            />
            <TextField size="small" type="date" value={filters.start_date} label="From"
              onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} sx={{ width: 145 }} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" value={filters.end_date} label="To"
              onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} sx={{ width: 145 }} InputLabelProps={{ shrink: true }} />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Method</InputLabel>
              <Select value={filters.method} label="Method" onChange={e => setFilters(f => ({ ...f, method: e.target.value }))}>
                <MenuItem value="all">All Methods</MenuItem>
                {METHODS.map(m => <MenuItem key={m} value={m}>{METHOD_ICONS[m]} {METHOD_LABELS[m]}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Status</InputLabel>
              <Select value={filters.payment_status} label="Status" onChange={e => setFilters(f => ({ ...f, payment_status: e.target.value }))}>
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="partial">Partial</MenuItem>
                <MenuItem value="due">Due</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* ── Payments table ── */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    {['Receipt', 'Tenant', 'Month', 'Date', 'Paid', 'Rent', 'Balance', 'Method', 'Status', ...(isOwner ? [''] : [])].map((h, i) => (
                      <TableCell key={i} sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', py: 1.2 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payments.map(p => {
                    const partial = isPartial(p);
                    const pct     = paidPct(p);
                    return (
                      <TableRow
                        key={p.id} hover
                        onClick={() => { if (canCreate) openEdit(p); }}
                        sx={{ cursor: canCreate ? 'pointer' : 'default', bgcolor: partial ? '#FFFBF5' : undefined, '&:hover': { bgcolor: partial ? '#FEF9ED' : '#F5F7FF' } }}
                      >
                        <TableCell>
                          <Typography sx={{ fontSize: '0.8rem', color: '#1B3A6B', fontWeight: 600 }}>{p.receipt_number}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: '#1B3A6B' }}>
                              {p.tenant_name?.substring(0, 2).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{p.tenant_name}</Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>{p.room_number}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>{p.month || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.78rem' }}>{fmtDate(p.payment_date)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{fm(p.paid_amount || p.amount)}</Typography>
                          {partial && (
                            <Tooltip title={`${pct}% of rent paid`}>
                              <LinearProgress
                                variant="determinate" value={pct}
                                sx={{ height: 3, borderRadius: 2, bgcolor: '#E5E7EB', mt: 0.4, width: 64,
                                  '& .MuiLinearProgress-bar': { bgcolor: '#D97706' } }}
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.82rem', color: '#6B7280' }}>{fm(p.tenant_rent || p.monthly_rent)}</Typography>
                        </TableCell>
                        <TableCell>
                          {partial
                            ? <Chip label={fm(p.balance_due)} size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: '0.68rem' }} />
                            : <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</Typography>
                          }
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span style={{ fontSize: 14 }}>{METHOD_ICONS[p.payment_mode] || '💳'}</span>
                            <Typography sx={{ fontSize: '0.75rem' }}>{METHOD_LABELS[p.payment_mode] || p.payment_mode}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={partial ? 'partial' : (p.status || 'settled')} />
                        </TableCell>
                        {isOwner && (
                          <TableCell align="right" sx={{ pr: 1 }}>
                            <Tooltip title="Delete payment">
                              <IconButton
                                size="small"
                                onClick={(e) => openDeleteConfirm(e, p)}
                                sx={{
                                  color: '#9CA3AF',
                                  '&:hover': { color: '#DC2626', bgcolor: '#FEE2E2' },
                                }}
                              >
                                <DeleteOutline sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isOwner ? 10 : 9} sx={{ textAlign: 'center', py: 6, color: '#9CA3AF' }}>
                        <Typography sx={{ fontSize: '0.85rem' }}>No payments found</Typography>
                        <Typography sx={{ fontSize: '0.75rem', mt: 0.5 }}>Try adjusting the filters above</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.82rem', color: '#6B7280' }}>Showing {payments.length} of {total}</Typography>
            <TablePagination
              component="div" count={total} page={page}
              onPageChange={(_, p) => setPage(p)} rowsPerPage={15} rowsPerPageOptions={[]}
              sx={{ border: 'none' }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* ── RECORD / EDIT PAYMENT DIALOG ── */}
      <Dialog
        open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth
        keepMounted={false} TransitionProps={{ onExited: handleExited }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
            {editPayment ? 'Edit Payment' : 'Record Payment'}
          </Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {err && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{err}</Alert>}

          {/* Previous month due warning */}
          {selectedTenantDue && safeNum(selectedTenantDue.prev_due) > 0 && (
            <Alert severity="warning" icon={<Warning />} sx={{ mb: 2, borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Previous balance: {fm(selectedTenantDue.prev_due)}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', mt: 0.3 }}>
                To clear all dues, collect {fm(totalOwed)} (rent + balance).
              </Typography>
              <Button
                size="small" variant="outlined" color="warning"
                onClick={() => setForm(f => ({ ...f, amount: totalOwed }))}
                sx={{ mt: 0.8, fontSize: '0.72rem', py: 0.3, borderRadius: 1.5 }}
              >
                Auto-fill {fm(totalOwed)}
              </Button>
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 0 }}>
            {/* Tenant */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small" error={!!errors.pg_tenant_id}>
                <InputLabel>Select Tenant *</InputLabel>
                <Select
                  value={form.pg_tenant_id} label="Select Tenant *"
                  onChange={e => handleTenantSelect(e.target.value)}
                  disabled={!!editPayment}
                >
                  {tenants.map(t => {
                    const hasDue = prevDues.some(d => String(d.id) === String(t.id));
                    return (
                      <MenuItem key={t.id} value={String(t.id)}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Typography sx={{ flex: 1, fontSize: '0.85rem' }}>
                            {t.name} — {t.room_number} ({fm(t.monthly_rent)}/mo)
                          </Typography>
                          {hasDue && (
                            <Chip label="PREV DUE" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: '0.62rem' }} />
                          )}
                          {t.payment_status === 'partial' && !hasDue && (
                            <Chip label="PARTIAL" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: '0.62rem' }} />
                          )}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
                {errors.pg_tenant_id && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#DC2626', mt: 0.5, ml: 1.5 }}>{errors.pg_tenant_id}</Typography>
                )}
              </FormControl>
            </Grid>

            {/* Quick-fill buttons when tenant selected */}
            {selectedTenant && (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mr: 0.5 }}>Quick fill:</Typography>
                  {isPartialTenant ? (
                    <>
                      <Chip
                        label={`Clear balance ${fm(balanceDueNum)}`}
                        size="small" clickable variant="outlined" color="warning"
                        onClick={() => { setForm(f => ({ ...f, amount: balanceDueNum })); setErrors(e => ({ ...e, amount: '' })); }}
                        sx={{ fontSize: '0.72rem' }}
                      />
                      {prevDueNum > 0 && (
                        <Chip
                          label={`Balance + prev due ${fm(balanceDueNum + prevDueNum)}`}
                          size="small" clickable variant="outlined" color="error"
                          onClick={() => { setForm(f => ({ ...f, amount: balanceDueNum + prevDueNum })); setErrors(e => ({ ...e, amount: '' })); }}
                          sx={{ fontSize: '0.72rem' }}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Chip
                        label={`Full rent ${fm(rentNum)}`}
                        size="small" clickable variant="outlined"
                        onClick={() => { setForm(f => ({ ...f, amount: rentNum })); setErrors(e => ({ ...e, amount: '' })); }}
                        sx={{ fontSize: '0.72rem' }}
                      />
                      {prevDueNum > 0 && (
                        <Chip
                          label={`Rent + prev due ${fm(totalOwed)}`}
                          size="small" clickable variant="outlined" color="warning"
                          onClick={() => { setForm(f => ({ ...f, amount: totalOwed })); setErrors(e => ({ ...e, amount: '' })); }}
                          sx={{ fontSize: '0.72rem' }}
                        />
                      )}
                      <Chip
                        label="Half rent"
                        size="small" clickable variant="outlined"
                        onClick={() => { setForm(f => ({ ...f, amount: Math.round(rentNum / 2) })); setErrors(e => ({ ...e, amount: '' })); }}
                        sx={{ fontSize: '0.72rem' }}
                      />
                    </>
                  )}
                </Box>
              </Grid>
            )}

            {/* Amount */}
            <Grid item xs={6}>
              <TextField
                fullWidth label="Amount Paid (₹) *" size="small" type="number"
                value={form.amount}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, amount: val }));
                  // Real-time overpayment check — clear error if within limit, set immediately if over
                  if (selectedTenant && !editPayment && val) {
                    const hardMax = (isPartialTenant ? balanceDueNum : rentNum) + prevDueNum;
                    if (safeNum(val) > hardMax) {
                      setErrors(er => ({
                        ...er,
                        amount: `Cannot exceed ${fm(hardMax)}${isPartialTenant ? ` — only ${fm(balanceDueNum)} balance left` : ''}`,
                      }));
                    } else {
                      setErrors(er => ({ ...er, amount: '' }));
                    }
                  } else {
                    setErrors(er => ({ ...er, amount: '' }));
                  }
                }}
                error={!!errors.amount}
                helperText={errors.amount || amountHelperText()}
                FormHelperTextProps={{ sx: { color: errors.amount ? '#DC2626' : amountHelperColor(), fontSize: '0.7rem' } }}
                inputProps={{
                  min: 1,
                  step: 1,
                  // Hard HTML max — browser enforces this on spin buttons
                  max: !editPayment && selectedTenant
                    ? (isPartialTenant ? balanceDueNum : rentNum) + prevDueNum
                    : undefined,
                }}
              />
            </Grid>

            {/* Payment date */}
            <Grid item xs={6}>
              <TextField
                fullWidth label="Payment Date *" size="small" type="date"
                InputLabelProps={{ shrink: true }}
                value={form.payment_date}
                onChange={e => { setForm(f => ({ ...f, payment_date: e.target.value })); setErrors(er => ({ ...er, payment_date: '' })); }}
                error={!!errors.payment_date}
                helperText={errors.payment_date}
              />
            </Grid>

            {/* Month (dropdown) */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" error={!!errors.month}>
                <InputLabel>Month *</InputLabel>
                <Select
                  value={form.month} label="Month *"
                  onChange={e => { setForm(f => ({ ...f, month: e.target.value })); setErrors(er => ({ ...er, month: '' })); }}
                >
                  {MONTH_OPTIONS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
                {errors.month && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#DC2626', mt: 0.5, ml: 1.5 }}>{errors.month}</Typography>
                )}
              </FormControl>
            </Grid>

            {/* Payment method */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" error={!!errors.payment_mode}>
                <InputLabel>Method *</InputLabel>
                <Select
                  value={form.payment_mode} label="Method *"
                  onChange={e => { setForm(f => ({ ...f, payment_mode: e.target.value })); setErrors(er => ({ ...er, payment_mode: '' })); }}
                >
                  {METHODS.map(m => (
                    <MenuItem key={m} value={m}>{METHOD_ICONS[m]} {METHOD_LABELS[m]}</MenuItem>
                  ))}
                </Select>
                {errors.payment_mode && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#DC2626', mt: 0.5, ml: 1.5 }}>{errors.payment_mode}</Typography>
                )}
              </FormControl>
            </Grid>

            {/* Transaction ref */}
            <Grid item xs={12}>
              <TextField
                fullWidth label="Transaction Reference" size="small"
                placeholder={form.payment_mode === 'upi' ? 'UPI transaction ID' : form.payment_mode === 'cheque' ? 'Cheque number' : 'Optional reference'}
                value={form.transaction_ref}
                onChange={e => setForm(f => ({ ...f, transaction_ref: e.target.value }))}
              />
            </Grid>

            {/* Status (edit only) */}
            {editPayment && (
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select value={form.status} label="Status" onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {['settled', 'pending', 'failed'].map(s => (
                      <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Notes */}
            <Grid item xs={12}>
              <TextField fullWidth label="Notes" size="small" multiline rows={2}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>

          {/* Summary box */}
          {selectedTenant && form.amount && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', mb: 0.8 }}>Payment Summary</Typography>
              {isPartialTenant ? (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>Monthly rent</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{fm(rentNum)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.4 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#059669' }}>Already paid</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669' }}>{fm(rentNum - balanceDueNum)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.4 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#D97706' }}>Remaining balance</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#D97706' }}>{fm(balanceDueNum)}</Typography>
                  </Box>
                </>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>Monthly rent</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{fm(rentNum)}</Typography>
                </Box>
              )}
              {prevDueNum > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.4 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#DC2626' }}>Previous month balance</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#DC2626' }}>{fm(prevDueNum)}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.4 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>Paying now</Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{fm(amountNum)}</Typography>
              </Box>
              <Divider sx={{ my: 0.8 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: balance > 0 ? '#D97706' : '#059669' }}>
                  {balance > 0 ? 'Still owing after payment' : 'Status'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: balance > 0 ? '#D97706' : '#059669' }}>
                  {balance > 0 ? `${fm(balance)} remaining` : '✓ Fully settled'}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius: 2, flex: 1 }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} sx={{ borderRadius: 2, flex: 2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : editPayment ? 'Save Changes' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── DELETE CONFIRMATION DIALOG ── */}
      <Dialog
        open={deleteConfirmOpen} onClose={handleDeleteCancel} maxWidth="xs" fullWidth
        keepMounted={false} TransitionProps={{ onExited: () => setDeleteTarget(null) }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#DC2626' }}>Delete Payment</Typography>
          <IconButton onClick={handleDeleteCancel} size="small" disabled={deleting}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {deleteErr && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteErr}</Alert>}
          {deleteTarget && (
            <Box>
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-icon': { alignItems: 'center' } }}>
                This action is <strong>permanent</strong> and cannot be undone.
              </Alert>
              <Box sx={{ bgcolor: '#F9FAFB', borderRadius: 2, p: 2, border: '1px solid #E5E7EB' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>Receipt</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#1B3A6B' }}>{deleteTarget.receipt_number}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>Tenant</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{deleteTarget.tenant_name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>Month</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{deleteTarget.month || '—'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>Amount</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#DC2626' }}>
                    {fm(deleteTarget.paid_amount || deleteTarget.amount)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>Date</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{fmtDate(deleteTarget.payment_date)}</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.78rem', color: '#6B7280', mt: 1.5 }}>
                Deleting this record will also revert the tenant's payment status back to <strong>due</strong>.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={handleDeleteCancel} variant="outlined" disabled={deleting} sx={{ borderRadius: 2, flex: 1 }}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm} variant="contained" disabled={deleting}
            sx={{ borderRadius: 2, flex: 2, bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } }}
          >
            {deleting
              ? <CircularProgress size={20} color="inherit" />
              : `Yes, delete ${deleteTarget ? fm(deleteTarget.paid_amount || deleteTarget.amount) : ''}`
            }
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}