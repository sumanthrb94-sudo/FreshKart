"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ShoppingCart, Sprout, Sun, Moon } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { NotificationBell } from "@/components/NotificationDrawer";
import { cn } from "@/lib/utils";

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full bg-raised text-fg-muted transition-colors hover:bg-line hover:text-fg";

export function BuyerHeader() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    window.location.assign("/");
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Sprout className="h-4 w-4" />
            </span>
            <span className="text-sm font-extrabold text-fg">Green Basket</span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-raised text-fg-muted transition-colors hover:bg-line hover:text-fg"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {isAuthenticated && (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="mr-0.5 flex items-center gap-1 rounded-full bg-raised px-2 py-1 text-xs font-semibold text-fg-muted transition-colors hover:bg-line hover:text-fg"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
              {/* Notification bell */}
              <NotificationBell />
              {/* Cart */}
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
