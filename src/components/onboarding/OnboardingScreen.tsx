"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { ArrowRight, Check, Loader2, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import { sendOtp, toE164, resetRecaptcha } from "@/lib/firebase/phone-auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

type Step = "welcome" | "mobile" | "verify" | "shop" | "done";

const STEP_ORDER: Step[] = ["mobile", "verify", "shop"];
const BUSINESS_TYPES = ["Kirana store", "Restaurant", "Hotel", "Cloud kitchen", "Reseller"];
const RECAPTCHA_ID = "recaptcha-container";

export function OnboardingScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<Step>("welcome");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [shopName, setShopName] = useState("");
  const [bizType, setBizType] = useState("Kirana store");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const confirmation = useRef<ConfirmationResult | null>(null);

  useEffect(() => () => resetRecaptcha(), []);

  const stepIndex = STEP_ORDER.indexOf(step as Step);

  async function handleSendOtp() {
    if (phone.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!firebaseConfigured) {
      setError("Auth is not configured. Set the Firebase env vars to enable sign-in.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      confirmation.current = await sendOtp(toE164(phone), RECAPTCHA_ID);
      setOtp(["", "", "", "", "", ""]);
      setStep("verify");
    } catch (e) {
      resetRecaptcha();
      setError(
        e instanceof Error ? e.message : "Couldn't send the code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    const code = otp.join("");
    if (code.length < 6 || !confirmation.current) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmation.current.confirm(code);
      const existing = await refreshUser();
      if (existing) {
        router.replace(existing.role === "ADMIN" ? "/admin" : "/");
      } else {
        setStep("shop"); // new user → set up shop
      }
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!shopName.trim()) {
      setError("Enter your shop name.");
      return;
    }
    if (!api.completeProfile) {
      setError("Auth backend not available.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.completeProfile({
        name: shopName.trim(),
        businessName: shopName.trim(),
        businessType: bizType,
        city: area.trim() || undefined,
      });
      await refreshUser();
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your shop. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function Progress() {
    if (stepIndex < 0) return null;
    return (
      <div className="mb-8 flex gap-1.5">
        {STEP_ORDER.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= stepIndex ? "bg-brand-500" : "bg-gray-200"
            )}
          />
        ))}
      </div>
    );
  }

  // ---- Welcome & Done: full-bleed green gradient ----
  if (step === "welcome" || step === "done") {
    const done = step === "done";
    return (
      <div className="flex min-h-[100dvh] justify-center bg-gray-100">
        <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-600 via-brand-700 to-brand-800 px-7 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-40 -left-20 h-48 w-48 rounded-full bg-brand-400/30 blur-2xl" />

          {done ? (
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-white/15">
                <Check className="h-10 w-10" />
              </div>
              <h1 className="mt-6 text-2xl font-extrabold">You&apos;re all set!</h1>
              <p className="mt-2 max-w-xs text-sm text-white/80">
                {shopName ? `${shopName} is verified. ` : "Your shop is verified. "}
                Browse today&apos;s fresh arrivals and place your first order.
              </p>
              <span className="mt-5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold">
                🎉 Free delivery on your first 3 orders
              </span>
            </div>
          ) : (
            <div className="relative z-10 flex flex-1 flex-col justify-end pb-4">
              <div className="flex flex-1 items-center justify-center">
                <span className="text-[120px] drop-shadow-lg">🧺</span>
              </div>
              <h1 className="text-3xl font-extrabold leading-tight">
                Fresh produce,
                <br /> before you open.
              </h1>
              <p className="mt-3 text-sm text-white/80">
                Wholesale fruits &amp; vegetables for your store — graded, priced, and at
                your door by 6 AM.
              </p>
            </div>
          )}

          <div className="relative z-10 flex flex-col gap-3 pb-9 pt-6">
            {done ? (
              <button
                onClick={() => router.push("/")}
                className="rounded-xl bg-accent-500 px-5 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-accent-600"
              >
                Start ordering
              </button>
            ) : (
              <>
                <button
                  onClick={() => setStep("mobile")}
                  className="rounded-xl bg-accent-500 px-5 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-accent-600"
                >
                  Get started
                </button>
                <button
                  onClick={() => setStep("mobile")}
                  className="rounded-xl py-3 text-center text-sm font-semibold text-white/90 hover:text-white"
                >
                  I already have an account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Form steps: light background ----
  return (
    <div className="flex min-h-[100dvh] justify-center bg-gray-100">
      <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-white px-7 pt-14 shadow-xl">
        <Progress />

        {step === "mobile" && (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-extrabold text-gray-900">
              What&apos;s your mobile number?
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ll send a 6-digit code to verify it&apos;s your shop.
            </p>
            <div className="mt-7 flex items-center gap-2 rounded-xl border border-gray-300 px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="border-r border-gray-200 py-3 pr-3 text-sm font-semibold text-gray-500">
                +91
              </span>
              <input
                autoFocus
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                placeholder="98765 43210"
                className="h-12 flex-1 bg-transparent text-lg font-semibold tracking-wide text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400">Standard SMS rates may apply.</p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-auto pb-9">
              <button
                disabled={phone.length < 10 || busy}
                onClick={handleSendOtp}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Sending code…" : "Continue"}
              </button>
              <p className="mt-3 text-center text-xs text-gray-400">
                By continuing you agree to FreshKart&apos;s Terms &amp; Privacy Policy.
              </p>
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-extrabold text-gray-900">Enter the code</h1>
            <p className="mt-2 text-sm text-gray-500">
              Sent to +91 {phone} ·{" "}
              <button
                onClick={() => {
                  resetRecaptcha();
                  setError(null);
                  setStep("mobile");
                }}
                className="font-semibold text-brand-600"
              >
                Edit
              </button>
            </p>
            <div className="mt-7 flex gap-2">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={i === 0}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setOtp((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    });
                    if (v && i < 5) otpRefs.current[i + 1]?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                  }}
                  className={cn(
                    "h-14 w-12 rounded-xl border text-center text-xl font-bold text-gray-900 outline-none transition-colors",
                    digit
                      ? "border-brand-500 bg-brand-50"
                      : "border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  )}
                />
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-auto pb-9">
              <button
                disabled={otp.join("").length < 6 || busy}
                onClick={handleVerify}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
            </div>
          </div>
        )}

        {step === "shop" && (
          <div className="flex flex-1 flex-col overflow-y-auto">
            <h1 className="text-2xl font-extrabold text-gray-900">Set up your shop</h1>
            <p className="mt-2 text-sm text-gray-500">
              This helps us tailor produce and pricing for your business.
            </p>

            <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Shop name
            </label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Sri Balaji Stores"
              className="mt-1.5 h-12 w-full rounded-xl border border-gray-300 px-3.5 text-sm font-medium text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Business type
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setBizType(t)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
                    bizType === t
                      ? "bg-brand-500 text-white"
                      : "border border-gray-200 bg-white text-gray-600"
                  )}
                >
                  {bizType === t && <Check className="h-3.5 w-3.5" />}
                  {t}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Delivery area
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-gray-300 px-3.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <MapPin className="h-4 w-4 text-brand-500" />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Bengaluru – KR Market"
                className="h-12 flex-1 bg-transparent text-sm font-medium text-gray-900 outline-none"
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-auto py-9">
              <button
                disabled={!shopName.trim() || busy}
                onClick={handleComplete}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Invisible reCAPTCHA mount point for phone auth */}
        <div id={RECAPTCHA_ID} />
      </div>
    </div>
  );
}
