"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Truck,
  CheckCheck,
  ShoppingBag,
  ChefHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useOrderTracker, STATUS_FLOW, STAGE_DURATIONS } from "@/components/providers/OrderTrackerProvider";
import type { OrderStatus } from "@/lib/types";

const STAGE_META: Record<
  OrderStatus,
  { label: string; sub: string; icon: typeof Clock; color: string; bg: string }
> = {
  PENDING: {
    label: "Order Placed",
    sub: "Waiting for confirmation",
    icon: ShoppingBag,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  CONFIRMED: {
    label: "Confirmed",
    sub: "Your order is confirmed",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  PACKED: {
    label: "Preparing",
    sub: "Packing your items",
    icon: ChefHat,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  SHIPPED: {
    label: "On the Way",
    sub: "Delivery partner assigned",
    icon: Truck,
    color: "text-brand-500",
    bg: "bg-brand-500/10",
  },
  DELIVERED: {
    label: "Delivered",
    sub: "Enjoy your fresh produce!",
    icon: CheckCheck,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  CANCELLED: {
    label: "Cancelled",
    sub: "Order was cancelled",
    icon: CheckCheck,
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
};

export function OrderTracker() {
  const {
    tracked,
    confirmOrder,
    dismissTracker,
    expandTracker,
    collapseTracker,
    isExpanded,
  } = useOrderTracker();

  const [progress, setProgress] = useState(0);

  const currentStatus = tracked
    ? STATUS_FLOW[tracked.currentStage]
    : null;
  const meta = currentStatus ? STAGE_META[currentStatus] : null;

  useEffect(() => {
    if (!tracked || !currentStatus || currentStatus === "DELIVERED") {
      setProgress(100);
      return;
    }
    const duration = STAGE_DURATIONS[tracked.currentStage] * 1000;
    if (duration <= 0) {
      setProgress(100);
      return;
    }
    setProgress(0);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [tracked?.currentStage, currentStatus]);

  const etaText = useMemo(() => {
    if (!tracked || currentStatus === "DELIVERED") return "";
    const remainingStages = STATUS_FLOW.length - 1 - tracked.currentStage;
    const remainingSecs = STAGE_DURATIONS
      .slice(tracked.currentStage)
      .reduce((a, b) => a + b, 0);
    if (remainingStages <= 0) return "Arriving soon";
    return `${remainingSecs}s remaining`;
  }, [tracked, currentStatus]);

  if (!tracked || tracked.dismissed) return null;
  if (tracked.confirmed && currentStatus === "DELIVERED") return null;
  if (!meta) return null;

  const Icon = meta.icon;
  const totalItems = tracked.order.items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-app p-3">
      <div
        className={cn(
          "pointer-events-auto overflow-hidden rounded-2xl border border-line bg-surface shadow-cart-bar transition-all duration-300",
          isExpanded ? "max-h-[500px]" : "max-h-[88px]"
        )}
      >
        {/* Progress bar at top */}
        <div className="h-1 w-full bg-raised">
          <div
            className={cn(
              "h-full transition-all duration-100 ease-linear",
              currentStatus === "DELIVERED"
                ? "bg-emerald-500"
                : "bg-brand-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Collapsed view */}
        {!isExpanded && (
          <button
            onClick={expandTracker}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                meta.bg
              )}
            >
              <Icon className={cn("h-5 w-5", meta.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg">{meta.label}</p>
              <p className="text-xs text-fg-subtle">{meta.sub}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-fg-muted">
                {Math.round(progress)}%
              </span>
              <ChevronUp className="h-4 w-4 text-fg-subtle" />
            </div>
          </button>
        )}

        {/* Expanded view */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    meta.bg
                  )}
                >
                  <Icon className={cn("h-4 w-4", meta.color)} />
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">{meta.label}</p>
                  <p className="text-xs text-fg-subtle">{etaText}</p>
                </div>
              </div>
              <button
                onClick={collapseTracker}
                className="rounded-full p-1 text-fg-subtle hover:bg-raised"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Stage timeline */}
            <div className="relative mt-4 flex items-center">
              {STATUS_FLOW.map((status, i) => {
                const stageMeta = STAGE_META[status];
                const StageIcon = stageMeta.icon;
                const isActive = i === tracked.currentStage;
                const isDone = i < tracked.currentStage;
                return (
                  <div key={status} className="relative flex flex-1 flex-col items-center gap-1.5">
                    {/* Connector line */}
                    {i > 0 && (
                      <div
                        className={cn(
                          "absolute right-1/2 top-4 h-0.5 w-full",
                          isDone ? "bg-emerald-500" : "bg-line"
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActive
                          ? meta.bg + " " + meta.color + " ring-2 ring-brand-500/30"
                          : "bg-raised text-fg-subtle"
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <StageIcon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-center text-[9px] font-medium leading-tight",
                        isActive
                          ? "text-fg"
                          : isDone
                          ? "text-emerald-500"
                          : "text-fg-subtle"
                      )}
                    >
                      {stageMeta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Order summary */}
            <div className="mt-4 rounded-xl border border-line bg-raised p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg-muted">
                  {tracked.order.orderNumber}
                </span>
                <span className="text-sm font-bold text-fg">
                  {formatCurrency(tracked.order.total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {tracked.order.items.length} items &middot; {totalItems} units &middot;{" "}
                {tracked.order.paymentMethod}
              </p>
            </div>

            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              {currentStatus === "DELIVERED" && !tracked.confirmed ? (
                <button
                  onClick={confirmOrder}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
                >
                  <CheckCheck className="h-4 w-4" />
                  Confirm Delivery
                </button>
              ) : currentStatus === "DELIVERED" && tracked.confirmed ? (
                <button
                  onClick={dismissTracker}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={dismissTracker}
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-raised"
                  >
                    Hide
                  </button>
                  <div className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500/10 py-3 text-sm font-semibold text-brand-500">
                    <Clock className="h-4 w-4 animate-pulse" />
                    {meta.sub}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
