"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { formatCurrency, MIN_ORDER_TOTAL_QTY } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { cn } from "@/lib/utils";

export function StickyCartBar({ onReview, disabled }: { onReview: () => void; disabled?: boolean }) {
  const { itemCount, totalQty, subtotal } = useCart();
  if (itemCount === 0) return null;

  const qtyShort = `${totalQty} ${totalQty === 1 ? "kg" : "kgs"}`;
  // Wholesale floor: below it the order can't be placed, so the bar says how
  // much more is needed rather than letting someone reach checkout to be told.
  const underMin = totalQty < MIN_ORDER_TOTAL_QTY;
  const remaining = Math.max(0, MIN_ORDER_TOTAL_QTY - totalQty);
  // Above the floor the delivery fee is the thing worth nudging on instead.
  const deliveryFee = calculateDeliveryFee(subtotal);
  const toFreeDelivery = Math.max(0, 3001 - subtotal);

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={onReview}
        disabled={disabled || underMin}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-cart-bar transition-colors",
          disabled || underMin ? "cursor-not-allowed opacity-60" : "hover:bg-brand-700"
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold">
              {qtyShort} · {formatCurrency(subtotal)}
            </span>
            <span className="block text-2xs font-medium text-white/80">
              {underMin
                ? `Add ${remaining} ${remaining === 1 ? "kg" : "kgs"} more to place an order`
                : deliveryFee === 0
                  ? "Free delivery · 1–2 days"
                  : `+${formatCurrency(deliveryFee)} delivery · ${formatCurrency(toFreeDelivery)} more for free`}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          {disabled
            ? "Prices updating…"
            : underMin
              ? `Min ${MIN_ORDER_TOTAL_QTY} kgs`
              : "Review & Order"}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
