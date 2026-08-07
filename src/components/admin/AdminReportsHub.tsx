"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ClipboardList,
  Package,
  ShoppingCart,
  FileText,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  generateInventoryReport,
  generateSalesReport,
  generateInvoiceReportPerCustomer,
  reportToCSV,
  type InventoryReport,
  type SalesReport,
  type CustomerInvoiceReport,
} from "@/lib/reports";
import { downloadCSV as saveCSV } from "@/lib/csv";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { getIstToday, shiftIstDate, getIstBusinessDayRange } from "@/lib/time";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPackingView } from "./AdminPackingView";

type ReportTab = "packing" | "inventory" | "sales" | "invoices";

/** How far back the figures reach. Stock on hand is always current; only what
 *  SOLD is scoped to the period. */
const PERIODS = [
  { key: "1", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
] as const;

export function AdminReportsHub() {
  // Packing is the daily-driver report — it opens first.
  const [activeTab, setActiveTab] = useState<ReportTab>("packing");
  const [periodKey, setPeriodKey] = useState<(typeof PERIODS)[number]["key"]>("7");
  const [downloaded, setDownloaded] = useState(false);

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];

  // The window runs from the start of the first day to the end of today, in
  // IST business days — the same day boundaries the packing run uses, so the
  // two tabs never disagree about which day an order belongs to.
  const { startIso, endIso } = useMemo(() => {
    const today = getIstToday();
    return {
      startIso: getIstBusinessDayRange(shiftIstDate(today, -(period.days - 1))).startIso,
      endIso: getIstBusinessDayRange(today).endIso,
    };
  }, [period.days]);

  // Packing fetches its own data for its own day; the other three share this.
  const needsData = activeTab !== "packing";
  const {
    data: orders,
    loading,
    error,
  } = useAsync(
    () => (needsData ? api.listOrdersByRange(startIso, endIso) : Promise.resolve(null)),
    [needsData, startIso, endIso]
  );
  const { data: products } = useAsync(
    () => (needsData ? api.listProducts() : Promise.resolve(null)),
    [needsData]
  );

  const inventory = useMemo(
    () => (orders && products ? generateInventoryReport(orders, products) : null),
    [orders, products]
  );
  const sales = useMemo(
    () => (orders && products ? generateSalesReport(orders, products) : null),
    [orders, products]
  );
  const invoices = useMemo(
    () => (orders ? generateInvoiceReportPerCustomer(orders) : null),
    [orders]
  );

  const downloadCSV = useCallback(() => {
    const stamp = `${period.days}d-${getIstToday()}`;
    let csv = "";
    let filename = "";

    if (activeTab === "inventory" && inventory) {
      csv = reportToCSV(
        ["Product", "Unit", "Stock on hand", "Sold", "Price", "Stock value", "Status"],
        inventory.lines.map((l) => [
          l.productName, l.unit, l.stockOnHand, l.soldQty, l.unitPrice, l.stockValue, l.status,
        ])
      );
      filename = `green-basket-inventory-${stamp}.csv`;
    } else if (activeTab === "sales" && sales) {
      csv = reportToCSV(
        ["Product", "Unit", "Qty sold", "Revenue", "Orders"],
        sales.lines.map((l) => [l.productName, l.unit, l.soldQty, l.revenue, l.orderCount])
      );
      filename = `green-basket-sales-${stamp}.csv`;
    } else if (activeTab === "invoices" && invoices) {
      const rows: (string | number)[][] = [];
      for (const c of invoices) {
        for (const l of c.lines) {
          rows.push([
            c.businessName, c.customerPhone, l.orderNumber, l.invoiceNumber,
            l.date.slice(0, 10), l.total, l.paymentMethod, l.paid ? "Paid" : "Unpaid",
          ]);
        }
      }
      csv = reportToCSV(
        ["Business", "Phone", "Order #", "Invoice", "Date", "Total", "Payment", "Paid"],
        rows
      );
      filename = `green-basket-invoices-${stamp}.csv`;
    }

    if (!csv) return;
    saveCSV(filename, csv);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }, [activeTab, period.days, inventory, sales, invoices]);

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: "packing", label: "Packing", icon: Package },
    { key: "inventory", label: "Stock", icon: ClipboardList },
    { key: "sales", label: "Sales", icon: ShoppingCart },
    { key: "invoices", label: "Invoices", icon: FileText },
  ];

  const ready = Boolean(orders) && !loading && !error;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-fg">Reports</h1>
            <p className="truncate text-xs text-fg-subtle">
              Packing, stock, sales &amp; invoices
            </p>
          </div>
          {needsData && (
            <button
              onClick={downloadCSV}
              disabled={!ready}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${
                downloaded ? "bg-emerald-500 text-white" : "bg-brand-500 text-white hover:bg-brand-600"
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              {downloaded ? "Downloaded!" : "CSV"}
            </button>
          )}
        </div>

        <div className="mt-2 flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                  activeTab === t.key ? "bg-brand-500 text-white" : "bg-raised text-fg-subtle hover:bg-surface"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {needsData && (
          <div className="mt-2 flex items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodKey(p.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                  periodKey === p.key
                    ? "bg-fg text-canvas"
                    : "bg-raised text-fg-subtle hover:text-fg"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "packing" && <AdminPackingView />}

        {needsData && loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {needsData && error && (
          <Alert variant="error">Couldn&apos;t load orders. Pull down to try again.</Alert>
        )}

        {ready && activeTab === "inventory" && inventory && (
          <InventoryView r={inventory} periodLabel={period.label} />
        )}
        {ready && activeTab === "sales" && sales && (
          <SalesView r={sales} periodLabel={period.label} />
        )}
        {ready && activeTab === "invoices" && invoices && (
          <InvoicesView r={invoices} periodLabel={period.label} />
        )}
      </div>
    </div>
  );
}

