/**
 * The delivery fee is computed in TWO places that must agree exactly:
 *
 *   1. calculateDeliveryFee()      — src/lib/delivery.ts (what the client writes)
 *   2. getExpectedDeliveryFee()    — firestore.rules   (what the server accepts)
 *
 * The browser writes orders straight to Firestore, so the rules recompute the
 * fee and reject any order where the two disagree — surfacing as a bare
 * "Missing or insufficient permissions" that says nothing about fees. This
 * suite pins the slabs AND parses the live rules file to prove the two
 * implementations still match, so a one-sided edit fails here instead of in
 * production checkout.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateDeliveryFee } from "../delivery";

describe("delivery fee slabs", () => {
  it("charges Rs. 50 below Rs. 1,000", () => {
    expect(calculateDeliveryFee(1)).toBe(50);
    expect(calculateDeliveryFee(500)).toBe(50);
    expect(calculateDeliveryFee(999)).toBe(50);
  });

  it("charges Rs. 25 from Rs. 1,000 through Rs. 3,000 inclusive", () => {
    expect(calculateDeliveryFee(1000)).toBe(25);
    expect(calculateDeliveryFee(2000)).toBe(25);
    expect(calculateDeliveryFee(3000)).toBe(25);
  });

  it("is free above Rs. 3,000", () => {
    expect(calculateDeliveryFee(3001)).toBe(0);
    expect(calculateDeliveryFee(50_000)).toBe(0);
  });

  it("charges nothing for an empty cart", () => {
    expect(calculateDeliveryFee(0)).toBe(0);
  });
});

describe("firestore.rules agrees with the client on every boundary", () => {
  /** Re-implement the rules' ternary by reading the thresholds straight out of
   *  firestore.rules, so this test fails the moment the two drift apart. */
  function feeFromRules(): (subtotal: number) => number {
    const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
    const body = rules.match(
      /function getExpectedDeliveryFee\(subtotal\)\s*\{\s*return([\s\S]*?);\s*\}/
    )?.[1];
    if (!body) throw new Error("getExpectedDeliveryFee() not found in firestore.rules");

    // e.g. "subtotal <= 0 ? 0 : subtotal < 1000 ? 50 : subtotal <= 3000 ? 25 : 0"
    const clauses = [...body.matchAll(/subtotal\s*(<=|<)\s*(\d+)\s*\?\s*(\d+)/g)].map((m) => ({
      op: m[1],
      threshold: Number(m[2]),
      fee: Number(m[3]),
    }));
    const fallback = Number(body.trim().split(":").pop()!.trim());
    expect(clauses.length).toBeGreaterThan(0);

    return (subtotal: number) => {
      for (const c of clauses) {
        if (c.op === "<=" ? subtotal <= c.threshold : subtotal < c.threshold) return c.fee;
      }
      return fallback;
    };
  }

  it("matches at every slab boundary and either side of it", () => {
    const fromRules = feeFromRules();
    const probes = [0, 1, 499, 999, 1000, 1001, 2999, 3000, 3001, 10_000];
    for (const subtotal of probes) {
      expect(
        calculateDeliveryFee(subtotal),
        `client and firestore.rules disagree at subtotal=${subtotal} — every checkout at this value would be rejected`
      ).toBe(fromRules(subtotal));
    }
  });
});
