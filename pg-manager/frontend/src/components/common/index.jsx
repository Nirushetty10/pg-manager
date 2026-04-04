import { Box, Card, CardContent, Typography, Button, LinearProgress } from '@mui/material';
import { Add } from '@mui/icons-material';

export function StatCard({ icon, title, value, subtitle, trend, trendLabel, color = '#1B3A6B', bgColor = '#EEF2FF', progress }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</Box>
          {trendLabel && (
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1.5, bgcolor: trend >= 0 ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: trend >= 0 ? '#065F46' : '#991B1B' }}>{trendLabel}</Typography>
            </Box>
          )}
        </Box>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, color: '#1A1F36', lineHeight: 1.1, mb: 0.4 }}>{value}</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: '0.78rem', color: '#9CA3AF', mt: 0.4 }}>{subtitle}</Typography>}
        {progress !== undefined && (
          <LinearProgress variant="determinate" value={progress} sx={{ mt: 1.5, height: 5, borderRadius: 3, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: color } }} />
        )}
      </CardContent>
    </Card>
  );
}

export function PageHeader({ title, subtitle, action, actionLabel, onAction }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#1A1F36', mb: 0.3 }}>{title}</Typography>
        {subtitle && <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>{subtitle}</Typography>}
      </Box>
      {(actionLabel || action) && (action || (
        <Button variant="contained" startIcon={<Add />} onClick={onAction} sx={{ whiteSpace: 'nowrap', px: 2.5 }}>
          {actionLabel}
        </Button>
      ))}
    </Box>
  );
}

export function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
      <Box sx={{ fontSize: 52, mb: 2 }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#1A1F36' }}>{title}</Typography>
      <Typography sx={{ color: '#6B7280', mb: 3, maxWidth: 360, mx: 'auto', fontSize: '0.875rem' }}>{description}</Typography>
      {actionLabel && <Button variant="contained" startIcon={<Add />} onClick={onAction}>{actionLabel}</Button>}
    </Box>
  );
}
