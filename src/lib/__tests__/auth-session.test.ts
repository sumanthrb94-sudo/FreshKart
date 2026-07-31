/**
 * A failed profile read must never be reported as a sign-out.
 *
 * This is reconstructed from the real failure: onAuthStateChanged fires again
 * mid-session (Firebase refreshes the ID token on its own), the profile read
 * hits a transient permission-denied while the new token propagates, and the
 * old code answered `null` — which every screen reads as "logged out". The
 * buyer saw the page reset and their next click do nothing.
 */

import { describe, it, expect, vi } from "vitest";
import type { User } from "../types";

/**
 * The listener's decision logic, in the same shape as subscribeAuth: emit the
 * profile when the read works, keep quiet when it fails mid-session, and only
 * answer null when Firebase itself says nobody is signed in.
 */
function makeListener(readProfile: () => Promise<User | null>) {
  let hasEmitted = false;
  const emissions: (User | null)[] = [];

  async function onAuthEvent(signedIn: boolean) {
    if (!signedIn) {
      hasEmitted = true;
      emissions.push(null);
      return;
    }
    try {
      const profile = await readProfile();
      hasEmitted = true;
      emissions.push(profile);
    } catch {
      if (!hasEmitted) {
        hasEmitted = true;
        emissions.push(null);
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
      .mockRejectedValueOnce(new Error("permission-denied"));

    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true); // sign-in
    await onAuthEvent(true); // token refresh, read fails

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
    await onAuthEvent(true);
    expect(emissions).toEqual([buyer, buyer]);
  });

  it("still answers on the very first read, even if it fails", async () => {
    // The app is on a loading screen until it hears something, so silence
    // here would hang it forever.
    const read = vi.fn<() => Promise<User | null>>().mockRejectedValue(new Error("offline"));
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    expect(emissions).toEqual([null]);
  });

  it("reports a real sign-out immediately", async () => {
    const read = vi.fn<() => Promise<User | null>>().mockResolvedValue(buyer);
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    await onAuthEvent(false);
    expect(emissions).toEqual([buyer, null]);
  });

  it("reports null when the profile genuinely does not exist yet", async () => {
    // Mid-onboarding: authenticated, but no users/{uid} doc written yet. That
    // is a real "no profile", not a failed read.
    const read = vi.fn<() => Promise<User | null>>().mockResolvedValue(null);
    const { onAuthEvent, emissions } = makeListener(read);
    await onAuthEvent(true);
    expect(emissions).toEqual([null]);
  });
});
