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

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /**
   * Has the auth layer reported at all yet? Until it has, "no user" means
   * "not known", not "signed out" — screens must not act on it.
   */
  authKnown: boolean;
  /**
   * Is the auth layer holding a signed-in user, whether or not their profile
   * has arrived? This is the only honest basis for showing a sign-in screen:
   * when it is true, the person did not sign out, so they must not be asked
   * to sign in again.
   */
  firebaseSignedIn: boolean;
  /**
   * Signed in, but the profile still hasn't loaded after a long wait — the
   * network is the problem. Screens can offer a retry instead of pretending
   * to be busy forever.
   */
  profileStalled: boolean;
  /** Email/password sign-in (mock/demo mode). */
  login: (credentials: { email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<User>;
  /** Re-read the signed-in user's profile (after phone OTP / shop setup). */
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authKnown, setAuthKnown] = useState(false);
  const [firebaseSignedIn, setFirebaseSignedIn] = useState(false);
  const [profileStalled, setProfileStalled] = useState(false);

  // No client-side caching of the session — Firebase Auth (subscribeAuth)
  // is the sole source of truth for who's signed in, backed by Firestore for
  // the profile itself. This trades an instant optimistic paint for never
  // risking a stale/incorrect cached identity.
  const persist = useCallback((next: User | null) => {
    setUser(next);
  }, []);

  // Is the auth layer holding a user? Answered locally and instantly, so it
  // is known long before the profile read finishes.
  useEffect(() => {
    if (!api.subscribeAuthPresence) {
      setAuthKnown(true);
      return;
    }
    return api.subscribeAuthPresence((signedIn) => {
      setFirebaseSignedIn(signedIn);
      setAuthKnown(true);
      // Signed out at the auth layer is the one thing that definitely ends
      // the session — clear immediately rather than waiting on a profile read
      // that will never come.
      if (!signedIn) {
        persist(null);
        setLoading(false);
        setProfileStalled(false);
      }
    });
  }, [persist]);

  useEffect(() => {
    if (api.subscribeAuth) {
      const unsub = api.subscribeAuth((next) => {
        persist(next);
        setLoading(false);
        setProfileStalled(false);
      });
      return unsub;
    }

    setLoading(false);
    setAuthKnown(true);
  }, [persist]);

  // The old safety net cleared `loading` after 9s with a null user, which the
  // rest of the app reads as "signed out" — so a slow profile read on mobile
  // data showed the sign-in screen to somebody who never signed out. It could
  // even fire before the read it was waiting on could finish. Now it only
  // releases the loader when NOBODY is signed in; if somebody is, the wait is
  // reported as a stalled network so a screen can offer a retry, and the
  // subscription keeps trying underneath.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (firebaseSignedIn) setProfileStalled(true);
      else setLoading(false);
    }, 9000);
    return () => clearTimeout(t);
  }, [loading, firebaseSignedIn]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      if (api.login) {
        const u = await api.login(credentials);
        persist(u);
        return u;
      }
      throw new Error("Email/password sign-in is not available on this backend.");
    },
    [persist]
  );

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
      authKnown,
      firebaseSignedIn,
      profileStalled,
      login,
      logout,
      updateProfile,
      refreshUser,
    }),
    [
      user,
      loading,
      authKnown,
      firebaseSignedIn,
      profileStalled,
      login,
      logout,
      updateProfile,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
