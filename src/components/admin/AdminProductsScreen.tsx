"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, FolderPlus, ImageIcon, Minus, Package, Pencil, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { Category, Product, ProductInput, Unit } from "@/lib/types";
import { api, ApiError, backendKind } from "@/lib/api";
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

const ALL = "__all__";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB, matches storage.rules

async function uploadProductImage(file: File, productId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ApiError("Please select an image file.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new ApiError("Image must be smaller than 5 MB.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `products/${productId}/${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/** A product is low when stock is within twice its minimum order quantity. */
function isLowStock(p: Product): boolean {
  return p.stock <= p.minOrderQty * 2;
}

function categoryLabel(slug: string, categoriesList?: Category[]): string {
  const list = categoriesList && categoriesList.length > 0 ? categoriesList : CATEGORIES;
  return list.find((c) => c.id === slug)?.name ?? slug;
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
  imageUrl: string;

}

type FormErrors = Partial<Record<keyof FormState, string>>;

function emptyForm(categoriesList?: Category[]): FormState {
  const list = categoriesList && categoriesList.length > 0 ? categoriesList : CATEGORIES;
  return {
    name: "",
    category: list[0]?.id ?? "vegetables",
    unit: "kg",
    price: "",
    minOrderQty: "1",
    stock: "",
    origin: "",
    active: true,
    imageUrl: "",
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
    imageUrl: p.imageUrl ?? "",
  };
}

/** Validates the form; returns the parsed input only when everything is valid. */
function validate(form: FormState): { errors: FormErrors; input: ProductInput | null } {
  const errors: FormErrors = {};

  const name = form.name.trim();
  const origin = form.origin.trim();
  const imageUrl = form.imageUrl.trim();
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
      imageUrl: form.imageUrl || undefined,
    },
  };
}

function ProductForm({
  title,
  open,
  initial,
  categories,
  productId,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  initial: FormState;
  categories: Category[];
  productId?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: ProductInput, file?: File) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : form.imageUrl || undefined),
    [imageFile, form.imageUrl]
  );

  useEffect(() => {
    // Revoke the temporary object URL when the file changes or the sheet closes.
    return () => {
      if (imageFile) URL.revokeObjectURL(URL.createObjectURL(imageFile));
    };
  }, [imageFile]);

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
      let imageUrl = input.imageUrl;
      if (imageFile) {
        setImageUploading(true);
        const { uploadProductImage } = await import("@/lib/firebase/storage");
        imageUrl = await uploadProductImage(imageFile, productId);
      }
      await onSubmit({ ...input, imageUrl });
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSaving(false);
      setImageUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSubmitError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("Image must be smaller than 5 MB.");
      return;
    }
    setSubmitError(null);
    setImageFile(file);
  }

  function clearImage() {
    setImageFile(null);
    setForm((f) => ({ ...f, imageUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const supportsUpload = backendKind === "firebase";
  const busy = saving || imageUploading;

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
              {categories.map((c) => (
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

        {/* Product image */}
        <div className="rounded-lg border border-line bg-raised p-3">
          <p className="mb-2 text-sm font-medium text-fg">Product image</p>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Product preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-fg-subtle" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {imageFile ? (
                <p className="truncate text-xs text-fg-muted">{imageFile.name}</p>
              ) : form.imageUrl ? (
                <p className="truncate text-xs text-fg-muted">{form.imageUrl.split("?")[0].split("/").pop()}</p>
              ) : (
                <p className="text-xs text-fg-muted">No image selected</p>
              )}
              {supportsUpload ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {form.imageUrl || imageFile ? "Change" : "Upload"}
                  </button>
                  {(form.imageUrl || imageFile) && (
                    <button
                      type="button"
                      onClick={clearImage}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-fg-muted hover:bg-surface"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>
              ) : (
                <Field label="Image URL" className="mt-2">
                  <Input
                    flavor="field"
                    placeholder="https://…"
                    value={form.imageUrl}
                    onChange={(e) => set("imageUrl", e.target.value)}
                  />
                </Field>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

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
          <Button type="button" variant="outline" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={busy} disabled={busy}>
            {imageUploading ? "Uploading image…" : submitLabel}
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
  categories,
  onPatched,
  onEdit,
}: {
  product: Product;
  categories: Category[];
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
                {categoryLabel(product.category, categories)} · {product.origin}
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
  categories,
  onPatched,
  onEdit,
}: {
  product: Product;
  categories: Category[];
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
      <td className="px-4 py-3 text-sm text-fg-muted">{categoryLabel(product.category, categories)}</td>
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
  categories,
  onPatched,
  onEdit,
}: {
  products: Product[];
  categories: Category[];
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
              <ProductTableRow
                key={p.id}
                product={p}
                categories={categories}
                onPatched={onPatched}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Category creation & deletion sheets
// ---------------------------------------------------------------------------

interface CreateCategorySheetProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  products: Product[];
  onCreated: (newCat: Category, selectedProductIds: string[]) => Promise<void>;
}

function CreateCategorySheet({
  open,
  onClose,
  categories,
  products,
  onCreated,
}: CreateCategorySheetProps) {
  const [name, setName] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = useMemo(
    () => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    [name]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.origin.toLowerCase().includes(q));
  }, [products, productSearch]);

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.id));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name is required.");
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase() || c.id === slug)) {
      setError("A category with this name or identifier already exists.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api.createCategory({ name: trimmed, productIds: selectedProductIds });
      await onCreated(created, selectedProductIds);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Create category">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        {error && <Alert variant="error">{error}</Alert>}

        <Field label="Category Name" htmlFor="category-name">
          <Input
            id="category-name"
            flavor="field"
            placeholder="e.g. Fruits, Exotic Vegetables, Herbs..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
          />
          {slug && (
            <p className="mt-1 text-xs text-fg-subtle">
              Identifier: <code className="rounded bg-raised px-1 py-0.5 font-mono text-fg">{slug}</code>
            </p>
          )}
        </Field>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-fg">Assign existing products</p>
              <p className="text-xs text-fg-subtle">
                Selected products will be added to this category filter ({selectedProductIds.length} selected)
              </p>
            </div>
            {filteredProducts.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={toggleAll}>
                {selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            )}
          </div>

          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              flavor="field"
              className="h-9 pl-8 text-xs"
              placeholder="Search products to add..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>

          <div className="fc-scroll max-h-52 overflow-y-auto divide-y divide-line rounded-lg border border-line bg-surface">
            {filteredProducts.length === 0 ? (
              <p className="p-3 text-center text-xs text-fg-subtle">No products found</p>
            ) : (
              filteredProducts.map((p) => {
                const selected = selectedProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between gap-3 p-2.5 transition-colors hover:bg-raised"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleProduct(p.id)}
                        className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                      />
                      <ProductThumb name={p.name} imageUrl={p.imageUrl} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-fg">{p.name}</p>
                        <p className="text-2xs text-fg-subtle">
                          Currently: {categoryLabel(p.category, categories)} · {p.stock} in stock
                        </p>
                      </div>
                    </div>
                    {selected && (
                      <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-2xs font-bold text-brand-400">
                        Will be moved
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            {selectedProductIds.length > 0
              ? `Create category & add ${selectedProductIds.length} product${selectedProductIds.length === 1 ? "" : "s"}`
              : "Create category"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

interface DeleteCategorySheetProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  products: Product[];
  onDeleted: (deletedId: string) => Promise<void>;
}

function DeleteCategorySheet({
  open,
  onClose,
  categories,
  products,
  onDeleted,
}: DeleteCategorySheetProps) {
  const deletableCategories = useMemo(
    () => categories.filter((c) => !c.isDefault && c.id !== "vegetables" && c.id !== "leafy-greens"),
    [categories]
  );

  const [selectedId, setSelectedId] = useState<string>(deletableCategories[0]?.id ?? "");
  const [reassignTo, setReassignTo] = useState<string>(categories[0]?.id ?? "vegetables");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deletableCategories.length > 0 && (!selectedId || !deletableCategories.some((c) => c.id === selectedId))) {
      setSelectedId(deletableCategories[0].id);
    }
  }, [deletableCategories, selectedId]);

  const targetCategories = useMemo(
    () => categories.filter((c) => c.id !== selectedId),
    [categories, selectedId]
  );

  useEffect(() => {
    if (targetCategories.length > 0 && (!reassignTo || reassignTo === selectedId)) {
      const fallback = targetCategories.find((c) => c.id === "vegetables") ?? targetCategories[0];
      if (fallback) setReassignTo(fallback.id);
    }
  }, [targetCategories, selectedId, reassignTo]);

  const affectedProducts = useMemo(
    () => products.filter((p) => p.category === selectedId),
    [products, selectedId]
  );

  const selectedCategory = categories.find((c) => c.id === selectedId);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;

    setDeleting(true);
    setError(null);
    try {
      await api.deleteCategory(selectedId, reassignTo);
      await onDeleted(selectedId);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Delete category">
      <form onSubmit={handleDelete} className="flex flex-col gap-4 p-5">
        {error && <Alert variant="error">{error}</Alert>}

        {deletableCategories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-fg-subtle">
              <Package className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-fg">No custom categories to delete</p>
              <p className="mt-1 text-xs text-fg-subtle">
                Default system categories (Vegetables and Leafy Greens) are required by the catalog and cannot be deleted. You can create new categories anytime using &quot;Add category&quot;.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="mt-2">
              Close
            </Button>
          </div>
        ) : (
          <>
            <Field label="Choose category to delete" htmlFor="delete-cat-select">
              <Select
                id="delete-cat-select"
                flavor="field"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {deletableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            {affectedProducts.length > 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5">
                <p className="text-xs font-bold text-amber-400">
                  {affectedProducts.length} product{affectedProducts.length === 1 ? "" : "s"} in &quot;{selectedCategory?.name}&quot;
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  These products will not be deleted. Select where to move them:
                </p>
                <div className="mt-3">
                  <Field label="Move products to" htmlFor="reassign-select">
                    <Select
                      id="reassign-select"
                      flavor="field"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                    >
                      {targetCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-xs text-fg-subtle">
                There are currently no products in this category. It will be safely removed.
              </p>
            )}

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={deleting} disabled={!selectedId}>
                Delete category
              </Button>
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AdminProductsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, error, refetch } = useAsync(() => api.listProducts(), []);
  const {
    data: categoriesData,
    refetch: refetchCategories,
  } = useAsync(() => api.listCategories(), []);
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useAsync(() => api.getDailyPricesSettings(), []);
  const [publishing, setPublishing] = useState(false);

  const categories = useMemo<Category[]>(() => {
    return categoriesData && categoriesData.length > 0 ? categoriesData : CATEGORIES;
  }, [categoriesData]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // Local mirror so optimistic edits show instantly; refetch() reconciles it.
  const [overrides, setOverrides] = useState<Record<string, Product>>({});

  function applyOverride(p: Product) {
    setOverrides((prev) => ({ ...prev, [p.id]: p }));
  }

  const products = useMemo<Product[]>(() => {
    const base = data ?? [];
    return base.map((p) => overrides[p.id] ?? p);
  }, [data, overrides]);

  // Deep-link support: /admin/products?open=<id> — used by the dashboard
  // search bar to jump straight to a specific product's edit sheet.
  useEffect(() => {
    if (!data) return;
    const open = params.get("open");
    if (!open) return;
    const match = data.find((p) => p.id === open);
    if (match) setEditing(match);
    router.replace("/admin/products");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

  async function handleCreate(input: ProductInput, file?: File) {
    if (file) {
      const created = await api.createProduct({ ...input, imageUrl: undefined });
      const url = await uploadProductImage(file, created.id);
      await api.updateProduct(created.id, { imageUrl: url });
    } else {
      await api.createProduct(input);
    }
    setAdding(false);
    refetch();
  }

  async function handleUpdate(input: ProductInput, file?: File) {
    if (!editing) return;
    const patch: Parameters<typeof api.updateProduct>[1] = { ...input };
    if (file) {
      const url = await uploadProductImage(file, editing.id);
      patch.imageUrl = url;
    } else if (editing.imageUrl && !input.imageUrl) {
      patch.imageUrl = null;
    }
    const updated = await api.updateProduct(editing.id, patch);
    applyOverride(updated);
    setEditing(null);
    refetch();
  }

  async function handleCategoryCreated(newCat: Category) {
    await refetchCategories();
    await refetch();
    setCategory(newCat.id);
  }

  async function handleCategoryDeleted(deletedId: string) {
    await refetchCategories();
    await refetch();
    if (category === deletedId) {
      setCategory(ALL);
    }
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-fg">Inventory</h1>
            <p className="text-xs text-fg-subtle">
              {products.length} product{products.length === 1 ? "" : "s"}
              {lowCount > 0 && <span className="text-red-300"> · {lowCount} low on stock</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<FolderPlus className="h-4 w-4 text-brand-500" />}
              onClick={() => setCreatingCategory(true)}
            >
              Add category
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<Trash2 className="h-4 w-4 text-red-400" />}
              onClick={() => setDeletingCategory(true)}
            >
              Delete category
            </Button>
            <Button size="sm" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add product
            </Button>
          </div>
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
              All ({products.length})
            </Chip>
            {categories.map((c) => {
              const count = products.filter((p) => p.category === c.id).length;
              return (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.name} {count > 0 && `(${count})`}
                </Chip>
              );
            })}
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
                <ProductRow
                  key={p.id}
                  product={p}
                  categories={categories}
                  onPatched={applyOverride}
                  onEdit={setEditing}
                />
              ))}
            </div>
            <div className="hidden lg:block">
              <ProductTable
                products={filtered}
                categories={categories}
                onPatched={applyOverride}
                onEdit={setEditing}
              />
            </div>
          </>
        )}
      </div>

      {adding && (
        <ProductForm
          key="add"
          title="Add product"
          open={adding}
          initial={emptyForm(categories)}
          categories={categories}
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
          categories={categories}
          productId={editing.id}
          submitLabel="Save changes"
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}

      {creatingCategory && (
        <CreateCategorySheet
          open={creatingCategory}
          onClose={() => setCreatingCategory(false)}
          categories={categories}
          products={products}
          onCreated={handleCategoryCreated}
        />
      )}

      {deletingCategory && (
        <DeleteCategorySheet
          open={deletingCategory}
          onClose={() => setDeletingCategory(false)}
          categories={categories}
          products={products}
          onDeleted={handleCategoryDeleted}
        />
      )}
    </AdminShell>
  );
}
