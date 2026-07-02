"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@/lib/types";
import { api } from "@/lib/api";

const SESSION_KEY = "freshkart.session.v1";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<User>;
  /** Re-read the signed-in user's profile (after phone OTP / shop setup). */
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((next: User | null) => {
    setUser(next);
    try {
      if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Restore session. With a backend that manages auth state (Firebase), that
  // subscription is the source of truth; localStorage gives an instant
  // optimistic paint while it settles. Otherwise localStorage is authoritative.
  useEffect(() => {
    let hydrated: User | null = null;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) hydrated = JSON.parse(raw) as User;
    } catch {
      /* ignore */
    }
    if (hydrated) setUser(hydrated);

    if (api.subscribeAuth) {
      // Safety net: never let a stalled backend read pin the app on a loader.
      const safety = setTimeout(() => setLoading(false), 9000);
      const unsub = api.subscribeAuth((next) => {
        persist(next);
        setLoading(false);
        clearTimeout(safety);
      });
      return () => {
        clearTimeout(safety);
        unsub();
      };
    }

    setLoading(false);
  }, [persist]);

  const logout = useCallback(async () => {
    try {
      await api.logout?.();
    } finally {
      persist(null);
    }
  }, [persist]);

  const updateProfile = useCallback(
    async (patch: Partial<User>) => {
      if (!user) throw new Error("Not signed in");
      const u = await api.updateProfile(user.id, patch);
      persist(u);
      return u;
    },
    [persist, user]
  );

  const refreshUser = useCallback(async () => {
    if (!api.getCurrentUser) return user;
    try {
      const u = await api.getCurrentUser();
      persist(u);
      return u;
    } catch {
      // A transient read failure shouldn't break the sign-in flow.
      return user;
    }
  }, [persist, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isAdmin: user?.role === "ADMIN",
      logout,
      updateProfile,
      refreshUser,
    }),
    [user, loading, logout, updateProfile, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
