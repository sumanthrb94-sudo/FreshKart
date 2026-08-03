/**
 * Phone numbers carry no country code in this app — every field draws its own
 * "+91". Storing Firebase Auth's E.164 value verbatim put the code inside the
 * value, and a live customer could not place an order: checkout rendered
 * "+91 | +918639766053", the 10-digit check counted twelve and refused, and
 * backspacing through the prefix fought the sanitiser on every keystroke.
 */

import { describe, it, expect } from "vitest";
import { isValidPhoneDigits, telHref, toLocalMobile } from "../format";

const REPORTED = "+918639766053"; // straight from the failing order

describe("toLocalMobile", () => {
  it("strips the country code Firebase Auth returns", () => {
    expect(toLocalMobile(REPORTED)).toBe("8639766053");
  });

  it("accepts the number the customer would actually be asked to place", () => {
    // The bug, stated as the thing that mattered: checkout refused the order.
    expect(isValidPhoneDigits(REPORTED)).toBe(false);
    expect(isValidPhoneDigits(toLocalMobile(REPORTED))).toBe(true);
  });

  it.each([
    ["+918639766053", "8639766053", "E.164"],
    ["918639766053", "8639766053", "country code, no plus"],
    ["08639766053", "8639766053", "trunk zero"],
    ["8639766053", "8639766053", "already local"],
    ["+91 86397 66053", "8639766053", "spaced E.164"],
    ["", "", "empty"],
  ])("normalises %s to %s (%s)", (input, expected) => {
    expect(toLocalMobile(input)).toBe(expected);
  });

  it("leaves a real mobile that happens to start 91 alone", () => {
    // 9188888888 is a valid Indian mobile. Blindly dropping a leading "91"
    // would turn it into an 8-digit number.
    expect(toLocalMobile("9188888888")).toBe("9188888888");
  });

  it("ignores an eleventh digit rather than shifting the number along", () => {
    // Taking the last 10 would silently rewrite what the typist can see.
    expect(toLocalMobile("86397660531")).toBe("8639766053");
  });

  it("is idempotent — a normalised number survives being normalised again", () => {
    expect(toLocalMobile(toLocalMobile(REPORTED))).toBe("8639766053");
  });

  it("handles null and undefined, which is what an unset profile field is", () => {
    expect(toLocalMobile(null)).toBe("");
    expect(toLocalMobile(undefined)).toBe("");
  });
});

describe("telHref", () => {
  it("puts the country code back on for dialling", () => {
    // Stored local, dialled international — the code belongs at the point of
    // dialling, not in the value.
    expect(telHref("8639766053")).toBe("tel:+918639766053");
  });

  it("leaves an already-international number alone", () => {
    // Orders placed before this change still hold E.164 in their snapshot.
    expect(telHref(REPORTED)).toBe("tel:+918639766053");
  });

  it("passes through anything that is not a 10-digit mobile", () => {
    // A landline or a partial number should still be dialable, not mangled.
    expect(telHref("040 2345 6789")).toBe("tel:04023456789");
  });

  it("does not produce a dead link for a missing number", () => {
    expect(telHref(undefined)).toBe("tel:");
  });
});
