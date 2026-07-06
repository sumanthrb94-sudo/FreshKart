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
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Package, label: "Inventory", path: "/admin/products" },
  { icon: Tag, label: "Prices", path: "/admin/prices" },
  { icon: ClipboardList, label: "Orders", path: "/admin/orders" },
  { icon: RotateCcw, label: "Returns", path: "/admin/returns" },
  { icon: FileText, label: "Reports", path: "/admin/reports" },
  { icon: BadgePercent, label: "Coupons", path: "/admin/coupons" },
  { icon: Users, label: "Buyers", path: "/admin/customers" },
];

export function AdminBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 border-t border-line bg-surface">
      <div className="flex items-center justify-around overflow-x-auto px-2 py-1">
        {tabs.map(({ icon: Icon, label, path }) => {
          const isActive = pathname === path;
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-brand-500"
                  : "text-fg-subtle hover:text-fg-muted"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
