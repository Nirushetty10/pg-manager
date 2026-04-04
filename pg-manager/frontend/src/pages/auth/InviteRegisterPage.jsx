import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import { Business } from '@mui/icons-material';
import { authAPI } from '../../services/api';

export default function InviteRegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return; }
    authAPI.validateInvite(token)
      .then(r => setInvite(r.data.invite))
      .catch(() => setError('Invalid or expired invite link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setSaving(true);
    try {
      await authAPI.registerOwner({ token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally { setSaving(false); }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0D1F3C,#1B3A6B)', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 400, borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: 2, background: 'linear-gradient(135deg,#1B3A6B,#2952A3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Business sx={{ color: '#fff', fontSize: 22 }} />
            </Box>
            <Typography sx={{ fontFamily: '"Sora",sans-serif', fontWeight: 800, color: '#1B3A6B' }}>PG MANAGER</Typography>
          </Box>

          {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box> :
           done ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 40, mb: 2 }}>✅</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Account created!</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>Redirecting to login...</Typography>
            </Box>
           ) : error && !invite ? (
            <Alert severity="error">{error}</Alert>
           ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Create your account</Typography>
              {invite && <Typography sx={{ color: '#6B7280', fontSize: '0.875rem', mb: 2.5 }}>Welcome, {invite.name}! Set a password to get started.</Typography>}
              {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
              <Box component="form" onSubmit={handleSubmit}>
                <TextField fullWidth label="Email" size="small" value={invite?.email || ''} disabled sx={{ mb: 2 }} />
                <TextField fullWidth label="Password" type="password" size="small" value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} required />
                <TextField fullWidth label="Confirm Password" type="password" size="small" value={confirm} onChange={e => setConfirm(e.target.value)} sx={{ mb: 3 }} required />
                <Button fullWidth type="submit" variant="contained" size="large" disabled={saving} sx={{ py: 1.4, borderRadius: 2.5 }}>
                  {saving ? <CircularProgress size={22} color="inherit" /> : 'Create Account'}
                </Button>
              </Box>
            </>
           )}
        </CardContent>
      </Card>
    </Box>
  );
}
