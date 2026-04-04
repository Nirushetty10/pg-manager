import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Grid, Card, CardContent, Typography, Avatar, Chip, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Button } from '@mui/material';
import { People, Business, KingBed, AttachMoney, TrendingUp } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { masterAPI } from '../../services/api';
import { StatCard } from '../../components/common';
import StatusChip from '../../components/common/StatusChip';

const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;

export default function MasterDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterAPI.getDashboard().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', pt: 8 }}><CircularProgress /></Box>;
  const { stats = {}, recentOwners = [], pgGrowth = [] } = data || {};

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Platform Overview</Typography>
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>Real-time stats across all PGs and owners</Typography>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><StatCard icon={<People />} title="Total Owners" value={stats.total_owners || 0} subtitle={`${stats.active_owners} active · ${stats.inactive_owners} inactive`} color="#1B3A6B" bgColor="#EEF2FF" trendLabel={`${stats.active_owners} active`} trend={1} /></Grid>
        <Grid item xs={6} md={3}><StatCard icon={<Business />} title="Total PGs" value={stats.total_pgs || 0} color="#059669" bgColor="#D1FAE5" /></Grid>
        <Grid item xs={6} md={3}><StatCard icon={<People />} title="Active Tenants" value={stats.active_tenants || 0} subtitle={`${stats.total_tenants} total`} color="#D97706" bgColor="#FEF3C7" /></Grid>
        <Grid item xs={6} md={3}><StatCard icon={<KingBed />} title="Bed Occupancy" value={`${stats.total_beds > 0 ? Math.round(stats.occupied_beds/stats.total_beds*100) : 0}%`} subtitle={`${stats.occupied_beds}/${stats.total_beds} beds filled`} color="#7C3AED" bgColor="#EDE9FE" progress={stats.total_beds > 0 ? stats.occupied_beds/stats.total_beds*100 : 0} /></Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 2 }}>PG Registrations (Last 6 Months)</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pgGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }} />
                  <Bar dataKey="new_pgs" name="New PGs" fill="#1B3A6B" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography sx={{ fontWeight: 700 }}>Recent Owners</Typography>
                <Button size="small" onClick={() => navigate('/admin/owners')} sx={{ fontWeight: 600 }}>View All</Button>
              </Box>
              {recentOwners.map(o => (
                <Box key={o.id} onClick={() => navigate(`/admin/owners/${o.id}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, p: 1.2, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: '#F9FAFB' } }}>
                  <Avatar sx={{ width: 34, height: 34, bgcolor: '#1B3A6B', fontSize: '0.85rem' }}>{o.name?.charAt(0)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }} noWrap>{o.name}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>{o.pg_count} PG{o.pg_count !== 1 ? 's' : ''} · {o.phone}</Typography>
                  </Box>
                  <StatusChip status={o.is_active ? 'active' : 'inactive'} />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
