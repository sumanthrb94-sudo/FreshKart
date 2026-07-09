"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { Check, Loader2, ShieldCheck, Store, Sun, Moon } from "lucide-react";
import { api, ApiError, usingMockBackend } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import {
  sendOtp,
  toE164,
  resetRecaptcha,
  renderRecaptcha,
  PhoneAuthError,
} from "@/lib/firebase/phone-auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { AddressPicker, type PickedAddress } from "@/components/address/AddressPicker";

type Step = "mobile" | "verify" | "shop" | "done";

const STEP_ORDER: Step[] = ["mobile", "verify", "shop"];
const RECAPTCHA_ID = "recaptcha-container";

/** Google "G" mark — brand-accurate (lucide ships no brand icons). */
function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.45.35-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

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

/** Translate Firebase error codes to user-friendly messages. */
function friendlyPhoneError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : "";

  if (code.includes("invalid-phone-number")) {
    return "Invalid phone number. Please enter a valid 10-digit Indian mobile number.";
  }
  if (code.includes("missing-phone-number")) {
    return "Phone number is required.";
  }
  if (code.includes("quota-exceeded")) {
    return "SMS quota exceeded. Try again later or use Google sign-in.";
  }
  if (code.includes("user-disabled")) {
    return "This phone number has been disabled. Contact support.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Phone sign-in is not enabled. Please enable it in Firebase Console → Authentication → Sign-in method → Phone.";
  }
  if (code.includes("captcha-check-failed")) {
    return "reCAPTCHA verification failed. Please refresh the page and try again.";
  }
  if (code.includes("app-not-authorized")) {
    return "This app is not authorized for phone authentication. Add your domain to Firebase Console → Authentication → Authorized domains.";
  }
  if (code.includes("invalid-app-credential")) {
    return "Invalid app configuration. Check your Firebase API key and app ID.";
  }
  if (code.includes("network-request-failed")) {
    return "Network error. Check your internet connection and try again.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Please wait a few minutes before trying again.";
  }
  if (code.includes("argument-error")) {
    return "Authentication setup error. The reCAPTCHA verifier may not be configured correctly.";
  }
  if (code.includes("timeout")) {
    return "Request timed out. Check your connection and try again.";
  }
  // OTP verification errors
  if (code.includes("invalid-verification-code")) {
    return "Invalid code. Please check and try again.";
  }
  if (code.includes("invalid-verification-id")) {
    return "Session expired. Please request a new code.";
  }
  if (code.includes("session-expired")) {
    return "Code expired. Please request a new one.";
  }

  return msg || "Something went wrong. Please try again.";
}

