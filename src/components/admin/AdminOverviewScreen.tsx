"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  IndianRupee,
  Package,
  Plus,
  ScanLine,
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
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader } from "@/components/ui/Spinner";

const ALL_STATUSES: OrderStatus[] = [...STATUS_FLOW, "CANCELLED"];

export function AdminOverviewScreen() {
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } =
    useAsync(() => api.getAdminStats(), []);
  const { data: orders, loading: ordersLoading, error: ordersError, refetch: refetchOrders } =
    useAsync(() => api.listOrders(), []);

  if (statsLoading || ordersLoading) {
    return (
      <AdminShell>
        <FullScreenLoader label="Loading dashboard…" />
      </AdminShell>
    );
  }

  // Surface the error (e.g. Firestore "insufficient permissions" when the
  // account isn't an admin) instead of hanging on the loader forever.
  const loadError = statsError || ordersError;
  if (loadError || !stats) {
    return (
      <AdminShell>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the dashboard"
          subtitle={loadError ?? "Your account may not have admin access yet."}
          action={
            <Button
              size="lg"
              onClick={() => {
                refetchStats();
                refetchOrders();
              }}
            >
              Try again
            </Button>
          }
        />
      </AdminShell>
    );
  }

  const lowStock = stats.lowStockCount > 0;
  const recentOrders = orders ? orders.slice(0, 5) : [];

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 p-4">
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/admin/pos"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-600 active:bg-brand-600"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            New POS sale
          </Link>
          <Link
            href="/admin/products"
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-fg shadow-card transition-colors hover:bg-raised"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add product
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Revenue"
            value={formatCurrency(stats.revenue)}
            hint="Non-cancelled"
            icon={IndianRupee}
            tone="brand"
          />
          <StatCard label="Orders" value={stats.orderCount} icon={ShoppingCart} tone="gray" />
          <StatCard
            label="Pending"
            value={stats.ordersByStatus.PENDING}
            hint="Awaiting action"
            icon={Clock}
            tone="gray"
          />
          <StatCard label="Customers" value={stats.customerCount} icon={Users} tone="gray" />
          <StatCard
            label="Products"
            value={stats.productCount}
            hint={`${stats.activeProductCount} active`}
            icon={Package}
            tone="gray"
          />
          <StatCard
            label="Low stock"
            value={stats.lowStockCount}
            hint={lowStock ? "Needs restock" : "All healthy"}
            icon={lowStock ? AlertTriangle : CheckCircle2}
            tone={lowStock ? "red" : "gray"}
          />
        </div>

        {/* Low-stock alert */}
        {lowStock && (
          <Link
            href="/admin/products"
            className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 transition-colors hover:bg-red-500/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-bold text-fg">
                {stats.lowStockCount} {stats.lowStockCount === 1 ? "item" : "items"} need restock
              </span>
              <span className="block text-xs text-fg-muted">Tap to review low-stock products</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-red-400">Review</span>
          </Link>
        )}

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
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-brand-400 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {recentOrders.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recentOrders.map((o) => (
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
                      <span className="text-sm font-bold text-fg">{formatCurrency(o.total)}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
