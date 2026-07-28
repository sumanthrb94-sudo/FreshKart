"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Truck, X } from "lucide-react";
import type { Order, User } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { driverApprovalLimit, payableTotal } from "@/lib/delivery-adjustment";
import { AdminShell } from "./AdminShell";
import { AdminServiceAreaCard } from "./AdminServiceAreaCard";
import { AdminExecutivesCard } from "./AdminExecutivesCard";
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
        <p className="-mt-1 text-xs text-fg-subtle">
          Goods handed back at the door are under{" "}
          <Link href="/admin/returns" className="font-semibold text-brand-500">
            Returns
          </Link>
          .
        </p>
        {error && <Alert variant="error">{error}</Alert>}

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

        {/* Who runs the deliveries */}
        <AdminExecutivesCard />

        {/* Where we deliver — drives the driver's map and stop order */}
        <AdminServiceAreaCard />

      </div>
    </AdminShell>
  );
}
