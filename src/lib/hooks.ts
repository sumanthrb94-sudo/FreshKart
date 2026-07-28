"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { isTypingActive, TYPING_HEARTBEAT_MS } from "@/lib/typing-indicator";

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
 * Redirects unauthenticated users to the phone onboarding/sign-in flow;
 * optionally enforces a role. Returns { ready } once the auth check has settled
 * and access is OK.
 */
export function useRequireAuth(options?: { role?: "ADMIN" | "BUYER"; callbackUrl?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
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

/**
 * True while `lastTypingAt` (an ISO heartbeat timestamp) is fresh — see
 * lib/typing-indicator.ts for the TTL semantics. Re-evaluates on a 1s tick so
 * the indicator turns itself off once the heartbeat goes stale, even though
 * nothing about the underlying data changed (no new snapshot arrives just
 * because a clock advanced). The ticker only runs while a timestamp is
 * present, so an idle thread costs nothing.
 */
export function useTypingActive(lastTypingAt?: string): boolean {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!lastTypingAt) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [lastTypingAt]);
  return isTypingActive(lastTypingAt);
}

/**
 * Returns a `notifyTyping()` callback to fire from a composer's onChange.
 * Throttles to at most one `send()` call per TYPING_HEARTBEAT_MS regardless
 * of keystroke rate — the receiving side only needs "still typing, roughly
 * every couple seconds," not one write per keystroke. `send` is optional so
 * call sites can pass `api.setReturnTyping?.bind(...)` directly without a
 * feature-detection branch at every call site.
 */
export function useTypingHeartbeat(send?: () => void): () => void {
  const lastSentRef = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  return useCallback(() => {
    if (!sendRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_HEARTBEAT_MS) return;
    lastSentRef.current = now;
    sendRef.current();
  }, []);
}
