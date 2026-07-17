"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader } from "@/components/ui/Spinner";

export function AdminCustomersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: customers, loading, error, refetch } = useAsync(() => api.listCustomers(), []);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // Deep-link support: /admin/customers?highlight=<id> — used by the
  // dashboard search bar to jump straight to a specific buyer. There's no
  // per-customer detail route, so we scroll to and highlight the card instead.
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
    highlightedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
        <div className="flex flex-col gap-3 p-4">
          {customers.map((c) => (
            <div key={c.id} ref={c.id === highlightId ? highlightedRef : undefined}>
              <Card
                className={cn(
                  "flex items-center justify-between gap-3 p-4 transition-colors",
                  c.id === highlightId && "ring-2 ring-brand-500"
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
          ))}
        </div>
      )}
    </AdminShell>
  );
}
