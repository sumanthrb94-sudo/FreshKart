"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, ShoppingBag, Store, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_TABS } from "@/components/admin/AdminBottomNav";
import { useAuth } from "@/components/providers/AuthProvider";
import { useLiveOrders, useLiveReturns, useLiveNeedsHumanCount } from "@/lib/admin-alerts-store";
import { NotificationBell } from "@/components/NotificationDrawer";

/** Live badge count for a nav row, keyed by href — the same
 *  admin-alerts-store singletons the dashboard's Manage tiles read, so the
 *  sidebar's badges, the tile badges, and the actual chime never drift out
 *  of sync with each other. */
function useNavBadgeCounts(): Record<string, number> {
  const { confirmedOrders, isLive } = useLiveOrders();
  const { pendingCount } = useLiveReturns();
  const needsHumanCount = useLiveNeedsHumanCount();
  return {
    "/admin/orders": confirmedOrders.length,
    "/admin/returns": pendingCount,
    "/admin/support": needsHumanCount,
    __isLive: isLive ? 1 : 0,
  } as Record<string, number>;
}

/**
 * Persistent left sidebar for the admin app on desktop. Reuses the tab
 * definitions from `AdminBottomNav` so mobile and desktop nav stay in sync.
 * Live status (the "LIVE" indicator, new-order/return/chat counts) lives
 * here — right on the nav row it applies to, visible from every admin page —
 * rather than as a separate pill row squeezed into the top header, which is
 * reserved for account-level actions (notifications, buyer view, logout).
 */
export function AdminSidebar() {
  const pathname = usePathname() || "/admin";
  const { logout } = useAuth();
  const badgeCounts = useNavBadgeCounts();
  const isLive = badgeCounts.__isLive === 1;

  async function handleLogout() {
    await logout();
    window.location.assign("/");
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="relative overflow-hidden">
        {/* Soft brand-green wash behind the logo — the bit of depth that
            makes a sidebar read as a designed product surface rather than a
            flat list of links. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-brand-500/[0.08] to-transparent" />
        <div className="relative flex items-center gap-2.5 px-5 py-4">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-500/40 blur-md" aria-hidden />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm shadow-brand-500/30">
              <Sprout className="h-5 w-5" />
            </span>
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-base font-extrabold text-fg">Admin</span>
            <span className="block text-2xs font-medium text-fg-subtle">Green Basket operations</span>
          </span>
          {isLive && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand-500"
              title="Real-time updates connected"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
              Live
            </span>
          )}
          <div className="shrink-0">
            <NotificationBell />
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {ADMIN_TABS.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            const count = badgeCounts[tab.href] ?? 0;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                      : "text-fg-subtle hover:bg-raised hover:text-fg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  {count > 0 && (
                    <span
                      key={count}
                      className="animate-pop flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-2xs font-extrabold leading-none text-white"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-fg-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <ShoppingBag className="h-4 w-4" /> Buyer view
        </Link>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-fg-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <Store className="h-4 w-4" /> Shop
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  );
}
