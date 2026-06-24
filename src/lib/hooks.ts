"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

/** Minimal data-loading hook with loading/error/refetch. */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Something went wrong.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  return { data, loading, error, refetch: run };
}

/**
 * Redirects unauthenticated users to /login?callbackUrl=…; optionally enforces
 * a role. Returns { ready } once the auth check has settled and access is OK.
 */
export function useRequireAuth(options?: { role?: "ADMIN" | "BUYER"; callbackUrl?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const cb = options?.callbackUrl
        ? `?callbackUrl=${encodeURIComponent(options.callbackUrl)}`
        : "";
      router.replace(`/login${cb}`);
      return;
    }
    if (options?.role && user.role !== options.role) {
      // Wrong role → send to their home.
      router.replace(user.role === "ADMIN" ? "/admin" : "/");
      return;
    }
    setReady(true);
  }, [user, loading, router, options?.role, options?.callbackUrl]);

  return { ready, user };
}
