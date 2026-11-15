import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrf, setCsrf] = useState(null);
  const [keyUnlocked, setKeyUnlocked] = useState(true);
  const [booted, setBooted] = useState(false);

  const apply = useCallback((data) => {
    setUser(data.user);
    setCsrf(data.csrfToken);
    setCsrfToken(data.csrfToken);
    setKeyUnlocked(Boolean(data.keyUnlocked));
    return data;
  }, []);

  useEffect(() => {
    api('/auth/me', { skipAuthEvent: true })
      .then((data) => apply(data))
      .catch(() => {})
      .finally(() => setBooted(true));
  }, [apply]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setCsrf(null);
      setCsrfToken(null);
    };
    window.addEventListener('sf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sf:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuthEvent: true,
      });
      return apply(data);
    },
    [apply]
  );

  const register = useCallback(
    async (username, email, password) => {
      const data = await api('/auth/register', {
        method: 'POST',
        body: { username, email, password },
        skipAuthEvent: true,
      });
      return apply(data);
    },
    [apply]
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', skipAuthEvent: true });
    } catch {
      /* session already gone */
    } finally {
      setUser(null);
      setCsrf(null);
      setCsrfToken(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await api('/auth/me', { skipAuthEvent: true });
    return apply(data);
  }, [apply]);

  const value = useMemo(
    () => ({ user, csrf, keyUnlocked, booted, login, register, logout, refresh }),
    [user, csrf, keyUnlocked, booted, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
