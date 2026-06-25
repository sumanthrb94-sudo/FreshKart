"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  IndianRupee,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, ORDER_STATUS_META, STATUS_FLOW } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { AdminShell } from "./AdminShell";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { FullScreenLoader } from "@/components/ui/Spinner";

const ALL_STATUSES: OrderStatus[] = [...STATUS_FLOW, "CANCELLED"];

export function AdminOverviewScreen() {
  const { data: stats, loading: ls } = useAsync(() => api.getAdminStats(), []);
  const { data: orders, loading: lo } = useAsync(() => api.listOrders(), []);

  return (
    <AdminShell>
      {ls || lo || !stats ? (
        <FullScreenLoader label="Loading dashboard…" />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Revenue"
              value={formatCurrency(stats.revenue)}
              hint="Non-cancelled"
              icon={IndianRupee}
              tone="accent"
            />
            <StatCard label="Orders" value={stats.orderCount} icon={ShoppingCart} tone="brand" />
            <StatCard
              label="Products"
              value={stats.productCount}
              hint={`${stats.activeProductCount} active`}
              icon={Package}
              tone="brand"
            />
            <StatCard label="Customers" value={stats.customerCount} icon={Users} tone="accent" />
            <StatCard
              label="Low stock"
              value={stats.lowStockCount}
              hint={stats.lowStockCount > 0 ? "Needs restock" : "All healthy"}
              icon={stats.lowStockCount > 0 ? AlertTriangle : CheckCircle2}
              tone={stats.lowStockCount > 0 ? "red" : "gray"}
            />
          </div>

          {/* Orders by status */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-bold text-fg">Orders by status</h2>
            </CardHeader>
            <CardBody className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((s) => (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_META[s].badge}`}
                >
                  {ORDER_STATUS_META[s].label}: {stats.ordersByStatus[s]}
                </span>
              ))}
            </CardBody>
          </Card>

          {/* Recent orders */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-fg">Recent orders</h2>
              <Link href="/admin/orders" className="text-xs font-semibold text-brand-400 hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {!orders || orders.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-fg-subtle">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {orders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-fg-muted">
                          {o.orderNumber}
                        </p>
                        <p className="truncate text-xs text-fg-subtle">
                          {o.businessName} · {formatDate(o.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold text-fg">
                          {formatCurrency(o.total)}
                        </span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
