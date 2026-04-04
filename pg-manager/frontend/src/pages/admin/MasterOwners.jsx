import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, TextField, Avatar, Table, TableHead, TableRow, TableCell, TableBody, TablePagination, InputAdornment, Chip, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Tabs, Tab } from '@mui/material';
import { Search, Add, Close, ContentCopy, Check } from '@mui/icons-material';
import { masterAPI, authAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';
import { PageHeader } from '../../components/common';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-';

export default function MasterOwners() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await masterAPI.getOwners({ search, status: statusFilter === 'all' ? undefined : statusFilter, page: page+1, limit: 15 });
      setOwners(res.data.owners); setTotal(res.data.total);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleClose = () => { if(saving) return; setDialogOpen(false); };
  const handleExited = () => { setForm({ name:'', email:'', phone:'' }); setFormError(''); setInviteLink(''); setCopied(false); };

  const handleInvite = async () => {
    setFormError('');
    if (!form.name || !form.email || !form.phone) return setFormError('All fields required');
    setSaving(true);
    try {
      const res = await authAPI.inviteOwner(form);
      const link = `${window.location.origin}/invite/owner?token=${res.data.token}`;
      setInviteLink(link);
      fetch();
    } catch(e) { setFormError(e.response?.data?.message || 'Failed to send invite'); }
    finally { setSaving(false); }
  };

  const handleCopy = () => { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleToggle = async (id, e) => {
    e.stopPropagation();
    await masterAPI.toggleOwnerStatus(id);
    fetch();
  };

  return (
    <Box>
      <PageHeader title="Owners" subtitle="Manage all PG owners on the platform." actionLabel="Invite Owner" onAction={() => setDialogOpen(true)} />

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 2.5, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E7EB' }}>
            <TextField size="small" placeholder="Search owners..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} sx={{ width: 240 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 17, color: '#9CA3AF' }} /></InputAdornment> }} />
            <Tabs value={statusFilter} onChange={(_, v) => { setStatusFilter(v); setPage(0); }} sx={{ '& .MuiTab-root': { fontSize: '0.82rem', fontWeight: 600, minHeight: 40, py: 0 } }}>
              {['all','active','inactive'].map(t => <Tab key={t} label={t.charAt(0).toUpperCase()+t.slice(1)} value={t} />)}
            </Tabs>
          </Box>

          {loading ? <Box sx={{ display:'flex', justifyContent:'center', py:6 }}><CircularProgress /></Box> : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Owner','Phone','No. of PGs','Status','Joined','Actions'].map(h => <TableCell key={h}>{h}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {owners.map(o => (
                    <TableRow key={o.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/owners/${o.id}`)}>
                      <TableCell>
                        <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                          <Avatar sx={{ width:36, height:36, bgcolor:'#1B3A6B', fontSize:'0.85rem' }}>{o.name?.charAt(0)}</Avatar>
                          <Box>
                            <Typography sx={{ fontWeight:600, fontSize:'0.875rem' }}>{o.name}</Typography>
                            <Typography sx={{ fontSize:'0.75rem', color:'#6B7280' }}>{o.email}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>{o.phone}</TableCell>
                      <TableCell><Chip label={`${o.pg_count} PGs`} size="small" sx={{ fontWeight:700, fontSize:'0.72rem', bgcolor:'#EEF2FF', color:'#1B3A6B' }} /></TableCell>
                      <TableCell><StatusChip status={o.invite_accepted ? (o.is_active ? 'active' : 'inactive') : 'pending'} /></TableCell>
                      <TableCell>{fmtDate(o.created_at)}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={e => handleToggle(o.id, e)}
                          sx={{ fontSize:'0.72rem', borderRadius:1.5, color: o.is_active ? '#DC2626' : '#059669', borderColor: o.is_active ? '#FCA5A5' : '#6EE7B7' }}>
                          {o.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {owners.length === 0 && <TableRow><TableCell colSpan={6} sx={{ textAlign:'center', py:5, color:'#9CA3AF' }}>No owners found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box sx={{ px:2, py:1, borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>Showing {owners.length} of {total} owners</Typography>
            <TablePagination component="div" count={total} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={15} rowsPerPageOptions={[]} sx={{ border:'none' }} />
          </Box>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth keepMounted={false} TransitionProps={{ onExited: handleExited }} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography sx={{ fontWeight:700 }}>Invite New Owner</Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{formError}</Alert>}
          {inviteLink ? (
            <Box>
              <Alert severity="success" sx={{ mb:2, borderRadius:2 }}>Invite created! Share this link with the owner.</Alert>
              <Box sx={{ p:2, bgcolor:'#F9FAFB', borderRadius:2, border:'1px solid #E5E7EB', wordBreak:'break-all', fontSize:'0.78rem', color:'#374151', mb:2 }}>{inviteLink}</Box>
              <Button fullWidth variant="outlined" startIcon={copied ? <Check /> : <ContentCopy />} onClick={handleCopy} sx={{ borderRadius:2 }}>
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ display:'flex', flexDirection:'column', gap:2, mt:0.5 }}>
              <TextField fullWidth label="Full Name *" size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <TextField fullWidth label="Email *" size="small" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <TextField fullWidth label="Phone *" size="small" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </Box>
          )}
        </DialogContent>
        {!inviteLink && (
          <DialogActions sx={{ px:3, pb:3, gap:1 }}>
            <Button onClick={handleClose} variant="outlined" disabled={saving} sx={{ borderRadius:2, flex:1 }}>Cancel</Button>
            <Button onClick={handleInvite} variant="contained" disabled={saving} sx={{ borderRadius:2, flex:2 }}>
              {saving ? <CircularProgress size={20} color="inherit" /> : 'Send Invite'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}
