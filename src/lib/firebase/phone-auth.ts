import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

/**
 * Firebase Phone Authentication helpers (browser only). Phone sign-in requires
 * an invisible reCAPTCHA verifier; we keep a single instance per page.
 *
 * For local/test sign-in without real SMS, add a test phone number in
 * Firebase console → Authentication → Sign-in method → Phone → "Phone numbers
 * for testing" (e.g. +91 98765 43210 → 123456).
 */
let verifier: RecaptchaVerifier | null = null;

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

async function ensureVerifier(containerId: string): Promise<RecaptchaVerifier> {
  if (verifier) return verifier;

  const container = getContainer(containerId);

  // The invisible reCAPTCHA must be attached to a visible, rendered element.
  // Wait one frame so the container is fully laid out before mounting.
  await new Promise((res) => requestAnimationFrame(() => res(undefined)));

  verifier = new RecaptchaVerifier(getFirebaseAuth(), container, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved silently — signInWithPhoneNumber will proceed.
    },
    "expired-callback": () => {
      // Token expired; force a fresh verifier on the next attempt.
      resetRecaptcha();
    },
  });
  return verifier;
}

/** Normalize a 10-digit Indian number (or any input) to E.164 (+91…). */
export function toE164(input: string, countryCode = "+91"): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  return `${countryCode}${digits}`;
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
        "reCAPTCHA check failed. Disable ad-blockers, refresh the page, and try again."
      );
    case code.includes("network-request-failed"):
      return new PhoneAuthError(code, "Network error. Please check your connection and try again.");
    case code.includes("invalid-app-credential"):
    case code.includes("app-check"):
      return new PhoneAuthError(
        code,
        "App Check validation failed. Ensure NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY is correct, or turn off App Check enforcement in the Firebase Console until the key is configured."
      );
    default:
      return new PhoneAuthError(code, `${message} (code: ${code})`);
  }
}

/** Send an OTP; returns a confirmation handle used to verify the code. */
export async function sendOtp(
  phoneE164: string,
  recaptchaContainerId: string
): Promise<ConfirmationResult> {
  try {
    const auth = getFirebaseAuth();
    const v = await ensureVerifier(recaptchaContainerId);
    return await signInWithPhoneNumber(auth, phoneE164, v);
  } catch (e) {
    // Reset the verifier on any failure so the next attempt starts clean.
    resetRecaptcha();
    throw normalizeFirebaseError(e);
  }
}

/** Tear down the reCAPTCHA (e.g. after a failed send) so it can be recreated. */
export function resetRecaptcha(): void {
  try {
    verifier?.clear();
  } catch {
    /* ignore */
  }
  verifier = null;
}
