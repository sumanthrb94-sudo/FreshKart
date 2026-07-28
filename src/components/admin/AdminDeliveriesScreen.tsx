"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Truck, X } from "lucide-react";
import type { Order, User } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { driverApprovalLimit, payableTotal } from "@/lib/delivery-adjustment";
import { AdminShell } from "./AdminShell";
import { AdminServiceAreaCard } from "./AdminServiceAreaCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

/**
 * Deliveries console: hand orders to drivers, and settle the door-side
 * rejections that came in over a driver's own authority.
 *
 * Escalations are the urgent half — a driver is standing in a shop waiting
 * for the answer — so they lead the screen.
 */
export function AdminDeliveriesScreen() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  // Escalations arrive from a driver standing at a door, so this list is a
  // live subscription rather than a snapshot the admin has to remember to
  // reload. The same singleton listener feeds the dashboard's badge.
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (api.subscribeOrders) {
      const stop = api.subscribeOrders(undefined, (next) => {
        setOrders(next);
        setLoading(false);
      });
      return stop;
    }
    let live = true;
    api
      .listOrders()
      .then((next) => {
        if (!live) return;
        setOrders(next);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tick]);
  const { data: drivers } = useAsync(
    () => (api.listDrivers ? api.listDrivers() : Promise.resolve([] as User[])),
    []
  );

  const live = (orders ?? []).filter((o) => o.status !== "CANCELLED");
  const pending = live.filter((o) => o.adjustment?.status === "PENDING");
  const toAssign = live.filter((o) => !o.driverId && o.status !== "DELIVERED");
  const settled = live.filter(
    (o) => o.adjustment && o.adjustment.status !== "PENDING"
  );

  async function decide(order: Order, decision: "APPROVED" | "REJECTED") {
    if (!api.decideDeliveryAdjustment) return;
    setBusyId(order.id + decision);
    setError(null);
    try {
      await api.decideDeliveryAdjustment(order.id, decision, note[order.id]);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't settle the adjustment.");
    } finally {
      setBusyId(null);
    }
  }

  async function assign(order: Order, driver: User) {
    if (!api.assignDriver) return;
    setBusyId(order.id + "assign");
    setError(null);
    try {
      await api.assignDriver(order.id, driver.id, driver.name);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't assign the driver.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-lg font-extrabold text-fg">Deliveries</h1>
        {error && <Alert variant="error">{error}</Alert>}

        {/* Escalations first — a driver is waiting at a customer's door. */}
        <Card className={cn(pending.length > 0 && "border-amber-500/40")}>
          <CardHeader className="flex items-center gap-2">
            <Clock className={cn("h-4 w-4", pending.length ? "text-amber-500" : "text-fg-subtle")} aria-hidden />
            <h2 className="text-sm font-bold text-fg">
              Needs your decision{pending.length > 0 && ` · ${pending.length}`}
            </h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {loading ? (
              <div className="flex justify-center py-6">
                <Spinner className="h-6 w-6" />
              </div>
            ) : pending.length === 0 ? (
              <p className="text-xs text-fg-subtle">
                Nothing waiting. Drivers settle anything under their own limit on the spot
                {" "}(the greater of ₹500 or 10% of the order), so only larger write-offs land here.
              </p>
            ) : (
              pending.map((o) => {
                const adj = o.adjustment!;
                return (
                  <div key={o.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-fg">{o.businessName}</p>
                        <p className="text-xs text-fg-subtle">
                          {o.orderNumber} · {o.driverName ?? "driver"} · limit{" "}
                          {formatCurrency(driverApprovalLimit(o.total))}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block text-base font-extrabold text-amber-600">
                          −{formatCurrency(adj.totalRefund)}
                        </span>
                        <span className="block text-2xs text-fg-subtle">
                          of {formatCurrency(o.total)}
                        </span>
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-fg">{adj.reason}</p>
                    <ul className="mt-1 text-xs text-fg-subtle">
                      {adj.lines.map((l) => (
                        <li key={l.productId}>
                          {l.rejectedQty} {l.unit} {l.name} — {formatCurrency(l.lineRefund)}
                        </li>
                      ))}
                    </ul>

                    {adj.photos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {adj.photos.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt={`Evidence ${i + 1} for ${o.orderNumber}`}
                            className="h-24 w-24 rounded-lg border border-line object-cover"
                          />
                        ))}
                      </div>
                    )}

                    <input
                      value={note[o.id] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [o.id]: e.target.value }))}
                      placeholder="Note (optional)"
                      aria-label={`Note for ${o.orderNumber}`}
                      className="mt-2.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-brand-500"
                    />

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={busyId === o.id + "APPROVED"}
                        disabled={busyId !== null}
                        onClick={() => decide(o, "APPROVED")}
                        leadingIcon={<Check className="h-4 w-4" />}
                      >
                        Approve — our produce was bad
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busyId === o.id + "REJECTED"}
                        disabled={busyId !== null}
                        onClick={() => decide(o, "REJECTED")}
                        leadingIcon={<X className="h-4 w-4" />}
                      >
                        Reject — goods were fine
                      </Button>
                    </div>
                    <p className="mt-1.5 text-2xs text-fg-subtle">
                      Either way the buyer pays {formatCurrency(o.total - adj.totalRefund)} — only what
                      they kept. Approving writes the stock off; rejecting puts it back in inventory.
                    </p>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        {/* Assignment */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-fg-subtle" aria-hidden />
            <h2 className="text-sm font-bold text-fg">Assign a driver</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {(drivers ?? []).length === 0 ? (
              <p className="text-xs text-fg-subtle">
                No delivery accounts yet. Create a user with the DRIVER role to assign runs.
              </p>
            ) : toAssign.length === 0 ? (
              <p className="text-xs text-fg-subtle">Every live order already has a driver.</p>
            ) : (
              toAssign.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{o.businessName}</p>
                    <p className="text-xs text-fg-subtle">
                      {o.orderNumber} · {formatCurrency(o.total)} · {o.delivery.city}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(drivers ?? []).map((d) => (
                      <Button
                        key={d.id}
                        size="sm"
                        variant="outline"
                        disabled={busyId !== null}
                        onClick={() => assign(o, d)}
                      >
                        {d.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Where we deliver — drives the driver's map and stop order */}
        <AdminServiceAreaCard />

        {/* Settled — the audit trail for what was written off */}
        {settled.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-bold text-fg">Settled adjustments</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-2.5">
              {settled.map((o) => {
                const adj = o.adjustment!;
                const wroteOff = adj.status !== "REJECTED";
                return (
                  <div key={o.id} className="flex items-start justify-between gap-3 border-b border-line pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">
                        {o.businessName}{" "}
                        <span className="font-normal text-fg-subtle">{o.orderNumber}</span>
                      </p>
                      <p className="text-xs text-fg-subtle">{adj.reason}</p>
                      <p className="mt-0.5 text-2xs font-semibold text-fg-subtle">
                        {adj.status === "AUTO_APPROVED" && "Settled by driver (within limit)"}
                        {adj.status === "APPROVED" && "Approved — written off"}
                        {adj.status === "REJECTED" && "Rejected — stock returned"}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className={cn("block text-sm font-bold", wroteOff ? "text-amber-600" : "text-fg")}>
                        −{formatCurrency(adj.totalRefund)}
                      </span>
                      <span className="block text-2xs text-fg-subtle">
                        billed {formatCurrency(payableTotal(o))}
                      </span>
                    </span>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
