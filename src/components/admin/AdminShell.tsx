"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck, Store } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/customers", label: "Customers" },
];

function AdminHeader() {
  const pathname = usePathname();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    window.location.assign("/login");
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold text-gray-900">Admin</span>
            <span className="block text-2xs font-medium text-gray-400">FreshKart operations</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Store className="h-3.5 w-3.5" /> Shop
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      <nav className="fc-scroll flex gap-1.5 overflow-x-auto px-4 pb-3">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth({ role: "ADMIN", callbackUrl: "/admin" });

  if (!ready) {
    return (
      <AppShell>
        <FullScreenLoader label="Loading dashboard…" />
      </AppShell>
    );
  }

  return <AppShell header={<AdminHeader />}>{children}</AppShell>;
}
