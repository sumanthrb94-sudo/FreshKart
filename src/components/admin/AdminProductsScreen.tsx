"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Minus, Package, Pencil, Plus, Search, Sparkles } from "lucide-react";
import type { Product, ProductInput, Unit } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, unitLabel } from "@/lib/format";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { CATEGORIES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";

const ALL = "__all__";

/** A product is low when stock is within twice its minimum order quantity. */
function isLowStock(p: Product): boolean {
  return p.stock <= p.minOrderQty * 2;
}

function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.id === slug)?.name ?? slug;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Product form (shared by the Add + Edit sheets)
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  category: string;
  unit: Unit;
  price: string;
  minOrderQty: string;
  stock: string;
  origin: string;
  active: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

function emptyForm(): FormState {
  return {
    name: "",
    category: CATEGORIES[0]?.id ?? "",
    unit: "kg",
    price: "",
    minOrderQty: "1",
    stock: "",
    origin: "",
    active: true,
  };
}

function formFromProduct(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    unit: p.unit,
    price: String(p.price),
    minOrderQty: String(p.minOrderQty),
    stock: String(p.stock),
    origin: p.origin,
    active: p.active,
  };
}

/** Validates the form; returns the parsed input only when everything is valid. */
function validate(form: FormState): { errors: FormErrors; input: ProductInput | null } {
  const errors: FormErrors = {};

  const name = form.name.trim();
  const origin = form.origin.trim();
  const price = Number(form.price);
  const minOrderQty = Number(form.minOrderQty);
  const stock = Number(form.stock);

  if (!name) errors.name = "Name is required.";
  if (!origin) errors.origin = "Origin is required.";
  if (!form.category) errors.category = "Pick a category.";

  if (form.price.trim() === "" || !Number.isFinite(price) || price <= 0) {
    errors.price = "Enter a price greater than 0.";
  }
  if (form.minOrderQty.trim() === "" || !Number.isFinite(minOrderQty) || minOrderQty <= 0) {
    errors.minOrderQty = "Enter a min order qty greater than 0.";
  }
  if (form.stock.trim() === "" || !Number.isFinite(stock) || stock < 0) {
    errors.stock = "Enter stock of 0 or more.";
  }

  if (Object.keys(errors).length > 0) return { errors, input: null };

  return {
    errors,
    input: {
      name,
      category: form.category,
      unit: form.unit,
      price,
      minOrderQty,
      stock,
      origin,
      active: form.active,
    },
  };
}

