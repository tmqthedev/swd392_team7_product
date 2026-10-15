import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getMe, postLogin, postLogout } from '../services/authApi';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // `user` holds the server session (incl. uppercase role) or null when signed
  // out. `loading` stays true until the initial /auth/me resolves so routes can
  // avoid redirecting before the session is known.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getMe();
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const login = useCallback(
    async (identifier, password) => {
      await postLogin(identifier, password);
      return refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await postLogout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};
