"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { ArrowRight, Check, Loader2, MapPin } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import { sendOtp, toE164, resetRecaptcha } from "@/lib/firebase/phone-auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

type Step = "mobile" | "verify" | "shop" | "done";

const STEP_ORDER: Step[] = ["mobile", "verify", "shop"];
const BUSINESS_TYPES = ["Kirana store", "Restaurant", "Hotel", "Cloud kitchen", "Reseller"];
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

export function OnboardingScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<Step>("mobile");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [shopName, setShopName] = useState("");
  const [bizType, setBizType] = useState("Kirana store");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const confirmation = useRef<ConfirmationResult | null>(null);

  useEffect(() => () => resetRecaptcha(), []);

  // Tick down the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const stepIndex = STEP_ORDER.indexOf(step as Step);
  const googleEnabled = typeof api.signInWithGoogle === "function";

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
        setStep("shop"); // new Google account → set up shop next
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
    setBusy(true);
    setError(null);
    try {
      // Fresh reCAPTCHA each send so a resend (after navigating to the OTP
      // screen) binds to the current mount point rather than a stale node.
      resetRecaptcha();
      confirmation.current = await sendOtp(toE164(phone), RECAPTCHA_ID);
      setOtp(["", "", "", "", "", ""]);
      setStep("verify");
      setResendIn(30);
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

  // ---- Done: full-bleed green celebration ----
  if (step === "done") {
    return (
      <div className="flex min-h-[100dvh] justify-center bg-gray-100">
        <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-600 via-brand-700 to-brand-800 px-7 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-40 -left-20 h-48 w-48 rounded-full bg-brand-400/30 blur-2xl" />

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

          <div className="relative z-10 flex flex-col gap-3 pb-9 pt-6">
            <button
              onClick={async () => {
                // Profile now exists — pull it into auth state so HomeGate
                // swaps "/" over to the shop.
                await refreshUser();
                router.replace("/");
              }}
              className="rounded-xl bg-accent-500 px-5 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-accent-600"
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
      <div className="flex min-h-[100dvh] justify-center bg-gray-100">
        <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-500 via-brand-600 to-brand-700 shadow-xl">
          {/* Decorative orbs */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-12 top-28 h-44 w-44 rounded-full bg-brand-300/20 blur-2xl" />

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
          <div className="relative z-10 rounded-t-[28px] bg-white px-7 pb-9 pt-7 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.3)]">
            <h2 className="text-lg font-extrabold text-gray-900">Sign in to continue</h2>
            <p className="mt-1 text-sm text-gray-500">Use whichever&apos;s easiest for your shop.</p>

            {/* Primary: Google */}
            {googleEnabled && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy || googleBusy}
                  className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white py-3.5 text-base font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {googleBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {googleBusy ? "Signing in…" : "Continue with Google"}
                </button>

                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs font-medium text-gray-400">or use your mobile</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
              </>
            )}

            {/* Secondary: phone OTP */}
            <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="border-r border-gray-200 py-3 pr-3 text-sm font-semibold text-gray-500">
                +91
              </span>
              <input
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                placeholder="98765 43210"
                aria-label="Mobile number"
                className="h-12 flex-1 bg-transparent text-lg font-semibold tracking-wide text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300"
              />
            </div>
            <button
              type="button"
              disabled={phone.length < 10 || busy || googleBusy}
              onClick={handleSendOtp}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending code…" : "Continue with mobile"}
            </button>

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <p className="mt-4 text-center text-2xs leading-relaxed text-gray-400">
              By continuing you agree to FreshKart&apos;s Terms &amp; Privacy Policy.
            </p>
          </div>

          {/* Invisible reCAPTCHA mount point for phone OTP */}
          <div id={RECAPTCHA_ID} />
        </div>
      </div>
    );
  }

  // ---- Form steps (verify / shop): light background ----
  return (
    <div className="flex min-h-[100dvh] justify-center bg-gray-100">
      <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-white px-7 pt-14 shadow-xl">
        <Progress />

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

            {/* Resend + delivery hint */}
            <div className="mt-5 text-center text-sm text-gray-500">
              Didn&apos;t get the code?{" "}
              {resendIn > 0 ? (
                <span className="text-gray-400">Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={busy}
                  className="font-semibold text-brand-600 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Resend code"}
                </button>
              )}
            </div>
            <p className="mt-1 text-center text-xs text-gray-400">
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
