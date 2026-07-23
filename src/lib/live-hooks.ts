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
  enabled: boolean
): LiveResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const runFetch = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    fetchRef
      .current()
      .then((items) => setData(items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    // Not ready yet (e.g. a buyer screen whose user id hasn't resolved) —
    // stay in the loading state rather than querying with a missing scope,
    // which a buyer's security rules would reject.
    if (!enabled) return;

    if (subscribeFn) {
      let active = true;
      setLoading(true);
      const unsubscribe = subscribeFn((items) => {
        if (!active) return;
        setData(items);
        setError(null);
        setLoading(false);
      });
      return () => {
        active = false;
        unsubscribe();
      };
    }
    runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, refetch: runFetch };
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
    enabled
  );
}

/** Live support tickets for a buyer or all tickets (admin). */
export function useLiveSupportTickets(buyerId?: string, enabled = true): LiveResult<SupportTicket> {
  const canSubscribe = typeof api.subscribeSupportTickets === "function";
  return useLiveList<SupportTicket>(
    canSubscribe ? (cb) => api.subscribeSupportTickets!(buyerId, cb) : null,
    () => api.listSupportTickets(buyerId),
    [buyerId],
    enabled
  );
}
