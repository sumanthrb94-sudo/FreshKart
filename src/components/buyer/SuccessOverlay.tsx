"use client";

import { CheckCircle2, Package } from "lucide-react";
import type { Order } from "@/lib/types";
import { formatCurrency, PAYMENT_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/Button";

export function SuccessOverlay({
  order,
  onPlaceAnother,
  onViewOrders,
}: {
  order: Order;
  onPlaceAnother: () => void;
  onViewOrders: () => void;
}) {
  const paymentChip =
    order.paymentStatus === "PAID"
      ? "✓ Paid online"
      : PAYMENT_LABELS[order.paymentMethod];

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-app flex-col items-center justify-center gap-5 bg-surface px-6 text-center shadow-xl">
      <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-brand-500/15">
        <CheckCircle2 className="h-11 w-11 text-brand-500" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-fg">Order placed!</h1>
        <p className="mt-1 text-sm text-fg-subtle">Your B2B order is confirmed.</p>
      </div>
      <span className="rounded-full bg-raised px-3 py-1 font-mono text-xs font-semibold text-fg-muted">
        {order.orderNumber}
      </span>
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-extrabold text-fg">
          {formatCurrency(order.total)}
        </p>
        <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-300">
          {paymentChip}
        </span>
      </div>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2.5">
        <Button size="lg" fullWidth onClick={onPlaceAnother}>
          Place another order
        </Button>
        <Button
          size="lg"
          variant="outline"
          fullWidth
          onClick={onViewOrders}
          leadingIcon={<Package className="h-4 w-4" />}
        >
          View my orders
        </Button>
      </div>
    </div>
  );
}
