"use client";

import { useMemo, useState } from "react";
import { Search, Tag, RotateCcw } from "lucide-react";
import type { Product } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, unitLabel } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { CATEGORIES } from "@/lib/mock-data";
import { AdminShell } from "./AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";

const ALL = "__all__";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

function parsePrice(value: string): number | null {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function AdminPricesScreen() {
  const { data, loading, error, refetch } = useAsync(() => api.listProducts(), []);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const products = useMemo<Product[]>(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.active) return false;
      if (category !== ALL && p.category !== category) return false;
      if (q) {
        const haystack = `${p.name} ${p.origin}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, category]);

  const changedCount = useMemo(() => {
    let count = 0;
    for (const p of products) {
      const draft = drafts[p.id];
      if (draft === undefined) continue;
      const price = parsePrice(draft);
      if (price !== null && price !== p.price) count++;
    }
    return count;
  }, [products, drafts]);

  function setDraft(id: string, value: string) {
    setSaveSuccess(false);
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  function reset() {
    setDrafts({});
    setSaveError(null);
    setSaveSuccess(false);
  }

  async function handleSave() {
    const updates: { id: string; price: number }[] = [];
    for (const p of products) {
      const draft = drafts[p.id];
      if (draft === undefined) continue;
      const price = parsePrice(draft);
      if (price !== null && price !== p.price) {
        updates.push({ id: p.id, price });
      }
    }
    if (updates.length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await api.updateProductPrices(updates);
      setSaveSuccess(true);
      setDrafts({});
      refetch();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-4 p-4 pb-28">
        <div>
          <h1 className="text-xl font-extrabold text-fg">Daily prices</h1>
          <p className="text-xs text-fg-subtle">
            Update today&apos;s rates any time. Changes apply immediately to the shop.
          </p>
        </div>

        {saveSuccess && <Alert variant="success">Prices updated successfully.</Alert>}
        {saveError && <Alert variant="error">{saveError}</Alert>}

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              flavor="field"
              className="pl-9"
              placeholder="Search by name or origin"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip active={category === ALL} onClick={() => setCategory(ALL)}>
              All
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>

        {loading ? (
          <FullScreenLoader label="Loading prices…" />
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No products"
            subtitle={products.length === 0 ? "Add products first." : "Try clearing the filters."}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => {
              const u = unitLabel(p.unit);
              const draft = drafts[p.id];
              const displayValue = draft === undefined ? String(p.price) : draft;
              const changed = draft !== undefined && parsePrice(draft) !== null && parsePrice(draft) !== p.price;
              return (
                <Card key={p.id} className={changed ? "ring-1 ring-brand-500/40" : undefined}>
                  <CardBody className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-fg">{p.name}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        {p.origin} · {u}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        Current: {formatCurrency(p.price)} / {u}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-fg-subtle">₹</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        flavor="field"
                        className="w-24 text-right"
                        value={displayValue}
                        onChange={(e) => setDraft(p.id, e.target.value)}
                        aria-label={`Price for ${p.name} per ${u}`}
                      />
                      <span className="w-8 text-xs text-fg-subtle">/{u}</span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface p-3 sm:absolute sm:bottom-0">
        <div className="mx-auto flex max-w-app items-center gap-3">
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={saving || changedCount === 0}
            onClick={reset}
            leadingIcon={<RotateCcw className="h-4 w-4" />}
          >
            Reset
          </Button>
          <Button
            type="button"
            fullWidth
            loading={saving}
            disabled={saving || changedCount === 0}
            onClick={handleSave}
          >
            Save {changedCount > 0 ? `${changedCount} price${changedCount === 1 ? "" : "s"}` : "prices"}
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
