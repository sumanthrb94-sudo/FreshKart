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
