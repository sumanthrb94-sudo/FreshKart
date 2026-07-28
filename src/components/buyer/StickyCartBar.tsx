"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { formatCurrency } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { cn } from "@/lib/utils";

export function StickyCartBar({ onReview, disabled }: { onReview: () => void; disabled?: boolean }) {
  const { itemCount, totalQty, subtotal } = useCart();
  if (itemCount === 0) return null;

  const qtyShort = `${totalQty} ${totalQty === 1 ? "kg" : "kgs"}`;
  // No whole-cart minimum any more — each product enforces its own minimum
  // through the quantity stepper, so any non-empty cart can be checked out.
  // Surface the delivery fee instead, since that's now the thing worth
  // nudging on ("₹X more for free delivery").
  const deliveryFee = calculateDeliveryFee(subtotal);
  const toFreeDelivery = Math.max(0, 3001 - subtotal);

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={onReview}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-cart-bar transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-brand-700"
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
              {deliveryFee === 0
                ? "Free delivery · 1–2 days"
                : `+${formatCurrency(deliveryFee)} delivery · ${formatCurrency(toFreeDelivery)} more for free`}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          {disabled ? "Prices updating…" : "Review & Order"}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
