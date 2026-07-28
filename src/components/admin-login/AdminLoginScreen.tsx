"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import { Loader2, ShieldCheck, Store } from "lucide-react";
import { api, usingMockBackend } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase/client";
import { isPlausibleIndianMobile } from "@/lib/format";
import { sendOtp, toE164, resetRecaptcha, renderRecaptcha } from "@/lib/firebase/phone-auth";
import { friendlyPhoneError } from "@/lib/firebase/friendly-phone-error";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/Alert";

type Step = "mobile" | "verify";
const RECAPTCHA_ID = "admin-recaptcha-container";

/**
 * Separate, admin-only sign-in entry point (not linked from the buyer app).
 * Same phone OTP mechanism as the buyer flow — phone is the single source of
 * truth for identity app-wide — but only numbers on the server-side admin
 * allowlist (see completeAdminLogin in firebase.ts) succeed here.
 */
export function AdminLoginScreen() {
  const router = useRouter();
  const { login, refreshUser } = useAuth();

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

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function handleDemoLogin() {
    setDemoBusy(true);
    setError(null);
    try {
      const user = await login({ email: "admin@green-basket.in", password: "password123" });
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

  /** Resend the OTP without leaving the code-entry screen — same in-place
   *  re-arm + re-send as the buyer onboarding flow. */
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
    if (!api.completeAdminLogin) {
      setError("Admin sign-in isn't available on this backend.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmation.current.confirm(code);
      await api.completeAdminLogin();
      await refreshUser();
      router.replace("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      // A rejected number is signed out server-side (completeAdminLogin), so
      // send them back to the phone step rather than leaving them stuck on
      // a verify screen for a session that no longer exists.
      setStep("mobile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-fg">Admin sign-in</h1>
            <p className="text-xs text-fg-subtle">Authorized numbers only</p>
          </div>
        </div>

        {usingMockBackend && (
          <>
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoBusy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Store className="h-4 w-4" />
              {demoBusy ? "Logging in…" : "Demo: Admin"}
            </button>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-medium text-fg-subtle">or sign in with mobile</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        {step === "mobile" && (
          <>
            <div
              className={cn(
                "mt-6 flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30",
                usingMockBackend && "mt-0"
              )}
            >
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
            <div id={RECAPTCHA_ID} className="hidden" />

            <button
              type="button"
              disabled={phone.length < 10 || busy || demoBusy || !recaptchaReady}
              onClick={handleSendOtp}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending code…" : "Continue"}
            </button>
          </>
        )}

        {step === "verify" && (
          <div className="mt-6">
            <p className="text-sm text-fg-subtle">
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
            <div className="mt-4 flex gap-2">
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
                    "h-12 w-10 rounded-xl border text-center text-lg font-bold text-fg outline-none transition-colors",
                    digit
                      ? "border-brand-500 bg-brand-500/15"
                      : "border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                  )}
                />
              ))}
            </div>

            <div id={RECAPTCHA_ID} className="hidden" />
            <div className="mt-4 text-sm text-fg-subtle">
              Didn&apos;t get the code?{" "}
              {resendIn > 0 ? (
                <span>Resend in {resendIn}s</span>
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

            <button
              disabled={otp.join("").length < 6 || busy}
              onClick={handleVerify}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
          </div>
        )}

        {error && (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        )}
      </div>
    </div>
  );
}
