"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { Order, OrderStatus } from "@/lib/types";

interface TrackedOrder {
  order: Order;
  currentStage: number;
  confirmed: boolean;
  dismissed: boolean;
  startedAt: number;
}

interface OrderTrackerContextValue {
  tracked: TrackedOrder | null;
  startTracking: (order: Order) => void;
  confirmOrder: () => void;
  dismissTracker: () => void;
  expandTracker: () => void;
  collapseTracker: () => void;
  isExpanded: boolean;
}

const OrderTrackerContext = createContext<OrderTrackerContextValue>({
  tracked: null,
  startTracking: () => {},
  confirmOrder: () => {},
  dismissTracker: () => {},
  expandTracker: () => {},
  collapseTracker: () => {},
  isExpanded: false,
});

const STATUS_FLOW: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
];

// Stage durations in seconds (for demo / simulation)
const STAGE_DURATIONS = [2, 3, 4, 5, 0]; // PENDING to CONFIRMED in 2s, etc.

export function OrderTrackerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tracked, setTracked] = useState<TrackedOrder | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance stages
  useEffect(() => {
    if (!tracked || tracked.confirmed || tracked.dismissed) return;

    const currentStatus = STATUS_FLOW[tracked.currentStage];
    if (currentStatus === "DELIVERED") return; // Done

    const durationMs = STAGE_DURATIONS[tracked.currentStage] * 1000;
    if (durationMs <= 0) return;

    timerRef.current = setTimeout(() => {
      setTracked((prev) => {
        if (!prev || prev.confirmed || prev.dismissed) return prev;
        const nextStage = Math.min(
          prev.currentStage + 1,
          STATUS_FLOW.length - 1
        );
        return { ...prev, currentStage: nextStage };
      });
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tracked?.currentStage, tracked?.confirmed, tracked?.dismissed]);

  const startTracking = useCallback((order: Order) => {
    setTracked({
      order,
      currentStage: 0, // Start at PENDING
      confirmed: false,
      dismissed: false,
      startedAt: Date.now(),
    });
    setIsExpanded(false);
  }, []);

  const confirmOrder = useCallback(() => {
    setTracked((prev) => (prev ? { ...prev, confirmed: true } : prev));
  }, []);

  const dismissTracker = useCallback(() => {
    setTracked((prev) => (prev ? { ...prev, dismissed: true } : prev));
    setIsExpanded(false);
  }, []);

  const expandTracker = useCallback(() => setIsExpanded(true), []);
  const collapseTracker = useCallback(() => setIsExpanded(false), []);

  return (
    <OrderTrackerContext.Provider
      value={{
        tracked,
        startTracking,
        confirmOrder,
        dismissTracker,
        expandTracker,
        collapseTracker,
        isExpanded,
      }}
    >
      {children}
    </OrderTrackerContext.Provider>
  );
}

export function useOrderTracker(): OrderTrackerContextValue {
  return useContext(OrderTrackerContext);
}

export { STATUS_FLOW, STAGE_DURATIONS };
