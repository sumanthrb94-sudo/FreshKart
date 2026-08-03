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

/**
 * Somebody just signed in and we have no profile for them. Go back to the
 * loader, or stay on the screen we are already showing?
 *
 * It depends entirely on where the sign-in came from.
 *
 * On a cold start, the app has no idea who this is — they could be a returning
 * customer whose profile is one read away — so a loader is right, and dropping
 * to the sign-up screen in that gap is the "it asks me to log in every time"
 * bug all over again.
 *
 * But if this page has already settled as signed-out, the person is looking at
 * the onboarding screen right now, and the sign-in they just triggered came
 * from it. Yanking that screen away to show a splash unmounts the flow
 * mid-step — the OTP screen advances to "tell us about your shop" and is
 * destroyed in the same tick. Leaving it mounted costs nothing: it is already
 * the correct screen, and it owns its own progress.
 */
export function shouldHoldLoaderOnSignIn(state: {
  hasProfile: boolean;
  sawSignedOut: boolean;
}): boolean {
  return !state.hasProfile && !state.sawSignedOut;
}
