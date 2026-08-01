/**
 * A failed profile read must never be reported as a sign-out.
 *
 * Reconstructed from two real failures.
 *
 * The first: onAuthStateChanged fires again mid-session (Firebase refreshes
 * the ID token on its own), the profile read hits a transient
 * permission-denied while the new token propagates, and the code answered
 * `null` — which every screen reads as "logged out". The buyer saw the page
 * reset and their next click do nothing.
 *
 * The second, reported as "it asks me to log in every time": the very FIRST
 * read after a page load failed — slow mobile data, or a permission-denied
 * that is rethrown with no retry — and that too answered `null`. Since
 * onAuthStateChanged does not fire again for about an hour, the person stayed
 * looking signed-out for the life of the page, despite Firebase holding a
 * perfectly valid session the whole time.
 *
 * `null` now means one thing only: the auth layer says nobody is signed in.
 */

import { describe, it, expect, vi } from "vitest";
import type { User } from "../types";

/**
 * The listener's decision logic, in the same shape as subscribeAuth: retry the
 * profile read while the auth layer still holds a user, emit the profile once
 * it arrives, and answer null ONLY on a real sign-out. `generation` models a
 * later auth event superseding an in-flight retry loop.
 */
function makeListener(readProfile: () => Promise<User | null>, attempts = 4) {
  let generation = 0;
  const emissions: (User | null)[] = [];

  async function onAuthEvent(signedIn: boolean) {
    const mine = ++generation;
    if (!signedIn) {
      emissions.push(null);
      return;
    }
    for (let i = 0; i < attempts; i++) {
      if (mine !== generation) return; // superseded by a newer auth event
      try {
        const profile = await readProfile();
        if (mine !== generation) return;
        emissions.push(profile);
        return;
      } catch {
        // Keep trying: the auth layer still says this person is signed in.
      }
    }
  }

  return { onAuthEvent, emissions };
}

const buyer: User = {
  id: "u1",
  name: "Suresh",
  email: "",
  phone: "9812345678",
  role: "BUYER",
  createdAt: "2026-07-01T00:00:00.000Z",
};

describe("a signed-in session surviving a bad read", () => {
  it("keeps the user signed in when a mid-session read fails", async () => {
    const read = vi
      .fn<() => Promise<User | null>>()
      .mockResolvedValueOnce(buyer)
      .mockRejectedValue(new Error("permission-denied"));

    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true); // sign-in
    await onAuthEvent(true); // token refresh, read keeps failing

    // One emission, not two: the failure said nothing rather than "logged out".
    expect(emissions).toEqual([buyer]);
  });

  it("recovers on the next successful emission", async () => {
    const read = vi
      .fn<() => Promise<User | null>>()
      .mockResolvedValueOnce(buyer)
      .mockRejectedValueOnce(new Error("permission-denied"))
      .mockResolvedValueOnce(buyer);

    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    await onAuthEvent(true);
    expect(emissions).toEqual([buyer, buyer]);
  });

  it("retries a failed FIRST read instead of reporting a sign-out", async () => {
    // The regression behind "it asks me to log in every time". This used to
    // emit null, and nothing would correct it for about an hour.
    const read = vi
      .fn<() => Promise<User | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(buyer);

    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);

    expect(emissions).toEqual([buyer]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("says nothing at all while a first read keeps failing", async () => {
    // Emitting null here is what showed the sign-in screen to somebody who
    // never signed out. Silence keeps the app on its loader, which is honest:
    // we do not yet know who this is, but we know they are signed in.
    const read = vi.fn<() => Promise<User | null>>().mockRejectedValue(new Error("offline"));
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    expect(emissions).toEqual([]);
  });

  it("reports a real sign-out immediately", async () => {
    const read = vi.fn<() => Promise<User | null>>().mockResolvedValue(buyer);
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    await onAuthEvent(false);
    expect(emissions).toEqual([buyer, null]);
  });

  it("abandons a retry loop once the user signs out", async () => {
    // Signing out mid-retry must not later emit a stale profile.
    let resolveRead: ((u: User) => void) | null = null;
    const read = vi.fn<() => Promise<User | null>>().mockImplementation(
      () =>
        new Promise<User>((res) => {
          resolveRead = res;
        })
    );
    const { onAuthEvent, emissions } = makeListener(read);
    const inFlight = onAuthEvent(true);
    await onAuthEvent(false); // signed out while the read is still pending
    resolveRead?.(buyer);
    await inFlight;

    expect(emissions).toEqual([null]);
  });

  it("reports null when the profile genuinely does not exist yet", async () => {
    // Mid-onboarding: authenticated, but no users/{uid} doc written yet. That
    // is a real "no profile", not a failed read — the app should send them to
    // finish signing up.
    const read = vi.fn<() => Promise<User | null>>().mockResolvedValue(null);
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    expect(emissions).toEqual([null]);
  });
});
