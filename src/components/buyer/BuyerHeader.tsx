"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ShoppingCart, Sprout } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { cn } from "@/lib/utils";

const ICON_BTN =
  "flex h-9 w-9 items-center justify-center rounded-full bg-raised text-fg-muted transition-colors hover:bg-line hover:text-fg";

export function BuyerHeader() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    // Full navigation so the back button can't return to a protected page.
    window.location.assign("/");
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold text-fg">FreshKart</span>
            <span className="block text-2xs font-medium text-fg-subtle">
              Wholesale B2B · per kg
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          {isAuthenticated && (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="mr-0.5 flex items-center gap-1 rounded-full bg-raised px-2.5 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-line hover:text-fg"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
              {/* Cart with a live count badge — always-visible "memory" */}
              <button
                type="button"
                aria-label={`Your cart (${itemCount})`}
                onClick={() => router.push("/?cart=1")}
                className={cn("relative", ICON_BTN)}
              >
                <ShoppingCart className="h-4 w-4" />
                {itemCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-surface">
                    {itemCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Log out"
                onClick={handleLogout}
                className={ICON_BTN}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
