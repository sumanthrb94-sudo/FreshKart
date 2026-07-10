"use client";

import { useState, useCallback } from "react";
import {
  ClipboardList,
  Package,
  ShoppingCart,
  FileText,
  Download,
  IndianRupee,
  TrendingUp,
  Boxes,
  Users,
  Clock,
} from "lucide-react";
import {
  generateInventoryReport,
  generatePurchaseReport,
  generatePackagingReport,
  generateInvoiceReportPerCustomer,
  reportToCSV,
} from "@/lib/reports";

type ReportTab = "inventory" | "purchase" | "packaging" | "invoices";

export function AdminReportsHub() {
  const [activeTab, setActiveTab] = useState<ReportTab>("inventory");
  const [downloaded, setDownloaded] = useState(false);

  const downloadCSV = useCallback(() => {
    let csv = "";
    let filename = "";

    switch (activeTab) {
      case "inventory": {
        const r = generateInventoryReport();
        csv = reportToCSV(
          ["Product", "Category", "Unit", "Opening", "Sold", "Returned", "Closing", "Price", "Stock Value", "Status"],
          r.lines.map((l) => [l.productName, l.category, l.unit, l.openingStock, l.soldQty, l.returnedQty, l.closingStock, l.unitPrice, l.stockValue, l.status])
        );
        filename = `green-basket-inventory-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }
      case "purchase": {
        const r = generatePurchaseReport();
        csv = reportToCSV(
          ["Product", "Category", "Qty Sold", "Revenue", "Avg Order", "Orders", "Trend"],
          r.lines.map((l) => [l.productName, l.category, l.totalSoldQty, l.totalRevenue, l.avgOrderQty, l.orderCount, l.trend])
        );
        filename = `green-basket-purchase-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }
      case "packaging": {
        const r = generatePackagingReport();
        csv = reportToCSV(
          ["Product", "Unit", "Orders", "Total Qty", "Packaging Type", "Est. Cost"],
          r.lines.map((l) => [l.productName, l.unit, l.orderCount, l.totalQty, l.packagingType, l.estPackagingCost])
        );
        filename = `green-basket-packaging-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }
      case "invoices": {
        const r = generateInvoiceReportPerCustomer();
        const rows: (string | number)[][] = [];
        for (const c of r) {
          for (const l of c.lines) {
            rows.push([c.businessName, l.orderNumber, l.date, l.total, l.paymentMethod, l.paymentStatus, l.invoiceNumber]);
          }
        }
        csv = reportToCSV(["Business", "Order #", "Date", "Total", "Payment", "Paid", "Invoice"], rows);
        filename = `green-basket-invoices-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }, [activeTab]);

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: "inventory", label: "Inventory", icon: ClipboardList },
    { key: "purchase", label: "Purchase", icon: ShoppingCart },
    { key: "packaging", label: "Packaging", icon: Package },
    { key: "invoices", label: "Invoices", icon: FileText },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-fg">Reports</h1>
            <p className="text-xs text-fg-subtle">Inventory, purchase, packaging & invoices</p>
          </div>
          <button
            onClick={downloadCSV}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              downloaded
                ? "bg-emerald-500 text-white"
                : "bg-brand-500 text-white hover:bg-brand-600"
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            {downloaded ? "Downloaded!" : "Download CSV"}
          </button>
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "inventory" && <InventoryReportView />}
        {activeTab === "purchase" && <PurchaseReportView />}
        {activeTab === "packaging" && <PackagingReportView />}
        {activeTab === "invoices" && <InvoicesReportView />}
      </div>
    </div>
  );
}

