"use client";

import { MapPin, Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatCurrency, unitLabel } from "@/lib/format";
import { useCart } from "@/components/providers/CartProvider";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { QuantityStepper } from "@/components/ui/QuantityStepper";

export function ProductListItem({ product }: { product: Product }) {
  const { qtyOf, add, increment, decrement } = useCart();
  const qty = qtyOf(product.id);
  const outOfStock = product.stock < product.minOrderQty;

  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-card">
      <ProductThumb name={product.name} imageUrl={product.imageUrl} size={96} />

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-bold leading-snug text-gray-900">{product.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin className="h-3 w-3" />
          <span className="truncate">{product.origin}</span>
        </p>

        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-lg font-extrabold text-gray-900">
            {formatCurrency(product.price)}
          </span>
          <span className="text-xs text-gray-400">/ {unitLabel(product.unit)}</span>
        </div>

        <span className="mt-1.5 w-fit rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
          Min order {product.minOrderQty} {unitLabel(product.unit)}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center gap-1">
        {outOfStock ? (
          <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400">
            Out of stock
          </span>
        ) : qty === 0 ? (
          <button
            type="button"
            onClick={() => add(product)}
            className="flex items-center gap-1 rounded-full border border-brand-500 px-4 py-1.5 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
          >
            <Plus className="h-4 w-4" />
            ADD
          </button>
        ) : (
          <>
            <QuantityStepper
              product={product}
              qty={qty}
              onIncrement={() => increment(product)}
              onDecrement={() => decrement(product)}
            />
            <span className="text-xs font-bold text-gray-900">
              {formatCurrency(product.price * qty)}
            </span>
            <span className="text-2xs text-gray-400">
              +{product.minOrderQty} {unitLabel(product.unit)} / tap
            </span>
          </>
        )}
      </div>
    </div>
  );
}
