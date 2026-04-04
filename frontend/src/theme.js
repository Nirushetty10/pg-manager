import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary:    { main: '#1B3A6B', light: '#2952A3', dark: '#0D1F3C', contrastText: '#fff' },
    secondary:  { main: '#FF6B35', light: '#FF8C5A', dark: '#CC4E1F', contrastText: '#fff' },
    success:    { main: '#059669', light: '#10B981' },
    warning:    { main: '#D97706', light: '#F59E0B' },
    error:      { main: '#DC2626', light: '#EF4444' },
    background: { default: '#F5F6FA', paper: '#FFFFFF' },
    text:       { primary: '#1A1F36', secondary: '#6B7280' },
    divider:    '#E5E7EB',
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    h1: { fontFamily: '"Sora", sans-serif', fontWeight: 800 },
    h2: { fontFamily: '"Sora", sans-serif', fontWeight: 700 },
    h3: { fontFamily: '"Sora", sans-serif', fontWeight: 700 },
    h4: { fontWeight: 700, letterSpacing: '-0.3px' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 9, boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        containedPrimary: { background: 'linear-gradient(135deg, #1B3A6B 0%, #2952A3 100%)' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 7, fontWeight: 600, fontSize: '0.71rem' } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-root': { fontWeight: 700, fontSize: '0.71rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6B7280', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' } },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottom: '1px solid #F3F4F6', padding: '13px 16px', fontSize: '0.875rem' } },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 9, '& fieldset': { borderColor: '#E5E7EB' }, '&:hover fieldset': { borderColor: '#1B3A6B' } } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRight: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },
  },
});

export default theme;
