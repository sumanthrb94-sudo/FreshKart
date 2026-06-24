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
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-app flex-col items-center justify-center gap-5 bg-white px-6 text-center shadow-xl">
      <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-brand-50">
        <CheckCircle2 className="h-11 w-11 text-brand-500" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Order placed!</h1>
        <p className="mt-1 text-sm text-gray-500">Your B2B order is confirmed.</p>
      </div>
      <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-xs font-semibold text-gray-600">
        {order.orderNumber}
      </span>
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-extrabold text-gray-900">
          {formatCurrency(order.total)}
        </p>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
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
