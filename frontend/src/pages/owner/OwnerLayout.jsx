import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Avatar, Divider, useMediaQuery, useTheme, IconButton, AppBar, Toolbar, Select, MenuItem, FormControl, Chip } from '@mui/material';
import { Dashboard, People, KingBed, AccountBalanceWallet, Receipt, AdminPanelSettings, Logout, Menu as MenuIcon, Business, SwapHoriz } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ownerAPI } from '../../services/api';

const W = 240;

export default function OwnerLayout() {
  const { user, logout, activePgId, selectPG } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pgId } = useParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pgs, setPgs] = useState([]);

  useEffect(() => {
    if (user?.role === 'owner') {
      ownerAPI.getPGs().then(r => setPgs(r.data)).catch(() => {});
    }
  }, [user]);

  const navItems = [
    { label: 'Dashboard', icon: <Dashboard />, path: `/pg/${pgId}` },
    { label: 'Tenants', icon: <People />, path: `/pg/${pgId}/tenants` },
    { label: 'Rooms & Beds', icon: <KingBed />, path: `/pg/${pgId}/rooms` },
    { label: 'Payments', icon: <AccountBalanceWallet />, path: `/pg/${pgId}/payments` },
    { label: 'Expenses', icon: <Receipt />, path: `/pg/${pgId}/expenses` },
  ];

  const handlePGSwitch = (id) => { selectPG(id); navigate(`/pg/${id}`); };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 2, background: 'linear-gradient(135deg,#1B3A6B,#2952A3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Business sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Typography sx={{ fontFamily: '"Sora",sans-serif', fontWeight: 800, fontSize: '0.82rem', color: '#1A1F36', lineHeight: 1.2 }}>PG MANAGER</Typography>
          <Typography sx={{ fontSize: '0.62rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Premium Living</Typography>
        </Box>
      </Box>

      {/* PG Switcher (owners with multiple PGs) */}
      {user?.role === 'owner' && pgs.length > 1 && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <FormControl fullWidth size="small">
            <Select value={pgId || ''} onChange={e => handlePGSwitch(e.target.value)}
              sx={{ fontSize: '0.82rem', fontWeight: 600, borderRadius: 2, bgcolor: '#F9FAFB' }}
              startAdornment={<SwapHoriz sx={{ fontSize: 16, color: '#6B7280', mr: 0.5 }} />}>
              {pgs.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.82rem' }}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      )}

      <Divider />

      {/* Nav */}
      <List sx={{ px: 1.5, pt: 1.5, flex: 1 }}>
        {navItems.map(item => {
          const active = item.path === `/pg/${pgId}` ? location.pathname === item.path : location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.4 }}>
              <ListItemButton onClick={() => { navigate(item.path); setMobileOpen(false); }}
                sx={{ borderRadius: 2, px: 2, py: 1, bgcolor: active ? '#EEF2FF' : 'transparent', color: active ? '#1B3A6B' : '#6B7280', '&:hover': { bgcolor: '#F5F7FF', color: '#1B3A6B' } }}>
                <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 700 : 500 }} />
                {active && <Box sx={{ width: 3, height: 18, borderRadius: 2, bgcolor: '#1B3A6B' }} />}
              </ListItemButton>
            </ListItem>
          );
        })}

        {/* Admin Panel - only for owner */}
        {user?.role === 'owner' && (() => {
          const active = location.pathname === `/pg/${pgId}/admin`;
          return (
            <ListItem disablePadding sx={{ mt: 1 }}>
              <ListItemButton onClick={() => { navigate(`/pg/${pgId}/admin`); setMobileOpen(false); }}
                sx={{ borderRadius: 2, px: 2, py: 1, bgcolor: active ? '#FEE2E2' : 'transparent', color: active ? '#DC2626' : '#6B7280', '&:hover': { bgcolor: '#FEF2F2', color: '#DC2626' }, border: '1px solid', borderColor: active ? '#FCA5A5' : 'transparent' }}>
                <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><AdminPanelSettings /></ListItemIcon>
                <ListItemText primary="Admin Panel" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 700 : 600 }} />
              </ListItemButton>
            </ListItem>
          );
        })()}
      </List>

      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#F9FAFB', mb: 0.5 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#1B3A6B', fontSize: '0.8rem' }}>{user?.name?.charAt(0)}</Avatar>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }} noWrap>{user?.name}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'capitalize' }}>{user?.role}</Typography>
          </Box>
        </Box>
        <ListItemButton onClick={logout} sx={{ borderRadius: 2, color: '#6B7280', py: 0.8, '&:hover': { bgcolor: '#FEF2F2', color: '#DC2626' } }}>
          <ListItemIcon sx={{ minWidth: 30, color: 'inherit' }}><Logout sx={{ fontSize: 18 }} /></ListItemIcon>
          <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.82rem' }} />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {!isMobile && <Drawer variant="permanent" sx={{ width: W, '& .MuiDrawer-paper': { width: W } }}>{drawer}</Drawer>}
      {isMobile && <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ '& .MuiDrawer-paper': { width: W } }}>{drawer}</Drawer>}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <AppBar position="static" elevation={0} sx={{ bgcolor: '#fff', borderBottom: '1px solid #E5E7EB' }}>
            <Toolbar>
              <IconButton onClick={() => setMobileOpen(true)} sx={{ color: '#1A1F36', mr: 1 }}><MenuIcon /></IconButton>
              <Typography sx={{ fontWeight: 700, color: '#1B3A6B', flex: 1 }}>PG Manager</Typography>
            </Toolbar>
          </AppBar>
        )}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }} className="fade-in"><Outlet /></Box>
      </Box>
    </Box>
  );
}
