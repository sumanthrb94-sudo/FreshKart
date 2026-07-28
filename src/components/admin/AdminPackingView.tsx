"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Download,
  IndianRupee,
  MapPin,
  Package,
  Phone,
  ShoppingCart,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { formatCurrency } from "@/lib/format";
import {
  formatIstDateLabel,
  formatLastPublished,
  getIstBusinessDayRange,
  getIstToday,
  isDailyPriceUpdatePublished,
} from "@/lib/time";
import { generateDailyPackingReport } from "@/lib/packing";
import { downloadCSV, reportToCSV } from "@/lib/csv";
import { DayPicker } from "@/components/ui/DayPicker";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { PackingSlipPrinter } from "./PackingSlipPrinter";

type PackingView = "picklist" | "customers";

/** The daily packing run: what to pick in total, and what goes to whom.
 *
 *  Self-contained — takes no props — so it can be promoted from a tab in the
 *  reports hub to its own route without changes.
 */
export function AdminPackingView() {
  const [day, setDay] = useState(() => getIstToday());
  const [view, setView] = useState<PackingView>("picklist");

  const { startIso, endIso } = useMemo(() => getIstBusinessDayRange(day), [day]);
  const { data: orders, loading, error } = useAsync(
    () => api.listOrdersByRange(startIso, endIso),
    [startIso, endIso]
  );
  // Products supply the category, which OrderItem doesn't carry — needed for
  // the packaging-material column.
  const { data: products } = useAsync(() => api.listProducts(), []);
  const { data: settings } = useAsync(() => api.getDailyPricesSettings(), []);

  // The generators in this file's sibling tabs run on every render; this one
  // only recomputes when its inputs actually change.
  const report = useMemo(
    () => (orders ? generateDailyPackingReport(orders, day, products ?? undefined) : null),
    [orders, day, products]
  );

  const isToday = day === getIstToday();
  const publishedToday = isDailyPriceUpdatePublished(settings?.publishedAt);

  function downloadPickList() {
    if (!report) return;
    downloadCSV(
      `freshkart-picklist-${report.istDate}.csv`,
      reportToCSV(
        ["Item", "Unit", "Total Qty", "Orders", "Packaging", "Cancelled Qty"],
        report.items.map((l) => [
          l.name,
          l.unit,
          l.totalQty,
          l.orderCount,
          l.packagingType,
          l.cancelledQty,
        ])
      )
    );
  }

  function downloadPackingList() {
    if (!report) return;
    // One row per customer-item so it pivots cleanly in Excel.
    const rows = report.slips.flatMap((s) =>
      s.items.map((i) => [
        s.businessName,
        s.contactName,
        s.phone,
        s.address,
        s.city,
        s.pincode,
        s.orderNumbers.join(" | "),
        i.name,
        i.qty,
        i.unit,
      ])
    );
    downloadCSV(
      `freshkart-packing-${report.istDate}.csv`,
      reportToCSV(
        [
          "Business",
          "Contact",
          "Phone",
          "Address",
          "City",
          "Pincode",
          "Order #",
          "Item",
          "Qty",
          "Unit",
        ],
        rows
      )
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <Card>
        <CardBody className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DayPicker value={day} onChange={setDay} />
            <div className="flex items-center gap-2">
              {report && <PackingSlipPrinter report={report} />}
              <Button
                variant="outline"
                onClick={view === "picklist" ? downloadPickList : downloadPackingList}
                disabled={!report}
                leadingIcon={<Download className="h-4 w-4" />}
              >
                CSV
              </Button>
            </div>
          </div>

          {isToday && (
            <p className="text-xs text-fg-subtle">
              {publishedToday && settings?.publishedAt
                ? `Prices published ${formatLastPublished(settings.publishedAt)} — the day is live.`
                : "Today's prices aren't published yet — orders open after publish."}
            </p>
          )}
        </CardBody>
      </Card>

      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading || !report ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-subtle">
          <Spinner className="h-4 w-4" /> Loading {formatIstDateLabel(day)}…
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard
              label="Orders"
              value={report.totals.orderCount}
              hint={formatIstDateLabel(day)}
              icon={ShoppingCart}
              tone="brand"
            />
            <StatCard
              label="To pick"
              value={`${report.totals.totalKg} kg`}
              hint={`${report.totals.totalPieces} pieces`}
              icon={Boxes}
              tone="brand"
            />
            <StatCard
              label="Customers"
              value={report.totals.customerCount}
              hint={`${report.slips.length} ${report.slips.length === 1 ? "drop" : "drops"}`}
              icon={Users}
              tone="gray"
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(report.totals.revenue)}
              hint={
                report.totals.refundedAmount > 0
                  ? `${formatCurrency(report.totals.refundedAmount)} refunded`
                  : "Non-cancelled"
              }
              icon={IndianRupee}
              tone="gray"
            />
          </div>

          {report.totals.cancelledOrderCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              <p className="text-xs text-fg">
                <strong>{report.totals.cancelledOrderCount}</strong>{" "}
                {report.totals.cancelledOrderCount === 1 ? "order was" : "orders were"} cancelled
                and {report.totals.cancelledOrderCount === 1 ? "is" : "are"} excluded from these
                quantities.
              </p>
            </div>
          )}

          {/* View toggle */}
          <div className="flex gap-1 rounded-lg bg-raised p-1">
            <Toggle active={view === "picklist"} onClick={() => setView("picklist")}>
              Pick list
            </Toggle>
            <Toggle active={view === "customers"} onClick={() => setView("customers")}>
              By customer ({report.slips.length})
            </Toggle>
          </div>

          {report.totals.orderCount === 0 ? (
            <EmptyState
              icon={Package}
              title="Nothing to pack"
              subtitle={`No orders were placed on ${formatIstDateLabel(day)}.`}
            />
          ) : view === "picklist" ? (
            <PickList report={report} />
          ) : (
            <CustomerSlips report={report} />
          )}
        </>
      )}
    </div>
  );
}

