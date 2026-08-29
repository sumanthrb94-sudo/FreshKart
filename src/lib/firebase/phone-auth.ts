import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithCredential,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";
import { IS_MOBILE_BUILD } from "../order-route";

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
 *
 * ── Android ──────────────────────────────────────────────────────────────
 * reCAPTCHA verifies the *origin*, and a Capacitor WebView serves the app from
 * `https://localhost`, which it cannot issue a valid token for — Firebase
 * rejects the attempt as `auth/invalid-app-credential`. So the mobile build
 * takes a different route: the native Firebase SDK sends the SMS (verifying the
 * app with Play Integrity, no reCAPTCHA at all) and hands back a verification
 * id, which is then exchanged for a session on the JS SDK — the JS SDK is what
 * holds the auth state every Firestore read runs under, so sign-in has to land
 * there either way.
 *
 * That native path needs `android/app/google-services.json` and the signing
 * key's SHA-1 registered on the Firebase Android app; without them the SMS
 * never sends.
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

/** The hostname the browser is actually on — see the identical helper in
 *  friendly-phone-error.ts for why every domain rejection should name it. */
function currentHost(): string {
  return typeof window !== "undefined" ? window.location.hostname : "this site";
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
        "Too many sign-in attempts from this device. Stop trying for about an hour — retrying now makes the block last longer."
      );
    case code.includes("quota-exceeded"):
      return new PhoneAuthError(
        code,
        "SMS quota exceeded for today. Please try again later or contact support."
      );
    case code.includes("billing-not-enabled"):
      return new PhoneAuthError(
        code,
        "Phone sign-in is temporarily unavailable. Please contact support."
      );
    case code.includes("operation-not-allowed"):
      return new PhoneAuthError(
        code,
        "Phone sign-in is not enabled for this app. Please contact support."
      );
    case code.includes("app-not-authorized"):
    case code.includes("unauthorized-domain"):
      return new PhoneAuthError(
        code,
        `"${currentHost()}" isn't authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
      );
    // Firebase reports several unrelated server-side rejections as a bare
    // `internal-error`. In practice the overwhelming cause is a hostname
    // missing from the authorized-domains list — which it never names. Lead
    // with the actual hostname so the fix is a copy-paste, not a hunt.
    case code.includes("internal-error"):
      return new PhoneAuthError(
        code,
        `Sign-in failed. Most likely "${currentHost()}" isn't in Firebase → Authentication → Settings → Authorized domains — add it there. Otherwise an ad-blocker or firewall may be blocking Firebase.`
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


// ── Native (Capacitor) OTP ──────────────────────────────────────────────────
// Loaded lazily so the plugin never enters the web bundle: IS_MOBILE_BUILD is a
// build-time constant, so on web these branches are dropped entirely.

/** Listener handles for one in-flight native verification. */
let nativeListeners: { remove: () => Promise<void> }[] = [];

async function clearNativeListeners(): Promise<void> {
  const handles = nativeListeners;
  nativeListeners = [];
  await Promise.all(handles.map((h) => h.remove().catch(() => {})));
}

/**
 * Send the OTP through the native Firebase SDK and return the same
 * `ConfirmationResult` shape the web path yields, so callers stay unchanged.
 */
async function sendOtpNative(phoneE164: string): Promise<ConfirmationResult> {
  const { FirebaseAuthentication } = await import(
    "@capacitor-firebase/authentication"
  );
  await clearNativeListeners();

  const verificationId = await new Promise<string>((resolve, reject) => {
    // Firebase gives up on an SMS well before this; the timer only stops the
    // promise hanging forever if no callback ever arrives.
    const timer = setTimeout(() => {
      reject(
        new PhoneAuthError(
          "OTP_SEND_TIMEOUT",
          "The code is taking too long to send. Please check your signal and try again."
        )
      );
    }, 90_000);

    const settle = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    FirebaseAuthentication.addListener("phoneCodeSent", (event) => {
      settle(() => resolve(event.verificationId));
    }).then(
      (handle) => nativeListeners.push(handle),
      () => {}
    );

    FirebaseAuthentication.addListener("phoneVerificationFailed", (event) => {
      settle(() => reject(normalizeFirebaseError(event)));
    }).then(
      (handle) => nativeListeners.push(handle),
      () => {}
    );

    // `skipNativeAuth` keeps the plugin from consuming the code itself — an OTP
    // is single-use, and it has to be spent on the JS SDK below.
    FirebaseAuthentication.signInWithPhoneNumber({
      phoneNumber: phoneE164,
      skipNativeAuth: true,
    }).catch((e) => settle(() => reject(normalizeFirebaseError(e))));
  }).finally(() => clearNativeListeners());

  return {
    verificationId,
    confirm: async (verificationCode: string) => {
      try {
        return await signInWithCredential(
          getFirebaseAuth(),
          PhoneAuthProvider.credential(verificationId, verificationCode)
        );
      } catch (e) {
        throw normalizeFirebaseError(e);
      }
    },
  };
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
  // Native builds verify the app with Play Integrity, so there is no widget to
  // render — report ready immediately and let sendOtp take the native path.
  if (IS_MOBILE_BUILD) {
    onVerified();
    return;
  }

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
  if (IS_MOBILE_BUILD) {
    return sendOtpNative(phoneE164);
  }

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
  if (IS_MOBILE_BUILD) {
    void clearNativeListeners();
    return;
  }

  try {
    verifier?.clear();
  } catch {
    /* ignore */
  }
  verifier = null;
}
