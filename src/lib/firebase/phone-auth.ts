import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

/**
 * Firebase Phone Authentication helpers (browser only).
 *
 * We use an **invisible** reCAPTCHA v2 verifier so the login screen shows no
 * visible "I'm not a robot" widget. The challenge is only presented when
 * Firebase suspects abuse, keeping the UI clean while still satisfying
 * Firebase's bot-protection requirement for phone OTP.
 *
 * For local/test sign-in without real SMS, add a test phone number in
 * Firebase console → Authentication → Sign-in method → Phone → "Phone numbers
 * for testing" (e.g. +91 98765 43210 → 123456).
 */

function getContainer(containerId: string): HTMLElement {
  const el = document.getElementById(containerId);
  if (!el) {
    throw new PhoneAuthError(
      "RECAPTCHA_CONTAINER_MISSING",
      "The sign-in widget could not load. Please refresh the page and try again."
    );
  }
  return el;
}

/** Human-friendly error with the original Firebase code preserved. */
export class PhoneAuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "PhoneAuthError";
  }
}

function normalizeFirebaseError(e: unknown): PhoneAuthError {
  const code = (e as { code?: string })?.code ?? "unknown";
  const message = e instanceof Error ? e.message : "Something went wrong.";

  switch (true) {
    case code.includes("invalid-phone-number"):
      return new PhoneAuthError(code, "Please enter a valid 10-digit mobile number.");
    case code.includes("too-many-requests"):
      return new PhoneAuthError(
        code,
        "Too many attempts from this device. Please wait a few minutes and try again."
      );
    case code.includes("quota-exceeded"):
      return new PhoneAuthError(
        code,
        "SMS quota exceeded for today. Try Google sign-in or contact support."
      );
    case code.includes("billing-not-enabled"):
      return new PhoneAuthError(
        code,
        "Phone sign-in is temporarily unavailable. Please use Google sign-in, or contact support."
      );
    case code.includes("operation-not-allowed"):
      return new PhoneAuthError(
        code,
        "Phone sign-in is not enabled for this app. Please use Google sign-in instead."
      );
    case code.includes("app-not-authorized"):
    case code.includes("unauthorized-domain"):
      return new PhoneAuthError(
        code,
        "This domain is not authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains."
      );
    case code.includes("internal-error"):
      return new PhoneAuthError(
        code,
        "Sign-in failed (internal error). Common causes: Phone provider disabled in Firebase Console, an invalid App Check token, or an ad-blocker/firewall blocking Firebase. Try refreshing, disabling extensions, or using Google sign-in."
      );
    case code.includes("captcha-check-failed"):
    case code.includes("recaptcha"):
      return new PhoneAuthError(
        code,
        "Security check failed. Refresh the page, disable ad-blockers, and try again."
      );
    case code.includes("network-request-failed"):
      return new PhoneAuthError(code, "Network error. Please check your connection and try again.");
    case code.includes("invalid-app-credential"):
    case code.includes("app-check"):
      return new PhoneAuthError(
        code,
        "App Check validation failed. Ensure NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY is correct, or turn off App Check enforcement in the Firebase Console until the key is configured."
      );
    case code.includes("code-expired"):
      return new PhoneAuthError(code, "The verification code has expired. Please request a new one.");
    case code.includes("invalid-verification-code"):
      return new PhoneAuthError(code, "Invalid code. Please check and try again.");
    default:
      return new PhoneAuthError(code, `${message} (code: ${code})`);
  }
}

let verifier: RecaptchaVerifier | null = null;

/** Normalize a 10-digit Indian number (or any input) to E.164 (+91…). */
export function toE164(input: string, countryCode = "+91"): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  return `${countryCode}${digits}`;
}

/**
 * Render an invisible reCAPTCHA verifier in the given container.
 * The container can be hidden; only the inline badge (if shown) lives there.
 * Calls `onVerified` once the verifier is ready, and `onExpired` if the token
 * expires before the OTP is sent.
 */
export async function renderRecaptcha(
  containerId: string,
  onVerified: () => void,
  onExpired: () => void
): Promise<void> {
  resetRecaptcha();
  const container = getContainer(containerId);

  try {
    verifier = new RecaptchaVerifier(getFirebaseAuth(), container, {
      size: "invisible",
      badge: "inline",
      callback: () => {
        onVerified();
      },
      "expired-callback": () => {
        onExpired();
      },
    });
    await verifier.render();
    // Invisible verifier is ready to execute when the user requests the code.
    onVerified();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[reCAPTCHA] render failed:", e);
    resetRecaptcha();
    throw normalizeFirebaseError(e);
  }
}

/** Send an OTP; returns a confirmation handle used to verify the code. */
export async function sendOtp(
  phoneE164: string,
  _recaptchaContainerId: string
): Promise<ConfirmationResult> {
  try {
    const auth = getFirebaseAuth();
    if (!verifier) {
      throw new PhoneAuthError(
        "RECAPTCHA_NOT_READY",
        "Security check is not ready. Please refresh the page and try again."
      );
    }
    return await signInWithPhoneNumber(auth, phoneE164, verifier);
  } catch (e) {
    resetRecaptcha();
    throw normalizeFirebaseError(e);
  }
}

/** Tear down the reCAPTCHA so it can be recreated. */
export function resetRecaptcha(): void {
  try {
    verifier?.clear();
  } catch {
    /* ignore */
  }
  verifier = null;
}
