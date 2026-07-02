"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, Search, AlertTriangle } from "lucide-react";
import { demoReturnRequests, RETURN_REASON_LABELS } from "@/lib/returns";
import type { ReturnRequest, ReturnStatus } from "@/lib/returns";

export function AdminReturnsScreen() {
  const [returns, setReturns] = useState<ReturnRequest[]>(demoReturnRequests);
  const [filter, setFilter] = useState<ReturnStatus | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = returns.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.businessName.toLowerCase().includes(search.toLowerCase()) &&
        !r.orderNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleStatusChange = (id: string, newStatus: ReturnStatus) => {
    setReturns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus, resolvedAt: new Date().toISOString() } : r))
    );
  };

  const statusColors: Record<ReturnStatus, string> = {
    REQUESTED: "bg-amber-500/10 text-amber-500",
    APPROVED: "bg-emerald-500/10 text-emerald-500",
    REJECTED: "bg-red-500/10 text-red-500",
    COMPLETED: "bg-brand-500/10 text-brand-500",
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <h1 className="text-lg font-extrabold text-fg">Returns & Refunds</h1>
        <p className="text-xs text-fg-subtle">Manage customer returns and process refunds</p>

        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            type="text"
            placeholder="Search by order # or business…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 bg-transparent text-sm text-fg outline-none"
          />
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto">
          {(["all", "REQUESTED", "APPROVED", "REJECTED", "COMPLETED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                filter === s ? "bg-brand-500 text-white" : "bg-raised text-fg-subtle hover:bg-surface"
              }`}
            >
              {s === "all" ? `All (${returns.length})` : `${s} (${returns.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RotateCcw className="h-12 w-12 text-fg-subtle" />
            <p className="mt-3 text-base font-bold text-fg">No returns found</p>
          </div>
        ) : (
          filtered.map((ret) => (
            <div key={ret.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[ret.status]}`}>
                      {ret.status}
                    </span>
                    <span className="text-xs font-mono text-fg-muted">{ret.id}</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-fg">{ret.businessName}</p>
                  <p className="text-xs text-fg-subtle">{ret.orderNumber}</p>
                </div>
                <p className="text-lg font-extrabold text-fg">Rs. {ret.totalRefund}</p>
              </div>

              <div className="mt-3 space-y-1">
                {ret.items.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between text-sm">
                    <span className="text-fg">
                      {item.productName} — {item.returnQty} {item.unit}
                    </span>
                    <span className="text-fg-muted">Rs. {item.lineRefund}</span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
                <AlertTriangle className="h-3 w-3" />
                {RETURN_REASON_LABELS[ret.reason]}
              </div>

              {ret.notes && (
                <p className="mt-1 text-xs text-fg-subtle italic">&quot;{ret.notes}&quot;</p>
              )}

              {ret.status === "REQUESTED" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleStatusChange(ret.id, "APPROVED")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleStatusChange(ret.id, "REJECTED")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}

              {ret.status === "APPROVED" && (
                <button
                  onClick={() => handleStatusChange(ret.id, "COMPLETED")}
                  className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600"
                >
                  Mark Refund Completed
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