const rupees = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

/** The one figure a screen is about, stated once and large. */
function Headline({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-medium text-fg-subtle">{label}</p>
      {/* text-xl, not 2xl: a stock value in lakhs ("Rs. 2,44,660") wrapped onto
          a second line at 2xl and broke the card. tabular-nums keeps the two
          cards' digits on the same baseline grid. */}
      <p
        className={`mt-0.5 whitespace-nowrap text-xl font-extrabold tabular-nums ${
          tone === "warn" ? "text-amber-600" : "text-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PeriodNote({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[11px] text-fg-subtle">{children}</p>;
}

/**
 * Stock. Was a six-column table crushed into a phone, where the product column
 * truncated to "Onio…" — and two different onions both read "Onio…", which
 * makes the row useless. It is a list now, with the whole name, ordered so the
 * thing about to run out is on top.
 */
function InventoryView({ r, periodLabel }: { r: InventoryReport; periodLabel: string }) {
  const needsAttention = r.criticalStockCount + r.lowStockCount;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Headline label="Stock value" value={rupees(r.totalStockValue)} />
        <Headline
          label="Need reordering"
          value={String(needsAttention)}
          tone={needsAttention > 0 ? "warn" : undefined}
        />
      </div>
      <PeriodNote>
        Stock is what&apos;s on the shelf now. &ldquo;Sold&rdquo; covers the last {periodLabel.toLowerCase()}.
      </PeriodNote>

      {r.lines.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No active products" subtitle="Add products to see stock here." />
      ) : (
        <div className="space-y-2">
          {r.lines.map((l) => (
            <div
              key={l.productId}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg">{l.productName}</p>
                <p className="text-[11px] text-fg-subtle">
                  {l.soldQty} {l.unit} sold · {rupees(l.unitPrice)}/{l.unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold text-fg">
                  {l.stockOnHand} {l.unit}
                </p>
                {l.status === "OK" ? (
                  <p className="text-[11px] text-fg-subtle">{rupees(l.stockValue)}</p>
                ) : (
                  <p
                    className={`flex items-center justify-end gap-1 text-[11px] font-bold ${
                      l.status === "CRITICAL" ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {l.status === "CRITICAL" ? "Order now" : "Running low"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sales. Was "Purchase", which read as what we buy from suppliers — that is the
 * supplier report, a different screen. Two things also went: the row said
 * "125 vegetables sold" because it printed the CATEGORY where the unit belonged,
 * and every row carried an UP/DOWN/STABLE badge that compared nothing to
 * anything — it was `qty > 100 ? UP : qty < 20 ? DOWN : STABLE`, a threshold on
 * volume wearing the clothes of a trend. A label that looks like insight and
 * isn't is worse than no label.
 */
function SalesView({ r, periodLabel }: { r: SalesReport; periodLabel: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Headline label="Revenue" value={rupees(r.totalRevenue)} />
        <Headline label="Orders" value={String(r.totalOrders)} />
      </div>
      <PeriodNote>Last {periodLabel.toLowerCase()}, cancelled orders excluded.</PeriodNote>

      {r.lines.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No sales yet" subtitle={`Nothing sold in the last ${periodLabel.toLowerCase()}.`} />
      ) : (
        <div className="space-y-2">
          {r.lines.map((l) => (
            <div
              key={l.productId}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg">{l.productName}</p>
                <p className="text-[11px] text-fg-subtle">
                  {l.soldQty} {l.unit} · {l.orderCount} {l.orderCount === 1 ? "order" : "orders"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-fg">{rupees(l.revenue)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Invoices. The question this screen answers is "who still owes me", so that is
 * the number it leads with, and the customer who owes most is first. Orders
 * that are already paid stay visible but recede.
 */
function InvoicesView({ r, periodLabel }: { r: CustomerInvoiceReport[]; periodLabel: string }) {
  const owed = r.reduce((s, c) => s + c.totalUnpaid, 0);
  const billed = r.reduce((s, c) => s + c.totalBilled, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Headline label="Unpaid" value={rupees(owed)} tone={owed > 0 ? "warn" : undefined} />
        <Headline label="Billed" value={rupees(billed)} />
      </div>
      <PeriodNote>Last {periodLabel.toLowerCase()}, most owed first.</PeriodNote>

      {r.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices" subtitle={`No orders in the last ${periodLabel.toLowerCase()}.`} />
      ) : (
        r.map((c) => (
          <div key={c.businessName} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-fg">{c.businessName}</h3>
                <p className="truncate text-[11px] text-fg-subtle">
                  {c.customerPhone} · {c.totalOrders} {c.totalOrders === 1 ? "order" : "orders"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {c.totalUnpaid > 0 ? (
                  <>
                    <p className="text-sm font-extrabold text-amber-600">{rupees(c.totalUnpaid)}</p>
                    <p className="text-[11px] text-fg-subtle">unpaid</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-extrabold text-fg">{rupees(c.totalBilled)}</p>
                    <p className="text-[11px] text-emerald-600">all paid</p>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y divide-line">
              {c.lines.map((l) => (
                <div key={l.orderId} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-fg">{l.orderNumber}</p>
                    <p className="truncate text-[11px] text-fg-subtle">
                      {l.date.slice(0, 10)} · {l.paymentMethod}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-fg">{rupees(l.total)}</p>
                    {!l.paid && <p className="text-[11px] font-bold text-amber-600">Unpaid</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
