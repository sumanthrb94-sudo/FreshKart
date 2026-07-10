"use client";

import Link from "next/link";
import { LogOut, ShieldCheck, Store, ShoppingBag } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { AdminBottomNav } from "./AdminBottomNav";

function AdminHeader() {
  const { logout } = useAuth();

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
              FreshKart operations
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
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
    <AppShell header={<AdminHeader />} footer={<AdminBottomNav />}>
      {children}
    </AppShell>
  );
}
