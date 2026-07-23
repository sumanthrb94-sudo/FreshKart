"use client";

import { useEffect, useState } from "react";
import { Banknote, MapPin, MessageCircle, Pencil, Phone, ShieldCheck } from "lucide-react";
import type { DeliveryDetails, PaymentMethod } from "@/lib/types";
import { formatCurrency, pricePerUnit, MIN_ORDER_TOTAL_QTY, MAX_ORDER_ITEM_TYPES, PAYMENT_LABELS } from "@/lib/format";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
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

/** COD-only for buyer self-checkout — the app has no live payment gateway.
 *  A buyer who needs to pay digitally arranges it directly with the team
 *  (call/WhatsApp); admins record that on their side via POS. */
const COD: PaymentMethod = "COD";
const SUPPORT_PHONE = "+917416620691";
const SUPPORT_WHATSAPP = "https://wa.me/917416620691";

export function CheckoutSheet({
  open,
  onClose,
  defaultDelivery,
  busy,
  error,
  disabled,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  defaultDelivery: DeliveryDetails;
  busy: boolean;
  error: string | null;
  disabled?: boolean;
  onContinue: (delivery: DeliveryDetails, method: PaymentMethod) => void;
}) {
  const { lines, subtotal, deliveryFee, total, increment, decrement } = useCart();
  const { user, updateProfile } = useAuth();
  const [delivery, setDelivery] = useState<DeliveryDetails>(defaultDelivery);
  const [localError, setLocalError] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);

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
    updateProfile({
      address: addr.address,
      city: addr.city,
      pincode: addr.pincode,
      lat: addr.lat,
      lng: addr.lng,
      addressLabel: addr.label,
    }).catch(() => {});
  }

  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  function handleSubmit() {
    if (!delivery.address || !delivery.city || !delivery.pincode) {
      setLocalError("Please add a delivery address.");
      return;
    }
    if (!delivery.phone) {
      setLocalError("Please add a phone number for delivery updates.");
      return;
    }
    if (totalQty < MIN_ORDER_TOTAL_QTY) {
      setLocalError(`Minimum order is ${MIN_ORDER_TOTAL_QTY} kgs. Add ${MIN_ORDER_TOTAL_QTY - totalQty} more kg to continue.`);
      return;
    }
    if (lines.length > MAX_ORDER_ITEM_TYPES) {
      setLocalError(
        `You can order up to ${MAX_ORDER_ITEM_TYPES} different products at a time — you have ${lines.length}. Remove ${lines.length - MAX_ORDER_ITEM_TYPES} to continue, or place a second order for the rest.`
      );
      return;
    }
    setLocalError(null);
    if (delivery.phone && delivery.phone !== user?.phone) {
      updateProfile({ phone: delivery.phone }).catch(() => {});
    }
    onContinue(delivery, COD);
  }

  const shownError = localError ?? error;

  return (
    <Sheet open={open} onClose={onClose} title="Your order" size="lg">
      <div className="flex flex-col gap-5 p-5">
        {shownError && <Alert variant="error">{shownError}</Alert>}

        {/* Items */}
        <section>
          <h3 className="mb-3 text-sm font-bold text-fg">
            Items ({lines.length})
          </h3>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li
                key={line.product.id}
                className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3"
              >
                <ProductThumb name={line.product.name} imageUrl={line.product.imageUrl} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{line.product.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {pricePerUnit(line.product.price, line.product.unit)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-fg">
                    {formatCurrency(line.product.price * line.qty)}
                  </p>
                </div>
                <QuantityStepper
                  product={line.product}
                  qty={line.qty}
                  onIncrement={() => increment(line.product)}
                  onDecrement={() => decrement(line.product)}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Delivery */}
        <section className="rounded-2xl border border-line/60 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <MapPin className="h-4 w-4 text-brand-500" /> Deliver to
            </h3>
            {delivery.address && (
              <button
                type="button"
                onClick={() => setChangeOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-400"
              >
                <Pencil className="h-3.5 w-3.5" /> Change
              </button>
            )}
          </div>

          {delivery.address ? (
            <div className="flex flex-col gap-3">
              {delivery.lat != null && delivery.lng != null && (
                <AddressMapPreview lat={delivery.lat} lng={delivery.lng} className="h-28 rounded-xl" />
              )}
              <div>
                {delivery.label && (
                  <span className="mb-1 inline-block rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand-300">
                    {delivery.label}
                  </span>
                )}
                <p className="text-sm font-medium text-fg">{delivery.address}</p>
                {(delivery.city || delivery.pincode) && (
                  <p className="text-xs text-fg-subtle">
                    {[delivery.city, delivery.pincode].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
              <Field label="Phone for delivery updates" htmlFor="checkout-phone">
                <Input
                  id="checkout-phone"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-raised py-3 text-sm font-bold text-fg-muted transition-colors hover:border-brand-300 hover:text-brand-400"
            >
              <MapPin className="h-4 w-4" /> Add delivery address
            </button>
          )}
        </section>

        {/* Payment — COD only; no live payment gateway is wired up yet. */}
        <section>
          <h3 className="mb-3 text-sm font-bold text-fg">Payment method</h3>
          <div className="flex items-center gap-3 rounded-xl border border-brand-500 bg-brand-500/10 px-3.5 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
              <Banknote className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{PAYMENT_LABELS.COD}</span>
              <span className="block text-xs text-fg-subtle">Pay in cash when your order arrives</span>
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-subtle">
            <span>Need to pay online instead?</span>
            <a
              href={`tel:${SUPPORT_PHONE}`}
              className="inline-flex items-center gap-1 font-semibold text-brand-400 hover:underline"
            >
              <Phone className="h-3 w-3" /> Call
            </a>
            <span>or</span>
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand-400 hover:underline"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
            <span>us to arrange it.</span>
          </p>
        </section>

        {/* Bill */}
        <section className="rounded-2xl border border-line/60 bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-subtle">Item total</span>
            <span className="font-medium text-fg">{formatCurrency(subtotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-fg-muted">Delivery</span>
            <span className={cn("font-bold", deliveryFee === 0 ? "text-brand-400" : "text-fg")}>
              {deliveryFee === 0 ? "FREE" : formatCurrency(deliveryFee)}
            </span>
          </div>
          <div className="my-3 border-t border-dashed border-line/60" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-fg">To pay</span>
            <span className="text-lg font-extrabold text-fg">{formatCurrency(total)}</span>
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
          <ShieldCheck className="h-4 w-4 text-brand-500" />
          Quality checked · easy returns on bad stock
        </p>
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 border-t border-line/60 bg-canvas p-4">
        <Button size="lg" fullWidth loading={busy} disabled={disabled} onClick={handleSubmit}>
          {busy
            ? "Placing order…"
            : disabled
            ? "Prices updating…"
            : `Place B2B order · ${formatCurrency(total)}`}
        </Button>
      </div>

      {/* Address picker */}
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
