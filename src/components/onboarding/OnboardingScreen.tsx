"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { Check, Loader2, ShieldCheck, Store, Sun, Moon } from "lucide-react";
import { api, usingMockBackend } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import { isPlausibleIndianMobile } from "@/lib/format";
import { sendOtp, toE164, resetRecaptcha, renderRecaptcha } from "@/lib/firebase/phone-auth";
import { friendlyPhoneError } from "@/lib/firebase/friendly-phone-error";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { AddressPicker, type PickedAddress } from "@/components/address/AddressPicker";

type Step = "mobile" | "verify" | "shop" | "done";

const STEP_ORDER: Step[] = ["mobile", "verify", "shop"];
const RECAPTCHA_ID = "recaptcha-container";

// Produce that drifts around the hero, ricocheting off the edges (Onida/DVD
// style). X and Y run on different periods so each item reverses at a different
// wall and the paths look organic; looping + `alternate` = permanent motion.
const FLOATERS = [
  { e: "🍅", s: "text-3xl", dx: "8s", dy: "6s", ox: "0s", oy: "-2s" },
  { e: "🥦", s: "text-2xl", dx: "7s", dy: "9s", ox: "-3s", oy: "-1s" },
  { e: "🍇", s: "text-xl", dx: "9s", dy: "7s", ox: "-5s", oy: "-4s" },
  { e: "🍋", s: "text-2xl", dx: "6.5s", dy: "8.5s", ox: "-2.5s", oy: "-6s" },
  { e: "🍆", s: "text-2xl", dx: "8.5s", dy: "6.5s", ox: "-7s", oy: "-3s" },
  { e: "🫑", s: "text-2xl", dx: "7.5s", dy: "9.5s", ox: "-1s", oy: "-5s" },
  { e: "🧅", s: "text-2xl", dx: "9.5s", dy: "7.5s", ox: "-4s", oy: "-8s" },
  { e: "🥔", s: "text-xl", dx: "6s", dy: "8s", ox: "-6s", oy: "-2.5s" },
  { e: "🥕", s: "text-2xl", dx: "8s", dy: "7.5s", ox: "-3.5s", oy: "-7s" },
];

