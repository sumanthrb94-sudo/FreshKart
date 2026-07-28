"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { playChime } from "@/lib/audio-chime";
import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { SupportTicket } from "@/lib/support-tickets";

/** Live admin order/return/ticket counts, shared by the header badges AND
 *  the dashboard's Manage-tile badges via a single Firestore listener each —
 *  a plain ref-counted module singleton rather than React Context, because
 *  the dashboard renders its tile grid as a CHILD of AdminShell (which owns
 *  the header), so a Context provided inside AdminShell can never be an
 *  ancestor of a hook call made in the page component that renders
 *  AdminShell — it would always read the default value. A subscription
 *  singleton has no such tree-position requirement: any component, anywhere,
 *  gets the same live data and the same single underlying listener. Two
 *  independent listeners for the same event would also double-fire the
 *  new-order/new-return/cancellation chime, which this avoids by construction. */

/** New-order chime — pleasant ascending triad (C5 → E5 → G5), sine. */
function playNewOrderSound() {
  playChime([
    { freq: 523.25, startOffset: 0, duration: 0.4 },
    { freq: 659.25, startOffset: 0.12, duration: 0.4 },
    { freq: 783.99, startOffset: 0.24, duration: 0.4 },
  ]);
}

/** Order-cancelled alert — low descending square-wave buzz, unmistakably a
 *  negative event next to the two pleasant sine chimes above. */
function playOrderCancelledSound() {
  playChime([
    { freq: 392.0, startOffset: 0, duration: 0.22, type: "square", gain: 0.08 },
    { freq: 261.63, startOffset: 0.18, duration: 0.3, type: "square", gain: 0.08 },
  ]);
}

/** "New since last time you looked" baselines. In-memory only (no client
 *  storage) — this resets on a fresh page load/reopened tab, so an admin who
 *  reloads while new orders arrived won't hear a chime for those specific
 *  ones. The count itself is always correct regardless (read fresh on every
 *  load either way); this only affects the one-time celebratory chime for a
 *  backlog that arrived while nobody had a tab open, which is an acceptable
 *  trade-off to avoid any client-side persistence. */
const lastSeenTs: Record<string, number> = {};

function readLastSeenTs(key: string): number {
  return lastSeenTs[key] ?? 0;
}

function writeLastSeenTs(key: string, ts: number) {
  if (!ts) return;
  lastSeenTs[key] = ts;
}

const ORDERS_LAST_SEEN_KEY = "orders";

/** Generic ref-counted singleton subscription: the underlying Firestore
 *  listener starts on the first subscriber and stops on the last, however
 *  many components call the corresponding hook. */
function createLiveStore<TSnapshot>(
  start: (
    setSnapshot: (next: TSnapshot) => void
  ) => (() => void) | void,
  initialSnapshot: TSnapshot
) {
  let snapshot = initialSnapshot;
  let stop: (() => void) | void;
  let refCount = 0;
  const listeners = new Set<() => void>();

  function setSnapshot(next: TSnapshot) {
    snapshot = next;
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (refCount === 0) {
      stop = start(setSnapshot);
    }
    refCount++;
    return () => {
      listeners.delete(listener);
      refCount--;
      if (refCount === 0) {
        stop?.();
        stop = undefined;
        snapshot = initialSnapshot;
      }
    };
  }

  function getSnapshot() {
    return snapshot;
  }

  return { subscribe, getSnapshot };
}

interface OrdersSnapshot {
  confirmedOrders: Order[];
  isLive: boolean;
}

const ordersStore = createLiveStore<OrdersSnapshot>((setSnapshot) => {
  if (typeof api.subscribeOrders !== "function") {
    api
      .listOrders()
      .then((orders) => setSnapshot({ confirmedOrders: orders.filter((o) => o.status === "CONFIRMED"), isLive: false }))
      .catch(() => {});
    return;
  }

  let previousStatus: Map<string, Order["status"]> | null = null;
  const unsubscribe = api.subscribeOrders(undefined, (orders) => {
    const confirmedOrders = orders
      .filter((o) => o.status === "CONFIRMED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const prev = previousStatus;
    if (prev) {
      // This tab has been open since the last snapshot — diff in memory.
      const newOrders = orders.filter((o) => !prev.has(o.id));
      if (newOrders.length > 0) {
        playNewOrderSound();
        newOrders.forEach((o) => {
          toast.success("New order received!", `${o.businessName} — ${formatCurrency(o.total)}`, 5000);
        });
      }

      const newlyCancelled = orders.filter(
        (o) => o.status === "CANCELLED" && prev.get(o.id) && prev.get(o.id) !== "CANCELLED"
      );
      if (newlyCancelled.length > 0) {
        playOrderCancelledSound();
        newlyCancelled.forEach((o) => {
          toast.error("Order cancelled", `${o.businessName} — ${o.orderNumber}`, 5000);
        });
      }
    } else {
      // First snapshot since this subscription (re)started — e.g. right
      // after a page reload, where the in-memory baseline above is gone.
      // Fall back to the persisted "last seen" timestamp so orders that
      // arrived while nobody had the tab open still get a chime + toast
      // instead of silently vanishing into "just part of the count now".
      // A missing/zero timestamp means this is the very first time ever
      // (or storage is unavailable) — treat as an existing backlog, not a
      // pile of "new" orders to announce all at once.
      const lastSeenTs = readLastSeenTs(ORDERS_LAST_SEEN_KEY);
      if (lastSeenTs > 0) {
        const newSinceLastVisit = orders.filter((o) => new Date(o.createdAt).getTime() > lastSeenTs);
        if (newSinceLastVisit.length > 0) {
          playNewOrderSound();
          newSinceLastVisit.forEach((o) => {
            toast.success("New order received!", `${o.businessName} — ${formatCurrency(o.total)}`, 5000);
          });
        }
      }
    }
    previousStatus = new Map(orders.map((o) => [o.id, o.status]));

    const latestTs = orders.reduce((max, o) => Math.max(max, new Date(o.createdAt).getTime()), 0);
    writeLastSeenTs(ORDERS_LAST_SEEN_KEY, latestTs);

    setSnapshot({ confirmedOrders, isLive: true });
  });

  return unsubscribe;
}, { confirmedOrders: [], isLive: false });

export function useLiveOrders(): OrdersSnapshot {
  return useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, () => ({ confirmedOrders: [], isLive: false }));
}

const ticketsStore = createLiveStore<number>((setSnapshot) => {
  if (typeof api.subscribeSupportTickets !== "function") {
    api
      .listSupportTickets()
      .then((tickets) => setSnapshot(tickets.filter((t) => t.needsHuman).length))
      .catch(() => {});
    return;
  }

  const unsubscribe = api.subscribeSupportTickets(undefined, (tickets: SupportTicket[]) => {
    setSnapshot(tickets.filter((t) => t.needsHuman).length);
  });

  return unsubscribe;
}, 0);

export function useLiveNeedsHumanCount(): number {
  return useSyncExternalStore(ticketsStore.subscribe, ticketsStore.getSnapshot, () => 0);
}
