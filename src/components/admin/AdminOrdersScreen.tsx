"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList } from "lucide-react";
import type { Order } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, nextStatus, ORDER_STATUS_META } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

function AdminOrderCard({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(order.status);
  const cancellable = order.status !== "DELIVERED" && order.status !== "CANCELLED";
  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);

  async function advance(to: Order["status"]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateOrderStatus(order.id, to);
      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-fg-muted">
            {order.orderNumber}
          </p>
          <p className="truncate text-sm font-bold text-fg">{order.businessName}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <p className="mt-1 text-xs text-fg-subtle">
        {order.delivery.city || "—"} · {formatDate(order.createdAt)} · {order.items.length} items ·{" "}
        {totalQty} units
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-base font-extrabold text-fg">
          {formatCurrency(order.total)}
        </span>
        <div className="flex items-center gap-1.5">
          {cancellable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => advance("CANCELLED")}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => advance(next)}
              className={cn(
                "flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              )}
            >
              {busy ? "Updating…" : <>Mark {ORDER_STATUS_META[next].label}</>}
              {!busy && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

export function AdminOrdersScreen() {
  const { data, loading } = useAsync(() => api.listOrders(), []);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (data) setOrders(data);
  }, [data]);

  return (
    <AdminShell>
      {loading ? (
        <FullScreenLoader />
      ) : orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No orders yet" />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {orders.map((o) => (
            <AdminOrderCard
              key={o.id}
              order={o}
              onChange={(updated) =>
                setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
            />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
