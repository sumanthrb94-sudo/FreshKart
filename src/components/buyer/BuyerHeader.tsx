"use client";

import Link from "next/link";
import { LayoutDashboard, Sprout, Sun, Moon } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { NotificationBell } from "@/components/NotificationDrawer";

export function BuyerHeader({
  searchSlot,
  showWordmark = false,
}: {
  searchSlot?: React.ReactNode;
  /** Shows the "Green Basket" text next to the logo — for inner screens
   *  (Orders, Account) that don't have the hero's branding context the
   *  shop screen does. */
  showWordmark?: boolean;
}) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-header">
      <div className="flex items-center justify-between gap-2 px-3 py-2 lg:gap-4 lg:px-6 lg:py-3">
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-3">
          {/* On desktop the sidebar already carries the wordmark — this header
              only needs the icon as a "back to shop" anchor, freeing width
              for search. */}
          <Link href="/" aria-label="Green Basket" className="flex items-center gap-1.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Sprout className="h-4 w-4" />
            </span>
            {showWordmark && (
              <span className="text-sm font-extrabold text-fg">Green Basket</span>
            )}
          </Link>

          {/* Theme toggle is a mobile-only affordance — desktop is light-only. */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-fg-muted transition-colors hover:bg-line hover:text-fg lg:hidden"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        {searchSlot && <div className="min-w-0 flex-1 lg:max-w-xl">{searchSlot}</div>}

        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          {isAuthenticated && (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="mr-0.5 flex items-center gap-1 rounded-full bg-raised px-2 py-1 text-xs font-semibold text-fg-muted transition-colors hover:bg-line hover:text-fg lg:px-3 lg:py-1.5"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
              {/* Notification bell */}
              <NotificationBell />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
