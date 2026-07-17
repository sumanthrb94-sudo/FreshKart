"use client";

import { Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatCurrency, unitLabel } from "@/lib/format";
import { useCart } from "@/components/providers/CartProvider";
import { useLang } from "@/lib/i18n";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { QuantityStepper } from "@/components/ui/QuantityStepper";

export function ProductListItem({ product }: { product: Product }) {
  const { qtyOf, add, increment, decrement } = useCart();
  const { t, tProduct } = useLang();
  const qty = qtyOf(product.id);
  const outOfStock = product.stock < product.minOrderQty;

  return (
    <div
      data-testid="product-card"
      className="group flex flex-row items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-card-hover md:flex-col md:items-stretch md:p-0"
    >
      {/* Thumbnail: fixed square on mobile, full-width aspect-square on desktop.
          The size must live on THIS wrapper, not on ProductThumb's className —
          next/image's `fill` mode injects its own inline
          position:absolute;height:100%;width:100% on the <img>, which beats
          any Tailwind size classes passed to it. Without an explicit size
          here, the wrapper had nothing to size itself by on mobile (its only
          child is out-of-flow) and collapsed to 0 width, making every
          product photo invisible on mobile while still showing on desktop
          (where md:aspect-square + md:w-full gave it a size). */}
      <div className="relative h-20 w-20 shrink-0 md:h-auto md:aspect-square md:w-full">
        <ProductThumb
          name={product.name}
          imageUrl={product.imageUrl}
          size={80}
          fill
          className="md:rounded-b-none"
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col md:p-3">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-fg">
          {tProduct(product.name)}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-extrabold text-fg">
                {formatCurrency(product.price)}
              </span>
              <span className="text-xs text-fg-subtle">/ {unitLabel(product.unit)}</span>
            </div>
            <span className="mt-1 inline-flex w-fit whitespace-nowrap rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
              {t("minOrder")} {product.minOrderQty} {unitLabel(product.unit)}
            </span>
          </div>

          <div className="shrink-0">
            {outOfStock ? (
              <span className="rounded-full bg-raised px-2.5 py-1.5 text-xs font-semibold text-fg-subtle">
                {t("outOfStock")}
              </span>
            ) : qty === 0 ? (
              <button
                type="button"
                data-testid="add-to-cart-btn"
                onClick={() => add(product)}
                className="flex items-center gap-1 rounded-full border border-brand-500 bg-brand-500/10 px-3 py-1.5 text-sm font-bold text-brand-400 transition-colors hover:bg-brand-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <Plus className="h-4 w-4" />
                {t("add")}
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <QuantityStepper
                  product={product}
                  qty={qty}
                  onIncrement={() => increment(product)}
                  onDecrement={() => decrement(product)}
                  size="sm"
                />
                <span className="text-xs font-bold text-fg">
                  {formatCurrency(product.price * qty)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