function PickList({ report }: { report: ReturnType<typeof generateDailyPackingReport> }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-px bg-line text-[10px] font-bold uppercase text-fg-subtle">
        <div className="bg-raised px-3 py-2">Item</div>
        <div className="bg-raised px-3 py-2 text-right">Total qty</div>
        <div className="bg-raised px-3 py-2 text-right">Orders</div>
        <div className="bg-raised px-3 py-2">Packaging</div>
      </div>
      {report.items.map((l) => (
        <div key={l.productId} className="grid grid-cols-[1fr_auto_auto_auto] gap-px bg-line">
          <div className="bg-surface px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-fg">{l.name}</p>
            {l.cancelledQty > 0 && (
              <p className="text-[10px] text-amber-500">
                {l.cancelledQty} {l.unit} cancelled
              </p>
            )}
          </div>
          <div className="bg-surface px-3 py-2.5 text-right">
            <span className="text-sm font-extrabold text-fg">{l.totalQty}</span>
            <span className="ml-1 text-[10px] text-fg-subtle">{l.unit}</span>
          </div>
          <div className="bg-surface px-3 py-2.5 text-right text-xs text-fg-subtle">
            {l.orderCount}
          </div>
          <div className="bg-surface px-3 py-2.5 text-[10px] text-fg-subtle">{l.packagingType}</div>
        </div>
      ))}
    </Card>
  );
}

function CustomerSlips({ report }: { report: ReturnType<typeof generateDailyPackingReport> }) {
  return (
    <div className="space-y-3">
      {report.slips.map((s) => (
        <Card key={s.key} className="overflow-hidden">
          <div className="border-b border-line bg-raised px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-fg">{s.businessName}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
                  <Phone className="h-3 w-3 shrink-0" aria-hidden />
                  {s.phone}
                  {s.label && (
                    <span className="ml-1 rounded-full bg-brand-500/15 px-1.5 py-0.5 font-bold text-brand-400">
                      {s.label}
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold text-fg">{formatCurrency(s.amount)}</p>
                <p className="text-[10px] text-fg-subtle">{s.orderNumbers.join(", ")}</p>
              </div>
            </div>

            <p className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-fg-muted">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                {s.contactName !== s.businessName && (
                  <span className="font-semibold text-fg">{s.contactName} · </span>
                )}
                {s.address}, {s.city} — {s.pincode}
              </span>
            </p>

            {s.orderNumbers.length > 1 && (
              <p className="mt-1.5 text-[10px] font-semibold text-amber-500">
                Merged from {s.orderNumbers.length} orders — pack as one.
              </p>
            )}
            {s.hasRefund && (
              <p className="mt-1 text-[10px] text-fg-subtle">Has a refunded return.</p>
            )}
          </div>

          <ul className="divide-y divide-line">
            {s.items.map((i) => (
              <li key={i.productId} className="flex items-center justify-between px-4 py-2">
                <span className="truncate text-xs text-fg">{i.name}</span>
                <span className="shrink-0 text-xs font-bold text-fg">
                  {i.qty} <span className="font-medium text-fg-subtle">{i.unit}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-line bg-raised px-4 py-2 text-[11px] font-semibold text-fg-subtle">
            {s.items.length} {s.items.length === 1 ? "item" : "items"}
            {s.totalKg > 0 && ` · ${s.totalKg} kg`}
            {s.totalPieces > 0 && ` · ${s.totalPieces} pc`}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md py-2 text-xs font-bold transition-colors",
        active ? "bg-brand-500 text-white" : "text-fg-subtle hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}
