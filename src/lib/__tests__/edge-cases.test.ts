/**
 * Edge-case validation tests for user-input fields prone to garbage input:
 * phone numbers, pincodes, and order weight bounds.
 *
 * Test command: npx vitest run src/lib/__tests__
 *
 * Motivating bug: a checkout phone field had no length cap at all — a
 * pasted/fat-fingered string of any length would save and print as-is (a
 * packing slip showing "9876543210987654321" as the delivery phone). Every
 * validator here is the fix for one such gap; these tests exist so the gap
 * can't quietly reopen.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizePhoneDigits,
  isValidPhoneDigits,
  PHONE_DIGIT_LENGTH,
  sanitizePincodeDigits,
  isValidPincodeDigits,
  PINCODE_DIGIT_LENGTH,
  MIN_ORDER_TOTAL_QTY,
  MAX_ORDER_TOTAL_QTY,
  isValidOrderWeight,
} from "../format";

describe("phone number validation", () => {
  it("accepts a well-formed 10-digit number", () => {
    expect(isValidPhoneDigits("9876543210")).toBe(true);
  });

  it("rejects too few digits", () => {
    expect(isValidPhoneDigits("98765")).toBe(false);
    expect(isValidPhoneDigits("")).toBe(false);
  });

  it("rejects too many digits — the exact bug from the packing slip screenshot", () => {
    expect(isValidPhoneDigits("9876543210987654321")).toBe(false);
    expect(isValidPhoneDigits("98765432101")).toBe(false);
  });

  it("ignores formatting (spaces, dashes) around a bare 10-digit number", () => {
    expect(isValidPhoneDigits("98765 43210")).toBe(true);
    expect(isValidPhoneDigits("98765-43210")).toBe(true);
  });

  it("rejects a country-code-prefixed number as its own field value — the +91 is not part of the 10-digit number", () => {
    // Matches the app's convention: user.phone / delivery.phone are stored
    // bare (e.g. from OnboardingScreen's addrPhone), never E.164 — see
    // format.ts's PHONE_DIGIT_LENGTH doc comment.
    expect(isValidPhoneDigits("+91 98765 43210")).toBe(false);
  });

  it("sanitize strips non-digits and hard-caps at PHONE_DIGIT_LENGTH", () => {
    expect(sanitizePhoneDigits("9876543210987654321")).toBe("9876543210");
    expect(sanitizePhoneDigits("+91 98765 43210")).toHaveLength(PHONE_DIGIT_LENGTH);
    expect(sanitizePhoneDigits("abc98765xyz43210")).toBe("9876543210");
  });

  it("sanitize output is always re-validatable (idempotent under isValidPhoneDigits once long enough)", () => {
    const sanitized = sanitizePhoneDigits("987654321098765");
    expect(sanitized).toHaveLength(PHONE_DIGIT_LENGTH);
    expect(isValidPhoneDigits(sanitized)).toBe(true);
  });

  it("sanitize never exceeds the cap no matter how much garbage is pasted", () => {
    const wallOfDigits = "9".repeat(500);
    expect(sanitizePhoneDigits(wallOfDigits)).toHaveLength(PHONE_DIGIT_LENGTH);
  });
});

describe("pincode validation", () => {
  it("accepts a well-formed 6-digit pincode", () => {
    expect(isValidPincodeDigits("560001")).toBe(true);
  });

  it("rejects too few or too many digits", () => {
    expect(isValidPincodeDigits("5600")).toBe(false);
    expect(isValidPincodeDigits("56000199")).toBe(false);
    expect(isValidPincodeDigits("")).toBe(false);
  });

  it("sanitize strips non-digits and hard-caps at PINCODE_DIGIT_LENGTH", () => {
    expect(sanitizePincodeDigits("560-001")).toBe("560001");
    expect(sanitizePincodeDigits("56000199999")).toHaveLength(PINCODE_DIGIT_LENGTH);
  });
});

describe("order weight bounds", () => {
  it("accepts weights within [MIN_ORDER_TOTAL_QTY, MAX_ORDER_TOTAL_QTY]", () => {
    expect(isValidOrderWeight(MIN_ORDER_TOTAL_QTY)).toBe(true);
    expect(isValidOrderWeight(MAX_ORDER_TOTAL_QTY)).toBe(true);
    expect(isValidOrderWeight((MIN_ORDER_TOTAL_QTY + MAX_ORDER_TOTAL_QTY) / 2)).toBe(true);
  });

  it("rejects below the minimum", () => {
    expect(isValidOrderWeight(MIN_ORDER_TOTAL_QTY - 1)).toBe(false);
    expect(isValidOrderWeight(0)).toBe(false);
  });

  it("rejects above the maximum — an order can't silently exceed packing/delivery capacity", () => {
    expect(isValidOrderWeight(MAX_ORDER_TOTAL_QTY + 1)).toBe(false);
    expect(isValidOrderWeight(10_000)).toBe(false);
  });
});
