"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { Check, Loader2, ShieldCheck, Store } from "lucide-react";
import { api, usingMockBackend } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import { isPlausibleIndianMobile } from "@/lib/format";
import { sendOtp, toE164, resetRecaptcha, renderRecaptcha } from "@/lib/firebase/phone-auth";
import { friendlyPhoneError } from "@/lib/firebase/friendly-phone-error";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { AddressPicker, type PickedAddress } from "@/components/address/AddressPicker";
import { BrandAuthScreen } from "@/components/ui/BrandAuthScreen";

type Step = "mobile" | "verify" | "shop" | "done";

const STEP_ORDER: Step[] = ["mobile", "verify", "shop"];
const RECAPTCHA_ID = "recaptcha-container";

/** Who buys wholesale produce. Optional, but it tells the office what a
 *  customer is before anyone picks up the phone. */
const BUSINESS_TYPES = [
  "Kirana store",
  "Restaurant",
  "Hotel",
  "Caterer",
  "Cloud kitchen",
  "Canteen / mess",
  "Other",
];

export function OnboardingScreen() {
  const router = useRouter();
  const { login, logout, refreshUser, firebaseSignedIn } = useAuth();

  const [step, setStep] = useState<Step>("mobile");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  // The profile the rest of the app reads: the Account screen, the admin's
  // customer list, every packing slip and every invoice all show these.
  const [contactName, setContactName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopType, setShopType] = useState("");

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);

  /**
   * Keep the caret where the typist left it.
   *
   * The field strips non-digits and caps at ten, so whenever what the user
   * typed differs from what we store — a space (which phone keypads insert
   * while formatting), any letter, or one digit too many — React rewrites
   * the input's value and the browser drops the caret at the end. Editing the
   * middle of a number became impossible: one keystroke and you are back at
   * the end.
   *
   * The caret is recorded in DIGITS-BEFORE-IT rather than characters, since
   * that is the one measure the stripping preserves, then restored before the
   * browser paints so there is no visible jump.
   */
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.currentTarget.value;
    const caret = e.currentTarget.selectionStart ?? raw.length;
    const cleaned = raw.replace(/\D/g, "").slice(0, 10);
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length;
    const pos = Math.min(digitsBefore, cleaned.length);
    caretRef.current = pos;
    setPhone(cleaned);

    // Restore here as well as in the layout effect below. When the typed
    // character is dropped entirely — a letter, a space — the cleaned value
    // EQUALS the current state, so React bails out of re-rendering and the
    // effect never runs; but React still rewrites the input's value to match
    // the prop, which parks the caret at the end. This path covers that.
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      if (document.activeElement === el) el.setSelectionRange(pos, pos);
    });
  }

  // Covers the ordinary case, before the browser paints, so there is no
  // visible jump when the value really did change.
  useLayoutEffect(() => {
    const el = phoneRef.current;
    if (!el || caretRef.current === null) return;
    if (document.activeElement === el) el.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [phone]);

  /**
   * Resume an abandoned sign-up.
   *
   * This screen is reached with a live Firebase session and no profile when
   * somebody verified their number and then closed the tab before filling in
   * their details. Their number is already verified — Firebase will not send a
   * second OTP to a number it is already signed in as, and asking for it again
   * only reads as "it forgot me". Pick up at the details step instead.
   *
   * Only ever moves off "mobile": mid-flow, `firebaseSignedIn` flips true the
   * moment the OTP is confirmed, and by then handleVerify owns the step.
   */
  useEffect(() => {
    if (firebaseSignedIn) setStep((s) => (s === "mobile" ? "shop" : s));
  }, [firebaseSignedIn]);

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
      // This is the customer-facing entry point: it never grants or routes to
      // the admin console, even for an allowlisted number. Admin sign-in is
      // exclusive to /admin-login, which is the only screen that calls
      // completeAdminLogin(). Everyone who signs in here lands in the shop.
      const existing = await refreshUser();
      if (existing) {
        router.replace("/");
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
    if (!contactName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!shopName.trim()) {
      setError("Please enter your shop or business name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Phone came from the OTP above. The name and shop name are collected
      // on this same screen: without them the profile fell back to using the
      // phone number as the person's name, so the Account screen, the admin's
      // customer list and every invoice read "9700144003".
      await api.completeProfile({
        name: contactName.trim(),
        businessName: shopName.trim(),
        businessType: shopType || undefined,
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
      <BrandAuthScreen
        tagline="Wholesale B2B · fresh produce, per kg"
        subline="Order in bulk · live rates · next day delivery"
      >
        <>
          {/* pt-3 above and mb-2.5 below sit the heading in even space: the
              line box adds 1.5px under the glyphs, so 12 above ≈ 11.5 below. */}
          <h2 className="mb-5 text-center text-2xl font-extrabold leading-tight text-fg">
            Sign in to continue
          </h2>

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
                ref={phoneRef}
                inputMode="numeric"
                value={phone}
                onChange={handlePhoneChange}
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
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending code…" : "Continue with mobile"}
            </button>

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <p className="mt-5 text-center text-2xs leading-relaxed text-fg-subtle">
              By continuing you agree to Green Basket&apos;s Terms &amp; Privacy Policy.
            </p>
        </>
      </BrandAuthScreen>
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
                    // Enter submits, as it does on the number screen before it.
                    // Six separate boxes are not a form, so nothing was
                    // listening: typing the last digit and pressing Enter —
                    // which is what an Android keyboard's ✓ key sends — did
                    // nothing at all, and the code just sat there.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleVerify();
                    }
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
            <h1 className="text-2xl font-extrabold text-fg">Tell us about your shop</h1>
            <p className="mt-2 text-sm text-fg-subtle">
              This is what we call you by on orders, invoices and at the door.
              {" · "}
              {/* The only way off this step. It is the last one, and somebody
                  resuming an abandoned sign-up arrives here directly — with
                  the wrong number verified, they would otherwise be stuck on
                  a screen with no exit. */}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  setStep("mobile");
                }}
                className="font-semibold text-brand-400"
              >
                Use a different number
              </button>
            </p>

            <label
              htmlFor="ob-name"
              className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
            >
              Your name
            </label>
            <input
              id="ob-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              autoComplete="name"
              placeholder="Suresh Kumar"
              className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3.5 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />

            <label
              htmlFor="ob-shop"
              className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
            >
              Shop / business name
            </label>
            <input
              id="ob-shop"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              autoComplete="organization"
              placeholder="Suresh Kirana Store"
              className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3.5 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />

            <label
              htmlFor="ob-type"
              className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
            >
              What kind of business? <span className="font-normal normal-case">(optional)</span>
            </label>
            <select
              id="ob-type"
              value={shopType}
              onChange={(e) => setShopType(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Select…</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <h2 className="mt-7 text-lg font-extrabold text-fg">Where do we deliver?</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              Pin your delivery location — used at checkout.
            </p>

            <div className="mt-4">
              <AddressPicker
                busy={busy}
                confirmLabel="Finish & start ordering"
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
