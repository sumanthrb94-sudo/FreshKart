"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { ReturnRequest } from "@/lib/returns";
import type { SupportTicket } from "@/lib/support-tickets";

interface LiveResult<T> {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Live list hook: subscribes via the backend's real-time channel when one
 *  exists (Firestore onSnapshot, or the mock store's in-memory pub/sub), so
 *  conversation threads built on top of it update the instant the other party
 *  writes — no reload, no manual refetch. Falls back to a one-shot fetch (with
 *  a working `refetch`) for backends that don't support subscriptions. Mirrors
 *  the `useAsync` return shape so callers swap in with almost no change. */
function useLiveList<T>(
  subscribeFn: ((cb: (items: T[]) => void) => () => void) | null,
  fetchFn: () => Promise<T[]>,
  deps: unknown[],
  enabled: boolean,
  pollMs = 0
): LiveResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const runFetch = useCallback((silent = false) => {
    if (!enabled) return;
    if (!silent) setLoading(true);
    setError(null);
    fetchRef
      .current()
      .then((items) => setData(items))
      .catch((e: unknown) => {
        if (!silent) setError(e instanceof Error ? e.message : "Something went wrong.");
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    // Not ready yet (e.g. a buyer screen whose user id hasn't resolved) —
    // stay in the loading state rather than querying with a missing scope,
    // which a buyer's security rules would reject.
    if (!enabled) return;

    let active = true;
    const cleanups: Array<() => void> = [];

    if (subscribeFn) {
      setLoading(true);
      const unsubscribe = subscribeFn((items) => {
        if (!active) return;
        setData(items);
        setError(null);
        setLoading(false);
      });
      cleanups.push(unsubscribe);
    } else {
      runFetch();
    }

    // Safety-net polling: even with a live subscription, real-time sockets can
    // silently drop (App Check, ad-blockers, mobile network churn, a stale tab
    // that lost focus). A quiet background re-fetch every `pollMs` guarantees a
    // conversation still catches up on its own — no manual refresh — regardless
    // of the subscription's health. `silent` avoids flashing a loading spinner.
    if (pollMs > 0) {
      const interval = setInterval(() => {
        if (active && document.visibilityState !== "hidden") runFetch(true);
      }, pollMs);
      cleanups.push(() => clearInterval(interval));
    }

    return () => {
      active = false;
      cleanups.forEach((c) => c());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, refetch: () => runFetch() };
}

/** Live returns for a buyer (buyerId set) or all returns (admin, buyerId
 *  omitted). Return-thread screens derive the single active thread from this
 *  live list by id, so it updates in real time. */
export function useLiveReturns(buyerId?: string, enabled = true): LiveResult<ReturnRequest> {
  const canSubscribe = typeof api.subscribeReturns === "function";
  return useLiveList<ReturnRequest>(
    canSubscribe ? (cb) => api.subscribeReturns!(buyerId, cb) : null,
    () => api.listReturns(buyerId),
    [buyerId],
    enabled,
    5000
  );
}

/** Live support tickets for a buyer or all tickets (admin). */
export function useLiveSupportTickets(buyerId?: string, enabled = true): LiveResult<SupportTicket> {
  const canSubscribe = typeof api.subscribeSupportTickets === "function";
  return useLiveList<SupportTicket>(
    canSubscribe ? (cb) => api.subscribeSupportTickets!(buyerId, cb) : null,
    () => api.listSupportTickets(buyerId),
    [buyerId],
    enabled,
    5000
  );
}
