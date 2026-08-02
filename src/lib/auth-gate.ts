/**
 * What "/" should render, given the auth state.
 *
 * Extracted from HomeGate because getting this table wrong is how users end up
 * stranded, and a table is far easier to test than a component tree. Two
 * distinct bugs have lived here:
 *
 *  - answering "onboarding" while a profile read was still in flight, which
 *    asked somebody who never signed out to sign in again; and then
 *  - over-correcting to "loading" for every signed-in user without a profile,
 *    which pinned anyone who abandoned sign-up after the OTP on a splash with
 *    nothing left to resolve.
 *
 * The distinction that makes both correct is `loading`, which the auth
 * provider holds true for exactly as long as the profile is unresolved. Once
 * it clears, "no user" is a final answer, not a pending one.
 */
export type AuthGateView =
  /** Auth hasn't settled. Show the splash. */
  | "loading"
  /** Signed in, profile read has been failing for a long time. Offer a retry. */
  | "stalled"
  /** No account, or an account that never finished sign-up. Show onboarding. */
  | "onboarding"
  /** Signed in with a profile. Show the app. */
  | "app";

export function authGateView(state: {
  loading: boolean;
  profileStalled: boolean;
  hasProfile: boolean;
}): AuthGateView {
  if (state.loading) return state.profileStalled ? "stalled" : "loading";
  return state.hasProfile ? "app" : "onboarding";
}
