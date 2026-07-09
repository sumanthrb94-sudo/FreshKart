"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StickyCartBar({ onReview, disabled }: { onReview: () => void; disabled?: boolean }) {
  const { itemCount, subtotal } = useCart();
  if (itemCount === 0) return null;

  return (
    <div className="shrink-0 p-3">
      <button
        type="button"
        onClick={onReview}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-cart-bar transition-colors",
          disabled
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
              {itemCount} {itemCount === 1 ? "item" : "items"} · {formatCurrency(subtotal)}
            </span>
            <span className="block text-2xs font-medium text-white/80">
              Free delivery · 1–2 days
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
