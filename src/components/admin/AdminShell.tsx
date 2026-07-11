"use client";

import Link from "next/link";
import { LogOut, ShieldCheck, Store, ShoppingBag, Radio, RotateCcw } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { api } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { NotificationBell } from "@/components/NotificationDrawer";

/** Web Audio API new-order chime — no external files needed. */
function playNewOrderSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Pleasant ascending chime (C5 → E5 → G5)
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.12, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch {
    // Audio not supported — silently ignore
  }
}

/** Web Audio API new-return alert — distinct descending tone. */
function playNewReturnSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Distinct descending alert (A5 → E5 → A4)
    [880.0, 659.25, 440.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.14, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.35);
    });
  } catch {
    // Audio not supported — silently ignore
  }
}

/** Hook for real-time order count + new-order alerts in admin header */
function useAdminOrderAlerts() {
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const previousIds = useRef<Set<string>>(new Set());
  const hasInit = useRef(false);

  useEffect(() => {
    if (typeof api.subscribeOrders !== "function") {
      // HTTP backend — not live
      api.listOrders()
        .then((orders) => {
          setConfirmedCount(orders.filter((o) => o.status === "CONFIRMED").length);
        })
        .catch(() => {});
      return;
    }

    setIsLive(true);
    const unsubscribe = api.subscribeOrders(undefined, (orders) => {
      setConfirmedCount(orders.filter((o) => o.status === "CONFIRMED").length);

      if (hasInit.current) {
        const currentIds = new Set(orders.map((o) => o.id));
        const newOrders = orders.filter((o) => !previousIds.current.has(o.id));
        if (newOrders.length > 0) {
          playNewOrderSound();
          newOrders.forEach((o) => {
            toast.success(
              "New order received!",
              `${o.businessName} — ${formatCurrency(o.total)}`,
              5000
            );
          });
        }
        previousIds.current = currentIds;
      } else {
        previousIds.current = new Set(orders.map((o) => o.id));
        hasInit.current = true;
      }
    });

    return () => unsubscribe();
  }, []);

  return { confirmedCount, isLive };
}

/** Hook for real-time pending-return count + new-return alerts in admin header */
function useAdminReturnAlerts() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const previousIds = useRef<Set<string>>(new Set());
  const hasInit = useRef(false);

  useEffect(() => {
    if (typeof api.subscribeReturns !== "function") {
      // HTTP / mock backend — not live
      api.listReturns()
        .then((returns) => {
          setPendingCount(returns.filter((r) => r.status === "REQUESTED").length);
        })
        .catch(() => {});
      return;
    }

    setIsLive(true);
    const unsubscribe = api.subscribeReturns(undefined, (returns) => {
      setPendingCount(returns.filter((r) => r.status === "REQUESTED").length);

      if (hasInit.current) {
        const currentIds = new Set(returns.map((r) => r.id));
        const newReturns = returns.filter(
          (r) => !previousIds.current.has(r.id) && r.status === "REQUESTED"
        );
        if (newReturns.length > 0) {
          playNewReturnSound();
          newReturns.forEach((r) => {
            toast.info(
              "New return request",
              `${r.businessName} — ${formatCurrency(r.totalRefund)}`,
              6000
            );
          });
        }
        previousIds.current = currentIds;
      } else {
        previousIds.current = new Set(returns.map((r) => r.id));
        hasInit.current = true;
      }
    });

    return () => unsubscribe();
  }, []);

  return { pendingCount, isLive };
}

function AdminHeader() {
  const { logout } = useAuth();
  const { confirmedCount, isLive } = useAdminOrderAlerts();
  const { pendingCount: pendingReturnCount } = useAdminReturnAlerts();

  async function handleLogout() {
    await logout();
    window.location.assign("/");
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold text-fg">Admin</span>
            <span className="block text-2xs font-medium text-fg-subtle">
              Green Basket operations
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Live indicator */}
          {isLive && (
            <span className="mr-1 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}

          {/* New orders badge */}
          {confirmedCount > 0 && (
            <span className="mr-1 flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              {confirmedCount} new
            </span>
          )}

          {/* Pending returns badge */}
          {pendingReturnCount > 0 && (
            <span className="mr-1 flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
              <RotateCcw className="h-3 w-3" />
              {pendingReturnCount} returns
            </span>
          )}

          <NotificationBell />

          <Link
            href="/"
            className="flex items-center gap-1 rounded-full border border-line bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-400 hover:bg-brand-500/20"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Buyer view
          </Link>
          <Link
            href="/"
            className="hidden items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-fg-muted hover:bg-raised sm:flex"
          >
            <Store className="h-3.5 w-3.5" /> Shop
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle hover:bg-raised"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Admin wrapper: gated header + bottom tab nav. Each admin screen renders its
 *  body inside this. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth({ role: "ADMIN", callbackUrl: "/admin" });

  if (!ready) {
    return (
      <AppShell>
        <FullScreenLoader label="Loading dashboard…" />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={<AdminHeader />}
      footer={<AdminBottomNav />}
      sidebar={<AdminSidebar />}
    >
      {children}
    </AppShell>
  );
}
