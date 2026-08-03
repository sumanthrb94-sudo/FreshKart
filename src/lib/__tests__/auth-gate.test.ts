/**
 * What "/" renders, for every combination of auth state.
 *
 * Both halves of this table have been wrong in production, in opposite
 * directions, so it is pinned here rather than left to a component's control
 * flow. See lib/auth-gate.ts.
 */

import { describe, it, expect } from "vitest";
import { authGateView, shouldHoldLoaderOnSignIn } from "../auth-gate";

describe("the / gate", () => {
  it("waits while auth is settling", () => {
    expect(authGateView({ loading: true, profileStalled: false, hasProfile: false })).toBe(
      "loading"
    );
  });

  it("waits while a signed-in user's profile is being read", () => {
    // The regression behind "it asks me to log in every time": this used to
    // fall through to onboarding, and asked somebody who never signed out to
    // sign in again. The provider holds `loading` for the whole read, and no
    // other flag is consulted here — that is the point.
    expect(authGateView({ loading: true, profileStalled: false, hasProfile: false })).not.toBe(
      "onboarding"
    );
  });

  it("offers a retry once the read has been failing for a long time", () => {
    // subscribeAuth's retry loop gives up after ~30s and then stays silent, so
    // without this the splash spins forever with nothing to press.
    expect(authGateView({ loading: true, profileStalled: true, hasProfile: false })).toBe(
      "stalled"
    );
  });

  it("sends a signed-in account with no profile to onboarding", () => {
    // The over-correction: somebody who verified their number and closed the
    // tab before filling in their details. Nothing further is coming for them
    // — a splash here is permanent. `loading` is false, so this is a final
    // answer, not a pending one.
    expect(authGateView({ loading: false, profileStalled: false, hasProfile: false })).toBe(
      "onboarding"
    );
  });

  it("sends a signed-out visitor to onboarding", () => {
    expect(authGateView({ loading: false, profileStalled: false, hasProfile: false })).toBe(
      "onboarding"
    );
  });

  it("shows the shop to a signed-in user with a profile", () => {
    expect(authGateView({ loading: false, profileStalled: false, hasProfile: true })).toBe("app");
  });

  it("never strands anybody: every settled state resolves to a real screen", () => {
    for (const profileStalled of [false, true]) {
      for (const hasProfile of [false, true]) {
        const view = authGateView({ loading: false, profileStalled, hasProfile });
        expect(["onboarding", "app"]).toContain(view);
      }
    }
  });
});

/**
 * The two sign-in sequences, replayed through the same decisions the provider
 * makes. The second one is what reached real customers: a brand-new buyer
 * confirmed their OTP and the gate replaced the sign-up flow with a splash
 * that never resolved.
 */
describe("signing in", () => {
  /** Replays a page's auth events and reports what "/" showed at each step. */
  function replay(events: Array<{ presence: boolean } | { profile: "none" | "found" }>) {
    let loading = true;
    let hasProfile = false;
    let sawSignedOut = false;
    const views: string[] = [];

    for (const e of events) {
      if ("presence" in e) {
        if (!e.presence) {
          sawSignedOut = true;
          hasProfile = false;
          loading = false;
        } else if (shouldHoldLoaderOnSignIn({ hasProfile, sawSignedOut })) {
          loading = true;
        }
      } else {
        hasProfile = e.profile === "found";
        loading = false;
      }
      views.push(authGateView({ loading, profileStalled: false, hasProfile }));
    }
    return views;
  }

  it("holds the loader on a cold start with a live session", () => {
    // Nothing is known yet — this could be a returning customer one read away
    // from their shop. Showing them the sign-in screen in that gap is the
    // "it asks me to log in every time" bug.
    expect(replay([{ presence: true }, { profile: "found" }])).toEqual(["loading", "app"]);
  });

  it("sends a cold start with a live session but no profile to onboarding", () => {
    // Sign-up abandoned after the OTP on a previous visit.
    expect(replay([{ presence: true }, { profile: "none" }])).toEqual(["loading", "onboarding"]);
  });

  it("never leaves a brand-new buyer's sign-up for a splash", () => {
    // THE PRODUCTION BUG. Signed out, onboarding on screen, OTP confirmed,
    // no profile yet. The gate must not take the flow away — the screen is
    // already correct and owns its own step. A "loading" anywhere after the
    // first event means the sign-up form was unmounted mid-flow.
    const views = replay([{ presence: false }, { presence: true }, { profile: "none" }]);
    expect(views).toEqual(["onboarding", "onboarding", "onboarding"]);
  });

  it("keeps the screen steady when a returning buyer signs back in", () => {
    // Same shape, but the profile exists. Still no splash in the middle.
    const views = replay([{ presence: false }, { presence: true }, { profile: "found" }]);
    expect(views).toEqual(["onboarding", "onboarding", "app"]);
  });

  it("holds the loader again on the next cold start, having signed in", () => {
    // sawSignedOut is per page load, not sticky across reloads — a fresh page
    // with a live session must still wait rather than flash the sign-in form.
    expect(replay([{ presence: true }, { profile: "found" }])).toEqual(["loading", "app"]);
  });
});
