"use client";

import Link from "next/link";
import {
  ArrowLeft,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  IndianRupee,
  ChevronRight,
  PackageX,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { formatCurrency, formatDate } from "@/lib/format";
import { RETURN_REASON_LABELS } from "@/lib/returns";
import type { ReturnRequest, ReturnStatus } from "@/lib/returns";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAsync } from "@/lib/hooks";

const STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; icon: typeof Clock }> = {
  REQUESTED: { label: "Requested", color: "text-amber-500 bg-amber-500/10", icon: Clock },
  APPROVED: { label: "Approved", color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", color: "text-red-500 bg-red-500/10", icon: XCircle },
  PICKED_UP: { label: "Picked Up", color: "text-blue-500 bg-blue-500/10", icon: Truck },
  REFUNDED: { label: "Refunded", color: "text-brand-500 bg-brand-500/10", icon: IndianRupee },
  COMPLETED: { label: "Completed", color: "text-brand-500 bg-brand-500/10", icon: CheckCircle2 },
};

export function BuyerReturnsScreen() {
  const { user } = useAuth();
  const { data: returns, loading } = useAsync(
    () => api.listReturns(user?.id),
    [user?.id]
  );
  const list = returns ?? [];

  if (loading) {
    return (
      <AppShell header={<BuyerHeader />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        <Link href="/orders" className="flex w-fit items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> My orders
        </Link>

        <div>
          <h1 className="text-lg font-extrabold text-fg">My Returns</h1>
          <p className="text-xs text-fg-subtle">Track your return and refund requests</p>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={PackageX}
            title="No returns yet"
            subtitle="Your return requests will appear here."
            action={
              <Link href="/orders">
                <Button>View orders</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((ret) => {
              const cfg = STATUS_CONFIG[ret.status];
              return (
                <Link key={ret.id} href={`/returns/${ret.id}`}>
                  <Card className="transition-colors hover:bg-raised/40">
                    <CardBody className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.color}`}>
                              <cfg.icon className="inline h-3 w-3 mr-0.5" />
                              {cfg.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-bold text-fg">{ret.orderNumber}</p>
                          <p className="text-xs text-fg-subtle">{RETURN_REASON_LABELS[ret.reason]}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-fg">{formatCurrency(ret.totalRefund)}</p>
                          <ChevronRight className="ml-auto h-4 w-4 text-fg-subtle" />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-fg-subtle">
                        Requested on {formatDate(ret.requestedAt)}
                      </p>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
