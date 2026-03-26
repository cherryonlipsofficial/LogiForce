import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({
    user: null,
    token: localStorage.getItem('token') || null,
    permissions: [],
    isAdmin: false,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setState(s => ({ ...s, isLoading: false }));
      return;
    }
    axiosInstance.get('/auth/me')
      .then(res => {
        const { user, permissions, isAdmin } = res.data.data;
        setState({
          user,
          token,
          permissions: permissions || [],
          isAdmin: !!isAdmin,
          isAuthenticated: true,
          isLoading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem('token');
        setState({ user: null, token: null, permissions: [],
                   isAdmin: false, isAuthenticated: false, isLoading: false });
      });
  }, []);

  const login = async (credentials) => {
    const res = await axiosInstance.post('/auth/login', credentials);
    const { token, user, permissions, isAdmin } = res.data.data;
    localStorage.setItem('token', token);
    setState({ user, token, permissions: permissions || [],
               isAdmin: !!isAdmin, isAuthenticated: true, isLoading: false });
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setState({ user: null, token: null, permissions: [],
               isAdmin: false, isAuthenticated: false, isLoading: false });
  };

  const hasPermission = useCallback(
    (key) => {
      if (state.isAdmin) return true;
      return state.permissions.includes(key);
    },
    [state.permissions, state.isAdmin]
  );

  const value = useMemo(
    () => ({
      user: state.user,
      token: state.token,
      loading: state.isLoading,
      isLoading: state.isLoading,
      isAdmin: state.isAdmin,
      login,
      logout,
      isAuthenticated: state.isAuthenticated,
      role: state.user?.roleId?.name || state.user?.role || null,
      permissions: state.permissions,
      hasPermission,
    }),
    [state, hasPermission]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
