"use client";

import { useState } from "react";
import { CreditCard, Lock, Smartphone } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";

type Tab = "card" | "upi";

export function PaymentSheet({
  open,
  amount,
  onClose,
  onPaid,
}: {
  open: boolean;
  amount: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [tab, setTab] = useState<Tab>("card");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("12/28");
  const [cvv, setCvv] = useState("123");
  const [upi, setUpi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  function formatCardNumber(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }
  function formatExpiry(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  function validate(): string | null {
    if (tab === "card") {
      if (card.replace(/\s/g, "").length !== 16) return "Enter a valid 16-digit card number.";
      if (!/^\d{2}\/\d{2}$/.test(expiry)) return "Enter expiry as MM/YY.";
      if (!/^\d{3}$/.test(cvv)) return "Enter a valid 3-digit CVV.";
    } else {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) return "Enter a valid UPI id (e.g. name@okbank).";
    }
    return null;
  }

  function handlePay() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setProcessing(true);
    // Simulated gateway round-trip.
    setTimeout(() => {
      setProcessing(false);
      onPaid();
    }, 1600);
  }

  return (
    <Sheet
      open={open}
      onClose={processing ? () => {} : onClose}
      scrimClassName="bg-black/50"
      title={
        <>
          <Lock className="h-5 w-5 text-brand-600" />
          Pay securely
        </>
      }
      headerAccessory={
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-amber-700">
          Test mode
        </span>
      }
    >
      {processing ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-500" />
          <p className="text-base font-bold text-gray-900">
            Processing {formatCurrency(amount)}…
          </p>
          <p className="text-sm text-gray-500">Do not close this screen.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {(["card", "upi"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition-colors",
                  tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                )}
              >
                {t === "card" ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                {t === "card" ? "Card" : "UPI"}
              </button>
            ))}
          </div>

          {tab === "card" ? (
            <div className="flex flex-col gap-3">
              <Field label="Card number">
                <Input
                  flavor="field"
                  inputMode="numeric"
                  value={card}
                  onChange={(e) => setCard(formatCardNumber(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                />
              </Field>
              <Field label="Name on card">
                <Input
                  flavor="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Suresh Kumar"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expiry (MM/YY)">
                  <Input
                    flavor="field"
                    inputMode="numeric"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                  />
                </Field>
                <Field label="CVV">
                  <Input
                    flavor="field"
                    inputMode="numeric"
                    type="password"
                    maxLength={3}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
                    placeholder="123"
                  />
                </Field>
              </div>
              <p className="text-xs text-gray-400">
                Test card pre-filled — no real charge is made.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="UPI id">
                <Input
                  flavor="field"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="yourname@okbank"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {["GPay", "PhonePe", "Paytm"].map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button size="lg" fullWidth onClick={handlePay} leadingIcon={<Lock className="h-4 w-4" />}>
            Pay {formatCurrency(amount)}
          </Button>
          <p className="text-center text-xs text-gray-400">
            ✓ Simulated gateway · PCI-safe demo
          </p>
        </div>
      )}
    </Sheet>
  );
}
