"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_TABS } from "@/components/admin/AdminBottomNav";

/**
 * Persistent left sidebar for the admin app on desktop. Reuses the tab
 * definitions from `AdminBottomNav` so mobile and desktop nav stay in sync.
 */
export function AdminSidebar() {
  const pathname = usePathname() || "/admin";

  return (
    <div className="flex h-full flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span className="leading-tight">
          <span className="block text-base font-extrabold text-fg">Admin</span>
          <span className="block text-2xs font-medium text-fg-subtle">Green Basket operations</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {ADMIN_TABS.map((tab) => {
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
    </div>
  );
}
