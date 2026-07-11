"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Sprout, ShoppingCart, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { formatCurrency } from "@/lib/format";
import { BUYER_TABS } from "@/components/buyer/BuyerBottomNav";

/**
 * Persistent left sidebar for the buyer app on desktop. Reuses the tab
 * definitions from `BuyerBottomNav` so mobile and desktop nav stay in sync.
 */
export function BuyerSidebar() {
  const pathname = usePathname() || "/";
  const { isAdmin, logout } = useAuth();
  const { itemCount, subtotal } = useCart();
  const tabs = isAdmin ? BUYER_TABS : BUYER_TABS.filter((t) => t.href !== "/admin");

  async function handleLogout() {
    await logout();
    window.location.assign("/");
  }

  return (
    <div className="flex h-full flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
          <Sprout className="h-5 w-5" />
        </span>
        <span className="text-base font-extrabold text-fg">Green Basket</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-brand-500/15 text-brand-400"
                      : "text-fg-subtle hover:bg-raised hover:text-fg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        {itemCount > 0 && (
          <Link
            href="/?cart=1"
            className="mb-3 flex flex-col gap-2 rounded-xl bg-brand-500/10 p-3 text-brand-400 transition-colors hover:bg-brand-500 hover:text-white"
          >
            <span className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" />
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <span>{formatCurrency(subtotal)}</span>
            </span>
            <span className="flex items-center justify-between text-sm font-extrabold">
              Review & Order
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-fg-subtle transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </div>
    </div>
  );
}
