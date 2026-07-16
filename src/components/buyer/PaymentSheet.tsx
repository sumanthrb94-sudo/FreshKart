"use client";

import { useState } from "react";
import { CreditCard, Lock, Smartphone } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Field, Input } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
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
      if (!name.trim()) return "Enter the name on card.";
    } else {
      if (!/[\w.\-]{2,}@[a-zA-Z]{2,}/.test(upi)) return "Enter a valid UPI id (e.g. name@okbank).";
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
          <Lock className="h-5 w-5 text-brand-400" />
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
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <Spinner className="h-10 w-10" />
          <div>
            <p className="text-base font-bold text-fg">Processing {formatCurrency(amount)}…</p>
            <p className="text-sm text-fg-subtle">Do not close this screen.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-5">
          {/* Amount card */}
          <div className="rounded-2xl bg-brand-500 p-5 text-white">
            <p className="text-sm font-medium text-white/80">Amount to pay</p>
            <p className="mt-1 text-3xl font-bold">{formatCurrency(amount)}</p>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
            {(["card", "upi"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors",
                  tab === t ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg"
                )}
              >
                {t === "card" ? <CreditCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                {t === "card" ? "Card" : "UPI"}
              </button>
            ))}
          </div>

          {tab === "card" ? (
            <div className="flex flex-col gap-4">
              <Field label="Card number" htmlFor="pay-card">
                <Input
                  id="pay-card"
                  flavor="field"
                  inputMode="numeric"
                  value={card}
                  onChange={(e) => setCard(formatCardNumber(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                />
              </Field>
              <Field label="Name on card" htmlFor="pay-name">
                <Input
                  id="pay-name"
                  flavor="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Suresh Kumar"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Expiry (MM/YY)" htmlFor="pay-expiry">
                  <Input
                    id="pay-expiry"
                    flavor="field"
                    inputMode="numeric"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                  />
                </Field>
                <Field label="CVV" htmlFor="pay-cvv">
                  <Input
                    id="pay-cvv"
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
              <p className="text-xs text-fg-subtle">Test card pre-filled — no real charge is made.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="UPI id" htmlFor="pay-upi">
                <Input
                  id="pay-upi"
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
                    className="rounded-full border border-line/60 bg-surface px-3 py-1 text-xs font-semibold text-fg-muted"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}

          <Button size="lg" fullWidth onClick={handlePay} leadingIcon={<Lock className="h-4 w-4" />}>
            Pay {formatCurrency(amount)}
          </Button>
          <p className="text-center text-xs text-fg-subtle">
            Simulated gateway · PCI-safe demo
          </p>
        </div>
      )}
    </Sheet>
  );
}
