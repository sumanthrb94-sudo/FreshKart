"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import type { Product } from "@/lib/types";
import { api } from "@/lib/api";
import { unitLabel } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { CATEGORIES } from "@/lib/mock-data";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/Card";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

function categoryName(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

function ProductAdminRow({ product, onChange }: { product: Product; onChange: (p: Product) => void }) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [active, setActive] = useState(product.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    price !== String(product.price) ||
    stock !== String(product.stock) ||
    active !== product.active;

  const lowStock = product.stock <= product.minOrderQty * 2;

  async function save() {
    const p = Number(price);
    const s = Number(stock);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(s) || s < 0) {
      setError("Enter a valid price/stock.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProduct(product.id, { price: p, stock: s, active });
      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const u = unitLabel(product.unit);

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <ProductThumb name={product.name} imageUrl={product.imageUrl} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">{product.name}</p>
              <p className="text-xs text-gray-400">
                {categoryName(product.category)} · ₹{product.price}/{u} · MOQ {product.minOrderQty} {u}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold",
                product.active ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-500"
              )}
            >
              {product.active ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-gray-400">
                Price / {u}
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm font-semibold text-gray-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-gray-400">
                Stock {lowStock && <span className="text-red-600">· low</span>}
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className={cn(
                  "h-9 rounded-lg border bg-gray-50 px-2.5 text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100",
                  lowStock ? "border-red-300" : "border-gray-200 focus:border-brand-500"
                )}
              />
            </label>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-200"
              />
              Active
            </label>
            <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </Card>
  );
}

export function AdminProductsScreen() {
  const { data, loading } = useAsync(() => api.listProducts(), []);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (data) setProducts(data);
  }, [data]);

  const lowCount = useMemo(
    () => products.filter((p) => p.active && p.stock <= p.minOrderQty * 2).length,
    [products]
  );

  return (
    <AdminShell>
      {loading ? (
        <FullScreenLoader />
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {lowCount > 0 && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {lowCount} product{lowCount === 1 ? "" : "s"} low on stock (≤ 2× min order).
            </p>
          )}
          {products.map((p) => (
            <ProductAdminRow
              key={p.id}
              product={p}
              onChange={(updated) =>
                setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
            />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
