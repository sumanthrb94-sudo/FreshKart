/**
 * Phone numbers (E.164, exactly as Firebase Auth reports them) granted ADMIN.
 * Phone OTP is the only sign-in method app-wide, so this allowlist IS the
 * admin gate: the main sign-in screen routes these numbers straight into the
 * admin console (see OnboardingScreen), and completeAdminLogin() in
 * firebase.ts promotes/creates their profile as ADMIN.
 *
 * Keep in sync with the `isAdminPhone()` allowlist in firestore.rules —
 * the rules are the real enforcement; this client copy only decides which
 * sign-in path to take. A number added here but not in the deployed rules
 * will fail admin sign-in with a permissions error.
 */
export const ADMIN_PHONES = ["+919700144003"];

export function isAdminPhone(phone?: string | null): boolean {
  return !!phone && ADMIN_PHONES.includes(phone.trim());
}