function ProductForm({
  title,
  open,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  initial: FormState;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: ProductInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { errors: nextErrors, input } = validate(form);
    setErrors(nextErrors);
    if (!input) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(input);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        {submitError && <Alert variant="error">{submitError}</Alert>}

        <Field label="Name" htmlFor="product-name" error={errors.name}>
          <Input
            id="product-name"
            flavor="field"
            placeholder="e.g. Tomato"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" htmlFor="product-category" error={errors.category}>
            <Select
              id="product-category"
              flavor="field"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Unit" htmlFor="product-unit">
            <Select
              id="product-unit"
              flavor="field"
              value={form.unit}
              onChange={(e) => set("unit", e.target.value as Unit)}
            >
              <option value="kg">Per kg</option>
              <option value="pc">Per piece</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={`Price / ${unitLabel(form.unit)} (₹)`} htmlFor="product-price" error={errors.price}>
            <Input
              id="product-price"
              flavor="field"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </Field>

          <Field label="Min order qty" htmlFor="product-moq" error={errors.minOrderQty}>
            <Input
              id="product-moq"
              flavor="field"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={form.minOrderQty}
              onChange={(e) => set("minOrderQty", e.target.value)}
            />
          </Field>
        </div>

        <Field label={`Stock (${unitLabel(form.unit)})`} htmlFor="product-stock" error={errors.stock}>
          <Input
            id="product-stock"
            flavor="field"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            value={form.stock}
            onChange={(e) => set("stock", e.target.value)}
          />
        </Field>

        <Field label="Origin" htmlFor="product-origin" error={errors.origin}>
          <Input
            id="product-origin"
            flavor="field"
            placeholder="e.g. Kolar, Karnataka"
            value={form.origin}
            onChange={(e) => set("origin", e.target.value)}
          />
        </Field>

        <label className="flex items-center justify-between rounded-lg border border-line bg-raised px-3.5 py-3">
          <span className="text-sm font-medium text-fg">Active in catalog</span>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
            className="h-5 w-5 rounded border-line bg-canvas text-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </label>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={saving} disabled={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Product row
// ---------------------------------------------------------------------------

function ProductRow({
  product,
  onPatched,
  onEdit,
}: {
  product: Product;
  onPatched: (p: Product) => void;
  onEdit: (p: Product) => void;
}) {
  const [busy, setBusy] = useState(false);
  const low = isLowStock(product);
  const u = unitLabel(product.unit);

  async function patch(patchData: Partial<Product>, optimistic: Product) {
    setBusy(true);
    // Optimistic update, reconciled by the parent's refetch.
    onPatched(optimistic);
    try {
      const updated = await api.updateProduct(product.id, patchData);
      onPatched(updated);
    } finally {
      setBusy(false);
    }
  }

  function adjustStock(direction: 1 | -1) {
    const step = Number.isFinite(product.minOrderQty) && product.minOrderQty > 0 ? product.minOrderQty : 1;
    const next = Math.max(0, product.stock + direction * step);
    if (next === product.stock) return;
    void patch({ stock: next }, { ...product, stock: next });
  }

  function toggleActive() {
    void patch({ active: !product.active }, { ...product, active: !product.active });
  }

  return (
    <Card className={cn(!product.active && "opacity-70")}>
      <CardBody className="flex gap-3 p-3">
        <ProductThumb name={product.name} imageUrl={product.imageUrl} size={56} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-fg">{product.name}</p>
              <p className="truncate text-xs text-fg-subtle">
                {categoryLabel(product.category)} · {product.origin}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                {formatCurrency(product.price)} / {u}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {low && (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-red-300">
                  Low
                </span>
              )}
              <span className="text-sm font-bold text-fg">
                {product.stock}
                <span className="ml-1 text-2xs font-medium text-fg-subtle">{u}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Decrease stock by ${product.minOrderQty}`}
                disabled={busy || product.stock <= 0}
                onClick={() => adjustStock(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-fg-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Increase stock by ${product.minOrderQty}`}
                disabled={busy}
                onClick={() => adjustStock(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-fg-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
              {busy && <Spinner className="h-4 w-4" />}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={toggleActive}
                className={cn(
                  "rounded-full px-2.5 py-1 text-2xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  product.active
                    ? "bg-brand-500/15 text-brand-300 hover:bg-brand-500/25"
                    : "bg-raised text-fg-subtle hover:bg-surface"
                )}
              >
                {product.active ? "Active" : "Inactive"}
              </button>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<Pencil className="h-3.5 w-3.5" />}
                disabled={busy}
                onClick={() => onEdit(product)}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Product table (desktop)
// ---------------------------------------------------------------------------

function ProductTableRow({
  product,
  onPatched,
  onEdit,
}: {
  product: Product;
  onPatched: (p: Product) => void;
  onEdit: (p: Product) => void;
}) {
  const [busy, setBusy] = useState(false);
  const low = isLowStock(product);
  const u = unitLabel(product.unit);

  async function patch(patchData: Partial<Product>, optimistic: Product) {
    setBusy(true);
    onPatched(optimistic);
    try {
      const updated = await api.updateProduct(product.id, patchData);
      onPatched(updated);
    } finally {
      setBusy(false);
    }
  }

  function adjustStock(direction: 1 | -1) {
    const step = Number.isFinite(product.minOrderQty) && product.minOrderQty > 0 ? product.minOrderQty : 1;
    const next = Math.max(0, product.stock + direction * step);
    if (next === product.stock) return;
    void patch({ stock: next }, { ...product, stock: next });
  }

  function toggleActive() {
    void patch({ active: !product.active }, { ...product, active: !product.active });
  }

  return (
    <tr className={cn(!product.active && "opacity-70")}>
      <td className="px-4 py-3">
        <ProductThumb name={product.name} imageUrl={product.imageUrl} size={40} />
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-fg">{product.name}</p>
        <p className="text-xs text-fg-subtle">{product.origin}</p>
      </td>
      <td className="px-4 py-3 text-sm text-fg-muted">{categoryLabel(product.category)}</td>
      <td className="px-4 py-3 text-sm font-semibold text-fg">
        {formatCurrency(product.price)} / {u}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Decrease stock by ${product.minOrderQty}`}
            disabled={busy || product.stock <= 0}
            onClick={() => adjustStock(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-raised text-fg-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3ch] text-center text-sm font-bold text-fg">
            {product.stock}
          </span>
          <button
            type="button"
            aria-label={`Increase stock by ${product.minOrderQty}`}
            disabled={busy}
            onClick={() => adjustStock(1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-raised text-fg-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {busy && <Spinner className="h-4 w-4" />}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-fg-muted">
        {product.minOrderQty} {u}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={toggleActive}
          className={cn(
            "rounded-full px-2.5 py-1 text-2xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            product.active
              ? "bg-brand-500/15 text-brand-300 hover:bg-brand-500/25"
              : "bg-raised text-fg-subtle hover:bg-surface"
          )}
        >
          {product.active ? "Active" : "Inactive"}
        </button>
        {low && (
          <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-red-300">
            Low
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Pencil className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={() => onEdit(product)}
        >
          Edit
        </Button>
      </td>
    </tr>
  );
}

function ProductTable({
  products,
  onPatched,
  onEdit,
}: {
  products: Product[];
  onPatched: (p: Product) => void;
  onEdit: (p: Product) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="fc-scroll overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-raised text-xs font-bold uppercase tracking-wide text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-semibold">Image</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Stock</th>
              <th className="px-4 py-3 font-semibold">Min order</th>
              <th className="px-4 py-3 font-semibold">Active</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => (
              <ProductTableRow key={p.id} product={p} onPatched={onPatched} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AdminProductsScreen() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useAsync(() => api.listProducts(), []);
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useAsync(() => api.getDailyPricesSettings(), []);
  const [publishing, setPublishing] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Local mirror so optimistic edits show instantly; refetch() reconciles it.
  const [overrides, setOverrides] = useState<Record<string, Product>>({});

  function applyOverride(p: Product) {
    setOverrides((prev) => ({ ...prev, [p.id]: p }));
  }

  const products = useMemo<Product[]>(() => {
    const base = data ?? [];
    return base.map((p) => overrides[p.id] ?? p);
  }, [data, overrides]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (category !== ALL && p.category !== category) return false;
      if (lowOnly && !isLowStock(p)) return false;
      if (q) {
        const haystack = `${p.name} ${p.origin}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, category, lowOnly, showInactive]);

  const lowCount = useMemo(() => products.filter((p) => p.active && isLowStock(p)).length, [products]);

  async function handleCreate(input: ProductInput) {
    await api.createProduct(input);
    setAdding(false);
    refetch();
  }

  async function handleUpdate(input: ProductInput) {
    if (!editing) return;
    const updated = await api.updateProduct(editing.id, input);
    applyOverride(updated);
    setEditing(null);
    refetch();
  }

  const publishedToday = isDailyPriceUpdatePublished(settings?.publishedAt);

  async function publishToday() {
    if (!user || publishedToday) return;
    setPublishing(true);
    try {
      await api.publishDailyPrices(user.id);
      await refetchSettings();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-4 p-4">
        {settingsError && <Alert variant="error">{settingsError}</Alert>}
        {!settingsLoading && !settingsError && (
          <Card>
            <CardBody className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-fg">
                  {publishedToday ? "Today's prices are live" : "Publish today's prices"}
                </p>
                <p className="text-xs text-fg-subtle">
                  {publishedToday
                    ? `Updated at ${new Date(settings!.publishedAt).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : "Buyers can't place orders until prices are published."}
                </p>
              </div>
              <Button
                size="sm"
                onClick={publishToday}
                loading={publishing}
                disabled={publishedToday || publishing || !user}
              >
                {publishedToday ? "Published" : "Publish"}
              </Button>
            </CardBody>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-fg">Inventory</h1>
            <p className="text-xs text-fg-subtle">
              {products.length} product{products.length === 1 ? "" : "s"}
              {lowCount > 0 && <span className="text-red-300"> · {lowCount} low on stock</span>}
            </p>
          </div>
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add product
          </Button>
        </div>

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

          <div className="flex flex-wrap gap-2">
            <Chip active={lowOnly} onClick={() => setLowOnly((v) => !v)}>
              Low stock only
            </Chip>
            <Chip active={showInactive} onClick={() => setShowInactive((v) => !v)}>
              Show inactive
            </Chip>
          </div>
        </div>

        {loading ? (
          <FullScreenLoader label="Loading inventory…" />
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={products.length === 0 ? "No products yet" : "No matching products"}
            subtitle={
              products.length === 0
                ? "Add your first product to start building the catalog."
                : "Try clearing the search or filters."
            }
            action={
              products.length === 0 ? (
                <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                  Add product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:hidden">
              {filtered.map((p) => (
                <ProductRow key={p.id} product={p} onPatched={applyOverride} onEdit={setEditing} />
              ))}
            </div>
            <div className="hidden lg:block">
              <ProductTable products={filtered} onPatched={applyOverride} onEdit={setEditing} />
            </div>
          </>
        )}
      </div>

      {adding && (
        <ProductForm
          key="add"
          title="Add product"
          open={adding}
          initial={emptyForm()}
          submitLabel="Add product"
          onClose={() => setAdding(false)}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <ProductForm
          key={editing.id}
          title="Edit product"
          open={editing !== null}
          initial={formFromProduct(editing)}
          submitLabel="Save changes"
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}
    </AdminShell>
  );
}
