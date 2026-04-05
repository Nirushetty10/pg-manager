import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Grid, Card, CardContent, Typography, LinearProgress, CircularProgress, Avatar, Chip, Divider } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { KingBed, People, AttachMoney, Warning, CheckCircle, TrendingDown } from '@mui/icons-material';
import { pgAPI } from '../../services/api';

const fm = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
const pct = (a,b) => b>0 ? Math.round(a/b*100) : 0;

export default function DashboardPage() {
  const { pgId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pgAPI(pgId).getDashboard().then(r => setData(r.data)).catch(console.error).finally(()=>setLoading(false));
  }, [pgId]);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', pt:8 }}><CircularProgress /></Box>;
  if (!data) return null;

  const { stats={}, revenueChart=[], expenseChart=[], expenseStats=[], bedByFloor=[], paymentStatus={}, duetenants=[] } = data;
  const occupancyPct = pct(stats.occupied_beds, stats.total_beds);
  const collectedPct = pct(stats.collected_mtd, stats.total_monthly_rent);

  const chartData = revenueChart.map(r => {
    const e = expenseChart.find(x=>x.month===r.month);
    return { month:r.month, Income:parseFloat(r.income||0), Expense:parseFloat(e?.expense||0) };
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight:800, mb:0.5 }}>Dashboard</Typography>
      <Typography sx={{ color:'#6B7280', fontSize:'0.875rem', mb:3 }}>Your PG at a glance</Typography>

      {/* Row 1: Key metrics */}
      <Grid container spacing={2} sx={{ mb:2.5 }}>
        {/* Occupancy */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ display:'flex', justifyContent:'space-between', mb:1.5 }}>
              <Box sx={{ width:42, height:42, borderRadius:2.5, bgcolor:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <KingBed sx={{ color:'#1B3A6B', fontSize:22 }} />
              </Box>
              <Chip label={`${occupancyPct}%`} size="small" sx={{ fontWeight:800, bgcolor: occupancyPct>=80?'#D1FAE5':'#FEF3C7', color: occupancyPct>=80?'#065F46':'#92400E', fontSize:'0.75rem' }} />
            </Box>
            <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Bed Occupancy</Typography>
            <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2 }}>{stats.occupied_beds}<Typography component="span" sx={{ fontSize:'1rem', color:'#6B7280', fontWeight:500 }}>/{stats.total_beds}</Typography></Typography>
            <LinearProgress variant="determinate" value={occupancyPct} sx={{ mt:1.5, height:5, borderRadius:3, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor: occupancyPct>=80?'#059669':'#1B3A6B' } }} />
            <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.5 }}>{stats.vacant_beds} beds vacant</Typography>
          </CardContent></Card>
        </Grid>

        {/* Tenants */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ width:42, height:42, borderRadius:2.5, bgcolor:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', mb:1.5 }}>
              <People sx={{ color:'#059669', fontSize:22 }} />
            </Box>
            <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Tenants</Typography>
            <Typography sx={{ fontSize:'1.8rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2 }}>{stats.active_tenants}</Typography>
            <Box sx={{ display:'flex', gap:1, mt:1 }}>
              <Chip label={`${stats.pending_tenants} pending`} size="small" sx={{ bgcolor:'#FEF3C7', color:'#92400E', fontWeight:600, fontSize:'0.68rem' }} />
            </Box>
            <Box sx={{ display:'flex', gap:1, mt:1, flexWrap:'wrap' }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:0.4 }}><Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor:'#059669' }} /><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{paymentStatus.paid||0} paid</Typography></Box>
              <Box sx={{ display:'flex', alignItems:'center', gap:0.4 }}><Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor:'#D97706' }} /><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{paymentStatus.partial||0} partial</Typography></Box>
              <Box sx={{ display:'flex', alignItems:'center', gap:0.4 }}><Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor:'#DC2626' }} /><Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{paymentStatus.due||0} due</Typography></Box>
            </Box>
          </CardContent></Card>
        </Grid>

        {/* Rent collected */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ width:42, height:42, borderRadius:2.5, bgcolor:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', mb:1.5 }}>
              <AttachMoney sx={{ color:'#D97706', fontSize:22 }} />
            </Box>
            <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Rent Collection (MTD)</Typography>
            <Typography sx={{ fontSize:'1.6rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2 }}>{fm(stats.collected_mtd)}</Typography>
            <LinearProgress variant="determinate" value={collectedPct} sx={{ mt:1.2, height:5, borderRadius:3, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor:'#D97706' } }} />
            <Typography sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.5 }}>of {fm(stats.total_monthly_rent)} expected · {collectedPct}%</Typography>
          </CardContent></Card>
        </Grid>

        {/* Expenses */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ width:42, height:42, borderRadius:2.5, bgcolor:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', mb:1.5 }}>
              <TrendingDown sx={{ color:'#DC2626', fontSize:22 }} />
            </Box>
            <Typography sx={{ fontSize:'0.7rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Expenses (MTD)</Typography>
            <Typography sx={{ fontSize:'1.6rem', fontWeight:800, color:'#1A1F36', lineHeight:1.2 }}>{fm(stats.expenses_mtd)}</Typography>
            {expenseStats.slice(0,2).map(e => (
              <Typography key={e.category} sx={{ fontSize:'0.72rem', color:'#9CA3AF', mt:0.3, textTransform:'capitalize' }}>{e.category}: {fm(e.total)}</Typography>
            ))}
          </CardContent></Card>
        </Grid>
      </Grid>

      {/* Row 2: Chart + Floor occupancy + Due tenants */}
      <Grid container spacing={2.5}>
        {/* Revenue chart */}
        <Grid item xs={12} lg={7}>
          <Card><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:0.3 }}>Monthly Revenue vs Expenses</Typography>
            <Typography sx={{ fontSize:'0.78rem', color:'#6B7280', mb:2 }}>Last 6 months</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v=>[fm(v)]} contentStyle={{ borderRadius:8, border:'1px solid #E5E7EB' }} />
                <Bar dataKey="Income" fill="#1B3A6B" radius={[5,5,0,0]} />
                <Bar dataKey="Expense" fill="#FCA5A5" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </Grid>

        {/* Floor occupancy */}
        <Grid item xs={12} sm={6} lg={2.5}>
          <Card sx={{ height:'100%' }}><CardContent sx={{ p:2.5 }}>
            <Typography sx={{ fontWeight:700, mb:2, fontSize:'0.9rem' }}>Floor-wise Vacancy</Typography>
            {bedByFloor.length === 0 && <Typography sx={{ color:'#9CA3AF', fontSize:'0.82rem' }}>No data</Typography>}
            {bedByFloor.map(f => {
              const p = f.total>0 ? Math.round(f.occupied/f.total*100) : 0;
              return (
                <Box key={f.floor} sx={{ mb:1.5 }}>
                  <Box sx={{ display:'flex', justifyContent:'space-between', mb:0.4 }}>
                    <Typography sx={{ fontSize:'0.82rem', fontWeight:600 }}>Floor {f.floor}</Typography>
                    <Typography sx={{ fontSize:'0.78rem', color:'#6B7280' }}>{f.occupied}/{f.total}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={p}
                    sx={{ height:6, borderRadius:3, bgcolor:'#E5E7EB', '& .MuiLinearProgress-bar':{ bgcolor: p>=90?'#DC2626':p>=70?'#D97706':'#059669' } }} />
                </Box>
              );
            })}
          </CardContent></Card>
        </Grid>

        {/* Due tenants */}
        <Grid item xs={12} sm={6} lg={2.5}>
          <Card sx={{ height:'100%', border:'1px solid #FCA5A5', bgcolor:'#FFF5F5' }}><CardContent sx={{ p:2.5 }}>
            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}>
              <Warning sx={{ color:'#DC2626', fontSize:18 }} />
              <Typography sx={{ fontWeight:700, fontSize:'0.9rem', color:'#DC2626' }}>Pending Rent</Typography>
            </Box>
            {duetenants.length === 0 ? (
              <Box sx={{ textAlign:'center', py:2 }}><CheckCircle sx={{ fontSize:32, color:'#059669', mb:0.5 }} /><Typography sx={{ fontSize:'0.82rem', color:'#059669', fontWeight:600 }}>All paid!</Typography></Box>
            ) : duetenants.map(t => (
              <Box key={t.id||t.name} sx={{ mb:1.2, p:1, borderRadius:1.5, bgcolor:'#fff', border:'1px solid #FCA5A5' }}>
                <Box sx={{ display:'flex', justifyContent:'space-between' }}>
                  <Typography sx={{ fontSize:'0.8rem', fontWeight:600 }} noWrap>{t.name}</Typography>
                  <Chip label={t.payment_status} size="small" sx={{ bgcolor: t.payment_status==='partial'?'#FEF3C7':'#FEE2E2', color: t.payment_status==='partial'?'#92400E':'#991B1B', fontWeight:700, fontSize:'0.62rem', height:18 }} />
                </Box>
                <Typography sx={{ fontSize:'0.72rem', color:'#6B7280' }}>{t.room_number} · {fm(t.monthly_rent)}</Typography>
              </Box>
            ))}
          </CardContent></Card>
        </Grid>
      </Grid>
    </Box>
  );
}
