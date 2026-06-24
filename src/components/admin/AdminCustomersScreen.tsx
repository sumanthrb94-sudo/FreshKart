"use client";

import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";

export function AdminCustomersScreen() {
  const { data: customers, loading } = useAsync(() => api.listCustomers(), []);

  return (
    <AdminShell>
      {loading ? (
        <FullScreenLoader />
      ) : !customers || customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {customers.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{c.name}</p>
                  <p className="truncate text-xs text-gray-500">{c.businessName}</p>
                  <p className="truncate text-2xs text-gray-400">
                    {c.phone} · {c.city ?? "—"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-gray-900">{c.orderCount} orders</p>
                <p className="text-xs text-gray-400">{formatCurrency(c.totalSpent)} spent</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
