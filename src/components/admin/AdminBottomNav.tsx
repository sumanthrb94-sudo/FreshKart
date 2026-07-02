"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  Boxes,
  IndianRupee,
  ClipboardList,
  RotateCcw,
  FileBarChart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (p: string) => boolean;
};

const TABS: Tab[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, isActive: (p) => p === "/admin" },
  { href: "/admin/pos", label: "POS", icon: ScanLine, isActive: (p) => p.startsWith("/admin/pos") },
  { href: "/admin/products", label: "Inventory", icon: Boxes, isActive: (p) => p.startsWith("/admin/products") },
  { href: "/admin/prices", label: "Prices", icon: IndianRupee, isActive: (p) => p.startsWith("/admin/prices") },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, isActive: (p) => p.startsWith("/admin/orders") },
  { href: "/admin/returns", label: "Returns", icon: RotateCcw, isActive: (p) => p.startsWith("/admin/returns") },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart, isActive: (p) => p.startsWith("/admin/reports") },
  { href: "/admin/customers", label: "Buyers", icon: Users, isActive: (p) => p.startsWith("/admin/customers") },
];

/** Admin bottom tab bar — 8 tabs for full management. */
export function AdminBottomNav() {
  const pathname = usePathname() || "/admin";

  return (
    <nav className="shrink-0 border-t border-line bg-surface pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-stretch justify-around overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors min-w-[44px]",
                active ? "text-brand-500" : "text-fg-subtle hover:text-fg-muted"
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500" />
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
