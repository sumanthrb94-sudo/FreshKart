"use client";

import { useEffect, useState } from "react";
import { Banknote, CreditCard, MapPin, Pencil, ShieldCheck, Wallet } from "lucide-react";
import type { DeliveryDetails, PaymentMethod } from "@/lib/types";
import { formatCurrency, pricePerUnit } from "@/lib/format";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import {
  AddressPicker,
  AddressMapPreview,
  type PickedAddress,
} from "@/components/address/AddressPicker";
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
  const { user, updateProfile } = useAuth();
  const [delivery, setDelivery] = useState<DeliveryDetails>(defaultDelivery);
  const [method, setMethod] = useState<PaymentMethod>("COD");
  const [localError, setLocalError] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);

  // Re-load the saved profile (address + phone) every time the sheet opens, so
  // details saved elsewhere — Account, or a previous order — show up and we
  // never ask again for something the user already gave us.
  useEffect(() => {
    if (open) setDelivery(defaultDelivery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof DeliveryDetails>(key: K, value: string) {
    setDelivery((d) => ({ ...d, [key]: value }));
  }

  function handlePickAddress(addr: PickedAddress) {
    setDelivery((d) => ({
      ...d,
      address: addr.address,
      city: addr.city,
      pincode: addr.pincode,
      lat: addr.lat,
      lng: addr.lng,
      label: addr.label,
    }));
    setChangeOpen(false);
    // Persist as the new default for next time (best-effort).
    updateProfile({
      address: addr.address,
      city: addr.city,
      pincode: addr.pincode,
      lat: addr.lat,
      lng: addr.lng,
      addressLabel: addr.label,
    }).catch(() => {});
  }

  function handleSubmit() {
    if (!delivery.address || !delivery.city || !delivery.pincode) {
      setLocalError("Please add a delivery address.");
      return;
    }
    if (!delivery.phone) {
      setLocalError("Please add a phone number for delivery updates.");
      return;
    }
    setLocalError(null);
    // Persist the phone back to the profile so it becomes the default and the
    // next order is pre-filled — no asking twice. Best-effort (the address is
    // already saved when picked).
    if (delivery.phone && delivery.phone !== user?.phone) {
      updateProfile({ phone: delivery.phone }).catch(() => {});
    }
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

        {/* 2 · Delivery — saved address (auto-selected) */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <MapPin className="h-4 w-4 text-brand-500" /> Deliver to
            </h3>
            {delivery.address && (
              <button
                type="button"
                onClick={() => setChangeOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-600"
              >
                <Pencil className="h-3.5 w-3.5" /> Change
              </button>
            )}
          </div>

          {delivery.address ? (
            <div className="flex flex-col gap-3">
              {delivery.lat != null && delivery.lng != null && (
                <AddressMapPreview lat={delivery.lat} lng={delivery.lng} className="h-28" />
              )}
              <div>
                {delivery.label && (
                  <span className="mb-1 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand-800">
                    {delivery.label}
                  </span>
                )}
                <p className="text-sm font-medium text-gray-800">{delivery.address}</p>
                {(delivery.city || delivery.pincode) && (
                  <p className="text-xs text-gray-400">
                    {[delivery.city, delivery.pincode].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
              <Field label="Phone for delivery updates">
                <Input
                  flavor="field"
                  inputMode="tel"
                  value={delivery.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="98765 43210"
                />
              </Field>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setChangeOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 py-3 text-sm font-bold text-brand-700"
            >
              <MapPin className="h-4 w-4" /> Add delivery address
            </button>
          )}
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

      {/* Change / add address — map picker on top of the order sheet */}
      <Sheet
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-500" /> Choose delivery address
          </span>
        }
      >
        <div className="p-4">
          <AddressPicker
            initial={{
              address: delivery.address,
              city: delivery.city,
              pincode: delivery.pincode,
              lat: delivery.lat,
              lng: delivery.lng,
              label: delivery.label,
            }}
            confirmLabel="Use this address"
            mapClassName="h-64"
            onConfirm={handlePickAddress}
          />
        </div>
      </Sheet>
    </Sheet>
  );
}