export function OnboardingScreen() {
  const router = useRouter();
  const { login, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [step, setStep] = useState<Step>("mobile");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [addrPhone, setAddrPhone] = useState("");
  const [addrEmail, setAddrEmail] = useState("");
  const [method, setMethod] = useState<"phone" | "google" | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
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
  const googleEnabled = typeof api.signInWithGoogle === "function";

  async function handleDemoLogin(role: "ADMIN" | "BUYER") {
    setDemoBusy(true);
    setError(null);
    try {
      const email = role === "ADMIN" ? "admin@freshkart.in" : "customer@freshkart.in";
      const user = await login({ email, password: "password123" });
      router.replace(user.role === "ADMIN" ? "/admin" : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo login failed.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleGoogle() {
    if (!api.signInWithGoogle) {
      setError("Google sign-in isn't available.");
      return;
    }
    setGoogleBusy(true);
    setError(null);
    try {
      const existing = await api.signInWithGoogle();
      await refreshUser();
      if (existing) {
        router.replace(existing.role === "ADMIN" ? "/admin" : "/");
      } else {
        setMethod("google"); // Google gave us the email — we'll ask the phone
        setStep("shop");
      }
    } catch (e) {
      // status 499 = user dismissed the popup; ignore quietly.
      if (!(e instanceof ApiError && e.status === 499)) {
        setError(e instanceof Error ? e.message : "Google sign-in failed.");
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleSendOtp() {
    if (phone.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
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
        setMethod("phone"); // phone is verified — we'll ask the email
        setStep("shop");
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
    // Every account ends up with BOTH a phone and an email: the sign-in method
    // supplies one, and we require the other here — never asking for the same
    // detail twice (no duplication).
    if (method === "google" && addrPhone.trim().length < 10) {
      setError("Please enter your 10-digit mobile number.");
      return;
    }
    if (method === "phone" && !/^\S+@\S+\.\S+$/.test(addrEmail.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.completeProfile({
        phone: addrPhone.trim() || undefined,
        email: addrEmail.trim() || undefined,
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
            <span className="mt-5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold">
              🎉 Free delivery on your first 3 orders
            </span>
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
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
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
              FreshKart
            </h1>
            <p className="relative z-10 mt-2 text-sm font-semibold text-white/90">
              Wholesale B2B · fresh produce, per kg
            </p>
            <p className="relative z-10 mt-1 text-xs text-white/70">
              Order in bulk · live rates · 1–2 day delivery
            </p>
          </div>

          {/* Auth card */}
          <div className="relative z-10 rounded-t-[28px] bg-surface px-7 pb-9 pt-7 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.3)]">
            <h2 className="text-lg font-extrabold text-fg">Sign in to continue</h2>
            <p className="mt-1 text-sm text-fg-subtle">Use whichever&apos;s easiest for your shop.</p>

            {/* Demo login buttons (mock mode only) */}
            {usingMockBackend && (
              <>
                <div className="mt-4 flex flex-col gap-2">
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

                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-xs font-medium text-fg-subtle">or sign in</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {/* Primary: Google */}
            {googleEnabled && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy || googleBusy || demoBusy}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface py-3.5 text-base font-bold text-fg-muted shadow-sm transition-colors hover:bg-raised disabled:opacity-50"
                >
                  {googleBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {googleBusy ? "Signing in…" : "Continue with Google"}
                </button>

                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-xs font-medium text-fg-subtle">or use your mobile</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {/* Secondary: phone OTP */}
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
            {/* Visible reCAPTCHA widget — much more reliable than invisible on mobile */}
            <div className="mt-3 flex justify-center">
              <div id={RECAPTCHA_ID} />
            </div>

            <button
              type="button"
              disabled={phone.length < 10 || busy || googleBusy || demoBusy || !recaptchaReady}
              onClick={handleSendOtp}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending code…" : "Continue with mobile"}
            </button>

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <p className="mt-4 text-center text-2xs leading-relaxed text-fg-subtle">
              By continuing you agree to FreshKart&apos;s Terms &amp; Privacy Policy.
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

            {/* Resend + delivery hint */}
            <div className="mt-5 text-center text-sm text-fg-subtle">
              Didn&apos;t get the code?{" "}
              {resendIn > 0 ? (
                <span className="text-fg-subtle">Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    resetRecaptcha();
                    setRecaptchaReady(false);
                    setStep("mobile");
                  }}
                  disabled={busy}
                  className="font-semibold text-brand-400 disabled:opacity-50"
                >
                  Resend code
                </button>
              )}
            </div>
            <p className="mt-1 text-center text-xs text-fg-subtle">
              SMS can take a moment. Check the number is right, or try again in a minute.
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
              {method === "phone"
                ? "Add your email & pin your delivery location — used at checkout."
                : "Add your phone & pin your delivery location — used at checkout."}
            </p>

            {/* Ask only for the contact detail the sign-in method didn't give us
                — so every account has both phone + email, with no duplicate ask. */}
            {method === "google" && (
              <>
                <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Mobile number
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
                  <span className="border-r border-line py-3 pr-3 text-sm font-semibold text-fg-subtle">
                    +91
                  </span>
                  <input
                    inputMode="numeric"
                    value={addrPhone}
                    onChange={(e) => setAddrPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    aria-label="Mobile number"
                    className="h-12 flex-1 bg-transparent text-base font-semibold tracking-wide text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle"
                  />
                </div>
              </>
            )}

            {method === "phone" && (
              <>
                <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Email address
                </label>
                <input
                  type="email"
                  inputMode="email"
                  value={addrEmail}
                  onChange={(e) => setAddrEmail(e.target.value)}
                  placeholder="you@business.com"
                  aria-label="Email address"
                  className="mt-1.5 h-12 w-full rounded-xl border border-line px-3.5 text-base font-medium text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                />
              </>
            )}

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
