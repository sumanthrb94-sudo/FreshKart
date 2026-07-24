/**
 * End-to-end edge-case coverage for PHONE ↔ EMAIL account linking and the
 * fake-account / fake-number reduction that guards it.
 *
 * Test command: npx vitest run src/lib/__tests__
 *
 * Context: every Green Basket account is anchored to exactly one phone AND one
 * email (see OnboardingScreen — the sign-in method supplies one, the link step
 * asks for the other; completeProfile() in firebase.ts then claims an
 * emailIndex + phoneIndex slot so the pair is unique account-wide). Two things
 * have to hold for that to actually reduce friction with fake accounts:
 *
 *   1. Normalization must be canonical — "You@Shop.COM ", "+91 98765 43210",
 *      "9876543210" must each resolve to ONE stable key, or the
 *      one-account-per-email/phone claim is trivially bypassed by re-typing the
 *      same contact a different way.
 *   2. Obvious throwaways (0000000000, 1234567890, temp-mail inboxes) must be
 *      turned away at the linking step, before an SMS is spent or a slot is
 *      claimed.
 *
 * These tests pin both. Pure logic only — the UI wiring that calls into these
 * (OnboardingScreen's handleSendOtp / handleSaveAddress) is exercised by the
 * Playwright spec e2e/phone-email-linking.spec.ts.
 */

import { describe, it, expect, vi } from "vitest";

// phone-auth.ts pulls in firebase/auth + ./client at import time (browser-only
// SDK). toE164() itself is pure, so stub those away to exercise the real
// normalization without the heavy SDK — vi.mock intercepts before resolution,
// so this runs whether or not firebase is installed in the test environment.
vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class {},
  signInWithPhoneNumber: vi.fn(),
}));
vi.mock("../firebase/client", () => ({
  getFirebaseAuth: () => ({}),
}));

import {
  sanitizePhoneDigits,
  isValidPhoneDigits,
  isPlausibleIndianMobile,
  isRepeatedOrSequentialDigits,
  PHONE_DIGIT_LENGTH,
  normalizeEmail,
  isValidEmail,
  emailDomain,
  isDisposableEmail,
  isLinkableEmail,
  DISPOSABLE_EMAIL_DOMAINS,
} from "../format";
import { toE164 } from "../firebase/phone-auth";

// ---------------------------------------------------------------------------
// Phone: plausibility gate for the linking step
// ---------------------------------------------------------------------------

describe("isPlausibleIndianMobile — the phone↔account link gate", () => {
  it("accepts genuine 10-digit numbers with a 6–9 leading digit", () => {
    for (const n of ["9876501234", "6000012345", "7412598630", "8123456709"]) {
      expect(isPlausibleIndianMobile(n)).toBe(true);
    }
  });

  it("tolerates real-world formatting: spaces, dashes, and a +91 / 0 prefix", () => {
    expect(isPlausibleIndianMobile("98765 01234")).toBe(true);
    expect(isPlausibleIndianMobile("98765-01234")).toBe(true);
    expect(isPlausibleIndianMobile("+91 98765 01234")).toBe(true);
    expect(isPlausibleIndianMobile("+919876501234")).toBe(true);
    expect(isPlausibleIndianMobile("098765 01234")).toBe(true); // trunk-0 + 10 digits
  });

  it("rejects the wrong number of national digits", () => {
    expect(isPlausibleIndianMobile("98765")).toBe(false); // too short
    expect(isPlausibleIndianMobile("987650123")).toBe(false); // 9 digits
    // 11 bare digits with no trunk 0 is an extra-digit typo, NOT a country
    // code — it must be rejected, never silently trimmed to a different number.
    expect(isPlausibleIndianMobile("98765012345")).toBe(false);
    expect(isPlausibleIndianMobile("")).toBe(false);
  });

  it("rejects a 0–5 leading digit — not a dialable Indian mobile", () => {
    for (const n of ["0123456780", "1987650123", "2987650123", "5987650123"]) {
      expect(isPlausibleIndianMobile(n)).toBe(false);
    }
  });

  it("rejects all-identical-digit throwaways", () => {
    for (const d of ["6", "7", "8", "9"]) {
      expect(isPlausibleIndianMobile(d.repeat(10))).toBe(false);
    }
  });

  it("rejects strict sequential runs that still lead 6–9", () => {
    expect(isPlausibleIndianMobile("9876543210")).toBe(false); // descending
    expect(isPlausibleIndianMobile("6789012345")).toBe(false); // ascending, no wrap
  });

  it("classic fake '1234567890' is rejected (fails the leading-digit rule)", () => {
    expect(isPlausibleIndianMobile("1234567890")).toBe(false);
  });

  it("a +91-prefixed real number keeps only the 10 national digits and passes", () => {
    // The +91 must NOT be counted as part of the 10 — otherwise a valid number
    // would be judged as 12 digits and wrongly rejected.
    expect(isPlausibleIndianMobile("+919812345607")).toBe(true);
    expect(sanitizePhoneDigits("+919812345607")).toBe("9198123456"); // (for contrast)
  });
});

