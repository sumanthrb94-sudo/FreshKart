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
let renderPromise: Promise<number> | null = null;

/** Normalize a 10-digit Indian number (or any input) to E.164 (+91…). */
export function toE164(input: string, countryCode = "+91"): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  return `${countryCode}${digits}`;
}

/** Create and render the invisible reCAPTCHA verifier. */
async function ensureVerifier(containerId: string): Promise<RecaptchaVerifier> {
  if (!verifier) {
    verifier = new RecaptchaVerifier(getFirebaseAuth(), containerId, {
      size: "invisible",
      callback: () => {
        // reCAPTCHA solved — invisible mode handles this automatically
      },
      "expired-callback": () => {
        // reCAPTCHA expired — reset it
        resetRecaptcha();
      },
    });
  }
  // Render the verifier into the DOM if not already rendered.
  // signInWithPhoneNumber WILL FAIL if the verifier hasn't been rendered.
  if (!renderPromise) {
    renderPromise = verifier.render();
  }
  await renderPromise;
  return verifier;
}

/** Send an OTP; returns a confirmation handle used to verify the code. */
export async function sendOtp(
  phoneE164: string,
  recaptchaContainerId: string
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  const appVerifier = await ensureVerifier(recaptchaContainerId);
  return signInWithPhoneNumber(auth, phoneE164, appVerifier);
}

/** Tear down the reCAPTCHA (e.g. after a failed send) so it can be recreated. */
export function resetRecaptcha(): void {
  try {
    verifier?.clear();
  } catch {
    /* ignore */
  }
  verifier = null;
  renderPromise = null;
}
