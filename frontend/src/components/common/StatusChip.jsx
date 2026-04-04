import { Chip } from '@mui/material';
const MAP = {
  active:      { label: 'Active',      bg: '#D1FAE5', color: '#065F46' },
  paid:        { label: 'Paid',        bg: '#D1FAE5', color: '#065F46' },
  settled:     { label: 'Settled',     bg: '#D1FAE5', color: '#065F46' },
  available:   { label: 'Available',   bg: '#D1FAE5', color: '#065F46' },
  resolved:    { label: 'Resolved',    bg: '#D1FAE5', color: '#065F46' },
  pending:     { label: 'Pending',     bg: '#FEF3C7', color: '#92400E' },
  processing:  { label: 'Processing',  bg: '#FEF3C7', color: '#92400E' },
  assigned:    { label: 'Assigned',    bg: '#FEF3C7', color: '#92400E' },
  overdue:     { label: 'Overdue',     bg: '#FEE2E2', color: '#991B1B' },
  failed:      { label: 'Failed',      bg: '#FEE2E2', color: '#991B1B' },
  vacated:     { label: 'Vacated',     bg: '#F3F4F6', color: '#374151' },
  inactive:    { label: 'Inactive',    bg: '#F3F4F6', color: '#374151' },
  occupied:    { label: 'Occupied',    bg: '#DBEAFE', color: '#1E40AF' },
  maintenance: { label: 'Maintenance', bg: '#EDE9FE', color: '#5B21B6' },
  open:        { label: 'Open',        bg: '#FEE2E2', color: '#991B1B' },
  urgent:      { label: 'Urgent',      bg: '#FEE2E2', color: '#991B1B' },
  high:        { label: 'High',        bg: '#FEF3C7', color: '#92400E' },
  normal:      { label: 'Normal',      bg: '#F3F4F6', color: '#374151' },
  low:         { label: 'Low',         bg: '#F3F4F6', color: '#6B7280' },
  trial:       { label: 'Trial',       bg: '#FEF3C7', color: '#92400E' },
  expired:     { label: 'Expired',     bg: '#FEE2E2', color: '#991B1B' },
};
export default function StatusChip({ status, size = 'small' }) {
  const cfg = MAP[status?.toLowerCase()] || { label: status?.toUpperCase() || '-', bg: '#F3F4F6', color: '#374151' };
  return <Chip label={cfg.label} size={size} sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.69rem', height: 22, border: 'none' }} />;
}
