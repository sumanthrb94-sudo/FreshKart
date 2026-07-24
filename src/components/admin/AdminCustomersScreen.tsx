"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Users } from "lucide-react";
import type { Customer } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader } from "@/components/ui/Spinner";

function CustomerCard({
  customer: c,
  highlighted,
  cardRef,
}: {
  customer: Customer;
  highlighted: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={cardRef}>
      <Card
        className={cn(
          "flex items-center justify-between gap-3 p-4 transition-colors",
          highlighted && "ring-2 ring-brand-500"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-400">
            {c.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-fg">{c.name}</p>
            <p className="truncate text-xs text-fg-subtle">{c.businessName}</p>
            <p className="truncate text-2xs text-fg-subtle">
              {c.phone} · {c.city ?? "—"}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-fg">{c.orderCount} orders</p>
          <p className="text-xs text-fg-subtle">{formatCurrency(c.totalSpent)} spent</p>
        </div>
      </Card>
    </div>
  );
}

function CustomerTable({
  customers,
  highlightId,
  highlightedRef,
}: {
  customers: Customer[];
  highlightId: string | null;
  highlightedRef: React.RefObject<HTMLTableRowElement | null>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="fc-scroll overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-raised text-xs font-bold uppercase tracking-wide text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-semibold">Buyer</th>
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 text-right font-semibold">Orders</th>
              <th className="px-4 py-3 text-right font-semibold">Total spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.map((c) => (
              <tr
                key={c.id}
                ref={c.id === highlightId ? highlightedRef : undefined}
                className={cn("transition-colors", c.id === highlightId && "bg-brand-500/10")}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-400">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-semibold text-fg">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-fg-muted">{c.businessName}</td>
                <td className="px-4 py-3 text-fg-muted">{c.phone}</td>
                <td className="px-4 py-3 text-fg-muted">{c.city ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-fg">{c.orderCount}</td>
                <td className="px-4 py-3 text-right font-bold text-fg">{formatCurrency(c.totalSpent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdminCustomersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: customers, loading, error, refetch } = useAsync(() => api.listCustomers(), []);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightedCardRef = useRef<HTMLDivElement | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Deep-link support: /admin/customers?highlight=<id> — used by the
  // dashboard search bar to jump straight to a specific buyer. There's no
  // per-customer detail route, so we scroll to and highlight the row/card instead.
  useEffect(() => {
    if (!customers) return;
    const highlight = params.get("highlight");
    if (!highlight) return;
    if (customers.some((c) => c.id === highlight)) setHighlightId(highlight);
    router.replace("/admin/customers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  useEffect(() => {
    if (!highlightId) return;
    (highlightedRowRef.current ?? highlightedCardRef.current)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return (
    <AdminShell>
      {loading ? (
        <FullScreenLoader />
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load customers"
          subtitle={error}
          action={
            <Button size="lg" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : !customers || customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" />
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div>
            <h1 className="text-lg font-extrabold text-fg">Buyers</h1>
            <p className="text-xs text-fg-subtle">{customers.length} registered buyers</p>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {customers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                highlighted={c.id === highlightId}
                cardRef={c.id === highlightId ? highlightedCardRef : undefined}
              />
            ))}
          </div>
          <div className="hidden lg:block">
            <CustomerTable customers={customers} highlightId={highlightId} highlightedRef={highlightedRowRef} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
