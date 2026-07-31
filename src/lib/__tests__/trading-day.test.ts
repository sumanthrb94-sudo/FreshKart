/**
 * The rules that decide whether the shop can take an order at all.
 *
 * Both of these were found by simulating a full trading day rather than by
 * reading the code, and both failed silently in a way nobody would have
 * reported as a bug — the shop simply took no orders, and buyers saw a
 * friendly "getting best prices for you" message all day.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { getIstBusinessDayRange, getIstDateString, isDailyPriceUpdatePublished } from "../time";
import { canBuyerCancel } from "../format";

/** Pin "now" to a given IST wall-clock instant. */
function atIst(istWallClock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${istWallClock}+05:30`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("today's prices are published", () => {
  it("counts a publish made before 7 AM — the mandi run finishes early", () => {
    // This is the bug: an admin back from the market at 06:30 who entered the
    // day's rates used to have that publish silently ignored, leaving the shop
    // unable to take a single order for the rest of the day.
    atIst("2026-07-29T09:00:00");
    expect(isDailyPriceUpdatePublished("2026-07-29T06:30:00+05:30")).toBe(true);
  });

  it("still counts the ordinary 7:05 AM publish", () => {
    atIst("2026-07-29T09:00:00");
    expect(isDailyPriceUpdatePublished("2026-07-29T07:05:00+05:30")).toBe(true);
  });

  it("counts a publish made at one minute past midnight IST", () => {
    atIst("2026-07-29T09:00:00");
    expect(isDailyPriceUpdatePublished("2026-07-29T00:01:00+05:30")).toBe(true);
  });

  it("does NOT count yesterday's prices — that's the whole point of the rule", () => {
    atIst("2026-07-29T09:00:00");
    expect(isDailyPriceUpdatePublished("2026-07-28T22:00:00+05:30")).toBe(false);
    expect(isDailyPriceUpdatePublished("2026-07-28T07:30:00+05:30")).toBe(false);
  });

  it("handles no publish and a corrupt timestamp without throwing", () => {
    atIst("2026-07-29T09:00:00");
    expect(isDailyPriceUpdatePublished(undefined)).toBe(false);
    expect(isDailyPriceUpdatePublished(null)).toBe(false);
    expect(isDailyPriceUpdatePublished("not a date")).toBe(false);
  });

  it("rolls over at IST midnight, not UTC midnight", () => {
    // 20:00 UTC on the 29th is already 01:30 IST on the 30th, so the 29th's
    // sheet must stop counting even though the UTC date hasn't changed.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T20:00:00Z"));
    expect(getIstDateString(new Date())).toBe("2026-07-30");
    expect(isDailyPriceUpdatePublished("2026-07-29T07:30:00+05:30")).toBe(false);
  });
});

describe("the business day", () => {
  it("covers the whole IST calendar day, so no order can fall outside it", () => {
    // The range used to start at 07:00. An order placed before that — possible
    // once an admin forces the shop live early — vanished from the day's
    // report and packing list entirely.
    const { startIso, endIso } = getIstBusinessDayRange("2026-07-29");
    expect(startIso).toBe(new Date("2026-07-29T00:00:00+05:30").toISOString());
    expect(endIso).toBe(new Date("2026-07-30T00:00:00+05:30").toISOString());
  });

  it("leaves no gap between one day and the next", () => {
    expect(getIstBusinessDayRange("2026-07-29").endIso).toBe(
      getIstBusinessDayRange("2026-07-30").startIso
    );
  });

  it("contains an order placed at 06:30 IST", () => {
    const { startIso, endIso } = getIstBusinessDayRange("2026-07-29");
    const early = new Date("2026-07-29T06:30:00+05:30").toISOString();
    expect(early >= startIso && early < endIso).toBe(true);
  });

  it("contains an order placed at 20:59 IST, just before the cart closes", () => {
    const { startIso, endIso } = getIstBusinessDayRange("2026-07-29");
    const late = new Date("2026-07-29T20:59:00+05:30").toISOString();
    expect(late >= startIso && late < endIso).toBe(true);
  });
});

describe("cancelling an order that is already on the van", () => {
  // Found by running the buyer, the office and the driver at the same time:
  // a buyer could call off an order the driver had already loaded, and the
  // stop simply disappeared from his run with no explanation.
  it("lets a buyer cancel while the order is still at the hub", () => {
    expect(canBuyerCancel("PENDING")).toBe(true);
    expect(canBuyerCancel("CONFIRMED")).toBe(true);
    expect(canBuyerCancel("CONFIRMED", null)).toBe(true);
  });

  it("stops the buyer once a driver is carrying it", () => {
    // Assignment does NOT change the status, so status alone cannot answer
    // this — the driver is the signal.
    expect(canBuyerCancel("CONFIRMED", "driver-1")).toBe(false);
    expect(canBuyerCancel("PENDING", "driver-1")).toBe(false);
  });

  it("still refuses once the order has moved on by itself", () => {
    expect(canBuyerCancel("SHIPPED")).toBe(false);
    expect(canBuyerCancel("DELIVERED")).toBe(false);
    expect(canBuyerCancel("CANCELLED")).toBe(false);
  });
});
