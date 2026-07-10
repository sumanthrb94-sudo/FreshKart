"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Package, User as UserIcon, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";

export type BuyerTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (path: string) => boolean;
};

export const BUYER_TABS: BuyerTab[] = [
  { href: "/", label: "Shop", icon: Store, isActive: (p) => p === "/" },
  { href: "/orders", label: "Orders", icon: Package, isActive: (p) => p.startsWith("/orders") },
  { href: "/account", label: "Account", icon: UserIcon, isActive: (p) => p.startsWith("/account") },
  // Shown only to admins (filtered out for buyers in the component below).
  { href: "/admin", label: "Admin", icon: ShieldCheck, isActive: (p) => p.startsWith("/admin") },
];

/**
 * Zomato/Zepto-style bottom tab bar. Lives in the AppShell footer slot (so it
 * pins to the bottom of the app column) on the main buyer screens. The active
 * tab is derived from the current route.
 */
export function BuyerBottomNav() {
  const pathname = usePathname() || "/";
  const { isAdmin } = useAuth();
  // The Admin tab is only visible to admins (e.g. the configured Gmail admin).
  const tabs = isAdmin ? BUYER_TABS : BUYER_TABS.filter((t) => t.href !== "/admin");

  return (
    <nav className="shrink-0 border-t border-line bg-surface pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-bold transition-colors",
                active ? "text-brand-500" : "text-fg-subtle hover:text-fg-muted"
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand-500" />
              )}
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
