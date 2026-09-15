'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api';
import type { AuthUser, UserRole } from './types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    });
    tokenStore.set(response.accessToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      // Server-side authorization is authoritative; this only hides controls.
      can: (...roles: UserRole[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
