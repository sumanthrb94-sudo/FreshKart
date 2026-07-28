"use client";

import { useState, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Save, Search, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";

export function AdminPriceUpdateScreen() {
  const { user } = useAuth();
  const { data: products, loading, error, refetch } = useAsync(() => api.listProducts(), []);
  const [updates, setUpdates] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handlePriceChange = useCallback((productId: string, newPrice: number) => {
    setUpdates((prev) => ({ ...prev, [productId]: newPrice }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!products || !user) return;
    setConfirmOpen(false);
    setSaving(true);
    setSaveError(null);
    try {
      for (const [productId, newPrice] of Object.entries(updates)) {
        const product = products.find((p) => p.id === productId);
        if (product && newPrice !== product.price) {
          await api.updateProduct(productId, { price: newPrice });
        }
      }
      // Publishing marks prices as live so buyers can add to cart and checkout.
      // Runs even with zero edits — "publish today's list as-is" is valid.
      await api.publishDailyPrices(user.id);
      setSaved(true);
      setUpdates({});
      refetch();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to update prices.");
      console.error("Failed to update prices:", e);
    } finally {
      setSaving(false);
    }
  }, [updates, products, refetch, user]);

  const filtered = (products || []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.origin.toLowerCase().includes(search.toLowerCase())
  );

  const changedCount = Object.keys(updates).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-fg">Daily Price Update</h1>
            <p className="text-xs text-fg-subtle">Update prices any time. Saving publishes them live.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-muted transition-colors hover:bg-raised disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={saving || loading}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${
                saved
                  ? "bg-emerald-500 text-white"
                  : "bg-brand-500 text-white hover:bg-brand-600"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              {saving
                ? "Publishing…"
                : saved
                ? "Published!"
                : changedCount > 0
                ? `Save & publish (${changedCount})`
                : "Publish today's prices"}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand-500">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
            <p className="mt-3 text-sm text-fg-subtle">Loading products…</p>
          </div>
        ) : error ? (
          <p className="text-center text-sm text-red-400">{error}</p>
        ) : (
          <div className="space-y-2">
            {saveError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-center text-sm text-red-300">
                {saveError}
              </p>
            )}
            {filtered.map((product) => {
              const newPrice = updates[product.id];
              const displayPrice = newPrice !== undefined ? newPrice : product.price;
              const isChanged = newPrice !== undefined && newPrice !== product.price;
              const isUp = isChanged && newPrice > product.price;
              const isDown = isChanged && newPrice < product.price;

              return (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    isChanged ? "border-brand-500 bg-brand-500/5" : "border-line bg-surface"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised text-lg">
                    {product.category === "leafy-greens" ? "🥬" : "🥕"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-fg truncate">{product.name}</p>
                    <p className="text-[10px] text-fg-subtle">{product.origin} · MOQ: {product.minOrderQty} {product.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isChanged ? "text-fg-subtle line-through" : "text-fg font-bold"}`}>
                      Rs. {product.price}
                    </span>
                    <div className="flex items-center gap-1">
                      {isUp && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                      {isDown && <TrendingDown className="h-3 w-3 text-red-500" />}
                      <input
                        type="number"
                        min={1}
                        value={displayPrice}
                        onChange={(e) => handlePriceChange(product.id, parseInt(e.target.value) || 0)}
                        className={`h-8 w-20 rounded-lg border px-2 text-right text-sm font-bold outline-none focus:border-brand-500 ${
                          isChanged
                            ? "border-brand-500 bg-brand-500/10 text-brand-500"
                            : "border-line bg-raised text-fg"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm/disclaimer before publishing — publishing makes these prices
          live to every buyer and opens the store for the day, so it shouldn't
          happen on a single stray click. */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
            </div>
            <h2 className="mt-3 text-center text-lg font-extrabold text-fg">
              Publish today&apos;s prices?
            </h2>
            <p className="mt-1 text-center text-sm text-fg-subtle">
              {changedCount > 0
                ? `You're updating ${changedCount} ${changedCount === 1 ? "price" : "prices"} and publishing today's list.`
                : "You're publishing today's list with no price changes."}
            </p>
            <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-center text-xs text-fg-muted">
              Once published, buyers see these prices and can order — the store
              goes live for the day. This can&apos;t be un-published.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-lg border border-line bg-surface py-2.5 text-sm font-bold text-fg-muted hover:bg-raised"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
              >
                Confirm &amp; publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
