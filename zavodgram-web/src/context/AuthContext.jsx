import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, usersApi, setTokens, clearTokens, setAuthCallback, getAccessToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    clearTokens();
    disconnectSocket();
    setUser(null);
  }, []);

  // On mount — check existing token
  useEffect(() => {
    setAuthCallback(logout);
    const token = getAccessToken();
    if (token) {
      usersApi.me()
        .then((u) => {
          setUser(u);
          connectSocket();
        })
        .catch(() => clearTokens())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [logout]);

  const login = async (phone, password) => {
    const data = await authApi.login(phone, password);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    connectSocket();
    return data.user;
  };

  const register = async (formData) => {
    const data = await authApi.register(formData);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    connectSocket();
    return data.user;
  };

  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
