import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { pgAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PermContext = createContext({ can: () => true });

export const PermissionsProvider = ({ pgId, children }) => {
  const { user } = useAuth();
  const [perms, setPerms] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!pgId || user?.role === 'owner' || user?.role === 'master_admin') {
      // Owners and master admins have all permissions
      setLoaded(true);
      return;
    }
    pgAPI(pgId).getPermissions()
      .then(r => {
        const map = {};
        r.data.forEach(p => {
          if (!map[p.permission]) map[p.permission] = {};
          map[p.permission] = { view: p.can_view, create: p.can_create };
        });
        setPerms(map);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [pgId, user?.role]);

  // can('manage_tenants', 'view') or can('manage_tenants', 'create')
  const can = useCallback((permission, action = 'view') => {
    if (user?.role === 'owner' || user?.role === 'master_admin') return true;
    if (!loaded) return false;
    const p = perms[permission];
    if (!p) return false;
    if (action === 'create') return p.create;
    return p.view;
  }, [perms, loaded, user?.role]);

  return <PermContext.Provider value={{ can, loaded, perms }}>{children}</PermContext.Provider>;
};

export const usePermissions = () => useContext(PermContext);
