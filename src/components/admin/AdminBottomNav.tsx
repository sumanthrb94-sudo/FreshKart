"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tag,
  ClipboardList,
  RotateCcw,
  FileText,
  Users,
  BadgePercent,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (path: string) => boolean;
};

export const ADMIN_TABS: AdminTab[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, isActive: (p) => p === "/admin" },
  { href: "/admin/products", label: "Inventory", icon: Package, isActive: (p) => p.startsWith("/admin/products") },
  { href: "/admin/prices", label: "Prices", icon: Tag, isActive: (p) => p.startsWith("/admin/prices") },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, isActive: (p) => p.startsWith("/admin/orders") },
  { href: "/admin/returns", label: "Returns", icon: RotateCcw, isActive: (p) => p.startsWith("/admin/returns") },
  { href: "/admin/reports", label: "Reports", icon: FileText, isActive: (p) => p.startsWith("/admin/reports") },
  { href: "/admin/coupons", label: "Coupons", icon: BadgePercent, isActive: (p) => p.startsWith("/admin/coupons") },
  { href: "/admin/customers", label: "Buyers", icon: Users, isActive: (p) => p.startsWith("/admin/customers") },
];

/** Admin bottom tab bar — Dashboard · Inventory · Prices · Orders · Returns · Reports · Coupons · Buyers. */
export function AdminBottomNav() {
  const pathname = usePathname() || "/admin";

  return (
    <nav className="shrink-0 border-t border-line bg-surface">
      <div className="flex items-center justify-around overflow-x-auto px-2 py-1">
        {ADMIN_TABS.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-brand-500" : "text-fg-subtle hover:text-fg-muted"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 1.5} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
