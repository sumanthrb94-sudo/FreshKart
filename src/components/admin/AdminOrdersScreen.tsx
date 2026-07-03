"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Ban,
  ClipboardList,
  FileText,
  MapPin,
  Phone,
  Search,
  SearchX,
  ServerCrash,
} from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import { api } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_META,
  PAYMENT_LABELS,
  STATUS_FLOW,
  unitLabel,
} from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { InvoiceDownloader } from "@/components/InvoiceDownloader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";

/** Order lifecycle + the terminal cancelled bucket, in display order. */
const FILTERS: OrderStatus[] = [...STATUS_FLOW, "CANCELLED"];

/** The status that follows `current`, or null at the end of the flow. */
function nextInFlow(current: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(current);
  if (i === -1 || i === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
}

function isTerminal(status: OrderStatus): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}

/** "3 items · Onion, Potato…" */
function itemSummary(order: Order): string {
  const count = order.items.length;
  const noun = count === 1 ? "item" : "items";
  const names = order.items.map((i) => i.name);
  const head = names.slice(0, 2).join(", ");
  const tail = names.length > 2 ? "…" : "";
  return `${count} ${noun} · ${head}${tail}`;
}

function PaymentBadge({ paid }: { paid: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
        paid ? "bg-brand-500/15 text-brand-300" : "bg-raised text-fg-subtle"
      )}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  return (
    <Card>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left transition-colors hover:bg-raised/40 rounded-xl"
      >
        <CardBody className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-fg-muted">
                {order.orderNumber}
              </p>
              <p className="truncate text-sm font-bold text-fg">
                {order.businessName}
              </p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          <p className="mt-1.5 truncate text-xs text-fg-subtle">
            {itemSummary(order)}
          </p>

          <div className="mt-3 flex items-end justify-between gap-3">
            <span className="text-base font-extrabold text-fg">
              {formatCurrency(order.total)}
            </span>
            <span className="text-2xs font-medium text-fg-subtle">
              {formatDate(order.createdAt)}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <span className="font-medium">{PAYMENT_LABELS[order.paymentMethod]}</span>
            <PaymentBadge paid={order.paymentStatus === "PAID"} />
          </div>
        </CardBody>
      </button>
    </Card>
  );
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className={cn("font-semibold", accent ? "text-brand-300" : "text-fg")}>{value}</span>
    </div>
  );
}

function OrderDetail({
  order,
  onMutated,
}: {
  order: Order;
  onMutated: (updated: Order) => void;
}) {
  const [busy, setBusy] = useState<null | "status" | "paid" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);

  const next = nextInFlow(order.status);
  const paid = order.paymentStatus === "PAID";
  const canAdvance = !isTerminal(order.status) && next !== null;
  const canCancel = !isTerminal(order.status);

  async function run(kind: "status" | "paid" | "cancel", fn: () => Promise<Order>) {
    setBusy(kind);
    setError(null);
    try {
      onMutated(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5 p-5">
        {/* Invoice download */}
        <InvoiceDownloader order={order} fullWidth />

        {/* Business + meta */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-fg">{order.businessName}</p>
            <p className="mt-0.5 text-xs text-fg-subtle">{formatDate(order.createdAt)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Items */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">
            Items
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {order.items.map((item, idx) => (
              <li
                key={`${item.name}-${idx}`}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{item.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {item.qty} {unitLabel(item.unit)} · {formatCurrency(item.price)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-fg">
                  {formatCurrency(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Delivery */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">
            Delivery
          </h3>
          <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <p className="text-sm font-semibold text-fg">{order.delivery.name}</p>
            <a
              href={`tel:${order.delivery.phone}`}
              className="mt-1 flex items-center gap-1.5 text-sm text-brand-300"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {order.delivery.phone}
            </a>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-fg-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {order.delivery.address}, {order.delivery.city} — {order.delivery.pincode}
              </span>
            </p>
          </div>
        </section>

        {/* Notes */}
        {order.notes && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">
              Notes
            </h3>
            <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-fg-muted">
              {order.notes}
            </p>
          </section>
        )}

        {/* Totals */}
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
          <DetailRow label="Subtotal" value={formatCurrency(order.subtotal)} />
          <DetailRow
            label="Delivery"
            value={order.deliveryFee > 0 ? formatCurrency(order.deliveryFee) : "FREE"}
            accent={order.deliveryFee === 0}
          />
          <div className="my-1 h-px bg-line" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-fg">Total</span>
            <span className="text-lg font-extrabold text-fg">{formatCurrency(order.total)}</span>
          </div>
        </section>

        {/* Payment */}
        <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-fg-subtle">Payment</p>
            <p className="mt-0.5 text-sm font-semibold text-fg">
              {PAYMENT_LABELS[order.paymentMethod]}
            </p>
          </div>
          <PaymentBadge paid={paid} />
        </section>
      </div>

      {/* Sticky actions */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-surface px-5 py-4">
        {error && <p className="text-xs font-medium text-red-400">{error}</p>}

        {canAdvance && next && (
          <Button
            variant="primary"
            fullWidth
            loading={busy === "status"}
            disabled={busy !== null}
            leadingIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
            onClick={() => run("status", () => api.updateOrderStatus(order.id, next))}
          >
            Mark {ORDER_STATUS_META[next].label}
          </Button>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            fullWidth
            loading={busy === "paid"}
            disabled={busy !== null}
            onClick={() => run("paid", () => api.setOrderPaid(order.id, !paid))}
          >
            {paid ? "Mark unpaid" : "Mark paid"}
          </Button>

          {canCancel && (
            <Button
              variant="danger"
              fullWidth
              loading={busy === "cancel"}
              disabled={busy !== null}
              leadingIcon={<Ban className="h-4 w-4" aria-hidden />}
              onClick={() => {
                if (window.confirm("Cancel this order? Stock will be restored.")) {
                  void run("cancel", () => api.cancelOrder(order.id));
                }
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminOrdersScreen() {
  const { data, loading, error, refetch } = useAsync(() => api.listOrders(), []);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const orders = useMemo(() => data ?? [], [data]);

  // Per-status counts for the filter chips.
  const counts = useMemo(() => {
    const acc: Record<OrderStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PACKED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };
    for (const o of orders) acc[o.status] += 1;
    return acc;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.businessName.toLowerCase().includes(q)
      );
    });
  }, [orders, filter, query]);

  // The order shown in the sheet, re-read from the freshest list each render so
  // it stays in sync after refetch.
  const active = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function handleMutated(updated: Order) {
    refetch();
    setOpenId(updated.id);
  }

  if (loading) {
    return (
      <AdminShell>
        <FullScreenLoader label="Loading orders…" />
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell>
        <EmptyState
          icon={ServerCrash}
          title="Couldn't load orders"
          subtitle={error}
          action={
            <Button variant="outline" onClick={refetch}>
              Try again
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 p-4">
        {/* Search */}
        <Input
          flavor="field"
          type="search"
          inputMode="search"
          placeholder="Search by order # or business"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search orders"
        />

        {/* Status filter chips */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All · {orders.length}
          </Chip>
          {FILTERS.map((s) => (
            <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {ORDER_STATUS_META[s].label} · {counts[s]}
            </Chip>
          ))}
        </div>

        {/* List */}
        {orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No orders yet" subtitle="New orders will appear here." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matching orders"
            subtitle="Try a different status or search term."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((o) => (
              <OrderCard key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={active !== null}
        onClose={() => setOpenId(null)}
        title={active ? active.orderNumber : "Order"}
      >
        {active && <OrderDetail order={active} onMutated={handleMutated} />}
      </Sheet>
    </AdminShell>
  );
}
