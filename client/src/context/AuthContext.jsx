import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);

  const fetchPermissions = async () => {
    try {
      const res = await axiosInstance.get('/auth/permissions');
      setPermissions(res.data.data?.permissions || []);
    } catch {
      setPermissions([]);
    }
  };

  useEffect(() => {
    if (token) {
      axiosInstance
        .get('/auth/me')
        .then((res) => {
          setUser(res.data.data);
          return fetchPermissions();
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
          setPermissions([]);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (credentials) => {
    const res = await axiosInstance.post('/auth/login', credentials);
    const { token: newToken, user: newUser } = res.data.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    // Fetch permissions immediately after login
    try {
      const permRes = await axiosInstance.get('/auth/permissions', {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      setPermissions(permRes.data.data?.permissions || []);
    } catch {
      setPermissions([]);
    }
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setPermissions([]);
  };

  const hasPermission = useCallback(
    (key) => permissions.includes(key),
    [permissions]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      isAuthenticated: !!user,
      role: user?.roleId?.name || user?.role || null,
      permissions,
      hasPermission,
    }),
    [user, token, loading, permissions, hasPermission]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
