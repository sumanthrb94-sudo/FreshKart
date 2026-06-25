"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  MapPin,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Store,
  UserPlus,
  Wallet,
} from "lucide-react";
import type {
  CartLine,
  Customer,
  DeliveryDetails,
  Order,
  PaymentMethod,
  Product,
  User,
} from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, pricePerUnit, unitLabel } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { AdminShell } from "./AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

const PAYMENT_OPTIONS: {
  method: PaymentMethod;
  label: string;
  sub: string;
  icon: typeof Wallet;
}[] = [
  { method: "COD", label: "Cash (COD)", sub: "Collect cash at the counter", icon: Banknote },
  { method: "CREDIT", label: "Business credit", sub: "Settle later on credit line", icon: Wallet },
  { method: "ONLINE", label: "Online", sub: "UPI / card · simulated", icon: CreditCard },
];

/** "Mark paid now" sensibly defaults to true for cash, false otherwise. */
function defaultPaid(method: PaymentMethod): boolean {
  return method === "COD";
}

function SectionTitle({
  icon: Icon,
  children,
  trailing,
}: {
  icon: typeof Store;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
        <Icon className="h-4 w-4 text-brand-400" aria-hidden />
        {children}
      </h2>
      {trailing}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer section
// ---------------------------------------------------------------------------

function CustomerPicker({
  customers,
  onSelect,
}: {
  customers: Customer[];
  onSelect: (c: Customer) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? customers.filter((c) =>
          [c.name, c.businessName ?? "", c.phone]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : customers;
    return list.slice(0, 25);
  }, [customers, query]);

  return (
    <Card>
      <CardBody className="p-3">
        <Input
          flavor="field"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by business, name or phone…"
          aria-label="Search customers"
        />
        <ul className="mt-2 flex flex-col">
          {results.length === 0 ? (
            <li className="px-1 py-6 text-center text-sm text-fg-subtle">
              No matching customers.
            </li>
          ) : (
            results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-raised"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-400">
                    {(c.businessName || c.name).charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-fg">
                      {c.businessName || c.name}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {c.phone}
                      {c.city ? ` · ${c.city}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

function SelectedCustomerCard({
  customer,
  profile,
  profileLoading,
  onChange,
}: {
  customer: Customer;
  profile: User | null;
  profileLoading: boolean;
  onChange: () => void;
}) {
  const address = profile?.address;
  const cityLine = [profile?.city ?? customer.city, profile?.pincode]
    .filter(Boolean)
    .join(" — ");

  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-base font-bold text-brand-400">
            {(customer.businessName || customer.name).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-fg">
              {customer.businessName || customer.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {customer.phone}
            </p>
            {profileLoading ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                <Spinner className="h-3.5 w-3.5" /> Loading address…
              </p>
            ) : address ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-subtle">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  {address}
                  {cityLine ? (
                    <span className="block text-fg-subtle">{cityLine}</span>
                  ) : null}
                </span>
              </p>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {customer.city || "No saved address — counter order"}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onChange}>
            Change
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Product section
// ---------------------------------------------------------------------------

function ProductPicker({
  products,
  inCart,
  onAdd,
}: {
  products: Product[];
  inCart: (id: string) => boolean;
  onAdd: (p: Product) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const active = products.filter((p) => p.active);
    const q = query.trim().toLowerCase();
    const list = q
      ? active.filter((p) =>
          `${p.name} ${p.category} ${p.origin}`.toLowerCase().includes(q)
        )
      : active;
    return list.slice(0, 30);
  }, [products, query]);

  return (
    <Card>
      <CardBody className="p-3">
        <Input
          flavor="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search produce to add…"
          aria-label="Search products"
        />
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {results.length === 0 ? (
            <li className="px-1 py-6 text-center text-sm text-fg-subtle">
              No active products match.
            </li>
          ) : (
            results.map((p) => {
              const added = inCart(p.id);
              const out = p.stock < p.minOrderQty;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(p)}
                    disabled={out}
                    className="flex w-full items-center gap-3 py-2.5 text-left transition-colors enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ProductThumb name={p.name} imageUrl={p.imageUrl} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {pricePerUnit(p.price, p.unit)} · MOQ {p.minOrderQty}{" "}
                        {unitLabel(p.unit)}
                        {out
                          ? " · out of stock"
                          : ` · ${p.stock} ${unitLabel(p.unit)} left`}
                      </span>
                    </span>
                    {added ? (
                      <Badge className="shrink-0 bg-brand-500/15 text-brand-300">
                        <Check className="mr-1 h-3 w-3" /> Added
                      </Badge>
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          out ? "bg-raised text-fg-subtle" : "bg-brand-500/15 text-brand-400"
                        )}
                      >
                        <Plus className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cart section
// ---------------------------------------------------------------------------

function CartList({
  lines,
  onIncrement,
  onDecrement,
}: {
  lines: CartLine[];
  onIncrement: (p: Product) => void;
  onDecrement: (p: Product) => void;
}) {
  if (lines.length === 0) {
    return (
      <Card>
        <CardBody className="px-4 py-8 text-center">
          <p className="text-sm text-fg-subtle">
            No items yet — search produce above and tap to add it to this order.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="p-3">
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line) => (
            <li
              key={line.product.id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <ProductThumb
                name={line.product.name}
                imageUrl={line.product.imageUrl}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {line.product.name}
                </p>
                <p className="text-xs text-fg-subtle">
                  {pricePerUnit(line.product.price, line.product.unit)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <QuantityStepper
                  product={line.product}
                  qty={line.qty}
                  onIncrement={() => onIncrement(line.product)}
                  onDecrement={() => onDecrement(line.product)}
                  size="sm"
                />
                <span className="text-xs font-bold text-fg">
                  {formatCurrency(line.product.price * line.qty)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payment section
// ---------------------------------------------------------------------------

function PaymentPicker({
  method,
  paid,
  onMethodChange,
  onPaidChange,
}: {
  method: PaymentMethod;
  paid: boolean;
  onMethodChange: (m: PaymentMethod) => void;
  onPaidChange: (p: boolean) => void;
}) {
  return (
    <Card>
      <CardBody className="p-3">
        <div className="flex flex-col gap-2">
          {PAYMENT_OPTIONS.map((opt) => {
            const selected = method === opt.method;
            const Icon = opt.icon;
            return (
              <button
                key={opt.method}
                type="button"
                onClick={() => onMethodChange(opt.method)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  selected ? "border-brand-500 bg-brand-500/15" : "border-line bg-surface"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    selected ? "text-brand-400" : "text-fg-subtle"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{opt.label}</span>
                  <span className="block text-xs text-fg-subtle">{opt.sub}</span>
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-brand-500" : "border-line"
                  )}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-line bg-raised px-3.5 py-3">
          <span>
            <span className="block text-sm font-semibold text-fg">Mark paid now</span>
            <span className="block text-xs text-fg-subtle">
              {paid ? "Recorded as paid" : "Recorded as unpaid"}
            </span>
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={paid}
            onChange={(e) => onPaidChange(e.target.checked)}
          />
          <span
            aria-hidden
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              paid ? "bg-brand-500" : "bg-line"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                paid ? "translate-x-[1.375rem]" : "translate-x-0.5"
              )}
            />
          </span>
        </label>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Success panel
// ---------------------------------------------------------------------------

function SuccessPanel({ order, onNewSale }: { order: Order; onNewSale: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15">
        <CheckCircle2 className="h-8 w-8 text-brand-400" aria-hidden />
      </div>
      <div>
        <p className="text-lg font-extrabold text-fg">Order placed</p>
        <p className="mt-1 text-sm text-fg-muted">
          {order.orderNumber} · {formatCurrency(order.total)}
        </p>
      </div>
      <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={onNewSale}>
        New sale
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AdminPosScreen() {
  const { data: customers, loading: customersLoading } = useAsync(
    () => api.listCustomers(),
    []
  );
  const { data: products, loading: productsLoading } = useAsync(
    () => api.listProducts(),
    []
  );

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("COD");
  const [paid, setPaid] = useState<boolean>(defaultPaid("COD"));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.price * l.qty, 0),
    [lines]
  );

  async function selectCustomer(c: Customer) {
    setCustomer(c);
    setProfile(null);
    setError(null);
    setProfileLoading(true);
    try {
      const full = await api.getUser(c.id);
      setProfile(full);
    } catch {
      // Non-fatal: we can still place a counter order without the full profile.
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  function changeCustomer() {
    setCustomer(null);
    setProfile(null);
    setError(null);
  }

  function chooseMethod(m: PaymentMethod) {
    setMethod(m);
    setPaid(defaultPaid(m));
  }

  function addProduct(product: Product) {
    setError(null);
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) return prev;
      return [...prev, { product, qty: product.minOrderQty }];
    });
  }

  function incrementLine(product: Product) {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === product.id
          ? {
              ...l,
              qty: Math.min(l.qty + product.minOrderQty, product.stock),
            }
          : l
      )
    );
  }

  function decrementLine(product: Product) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.product.id !== product.id) return [l];
        const next = l.qty - product.minOrderQty;
        return next < product.minOrderQty ? [] : [{ ...l, qty: next }];
      })
    );
  }

  function resetAll() {
    setCustomer(null);
    setProfile(null);
    setProfileLoading(false);
    setLines([]);
    setMethod("COD");
    setPaid(defaultPaid("COD"));
    setError(null);
    setPlaced(null);
    setBusy(false);
  }

  function buildDelivery(user: User): DeliveryDetails {
    const delivery: DeliveryDetails = {
      name: user.businessName || user.name,
      phone: user.phone,
      city: user.city || "",
      address:
        user.address || (user.city ? `${user.city} — counter order` : "Counter order"),
      pincode: user.pincode || "",
    };
    if (user.lat != null) delivery.lat = user.lat;
    if (user.lng != null) delivery.lng = user.lng;
    if (user.addressLabel) delivery.label = user.addressLabel;
    return delivery;
  }

  async function placeOrder() {
    if (!customer || lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Prefer the loaded profile; fall back to a minimal user from the
      // customer summary so a counter order can still go through.
      const user: User =
        profile ?? {
          id: customer.id,
          name: customer.name,
          email: "",
          phone: customer.phone,
          role: "BUYER",
          businessName: customer.businessName,
          city: customer.city,
          createdAt: new Date().toISOString(),
        };
      const order = await api.createOrder(customer.id, {
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        delivery: buildDelivery(user),
        paymentMethod: method,
        paid,
      });
      setPlaced(order);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Couldn't place the order. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const loading = customersLoading || productsLoading;
  const canPlace = !!customer && lines.length > 0 && !busy;

  return (
    <AdminShell>
      {loading ? (
        <FullScreenLoader label="Loading counter…" />
      ) : !customers || customers.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          subtitle="Onboard a business first, then build their order here."
        />
      ) : placed ? (
        <SuccessPanel order={placed} onNewSale={resetAll} />
      ) : (
        <>
          <div className="flex flex-col gap-5 p-4 pb-28">
            {/* 1 · Customer */}
            <section>
              <SectionTitle icon={Store}>Customer</SectionTitle>
              {customer ? (
                <SelectedCustomerCard
                  customer={customer}
                  profile={profile}
                  profileLoading={profileLoading}
                  onChange={changeCustomer}
                />
              ) : (
                <CustomerPicker customers={customers} onSelect={selectCustomer} />
              )}
            </section>

            {/* 2 · Products */}
            <section>
              <SectionTitle icon={Search}>Add products</SectionTitle>
              <ProductPicker
                products={products ?? []}
                inCart={(id) => lines.some((l) => l.product.id === id)}
                onAdd={addProduct}
              />
            </section>

            {/* 3 · Cart */}
            <section>
              <SectionTitle
                icon={ShoppingCart}
                trailing={
                  lines.length > 0 ? (
                    <span className="text-sm font-bold text-fg">
                      {formatCurrency(total)}
                    </span>
                  ) : undefined
                }
              >
                Order ({lines.length})
              </SectionTitle>
              <CartList
                lines={lines}
                onIncrement={incrementLine}
                onDecrement={decrementLine}
              />
            </section>

            {/* 4 · Payment */}
            <section>
              <SectionTitle icon={Wallet}>Payment</SectionTitle>
              <PaymentPicker
                method={method}
                paid={paid}
                onMethodChange={chooseMethod}
                onPaidChange={setPaid}
              />
            </section>

            {error && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400">
                {error}
              </p>
            )}
          </div>

          {/* Sticky place-order bar */}
          <div className="sticky bottom-0 border-t border-line bg-canvas/95 p-4 backdrop-blur">
            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={!canPlace}
              onClick={placeOrder}
            >
              {busy ? "Placing order…" : `Place order · ${formatCurrency(total)}`}
            </Button>
          </div>
        </>
      )}
    </AdminShell>
  );
}
