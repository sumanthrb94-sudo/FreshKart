/**
 * What "/" renders, for every combination of auth state.
 *
 * Both halves of this table have been wrong in production, in opposite
 * directions, so it is pinned here rather than left to a component's control
 * flow. See lib/auth-gate.ts.
 */

import { describe, it, expect } from "vitest";
import { authGateView } from "../auth-gate";

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