function InventoryReportView() {
  const r = generateInventoryReport();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={Boxes} label="Total Items" value={r.totalItems} color="text-blue-500" />
        <SummaryCard icon={IndianRupee} label="Stock Value" value={`Rs. ${r.totalStockValue.toLocaleString("en-IN")}`} color="text-emerald-500" />
        <SummaryCard icon={TrendingUp} label="Low Stock" value={r.lowStockCount} color="text-amber-500" />
        <SummaryCard icon={Clock} label="Critical" value={r.criticalStockCount} color="text-red-500" />
      </div>
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-6 gap-px bg-line text-[10px] font-bold uppercase text-fg-subtle">
          <div className="bg-raised px-3 py-2">Product</div>
          <div className="bg-raised px-3 py-2 text-right">Closing</div>
          <div className="bg-raised px-3 py-2 text-right">Sold</div>
          <div className="bg-raised px-3 py-2 text-right">Price</div>
          <div className="bg-raised px-3 py-2 text-right">Value</div>
          <div className="bg-raised px-3 py-2 text-center">Status</div>
        </div>
        {r.lines.map((l) => (
          <div key={l.productId} className="grid grid-cols-6 gap-px bg-line">
            <div className="bg-surface px-3 py-2 text-xs text-fg truncate">{l.productName}</div>
            <div className="bg-surface px-3 py-2 text-xs text-fg text-right">{l.closingStock}</div>
            <div className="bg-surface px-3 py-2 text-xs text-fg text-right">{l.soldQty}</div>
            <div className="bg-surface px-3 py-2 text-xs text-fg text-right">{l.unitPrice}</div>
            <div className="bg-surface px-3 py-2 text-xs text-fg text-right">{l.stockValue}</div>
            <div className="bg-surface px-3 py-2 text-center">
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                l.status === "CRITICAL" ? "bg-red-100 text-red-600" :
                l.status === "LOW" ? "bg-amber-100 text-amber-600" :
                "bg-emerald-100 text-emerald-600"
              }`}>{l.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaseReportView() {
  const r = generatePurchaseReport();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard icon={ShoppingCart} label="Total Revenue" value={`Rs. ${r.totalRevenue.toLocaleString("en-IN")}`} color="text-emerald-500" />
        <SummaryCard icon={Boxes} label="Qty Sold" value={r.totalQtySold} color="text-blue-500" />
        <SummaryCard icon={Users} label="Orders" value={r.totalOrders} color="text-brand-500" />
      </div>
      {r.lines.slice(0, 20).map((l) => (
        <div key={l.productId} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-bold text-fg">{l.productName}</p>
            <p className="text-[10px] text-fg-subtle">{l.totalSoldQty} {l.category} sold · {l.orderCount} orders</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-extrabold text-fg">Rs. {l.totalRevenue.toLocaleString("en-IN")}</p>
            <p className={`text-[10px] font-bold ${l.trend === "UP" ? "text-emerald-500" : l.trend === "DOWN" ? "text-red-500" : "text-fg-subtle"}`}>
              {l.trend}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PackagingReportView() {
  const r = generatePackagingReport();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={Package} label="Total Cost" value={`Rs. ${r.totalPackagingCost}`} color="text-emerald-500" />
        <SummaryCard icon={ShoppingCart} label="Orders" value={r.totalOrders} color="text-blue-500" />
      </div>
      {r.lines.filter((l) => l.totalQty > 0).map((l) => (
        <div key={l.productId} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-bold text-fg">{l.productName}</p>
            <p className="text-[10px] text-fg-subtle">{l.packagingType} · {l.totalQty} {l.unit}</p>
          </div>
          <p className="text-sm font-extrabold text-fg">Rs. {l.estPackagingCost}</p>
        </div>
      ))}
    </div>
  );
}

function InvoicesReportView() {
  const r = generateInvoiceReportPerCustomer();
  return (
    <div className="space-y-4">
      {r.map((c) => (
        <div key={c.businessName} className="rounded-xl border border-line bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-fg">{c.businessName}</h3>
              <p className="text-[10px] text-fg-subtle">{c.customerPhone} · {c.customerCity}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold text-fg">Rs. {c.totalSpent.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-fg-subtle">{c.totalOrders} orders · {c.totalItems} items</p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {c.lines.map((l) => (
              <div key={l.orderId} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-xs font-semibold text-fg">{l.orderNumber}</p>
                  <p className="text-[10px] text-fg-subtle">{l.invoiceNumber} · {l.paymentMethod}</p>
                </div>
                <p className="text-sm font-bold text-fg">Rs. {l.total.toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-[10px] font-medium text-fg-subtle">{label}</p>
      </div>
      <p className="mt-1 text-lg font-extrabold text-fg">{value}</p>
    </div>
  );
}
