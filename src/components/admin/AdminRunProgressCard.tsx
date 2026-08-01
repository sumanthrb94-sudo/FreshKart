"use client";

import { useState } from "react";
import { AlertTriangle, Clock, MapPin, Navigation, Truck } from "lucide-react";
import type { Order, User } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { formatKm, type ServiceArea } from "@/lib/service-area";
import { openRuns, sinceLabel, type RunProgress } from "@/lib/run-progress";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

/**
 * Where each driver has got to.
 *
 * Answers the question the office is actually asked — "how far away is my
 * delivery?" — without pretending to more than the data knows. There is no
 * GPS trail here: progress moves when a stop is completed, which is the only
 * moment the system genuinely learns something. A run that has gone quiet is
 * shown as quiet rather than as fine, because a silent van at 9 AM is the
 * one thing worth a phone call.
 */
export function AdminRunProgressCard({
  drivers,
  orders,
  area,
  onClosed,
}: {
  drivers: User[];
  orders: Order[];
  area: ServiceArea;
  onClosed?: () => void;
}) {
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One entry per driver PER DELIVERY DATE. A driver holding an unclosed run
  // from yesterday and today's fresh load appears twice, which is the honest
  // picture — and the only way the office sees that yesterday's cash is still
  // outstanding.
  const runs = openRuns(drivers, orders, area);

  async function close(run: RunProgress) {
    if (!api.closeRun) return;
    const key = `${run.driver.id}::${run.deliveryDate}`;
    setClosing(key);
    setError(null);
    try {
      await api.closeRun(run.driver.id, run.deliveryDate);
      onClosed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close the run.");
    } finally {
      setClosing(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Navigation className="h-4 w-4 text-fg-subtle" aria-hidden />
        <h2 className="text-sm font-bold text-fg">Runs in progress</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}
        {runs.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            Nobody is out yet. Assign orders below and the run appears here.
          </p>
        ) : (
          runs.map((run) => {
            const pct = run.stopsTotal ? Math.round((run.stopsDone / run.stopsTotal) * 100) : 0;
            const key = `${run.driver.id}::${run.deliveryDate}`;
            const undelivered = run.ordersTotal - run.ordersDone;
            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border p-3",
                  run.overdue
                    ? "border-amber-500/60 bg-amber-500/10"
                    : run.isStalled
                      ? "border-amber-500/50 bg-amber-500/5"
                      : run.finished
                        ? "border-brand-500/30 bg-brand-500/5"
                        : "border-line bg-raised"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-fg">
                      <Truck className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                      {run.driver.name}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {/* Which morning's van, always — two runs from two days
                          look identical otherwise. */}
                      <span className="font-semibold capitalize text-fg-muted">
                        {run.dayLabel}
                      </span>
                      {" · "}
                      {run.finished
                        ? `Run complete — ${run.stopsTotal} stop${run.stopsTotal === 1 ? "" : "s"}`
                        : `Stop ${Math.min(run.stopsDone + 1, run.stopsTotal)} of ${run.stopsTotal}`}
                      {" · "}
                      {run.ordersDone}/{run.ordersTotal} orders
                      {run.kmTotal > 0 && ` · ${formatKm(run.kmDone)} of ${formatKm(run.kmTotal)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-base font-extrabold text-fg">
                      {formatCurrency(run.cashCollected)}
                    </span>
                    <span className="block text-2xs text-fg-subtle">collected so far</span>
                  </span>
                </div>

                {/* Progress by doors done — the same count the driver sees. */}
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      run.finished ? "bg-brand-500" : "bg-blue-500"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {run.currentStop && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-fg">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-semibold">{run.currentStop.businessName}</span>
                      <span className="text-fg-subtle">
                        {" — "}
                        {run.currentStop.address}
                        {run.currentStop.pincode ? `, ${run.currentStop.pincode}` : ""}
                      </span>
                    </span>
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
                  <span
                    className={cn(
                      "flex items-center gap-1 font-semibold",
                      run.isStalled ? "text-amber-600" : "text-fg-subtle"
                    )}
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {sinceLabel(run.silentMinutes)}
                  </span>
                  {run.waitingOnOffice > 0 && (
                    <span className="flex items-center gap-1 font-bold text-amber-600">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {run.waitingOnOffice} waiting on your decision
                    </span>
                  )}
                  <a
                    href={`tel:${run.driver.phone}`}
                    className="font-semibold text-brand-500"
                  >
                    Call {run.driver.phone}
                  </a>
                </div>

                {run.isStalled && !run.overdue && (
                  <p className="mt-1.5 text-2xs font-semibold text-amber-600">
                    No update in {sinceLabel(run.silentMinutes).replace(" ago", "")} with stops left
                    — worth a call.
                  </p>
                )}

                {/* An overdue run is one whose delivery morning has passed and
                    which nobody has closed. It is NOT today's work, and saying
                    so is the whole point — this board used to show a run
                    finished the previous day as though the van were still
                    out. */}
                {run.overdue && (
                  <p className="mt-1.5 text-2xs font-semibold text-amber-600">
                    {run.dayLabel === "yesterday" ? "Yesterday's" : `${run.dayLabel}'s`} run, still
                    open. Close it once the cash is in.
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                  <span className="text-2xs text-fg-subtle">
                    {undelivered === 0
                      ? "All stops delivered."
                      : `${undelivered} stop${undelivered === 1 ? "" : "s"} not delivered — closing sends ${undelivered === 1 ? "it" : "them"} back to Assign a driver.`}
                  </span>
                  <Button
                    size="sm"
                    variant={run.finished ? "primary" : "secondary"}
                    disabled={closing === key || !api.closeRun}
                    onClick={() => close(run)}
                  >
                    {closing === key ? "Closing…" : "Close run"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
        <p className="text-2xs text-fg-subtle">
          Progress moves as each stop is completed — this is not live location.
        </p>
      </CardBody>
    </Card>
  );
}
