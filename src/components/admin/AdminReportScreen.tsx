"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
  Package,
  IndianRupee,
  TrendingDown,
  Clock,
  CheckCircle2,
  ArrowDownToLine,
} from "lucide-react";
import { generateSupplierReport, reportToCSV, reportToText } from "@/lib/supplier-report";
import type { SupplierReport } from "@/lib/supplier-report";

/** Admin supplier order report screen. */
export function AdminReportScreen() {
  const [report, setReport] = useState<SupplierReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const generate = useCallback(() => {
    setBusy(true);
    // Small delay to show the loading state
    setTimeout(() => {
      const r = generateSupplierReport();
      setReport(r);
      setBusy(false);
      setDownloaded(null);
    }, 300);
  }, []);

  const downloadCSV = useCallback(() => {
    if (!report) return;
    const csv = reportToCSV(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freshkart-supplier-report-${report.reportDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded("csv");
  }, [report]);

  const downloadText = useCallback(() => {
    if (!report) return;
    const text = reportToText(report);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freshkart-supplier-report-${report.reportDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded("text");
  }, [report]);

  // Initial generation on mount
  useState(() => {
    generate();
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-fg">Supplier Order Report</h1>
            <p className="text-xs text-fg-subtle">
              Daily ordering list for next-day delivery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-muted transition-colors hover:bg-raised disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {report && (
              <>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  CSV
                </button>
                <button
                  onClick={downloadText}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-muted transition-colors hover:bg-raised"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Text
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
              <p className="mt-3 text-sm text-fg-subtle">Generating report…</p>
            </motion.div>
          ) : report && report.totalItemsToOrder > 0 ? (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Download success toast */}
              <AnimatePresence>
                {downloaded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {downloaded === "csv" ? "CSV report downloaded" : "Text report downloaded"}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-fg">{report.summary.criticalStockCount}</p>
                      <p className="text-[10px] font-medium text-fg-subtle">Critical Stock</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                      <TrendingDown className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-fg">{report.summary.lowStockCount}</p>
                      <p className="text-[10px] font-medium text-fg-subtle">Low Stock</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                      <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-fg">{report.totalItemsToOrder}</p>
                      <p className="text-[10px] font-medium text-fg-subtle">Items to Order</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                      <IndianRupee className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-fg">
                        Rs. {report.totalEstimatedCost.toLocaleString("en-IN")}
                      </p>
                      <p className="text-[10px] font-medium text-fg-subtle">Est. Total Cost</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending orders info */}
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <Clock className="h-4 w-4 text-fg-subtle" />
                <p className="text-xs text-fg-subtle">
                  <span className="font-bold text-fg">{report.summary.pendingOrderItems}</span> products needed for{" "}
                  <span className="font-bold text-fg">{report.summary.totalPendingOrderQty}</span> pending order units
                </p>
              </div>

              {/* Report ID & date */}
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                <div>
                  <p className="text-[10px] font-medium text-fg-subtle">Report ID</p>
                  <p className="text-xs font-mono font-bold text-fg">{report.reportId}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium text-fg-subtle">Generated</p>
                  <p className="text-xs text-fg">
                    {new Date(report.generatedAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })} IST
                  </p>
                </div>
              </div>

              {/* Items by origin */}
              {Object.entries(report.byOrigin).map(([origin, items]) => (
                <div key={origin} className="rounded-xl border border-line bg-surface overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
                    <h3 className="text-sm font-bold text-fg">{origin}</h3>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                      {items.length} items
                    </span>
                  </div>
                  <div className="divide-y divide-line">
                    {items.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            item.stockStatus === "CRITICAL"
                              ? "bg-red-100 text-red-600"
                              : item.stockStatus === "LOW"
                                ? "bg-amber-100 text-amber-600"
                                : "bg-emerald-100 text-emerald-600"
                          }`}
                        >
                          {item.stockStatus === "CRITICAL" ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : item.stockStatus === "LOW" ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : (
                            <ArrowDownToLine className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-fg truncate">{item.productName}</p>
                          <p className="text-[10px] text-fg-subtle">
                            Stock: {item.currentStock} {item.unit} · Pending: {item.pendingOrderQty} {item.unit}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-extrabold text-fg">
                            {item.suggestedOrderQty} {item.unit}
                          </p>
                          <p className="text-[10px] text-fg-subtle">
                            Rs. {item.estimatedCost.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-line bg-raised px-4 py-2 text-right">
                    <p className="text-xs font-bold text-fg">
                      Subtotal: Rs. {items.reduce((s, i) => s + i.estimatedCost, 0).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="mt-3 text-base font-bold text-fg">All Stock Healthy</p>
              <p className="mt-1 text-sm text-fg-subtle">No items need reordering right now.</p>
              <button
                onClick={generate}
                className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
              >
                Generate Anyway
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
