import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('pg_user')); } catch { return null; } });
  const [activePgId, setActivePgId] = useState(() => localStorage.getItem('pg_active_pg') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pg_token');
    if (!token) { setLoading(false); return; }
    authAPI.getMe()
      .then(r => { setUser(r.data.user); localStorage.setItem('pg_user', JSON.stringify(r.data.user)); })
      .catch(() => { localStorage.clear(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const { token, user, pgs, requirePGSelect, defaultPgId } = res.data;
    localStorage.setItem('pg_token', token);
    localStorage.setItem('pg_user', JSON.stringify(user));
    setUser(user);
    if (defaultPgId) { localStorage.setItem('pg_active_pg', defaultPgId); setActivePgId(defaultPgId); }
    return { user, pgs, requirePGSelect, defaultPgId };
  };

  const logout = () => { localStorage.clear(); setUser(null); setActivePgId(null); };

  const selectPG = useCallback((pgId) => {
    localStorage.setItem('pg_active_pg', pgId);
    setActivePgId(pgId);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, activePgId, selectPG }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
