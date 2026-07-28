/** The address the browser is actually on. Firebase rejects phone sign-in
 *  from any hostname missing from its authorized-domains list, but never says
 *  which hostname it saw — and on a platform that mints a fresh URL per
 *  deploy (Vercel, Netlify), that is precisely the thing you need to know to
 *  fix it. Naming it turns a dead end into a one-line action. */
function currentHost(): string {
  return typeof window !== "undefined" ? window.location.hostname : "this site";
}

/** Translate Firebase phone-auth error codes to user-friendly messages.
 *  Shared by the buyer onboarding flow and the admin-only /admin-login route
 *  — both drive the same underlying phone OTP sign-in. */
export function friendlyPhoneError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : "";

  if (code.includes("invalid-phone-number")) {
    return "Invalid phone number. Please enter a valid 10-digit Indian mobile number.";
  }
  if (code.includes("missing-phone-number")) {
    return "Phone number is required.";
  }
  if (code.includes("quota-exceeded")) {
    return "SMS quota exceeded. Try again later.";
  }
  if (code.includes("user-disabled")) {
    return "This phone number has been disabled. Contact support.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Phone sign-in is not enabled. Please enable it in Firebase Console → Authentication → Sign-in method → Phone.";
  }
  if (code.includes("captcha-check-failed")) {
    return "Security check failed. Please refresh the page and try again.";
  }
  if (code.includes("app-not-authorized") || code.includes("unauthorized-domain")) {
    return `"${currentHost()}" isn't authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code.includes("invalid-app-credential")) {
    return "Invalid app configuration. Check your Firebase API key and app ID.";
  }
  // Firebase collapses several distinct server-side rejections into a bare
  // `internal-error`, and by far the most common one in practice is an
  // unauthorized domain — which it reports without naming the domain. Lead
  // with the hostname so the fix is obvious instead of a guessing game.
  if (code.includes("internal-error")) {
    return `Sign-in failed. Most likely "${currentHost()}" isn't in Firebase → Authentication → Settings → Authorized domains — add it there. Otherwise an ad-blocker or firewall may be blocking Firebase.`;
  }
  if (code.includes("network-request-failed")) {
    return "Network error. Check your internet connection and try again.";
  }
  if (code.includes("too-many-requests")) {
    // Firebase extends this block on every further attempt, so tell the user
    // to stop rather than implying a quick retry will work.
    return "Too many sign-in attempts from this device. Stop trying for about an hour — retrying now makes the block last longer.";
  }
  if (code.includes("argument-error")) {
    return "Authentication setup error. The security verifier may not be configured correctly.";
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