export function OnboardingScreen() {
  const router = useRouter();
  const { login, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [step, setStep] = useState<Step>("mobile");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const confirmation = useRef<ConfirmationResult | null>(null);

  useEffect(() => () => resetRecaptcha(), []);

  useEffect(() => {
    let mounted = true;
    if (step === "mobile" && firebaseConfigured) {
      setRecaptchaReady(false);
      renderRecaptcha(
        RECAPTCHA_ID,
        () => {
          if (mounted) setRecaptchaReady(true);
        },
        () => {
          if (mounted) setRecaptchaReady(false);
        }
      ).catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Could not load security check.");
      });
    }
    return () => {
      mounted = false;
      if (step !== "mobile") resetRecaptcha();
    };
  }, [step]);

  // Tick down the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const stepIndex = STEP_ORDER.indexOf(step as Step);

  async function handleDemoLogin(role: "ADMIN" | "BUYER") {
    setDemoBusy(true);
    setError(null);
    try {
      const email = role === "ADMIN" ? "admin@green-basket.in" : "customer@green-basket.in";
      const user = await login({ email, password: "password123" });
      router.replace(user.role === "ADMIN" ? "/admin" : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo login failed.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleSendOtp() {
    if (phone.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    // Turn away throwaway numbers (0000000000, 1234567890, a 0–5 leading
    // digit) before spending an SMS on them — the cheapest cut at fake
    // phone↔account links. Genuine Indian mobiles (6–9 lead) sail through.
    if (!isPlausibleIndianMobile(phone)) {
      setError("That doesn't look like a real mobile number. Please check and try again.");
      return;
    }
    if (!firebaseConfigured) {
      setError("Auth is not configured. Set the Firebase env vars to enable sign-in.");
      return;
    }
    if (!recaptchaReady) {
      setError("Please complete the security check above.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      confirmation.current = await sendOtp(toE164(phone), RECAPTCHA_ID);
      setOtp(["", "", "", "", "", ""]);
      setStep("verify");
      setResendIn(30);
    } catch (e) {
      resetRecaptcha();
      setRecaptchaReady(false);
      setError(friendlyPhoneError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Resend the OTP without leaving the code-entry screen. The first send's
   *  invisible-reCAPTCHA token was consumed, so re-arm a fresh verifier in
   *  this step's own hidden container, then fire the SMS again. */
  async function handleResend() {
    setBusy(true);
    setError(null);
    try {
      await renderRecaptcha(RECAPTCHA_ID, () => {}, () => {});
      confirmation.current = await sendOtp(toE164(phone), RECAPTCHA_ID);
      setOtp(["", "", "", "", "", ""]);
      setResendIn(30);
    } catch (e) {
      setError(friendlyPhoneError(e));
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
        setStep("shop"); // phone is verified — just need the delivery address
      }
    } catch (e) {
      setError(friendlyPhoneError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAddress(addr: PickedAddress) {
    if (!api.completeProfile) {
      setError("Auth backend not available.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Phone already came from the OTP verification above — nothing else to
      // collect here besides the delivery address.
      await api.completeProfile({
        address: addr.address,
        city: addr.city,
        pincode: addr.pincode,
        lat: addr.lat,
        lng: addr.lng,
        addressLabel: addr.label,
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your address. Try again.");
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
              i <= stepIndex ? "bg-brand-500" : "bg-raised"
            )}
          />
        ))}
      </div>
    );
  }

  // ---- Done: full-bleed brand celebration ----
  if (step === "done") {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-canvas lg:items-center lg:p-6">
        <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-600 via-brand-700 to-brand-800 px-7 text-white shadow-xl lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-3xl">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-40 -left-20 h-48 w-48 rounded-full bg-brand-400/30 blur-2xl" />

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-white/15">
              <Check className="h-10 w-10" />
            </div>
            <h1 className="mt-6 text-2xl font-extrabold">You&apos;re all set!</h1>
            <p className="mt-2 max-w-xs text-sm text-white/80">
              Your delivery address is saved. Browse today&apos;s fresh arrivals and
              place your first order.
            </p>
          </div>

          <div className="relative z-10 flex flex-col gap-3 pb-9 pt-6">
            <button
              onClick={async () => {
                // Profile now exists — pull it into auth state so HomeGate
                // swaps "/" over to the shop.
                await refreshUser();
                router.replace("/");
              }}
              className="rounded-xl bg-brand-500 px-5 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-brand-600"
            >
              Start ordering
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Sign in (landing): branded animated hero + auth card ----
  if (step === "mobile") {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-canvas lg:items-center lg:p-6">
        <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-500 via-brand-600 to-brand-700 shadow-xl lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-3xl">
          {/* Decorative orbs */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-12 top-28 h-44 w-44 rounded-full bg-brand-300/20 blur-2xl" />

          {/* Theme toggle — top right corner */}
          <button
            type="button"
            onClick={toggleTheme}
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/55"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Brand hero: a cart of produce, with fruit & veg floating around it */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-7 text-center text-white">
            {/* Produce ricocheting around the hero, off every edge, forever —
                a continuous loop, drifting behind the wordmark */}
            {FLOATERS.map((f, i) => (
              <span
                key={i}
                className={cn(
                  "pointer-events-none absolute opacity-80 drop-shadow motion-reduce:hidden",
                  f.s
                )}
                style={{
                  animationName: "driftX, driftY",
                  animationDuration: `${f.dx}, ${f.dy}`,
                  animationTimingFunction: "linear",
                  animationIterationCount: "infinite",
                  animationDirection: "alternate",
                  animationDelay: `${f.ox}, ${f.oy}`,
                  zIndex: 0,
                }}
              >
                {f.e}
              </span>
            ))}

            {/* Empty cart, bobbing gently */}
            <span className="relative z-10 mb-2 animate-float-slow text-7xl drop-shadow-lg motion-reduce:animate-none">
              🛒
            </span>

            <h1 className="relative z-10 text-5xl font-extrabold tracking-tight drop-shadow-sm">
              Green Basket
            </h1>
            <p className="relative z-10 mt-2 text-sm font-semibold text-white/90">
              Wholesale B2B · fresh produce, per kg
            </p>
            <p className="relative z-10 mt-1 text-xs text-white/70">
              Order in bulk · live rates · next day delivery
            </p>
          </div>

          {/* Auth card */}
          <div className="relative z-10 rounded-t-[28px] bg-surface px-7 pb-9 pt-7 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.3)]">
            <h2 className="text-lg font-extrabold text-fg">Sign in to continue</h2>
            <p className="mt-1 text-sm text-fg-subtle">Use whichever&apos;s easiest for your shop.</p>

            {/* Demo login buttons (mock mode only) */}
            {usingMockBackend && (
              <>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("ADMIN")}
                    disabled={demoBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {demoBusy ? "Logging in…" : "Demo: Admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("BUYER")}
                    disabled={demoBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-fg-muted shadow-sm transition-colors hover:bg-raised disabled:opacity-50"
                  >
                    <Store className="h-4 w-4" />
                    {demoBusy ? "Logging in…" : "Demo: Buyer"}
                  </button>
                </div>

                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-xs font-medium text-fg-subtle">or sign in</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {/* Sign in: phone OTP — the only sign-in method */}
            <div className="flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
              <span className="border-r border-line py-3 pr-3 text-sm font-semibold text-fg-subtle">
                +91
              </span>
              <input
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                placeholder="98765 43210"
                aria-label="Mobile number"
                className="h-12 flex-1 bg-transparent text-lg font-semibold tracking-wide text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle"
              />
            </div>
            {/* Invisible reCAPTCHA verifier — no visible widget, hidden badge container */}
            <div id={RECAPTCHA_ID} className="hidden" />

            <button
              type="button"
              disabled={phone.length < 10 || busy || demoBusy || !recaptchaReady}
              onClick={handleSendOtp}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending code…" : "Continue with mobile"}
            </button>

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <p className="mt-4 text-center text-2xs leading-relaxed text-fg-subtle">
              By continuing you agree to Green Basket&apos;s Terms &amp; Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Form steps (verify / shop): light background ----
  return (
    <div className="flex min-h-[100dvh] justify-center bg-canvas lg:items-center lg:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-canvas px-7 pt-14 shadow-xl lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-3xl lg:pt-7">
        <Progress />

        {step === "verify" && (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-extrabold text-fg">Enter the code</h1>
            <p className="mt-2 text-sm text-fg-subtle">
              Sent to +91 {phone} ·{" "}
              <button
                onClick={() => {
                  resetRecaptcha();
                  setError(null);
                  setStep("mobile");
                }}
                className="font-semibold text-brand-400"
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
                    "h-14 w-12 rounded-xl border text-center text-xl font-bold text-fg outline-none transition-colors",
                    digit
                      ? "border-brand-500 bg-brand-500/15"
                      : "border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                  )}
                />
              ))}
            </div>

            {/* Resend + delivery hint. Resending stays HERE on the code screen —
                it re-arms a fresh verifier in the hidden container below and
                fires the SMS again, no bounce back to the sign-in screen. */}
            <div id={RECAPTCHA_ID} className="hidden" />
            <div className="mt-5 text-center text-sm text-fg-subtle">
              Didn&apos;t get the code?{" "}
              {resendIn > 0 ? (
                <span className="text-fg-subtle">Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy}
                  className="font-semibold text-brand-400 disabled:opacity-50"
                >
                  Resend code
                </button>
              )}
            </div>
            <p className="mt-1 text-center text-xs text-fg-subtle">
              SMS can take a moment — and check your spam / blocked messages folder.
            </p>

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
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
          <div className="flex flex-1 flex-col overflow-y-auto pb-8">
            <h1 className="text-2xl font-extrabold text-fg">Set up your address</h1>
            <p className="mt-2 text-sm text-fg-subtle">
              Pin your delivery location — used at checkout.
            </p>

            <div className="mt-5">
              <AddressPicker
                busy={busy}
                confirmLabel="Save address & continue"
                onConfirm={handleSaveAddress}
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