describe("isRepeatedOrSequentialDigits", () => {
  it("flags all-same and strict single-step runs, either direction", () => {
    expect(isRepeatedOrSequentialDigits("0000000000")).toBe(true);
    expect(isRepeatedOrSequentialDigits("1234567")).toBe(true);
    expect(isRepeatedOrSequentialDigits("9876543210")).toBe(true);
  });

  it("does not flag ordinary numbers", () => {
    expect(isRepeatedOrSequentialDigits("9876501234")).toBe(false);
    expect(isRepeatedOrSequentialDigits("6000012345")).toBe(false);
  });

  it("does not flag a near-sequence with a single break", () => {
    expect(isRepeatedOrSequentialDigits("1234567891")).toBe(false); // last step breaks
  });
});

describe("length-only vs plausibility gate — they are intentionally different", () => {
  it("length-only accepts fakes that the linking gate rejects", () => {
    // isValidPhoneDigits guards free-text fields (packing slip fits); the
    // linking gate is stricter. This asserts the two stay distinct so a future
    // refactor can't collapse them and silently weaken the linking step.
    for (const fake of ["0000000000", "1234567890", "9999999999"]) {
      expect(isValidPhoneDigits(fake)).toBe(true);
      expect(isPlausibleIndianMobile(fake)).toBe(false);
    }
  });

  it("both agree on a genuine number", () => {
    expect(isValidPhoneDigits("9876501234")).toBe(true);
    expect(isPlausibleIndianMobile("9876501234")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phone: canonical E.164 form (the key phone→Firebase-auth is linked under)
// ---------------------------------------------------------------------------

describe("toE164 — canonical phone key for linking / dedupe", () => {
  it("prefixes a bare 10-digit number with +91", () => {
    expect(toE164("9876501234")).toBe("+919876501234");
  });

  it("collapses formatting so every spelling of one number maps to one key", () => {
    const forms = ["9876501234", "98765 01234", "98765-01234", "(98765) 01234"];
    const keys = new Set(forms.map((f) => toE164(f)));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("+919876501234");
  });

  it("preserves an explicitly-supplied country code", () => {
    expect(toE164("+91 98765 01234")).toBe("+919876501234");
    expect(toE164("+1 415 555 0123")).toBe("+14155550123");
  });

  it("honours a non-default country code argument", () => {
    expect(toE164("5551234567", "+1")).toBe("+15551234567");
  });
});

// ---------------------------------------------------------------------------
// Email: normalization + validity + disposable screening
// ---------------------------------------------------------------------------

describe("normalizeEmail — canonical email key for linking / dedupe", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeEmail("  You@Shop.COM  ")).toBe("you@shop.com");
  });

  it("every case/whitespace spelling collapses to one key — one account, not many", () => {
    const forms = ["you@shop.com", "You@Shop.com", "YOU@SHOP.COM", "  you@shop.com "];
    const keys = new Set(forms.map((f) => normalizeEmail(f)));
    expect(keys.size).toBe(1);
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary business addresses", () => {
    for (const e of [
      "owner@freshmart.in",
      "raj.kumar@gmail.com",
      "store+orders@shop.co.in",
      "a1@b2.io",
    ]) {
      expect(isValidEmail(e)).toBe(true);
    }
  });

  it("rejects malformed shapes", () => {
    for (const e of [
      "",
      "plainaddress",
      "no-at-sign.com",
      "foo@bar", // no dot in domain
      "@shop.com", // empty local part
      "you@ shop.com", // space
      "you@@shop.com", // double @
      "you@shop", // no TLD
    ]) {
      expect(isValidEmail(e)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace (validated on the trimmed value)", () => {
    expect(isValidEmail("  owner@freshmart.in  ")).toBe(true);
  });
});

describe("emailDomain", () => {
  it("returns the lowercased domain", () => {
    expect(emailDomain("Owner@FreshMart.IN")).toBe("freshmart.in");
  });

  it("returns null when there isn't exactly one @-delimited domain", () => {
    expect(emailDomain("plainaddress")).toBeNull();
    expect(emailDomain("a@b@c")).toBeNull();
    expect(emailDomain("trailing@")).toBeNull();
  });
});

describe("isDisposableEmail — throwaway-inbox screening", () => {
  it("flags known disposable providers, case/space-insensitively", () => {
    expect(isDisposableEmail("burner@mailinator.com")).toBe(true);
    expect(isDisposableEmail("  Test@10MinuteMail.com ")).toBe(true);
    expect(isDisposableEmail("x@yopmail.com")).toBe(true);
  });

  it("does not flag ordinary providers", () => {
    for (const e of ["raj@gmail.com", "owner@freshmart.in", "a@outlook.com"]) {
      expect(isDisposableEmail(e)).toBe(false);
    }
  });

  it("every curated domain is itself detected (guards typos in the set)", () => {
    for (const domain of DISPOSABLE_EMAIL_DOMAINS) {
      expect(isDisposableEmail(`user@${domain}`)).toBe(true);
    }
  });
});

describe("isLinkableEmail — the one call the link step makes", () => {
  it("accepts a well-formed, non-disposable email", () => {
    expect(isLinkableEmail("owner@freshmart.in")).toBe(true);
  });

  it("rejects malformed AND valid-but-disposable addresses", () => {
    expect(isLinkableEmail("not-an-email")).toBe(false); // malformed
    expect(isLinkableEmail("burner@mailinator.com")).toBe(false); // disposable
  });
});

// ---------------------------------------------------------------------------
// The linking invariant, stated as a test: sign-in supplies one detail, the
// link step supplies the other, and BOTH must be canonical + non-fake so the
// emailIndex/phoneIndex uniqueness claim can't be bypassed by re-spelling.
// ---------------------------------------------------------------------------

describe("account-linking invariant (fake-account reduction)", () => {
  it("a Google user linking a phone: fake phones are blocked, real ones canonicalize", () => {
    // method === "google" path in handleSaveAddress + phone→auth E.164 keying.
    expect(isPlausibleIndianMobile("9999999999")).toBe(false); // blocked at link
    expect(isPlausibleIndianMobile("9876501234")).toBe(true);
    expect(toE164("98765 01234")).toBe(toE164("9876501234")); // one dedupe key
  });

  it("a phone user linking an email: temp inboxes are blocked, real ones canonicalize", () => {
    // method === "phone" path in handleSaveAddress + emailIndex keying.
    expect(isLinkableEmail("burner@tempmail.com")).toBe(false); // blocked at link
    expect(isLinkableEmail("owner@freshmart.in")).toBe(true);
    expect(normalizeEmail("Owner@FreshMart.IN")).toBe(normalizeEmail("owner@freshmart.in"));
  });

  it("the pathological pasted-garbage phone can never reach the packing slip length", () => {
    // The original bug: a 19-digit paste on a delivery-phone field. Sanitize
    // caps it; the link gate additionally rejects it as implausible.
    const garbage = "9876543210987654321abc";
    expect(sanitizePhoneDigits(garbage)).toHaveLength(PHONE_DIGIT_LENGTH);
    // The link gate keeps only the last 10 national digits ("0987654321"),
    // which lead with 0 — not a dialable mobile — so it's rejected.
    expect(isPlausibleIndianMobile(garbage)).toBe(false);
  });
});
