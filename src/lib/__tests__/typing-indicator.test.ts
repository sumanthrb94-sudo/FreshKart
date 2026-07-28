import { describe, it, expect } from "vitest";
import { isTypingActive, TYPING_TTL_MS } from "../typing-indicator";

describe("isTypingActive", () => {
  const NOW = 1_800_000_000_000; // fixed reference instant

  it("is false with no heartbeat at all", () => {
    expect(isTypingActive(undefined, NOW)).toBe(false);
    expect(isTypingActive(null, NOW)).toBe(false);
    expect(isTypingActive("", NOW)).toBe(false);
  });

  it("is true for a heartbeat written just now", () => {
    expect(isTypingActive(new Date(NOW).toISOString(), NOW)).toBe(true);
  });

  it("is true right up to (but not at) the TTL boundary", () => {
    const justInside = new Date(NOW - (TYPING_TTL_MS - 1)).toISOString();
    expect(isTypingActive(justInside, NOW)).toBe(true);
  });

  it("goes stale once the TTL has elapsed", () => {
    const atBoundary = new Date(NOW - TYPING_TTL_MS).toISOString();
    expect(isTypingActive(atBoundary, NOW)).toBe(false);

    const wellPast = new Date(NOW - TYPING_TTL_MS - 5000).toISOString();
    expect(isTypingActive(wellPast, NOW)).toBe(false);
  });

  it("tolerates small clock skew where the heartbeat looks slightly in the future", () => {
    const slightlyAhead = new Date(NOW + 500).toISOString();
    expect(isTypingActive(slightlyAhead, NOW)).toBe(true);
  });

  it("rejects a heartbeat further in the future than one TTL window (bad data, not skew)", () => {
    const farFuture = new Date(NOW + TYPING_TTL_MS + 5000).toISOString();
    expect(isTypingActive(farFuture, NOW)).toBe(false);
  });

  it("never gets stuck forever — re-evaluating with a later `now` eventually goes false", () => {
    const ts = new Date(NOW).toISOString();
    expect(isTypingActive(ts, NOW)).toBe(true);
    expect(isTypingActive(ts, NOW + TYPING_TTL_MS + 1)).toBe(false);
  });

  it("rejects a garbage/unparseable timestamp instead of throwing", () => {
    expect(isTypingActive("not-a-date", NOW)).toBe(false);
  });
});
