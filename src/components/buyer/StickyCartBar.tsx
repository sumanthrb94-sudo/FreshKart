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
  // A cart must reach the whole-order minimum before it can be reviewed — the
  // button is not clickable until then, so the buyer meets the floor here
  // rather than filling in an address and only then being turned away at
  // checkout. This is on top of each product's own per-line minimum.
  const belowMin = totalQty < MIN_ORDER_TOTAL_QTY;
  const shortBy = MIN_ORDER_TOTAL_QTY - totalQty;

  const deliveryFee = calculateDeliveryFee(subtotal);
  const toFreeDelivery = Math.max(0, 3001 - subtotal);

  // A price/store gate (disabled) takes precedence over the minimum nudge.
  const blocked = disabled || belowMin;
  const cta = disabled ? "Prices updating…" : belowMin ? `Add ${shortBy} kg to order` : "Review & Order";
  const subline = belowMin
    ? `Minimum order ${MIN_ORDER_TOTAL_QTY} kg — add ${shortBy} more`
    : deliveryFee === 0
      ? "Free delivery · 1–2 days"
      : `+${formatCurrency(deliveryFee)} delivery · ${formatCurrency(toFreeDelivery)} more for free`;

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={onReview}
        disabled={blocked}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-cart-bar transition-colors",
          blocked ? "cursor-not-allowed opacity-60" : "hover:bg-brand-700"
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
            <span className="block text-2xs font-medium text-white/80">{subline}</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          {cta}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
