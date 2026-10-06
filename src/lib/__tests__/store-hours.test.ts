import { describe, it, expect } from "vitest";
import {
  STORE_OPEN_HOUR,
  STORE_OPEN_MINUTE,
  STORE_CLOSE_HOUR,
  STORE_CLOSE_MINUTE,
  getStoreStatus,
  nextStoreClose,
  effectiveOverride,
  formatRemainingMinutes,
  formatTime12h,
} from "../store-hours";

describe("store-hours constants", () => {
  it("opens at 8:00 AM IST", () => {
    expect(STORE_OPEN_HOUR).toBe(8);
    expect(STORE_OPEN_MINUTE).toBe(0);
  });

  it("closes at 10:30 PM IST", () => {
    expect(STORE_CLOSE_HOUR).toBe(22);
    expect(STORE_CLOSE_MINUTE).toBe(30);
  });
});

describe("getStoreStatus", () => {
  // Helper to create an instant with specified IST time
  // IST is UTC+5:30. E.g. 10:00 IST is 04:30 UTC.
  function ist(isoDate: string, time: string): Date {
    return new Date(`${isoDate}T${time}:00+05:30`);
  }

  it("reports store as open at 10:00 AM IST", () => {
    const status = getStoreStatus(ist("2026-10-06", "10:00"));
    expect(status.isOpen).toBe(true);
    expect(status.isOnSchedule).toBe(true);
    expect(status.canPlaceOrders).toBe(true);
  });

  it("reports store as open at 10:00 PM (22:00) IST", () => {
    const status = getStoreStatus(ist("2026-10-06", "22:00"));
    expect(status.isOpen).toBe(true);
    expect(status.isOnSchedule).toBe(true);
    expect(status.canPlaceOrders).toBe(true);
  });

  it("reports store as open right up to 10:29 PM IST", () => {
    const status = getStoreStatus(ist("2026-10-06", "22:29"));
    expect(status.isOpen).toBe(true);
    expect(status.isOnSchedule).toBe(true);
  });

  it("reports store as closed at 10:30 PM (22:30) IST sharp", () => {
    const status = getStoreStatus(ist("2026-10-06", "22:30"));
    expect(status.isOpen).toBe(false);
    expect(status.isOnSchedule).toBe(false);
    expect(status.canPlaceOrders).toBe(false);
  });

  it("reports store as closed after 10:30 PM IST", () => {
    const status = getStoreStatus(ist("2026-10-06", "23:00"));
    expect(status.isOpen).toBe(false);
    expect(status.isOnSchedule).toBe(false);
  });

  it("reports store as closed before 8:00 AM IST", () => {
    const status = getStoreStatus(ist("2026-10-06", "07:45"));
    expect(status.isOpen).toBe(false);
    expect(status.isOnSchedule).toBe(false);
  });

  it("respects admin override OPEN even after 10:30 PM", () => {
    const status = getStoreStatus(ist("2026-10-06", "23:00"), "OPEN");
    expect(status.isOpen).toBe(true);
    expect(status.isOnSchedule).toBe(false);
  });

  it("respects admin override CLOSED during trading hours", () => {
    const status = getStoreStatus(ist("2026-10-06", "14:00"), "CLOSED");
    expect(status.isOpen).toBe(false);
    expect(status.isOnSchedule).toBe(true);
  });
});

describe("nextStoreClose", () => {
  it("targets 10:30 PM IST on the same day when called before 10:30 PM", () => {
    // 14:00 IST on 2026-10-06 is 08:30 UTC
    const afternoon = new Date("2026-10-06T08:30:00.000Z");
    const nextClose = nextStoreClose(afternoon);
    // 22:30 IST on 2026-10-06 is 17:00 UTC
    expect(nextClose.toISOString()).toBe("2026-10-06T17:00:00.000Z");
  });

  it("targets 10:30 PM IST tomorrow when called after 10:30 PM", () => {
    // 23:00 IST on 2026-10-06 is 17:30 UTC
    const lateNight = new Date("2026-10-06T17:30:00.000Z");
    const nextClose = nextStoreClose(lateNight);
    // 22:30 IST on 2026-10-07 is 17:00 UTC on next day
    expect(nextClose.toISOString()).toBe("2026-10-07T17:00:00.000Z");
  });
});

describe("effectiveOverride", () => {
  it("reverts to AUTO once an override expires", () => {
    const past = new Date("2026-10-06T17:00:00.000Z"); // expired at 10:30 PM
    const now = new Date("2026-10-06T17:05:00.000Z");
    const effective = effectiveOverride(
      { override: "OPEN", expiresAt: past.toISOString() },
      now
    );
    expect(effective).toBe("AUTO");
  });

  it("keeps the override while unexpired", () => {
    const future = new Date("2026-10-06T17:00:00.000Z");
    const now = new Date("2026-10-06T16:00:00.000Z");
    const effective = effectiveOverride(
      { override: "OPEN", expiresAt: future.toISOString() },
      now
    );
    expect(effective).toBe("OPEN");
  });
});

describe("formatRemainingMinutes", () => {
  it("formats remaining minutes nicely", () => {
    expect(formatRemainingMinutes(135)).toBe("2h 15m");
    expect(formatRemainingMinutes(60)).toBe("1h");
    expect(formatRemainingMinutes(45)).toBe("45m");
    expect(formatRemainingMinutes(0)).toBe("");
  });
});

describe("formatTime12h", () => {
  it("formats AM and PM times with and without minutes", () => {
    expect(formatTime12h(8, 0)).toBe("8 AM");
    expect(formatTime12h(22, 30)).toBe("10:30 PM");
    expect(formatTime12h(12, 0)).toBe("12 PM");
    expect(formatTime12h(0, 0)).toBe("12 AM");
    expect(formatTime12h(21, 5)).toBe("9:05 PM");
  });
});
