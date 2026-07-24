"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { formatCurrency, MIN_ORDER_TOTAL_QTY } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StickyCartBar({ onReview, disabled }: { onReview: () => void; disabled?: boolean }) {
  const { itemCount, totalQty, subtotal } = useCart();
  if (itemCount === 0) return null;

  const qtyShort = `${totalQty} ${totalQty === 1 ? "kg" : "kgs"}`;
  const underMin = totalQty < MIN_ORDER_TOTAL_QTY;
  const remaining = Math.max(0, MIN_ORDER_TOTAL_QTY - totalQty);

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={onReview}
        disabled={disabled || underMin}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-cart-bar transition-colors",
          disabled || underMin
            ? "cursor-not-allowed opacity-60"
            : "hover:bg-brand-700"
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
                ? `Add ${remaining} more kg to reach minimum order`
                : "Free delivery · 1–2 days"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          {disabled ? "Prices updating…" : underMin ? `Min ${MIN_ORDER_TOTAL_QTY} kgs` : "Review & Order"}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
