import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Avatar, Divider, useMediaQuery, useTheme, IconButton, AppBar, Toolbar } from '@mui/material';
import { Dashboard, People, Logout, Business, Menu as MenuIcon } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

const W = 230;
const NAV = [
  { label: 'Dashboard', icon: <Dashboard />, path: '/admin' },
  { label: 'Owners', icon: <People />, path: '/admin/owners' },
];

export default function MasterLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 2, background: 'linear-gradient(135deg,#DC2626,#B91C1C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Business sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        <Box>
          <Typography sx={{ fontFamily: '"Sora",sans-serif', fontWeight: 800, fontSize: '0.85rem', color: '#1A1F36', lineHeight: 1.2 }}>PG MANAGER</Typography>
          <Typography sx={{ fontSize: '0.62rem', color: '#DC2626', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Master Admin</Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ px: 1.5, pt: 1.5, flex: 1 }}>
        {NAV.map(item => {
          const active = item.path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton onClick={() => { navigate(item.path); setMobileOpen(false); }} sx={{ borderRadius: 2, px: 2, py: 1, bgcolor: active ? '#FEE2E2' : 'transparent', color: active ? '#DC2626' : '#6B7280', '&:hover': { bgcolor: '#FEF2F2', color: '#DC2626' } }}>
                <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 700 : 500 }} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#F9FAFB', mb: 1 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#DC2626', fontSize: '0.8rem' }}>{user?.name?.charAt(0)}</Avatar>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }} noWrap>{user?.name}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 700 }}>Master Admin</Typography>
          </Box>
        </Box>
        <ListItemButton onClick={logout} sx={{ borderRadius: 2, color: '#6B7280', '&:hover': { bgcolor: '#FEF2F2', color: '#DC2626' } }}>
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
              <Typography sx={{ fontWeight: 700, color: '#DC2626', flex: 1 }}>Master Admin</Typography>
            </Toolbar>
          </AppBar>
        )}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }} className="fade-in"><Outlet /></Box>
      </Box>
    </Box>
  );
}
