"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Brand pill stepper (brief §4.15). Steps by product.minOrderQty.
 * At the minimum step the "–" becomes a trash icon (removes the line);
 * "+" is disabled once the next step would exceed stock.
 */
export function QuantityStepper({
  product,
  qty,
  onIncrement,
  onDecrement,
  size = "md",
}: {
  product: Product;
  qty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: "sm" | "md";
}) {
  const atMin = qty <= product.minOrderQty;
  const atMax = qty + product.minOrderQty > product.stock;
  const sm = size === "sm";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-between rounded-full bg-brand-500 text-white",
        sm ? "h-8 gap-1 px-1" : "h-10 gap-1 px-1.5"
      )}
    >
      <button
        type="button"
        aria-label={atMin ? `Remove ${product.name}` : "Decrease quantity"}
        onClick={onDecrement}
        className={cn(
          "flex items-center justify-center rounded-full transition-colors hover:bg-white/15 active:bg-white/25",
          sm ? "h-6 w-6" : "h-7 w-7"
        )}
      >
        {atMin ? (
          <Trash2 className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
        ) : (
          <Minus className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
        )}
      </button>
      <span
        className={cn(
          "min-w-[3.5rem] text-center font-bold tabular-nums",
          sm ? "text-xs" : "text-sm"
        )}
      >
        {qty} {product.unit}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={onIncrement}
        disabled={atMax}
        className={cn(
          "flex items-center justify-center rounded-full transition-colors hover:bg-white/15 active:bg-white/25",
          "disabled:opacity-40 disabled:hover:bg-transparent",
          sm ? "h-6 w-6" : "h-7 w-7"
        )}
      >
        <Plus className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>
    </div>
  );
}
