"use client";

import { useState } from "react";
import { Banknote, CreditCard, MapPin, ShieldCheck, Wallet } from "lucide-react";
import type { DeliveryDetails, PaymentMethod } from "@/lib/types";
import { formatCurrency, pricePerUnit } from "@/lib/format";
import { useCart } from "@/components/providers/CartProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";

const PAYMENT_OPTIONS: { method: PaymentMethod; label: string; sub: string; icon: typeof Wallet }[] = [
  { method: "COD", label: "Cash on delivery", sub: "Pay the rider when produce arrives", icon: Banknote },
  { method: "CREDIT", label: "Business credit", sub: "Pay later on your credit line", icon: Wallet },
  { method: "ONLINE", label: "Pay online", sub: "Card or UPI · simulated gateway", icon: CreditCard },
];

export function CheckoutSheet({
  open,
  onClose,
  defaultDelivery,
  busy,
  error,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  defaultDelivery: DeliveryDetails;
  busy: boolean;
  error: string | null;
  onContinue: (delivery: DeliveryDetails, method: PaymentMethod) => void;
}) {
  const { lines, subtotal, increment, decrement } = useCart();
  const [delivery, setDelivery] = useState<DeliveryDetails>(defaultDelivery);
  const [method, setMethod] = useState<PaymentMethod>("COD");
  const [localError, setLocalError] = useState<string | null>(null);

  function set<K extends keyof DeliveryDetails>(key: K, value: string) {
    setDelivery((d) => ({ ...d, [key]: value }));
  }

  function handleSubmit() {
    const missing = !delivery.name || !delivery.phone || !delivery.city || !delivery.address || !delivery.pincode;
    if (missing) {
      setLocalError("Please fill in all delivery details.");
      return;
    }
    setLocalError(null);
    onContinue(delivery, method);
  }

  const shownError = localError ?? error;

  return (
    <Sheet open={open} onClose={onClose} title="Your order">
      <div className="flex flex-col gap-4 p-4">
        {/* 1 · Items */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">
            Items ({lines.length})
          </h3>
          <ul className="flex flex-col divide-y divide-gray-100">
            {lines.map((line) => (
              <li key={line.product.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <ProductThumb name={line.product.name} imageUrl={line.product.imageUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {line.product.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {pricePerUnit(line.product.price, line.product.unit)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <QuantityStepper
                    product={line.product}
                    qty={line.qty}
                    onIncrement={() => increment(line.product)}
                    onDecrement={() => decrement(line.product)}
                    size="sm"
                  />
                  <span className="text-xs font-bold text-gray-900">
                    {formatCurrency(line.product.price * line.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 2 · Delivery details */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <MapPin className="h-4 w-4 text-brand-500" /> Delivery details
          </h3>
          <div className="flex flex-col gap-3">
            <Field label="Business / shop name">
              <Input flavor="field" value={delivery.name} onChange={(e) => set("name", e.target.value)} placeholder="Suresh Kirana Store" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input flavor="field" inputMode="tel" value={delivery.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9812345678" />
              </Field>
              <Field label="City">
                <Input flavor="field" value={delivery.city} onChange={(e) => set("city", e.target.value)} placeholder="Bengaluru" />
              </Field>
            </div>
            <Field label="Full address">
              <Input flavor="field" value={delivery.address} onChange={(e) => set("address", e.target.value)} placeholder="12, Gandhi Bazaar, Basavanagudi" />
            </Field>
            <Field label="Pincode" className="max-w-[50%]">
              <Input flavor="field" inputMode="numeric" value={delivery.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="560004" />
            </Field>
          </div>
        </section>

        {/* 3 · Payment */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Payment method</h3>
          <div className="flex flex-col gap-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const selected = method === opt.method;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.method}
                  type="button"
                  onClick={() => setMethod(opt.method)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    selected ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", selected ? "text-brand-600" : "text-gray-400")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                    <span className="block text-xs text-gray-500">{opt.sub}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                      selected ? "border-brand-500" : "border-gray-300"
                    )}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4 · Bill */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Item total</span>
            <span className="font-semibold text-gray-900">{formatCurrency(subtotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">Delivery</span>
            <span className="font-bold text-brand-600">FREE</span>
          </div>
          <div className="my-3 border-t border-dashed border-gray-200" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">To pay</span>
            <span className="text-lg font-extrabold text-gray-900">{formatCurrency(subtotal)}</span>
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-brand-500" />
          Quality checked · easy returns on bad stock
        </p>

        {shownError && <p className="text-center text-sm text-red-600">{shownError}</p>}
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 p-4 backdrop-blur">
        <Button size="lg" fullWidth loading={busy} onClick={handleSubmit}>
          {busy
            ? "Placing order…"
            : method === "ONLINE"
            ? `Pay ${formatCurrency(subtotal)}`
            : `Place B2B order · ${formatCurrency(subtotal)}`}
        </Button>
      </div>
    </Sheet>
  );
}
