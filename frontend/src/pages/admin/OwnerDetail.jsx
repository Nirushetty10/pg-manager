import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, Avatar, Grid, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Chip, Dialog, DialogTitle, DialogContent, IconButton, LinearProgress } from '@mui/material';
import { ArrowBack, Business, People, KingBed, Close, CheckCircle, Cancel } from '@mui/icons-material';
import { masterAPI } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-';

export default function OwnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPG, setSelectedPG] = useState(null);

  useEffect(() => {
    masterAPI.getOwnerById(id).then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', pt:8 }}><CircularProgress /></Box>;
  if (!data) return <Typography>Owner not found</Typography>;

  const { owner, pgs } = data;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/owners')} sx={{ mb:2, color:'#6B7280', fontWeight:600 }}>Back to Owners</Button>

      <Grid container spacing={2.5} sx={{ mb:3 }}>
        {/* Owner Info */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:2, mb:2 }}>
                <Avatar sx={{ width:52, height:52, bgcolor:'#1B3A6B', fontSize:'1.2rem' }}>{owner.name?.charAt(0)}</Avatar>
                <Box>
                  <Typography sx={{ fontWeight:700, fontSize:'1rem' }}>{owner.name}</Typography>
                  <StatusChip status={owner.is_active ? 'active' : 'inactive'} />
                </Box>
              </Box>
              {[
                { label: 'Email', value: owner.email },
                { label: 'Phone', value: owner.phone },
                { label: 'Member Since', value: fmtDate(owner.created_at) },
                { label: 'Total PGs', value: pgs.length },
              ].map(r => (
                <Box key={r.label} sx={{ display:'flex', justifyContent:'space-between', mb:1, py:0.8, borderBottom:'1px solid #F3F4F6' }}>
                  <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{r.label}</Typography>
                  <Typography sx={{ fontSize:'0.82rem', fontWeight:600 }}>{r.value}</Typography>
                </Box>
              ))}
              <Button fullWidth variant="outlined" sx={{ mt:2, borderRadius:2, fontSize:'0.82rem', color: owner.is_active ? '#DC2626' : '#059669', borderColor: owner.is_active ? '#FCA5A5' : '#6EE7B7' }}
                onClick={async () => { await masterAPI.toggleOwnerStatus(id); const r = await masterAPI.getOwnerById(id); setData(r.data); }}>
                {owner.is_active ? 'Deactivate Owner' : 'Activate Owner'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* PGs Summary */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Typography sx={{ fontWeight:700, mb:2 }}>PG Properties</Typography>
              <Box sx={{ overflowX:'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {['PG Name','City','Rooms','Beds','Active Tenants','Status','Subscription'].map(h => <TableCell key={h}>{h}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pgs.map(pg => (
                      <TableRow key={pg.id} hover sx={{ cursor:'pointer' }} onClick={() => setSelectedPG(pg)}>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                            <Business sx={{ fontSize:16, color:'#6B7280' }} />
                            <Typography sx={{ fontWeight:600, fontSize:'0.875rem' }}>{pg.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{pg.city || '-'}</TableCell>
                        <TableCell>{pg.total_rooms}</TableCell>
                        <TableCell>{pg.total_beds}</TableCell>
                        <TableCell>
                          <Chip label={pg.active_tenants || 0} size="small" sx={{ bgcolor:'#EEF2FF', color:'#1B3A6B', fontWeight:700, fontSize:'0.72rem' }} />
                        </TableCell>
                        <TableCell><StatusChip status={pg.is_active ? 'active' : 'inactive'} /></TableCell>
                        <TableCell><StatusChip status={pg.subscription_status || 'active'} /></TableCell>
                      </TableRow>
                    ))}
                    {pgs.length === 0 && <TableRow><TableCell colSpan={7} sx={{ textAlign:'center', py:4, color:'#9CA3AF' }}>No PGs yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* PG Details Modal */}
      <Dialog open={!!selectedPG} onClose={() => setSelectedPG(null)} maxWidth="sm" fullWidth keepMounted={false} PaperProps={{ sx: { borderRadius:3 } }}>
        <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <Business sx={{ color:'#1B3A6B' }} />
            <Typography sx={{ fontWeight:700 }}>{selectedPG?.name}</Typography>
          </Box>
          <IconButton onClick={() => setSelectedPG(null)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb:3 }}>
          {selectedPG && (
            <Grid container spacing={2}>
              {[
                { title:'Basic Info', items:[
                  { label:'City', value: selectedPG.city },
                  { label:'Address', value: selectedPG.address || '-' },
                  { label:'Created', value: fmtDate(selectedPG.created_at) },
                ]},
                { title:'Capacity', items:[
                  { label:'Total Rooms', value: selectedPG.total_rooms },
                  { label:'Total Beds', value: selectedPG.total_beds },
                  { label:'Occupied Beds', value: selectedPG.occupied_beds || 0 },
                  { label:'Vacant Beds', value: selectedPG.vacant_beds || 0 },
                ]},
                { title:'Tenants', items:[
                  { label:'Total Tenants', value: selectedPG.total_tenants || 0 },
                  { label:'Active', value: selectedPG.active_tenants || 0 },
                  { label:'Vacated', value: selectedPG.vacated_tenants || 0 },
                ]},
              ].map(section => (
                <Grid item xs={12} sm={6} key={section.title}>
                  <Typography sx={{ fontWeight:700, fontSize:'0.82rem', color:'#1B3A6B', textTransform:'uppercase', letterSpacing:'0.06em', mb:1 }}>{section.title}</Typography>
                  <Box sx={{ p:1.5, bgcolor:'#F9FAFB', borderRadius:2 }}>
                    {section.items.map(item => (
                      <Box key={item.label} sx={{ display:'flex', justifyContent:'space-between', mb:0.8 }}>
                        <Typography sx={{ fontSize:'0.82rem', color:'#6B7280' }}>{item.label}</Typography>
                        <Typography sx={{ fontSize:'0.82rem', fontWeight:600 }}>{item.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Typography sx={{ fontWeight:700, fontSize:'0.82rem', color:'#1B3A6B', textTransform:'uppercase', letterSpacing:'0.06em', mb:1 }}>Occupancy</Typography>
                <Box sx={{ p:1.5, bgcolor:'#F9FAFB', borderRadius:2 }}>
                  <Box sx={{ display:'flex', justifyContent:'space-between', mb:1 }}>
                    <Typography sx={{ fontSize:'0.82rem' }}>Beds</Typography>
                    <Typography sx={{ fontSize:'0.82rem', fontWeight:700 }}>{selectedPG.occupied_beds || 0}/{selectedPG.total_beds}</Typography>
                  </Box>
                  <LinearProgress variant="determinate"
                    value={selectedPG.total_beds > 0 ? (selectedPG.occupied_beds / selectedPG.total_beds) * 100 : 0}
                    sx={{ height:8, borderRadius:4, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar': { background:'linear-gradient(90deg,#1B3A6B,#2952A3)' } }}
                  />
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
