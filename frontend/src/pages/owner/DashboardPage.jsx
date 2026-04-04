// ── DASHBOARD ─────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Grid, Card, CardContent, Typography, Button, Avatar, LinearProgress, Chip, CircularProgress, IconButton } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KingBed, AttachMoney, Warning, Build, MoreVert, AccessTime, CheckCircle } from '@mui/icons-material';
import { pgAPI } from '../../services/api';
import { StatCard } from '../../components/common';
import StatusChip from '../../components/common/StatusChip';
import { useAuth } from '../../context/AuthContext';

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-';
const timeAgo = (ts) => { const s = Math.floor((Date.now()-new Date(ts))/1000); if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };

export default function DashboardPage() {
  const { pgId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const api = pgAPI(pgId);

  useEffect(() => {
    api.getDashboard().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [pgId]);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', pt:8 }}><CircularProgress /></Box>;
  const { stats={}, revenueChart=[], expenseChart=[], recentTenants=[], maintenance=[], roomAvailability=[] } = data || {};

  const chartData = revenueChart.map(r => {
    const e = expenseChart.find(x => x.month === r.month);
    return { month: r.month, Income: parseFloat(r.income||0), Expense: parseFloat(e?.expense||0) };
  });
  const occupancyPct = stats.total_beds > 0 ? Math.round(stats.occupied_beds/stats.total_beds*100) : 0;
  const typeLabel = { single:'Single', double:'Double Shared', triple:'Triple', deluxe:'Deluxe Suites' };

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight:800 }}>Dashboard</Typography>
          <Typography sx={{ color:'#6B7280', fontSize:'0.875rem' }}>Welcome back, {user?.name?.split(' ')[0]} 👋</Typography>
        </Box>
      </Box>

      <Grid container spacing={2.5} sx={{ mb:3 }}>
        <Grid item xs={6} lg={3}><StatCard icon={<KingBed />} title="Total Occupancy" value={`${occupancyPct}%`} progress={occupancyPct} trendLabel="+2% this month" trend={1} color="#1B3A6B" bgColor="#EEF2FF" /></Grid>
        <Grid item xs={6} lg={3}><StatCard icon={<AttachMoney />} title="Rent Collected (MTD)" value={fmtMoney(stats.rent_collected)} color="#059669" bgColor="#D1FAE5" /></Grid>
        <Grid item xs={6} lg={3}><StatCard icon={<Warning />} title="Pending Tenants" value={String(stats.pending_tenants||0).padStart(2,'0')} subtitle="Awaiting room assignment" color="#D97706" bgColor="#FEF3C7" /></Grid>
        <Grid item xs={6} lg={3}><StatCard icon={<Build />} title="Maintenance" value={String(stats.open_maintenance||0).padStart(2,'0')} subtitle={stats.urgent_maintenance > 0 ? `${stats.urgent_maintenance} urgent` : 'All clear'} color="#DC2626" bgColor="#FEE2E2" /></Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent sx={{ p:2.5 }}>
              <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
                <Box><Typography sx={{ fontWeight:700 }}>Monthly Revenue</Typography><Typography sx={{ fontSize:'0.78rem', color:'#6B7280' }}>Income vs Expenses</Typography></Box>
                <Box sx={{ display:'flex', gap:1 }}>
                  {[{l:'Income',c:'#1B3A6B'},{l:'Expense',c:'#F3F4F6',tc:'#374151'}].map(t => <Chip key={t.l} label={t.l} size="small" sx={{ bgcolor:t.c, color:t.tc||'#fff', fontWeight:600, fontSize:'0.75rem' }} />)}
                </Box>
              </Box>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={v => [fmtMoney(v)]} contentStyle={{ borderRadius:8, border:'1px solid #E5E7EB', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }} />
                  <Bar dataKey="Income" fill="#1B3A6B" radius={[5,5,0,0]} />
                  <Bar dataKey="Expense" fill="#E5E7EB" radius={[5,5,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Grid container spacing={2.5} sx={{ height:'100%' }}>
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p:2.5 }}>
                  <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}>
                    <Build sx={{ fontSize:16, color:'#D97706' }} />
                    <Typography sx={{ fontWeight:700, fontSize:'0.82rem', textTransform:'uppercase', letterSpacing:'0.07em' }}>Maintenance Desk</Typography>
                  </Box>
                  {maintenance.length === 0 ? (
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}><CheckCircle sx={{ color:'#059669', fontSize:16 }} /><Typography sx={{ fontSize:'0.82rem', color:'#059669' }}>All clear!</Typography></Box>
                  ) : maintenance.map(m => (
                    <Box key={m.id} sx={{ mb:1.5, p:1.5, borderRadius:2, borderLeft:`3px solid ${m.priority==='urgent'?'#DC2626':'#D97706'}`, bgcolor: m.priority==='urgent'?'#FEF2F2':'#FFFBF5' }}>
                      <Box sx={{ display:'flex', justifyContent:'space-between', mb:0.4 }}>
                        <Typography sx={{ fontSize:'0.78rem', fontWeight:700, color:m.priority==='urgent'?'#DC2626':'#D97706' }}>{m.room_number||'Common Area'}</Typography>
                        <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                          <AccessTime sx={{ fontSize:12, color:'#9CA3AF' }} />
                          <Typography sx={{ fontSize:'0.68rem', color:'#9CA3AF' }}>{timeAgo(m.created_at)}</Typography>
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize:'0.82rem', mb:1 }}>{m.title}</Typography>
                      <Box sx={{ display:'flex', gap:1 }}>
                        <Button size="small" variant="contained" sx={{ fontSize:'0.68rem', py:0.3, px:1.5, borderRadius:1.5 }}>Assign</Button>
                        <Button size="small" variant="outlined" sx={{ fontSize:'0.68rem', py:0.3, px:1.5, borderRadius:1.5 }}>Ignore</Button>
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p:2.5 }}>
                  <Typography sx={{ fontWeight:700, fontSize:'0.82rem', textTransform:'uppercase', letterSpacing:'0.07em', mb:2 }}>Room Availability</Typography>
                  {roomAvailability.map(r => (
                    <Box key={r.room_type} sx={{ mb:1.5 }}>
                      <Box sx={{ display:'flex', justifyContent:'space-between', mb:0.5 }}>
                        <Typography sx={{ fontSize:'0.82rem' }}>{typeLabel[r.room_type]||r.room_type}</Typography>
                        <Typography sx={{ fontSize:'0.82rem', fontWeight:700, color:'#1B3A6B' }}>{r.occupied}/{r.total}</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={r.total>0?(r.occupied/r.total)*100:0}
                        sx={{ height:5, borderRadius:3, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar': { background: parseInt(r.occupied)===parseInt(r.total)?'linear-gradient(90deg,#DC2626,#EF4444)':'linear-gradient(90deg,#1B3A6B,#2952A3)' } }}
                      />
                    </Box>
                  ))}
                  <Button fullWidth variant="outlined" size="small" sx={{ mt:1, borderRadius:2 }} onClick={() => navigate(`/pg/${pgId}/rooms`)}>Detailed Room Report</Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Card sx={{ mt:2.5 }}>
        <CardContent sx={{ p:2.5 }}>
          <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
            <Typography sx={{ fontWeight:700 }}>Recent Tenants</Typography>
            <Button size="small" sx={{ fontWeight:600 }} onClick={() => navigate(`/pg/${pgId}/tenants`)}>View All</Button>
          </Box>
          <Box sx={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>{['Tenant','Room/Bed','Joined','Status'].map(h => <th key={h} style={{ textAlign:'left', padding:'8px 14px', fontSize:'0.7rem', fontWeight:700, color:'#6B7280', letterSpacing:'0.07em', textTransform:'uppercase', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {recentTenants.map(t => (
                  <tr key={t.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'11px 14px' }}>
                      <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                        <Avatar sx={{ width:32, height:32, bgcolor:'#1B3A6B', fontSize:'0.78rem' }}>{t.name?.charAt(0)}</Avatar>
                        <Box><Typography sx={{ fontSize:'0.85rem', fontWeight:600 }}>{t.name}</Typography><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{t.phone}</Typography></Box>
                      </Box>
                    </td>
                    <td style={{ padding:'11px 14px' }}><Typography sx={{ fontSize:'0.85rem', fontWeight:600 }}>{t.room_number||'—'}{t.bed_label?`-${t.bed_label}`:''}</Typography></td>
                    <td style={{ padding:'11px 14px' }}><Typography sx={{ fontSize:'0.82rem' }}>{fmtDate(t.joining_date)}</Typography></td>
                    <td style={{ padding:'11px 14px' }}><StatusChip status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
