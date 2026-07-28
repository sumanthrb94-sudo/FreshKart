/**
 * A driver follows this sequence down the page all morning, so the two
 * things that must never break are: the order really is nearest-first from
 * the hub, and a stop we cannot place on the map still appears in the run
 * instead of quietly vanishing.
 */

import { describe, it, expect } from "vitest";
import type { Order } from "../types";
import {
  DEFAULT_SERVICE_AREA,
  formatKm,
  haversineKm,
  isServedPincode,
  locateOrder,
  navigationUrl,
  normalizePincode,
  runBounds,
  sequenceRun,
  summarizeRun,
  type ServiceArea,
} from "../service-area";

const AREA: ServiceArea = {
  hub: { name: "Hub", lat: 17.0, lng: 78.0 },
  pincodes: [
    { code: "500001", area: "Near", lat: 17.01, lng: 78.0 },
    { code: "500002", area: "Middle", lat: 17.05, lng: 78.0 },
    { code: "500003", area: "Far", lat: 17.2, lng: 78.0 },
  ],
};

const order = (id: string, over: Partial<Order["delivery"]> = {}): Order =>
  ({
    id,
    orderNumber: `ORD-${id}`,
    buyerId: "b1",
    businessName: `Shop ${id}`,
    items: [],
    status: "SHIPPED",
    paymentMethod: "COD",
    paymentStatus: "UNPAID",
    subtotal: 100,
    deliveryFee: 0,
    total: 100,
    delivery: {
      name: "Shop",
      phone: "9700000000",
      city: "Hyderabad",
      address: "1 Main Rd",
      pincode: "500002",
      ...over,
    },
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  }) as Order;

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 17, lng: 78 }, { lat: 17, lng: 78 })).toBe(0);
  });

  it("matches the ~111 km per degree of latitude rule of thumb", () => {
    const km = haversineKm({ lat: 17, lng: 78 }, { lat: 18, lng: 78 });
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it("is symmetric", () => {
    const a = { lat: 17.4, lng: 78.5 };
    const b = { lat: 17.45, lng: 78.39 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe("pincodes", () => {
  it("accepts only a full 6-digit PIN", () => {
    expect(normalizePincode("500 033")).toBe("500033");
    expect(normalizePincode("50003")).toBeNull();
    expect(normalizePincode(undefined)).toBeNull();
  });

  it("knows which addresses we serve", () => {
    expect(isServedPincode(AREA, "500002")).toBe(true);
    expect(isServedPincode(AREA, "560001")).toBe(false);
  });
});

describe("locateOrder", () => {
  it("prefers the buyer's own dropped pin over the pincode centre", () => {
    const located = locateOrder(order("a", { lat: 17.123, lng: 78.456 }), AREA);
    expect(located.precision).toBe("PIN");
    expect(located.point).toEqual({ lat: 17.123, lng: 78.456 });
  });

  it("falls back to the pincode centre, flagged as approximate", () => {
    const located = locateOrder(order("a", { pincode: "500003" }), AREA);
    expect(located.precision).toBe("PINCODE");
    expect(located.point).toEqual({ lat: 17.2, lng: 78.0 });
  });

  it("gives up honestly when the pincode is unknown and there is no pin", () => {
    const located = locateOrder(order("a", { pincode: "999999" }), AREA);
    expect(located.precision).toBe("NONE");
    expect(located.point).toBeNull();
  });
});

describe("sequenceRun", () => {
  it("visits the nearest stop first, regardless of the order they came in", () => {
    const stops = sequenceRun(
      [order("far", { pincode: "500003" }), order("near", { pincode: "500001" }), order("mid", { pincode: "500002" })],
      AREA
    );
    expect(stops.map((s) => s.order.id)).toEqual(["near", "mid", "far"]);
    expect(stops.map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it("measures each leg from the previous stop, not from the hub", () => {
    const stops = sequenceRun(
      [order("near", { pincode: "500001" }), order("mid", { pincode: "500002" })],
      AREA
    );
    // Hub→near is 0.01°, near→mid is 0.04° — so the second leg is longer
    // than the first even though "mid" is only 0.05° from the hub.
    expect(stops[1].legKm).toBeGreaterThan(stops[0].legKm!);
    expect(stops[1].cumulativeKm).toBeCloseTo(stops[0].legKm! + stops[1].legKm!, 6);
  });

  it("keeps unmappable stops in the run, at the end", () => {
    const stops = sequenceRun(
      [order("nowhere", { pincode: "999999" }), order("near", { pincode: "500001" })],
      AREA
    );
    expect(stops.map((s) => s.order.id)).toEqual(["near", "nowhere"]);
    expect(stops[1].point).toBeNull();
    expect(stops[1].legKm).toBeNull();
    expect(stops[1].seq).toBe(2);
  });

  it("flags a stop outside the service area but still routes it", () => {
    // An exact pin means we CAN drive there even though the pincode is not
    // one we advertise — the driver should see the warning, not an empty map.
    const stops = sequenceRun([order("outside", { pincode: "560001", lat: 17.02, lng: 78.0 })], AREA);
    expect(stops[0].served).toBe(false);
    expect(stops[0].point).not.toBeNull();
  });

  it("handles an empty run", () => {
    expect(sequenceRun([], AREA)).toEqual([]);
  });
});

describe("summarizeRun", () => {
  it("totals the distance to the last mapped stop and counts the gaps", () => {
    const stops = sequenceRun(
      [order("near", { pincode: "500001" }), order("far", { pincode: "500003" }), order("nowhere", { pincode: "999999" })],
      AREA
    );
    const summary = summarizeRun(stops);
    expect(summary.stops).toBe(3);
    expect(summary.mapped).toBe(2);
    expect(summary.unmapped).toBe(1);
    expect(summary.outsideArea).toBe(1);
    expect(summary.totalKm).toBeCloseTo(stops[1].cumulativeKm!, 6);
  });

  it("reports zero distance for a run with nothing mapped", () => {
    const summary = summarizeRun(sequenceRun([order("nowhere", { pincode: "999999" })], AREA));
    expect(summary.totalKm).toBe(0);
  });
});

describe("runBounds", () => {
  it("covers the hub and every mapped stop", () => {
    const stops = sequenceRun([order("far", { pincode: "500003" })], AREA);
    const bounds = runBounds(AREA, stops);
    expect(bounds).not.toBeNull();
    expect(bounds![0].lat).toBeCloseTo(17.0, 6);
    expect(bounds![1].lat).toBeCloseTo(17.2, 6);
  });

  it("is null when there is nothing but the hub to show", () => {
    expect(runBounds(AREA, [])).toBeNull();
  });
});

describe("navigationUrl", () => {
  it("navigates to exact coordinates when we have them", () => {
    const stops = sequenceRun([order("a", { lat: 17.1, lng: 78.2 })], AREA);
    expect(navigationUrl(stops[0])).toContain("destination=17.1,78.2");
  });

  it("falls back to the written address so an unmapped stop is still drivable", () => {
    const stops = sequenceRun([order("a", { pincode: "999999", address: "5 Market Rd" })], AREA);
    expect(navigationUrl(stops[0])).toContain(encodeURIComponent("5 Market Rd"));
  });
});

describe("formatKm", () => {
  it("uses metres below a kilometre", () => {
    expect(formatKm(0.42)).toBe("420 m");
  });

  it("drops the decimal once the number is long", () => {
    expect(formatKm(3.14)).toBe("3.1 km");
    expect(formatKm(12.7)).toBe("13 km");
  });

  it("shows a dash when there is nothing to measure", () => {
    expect(formatKm(null)).toBe("—");
  });
});

describe("DEFAULT_SERVICE_AREA", () => {
  it("has a usable hub and unique, well-formed pincodes", () => {
    expect(DEFAULT_SERVICE_AREA.pincodes.length).toBeGreaterThan(0);
    const codes = DEFAULT_SERVICE_AREA.pincodes.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const p of DEFAULT_SERVICE_AREA.pincodes) {
      expect(normalizePincode(p.code)).toBe(p.code);
      // Every seeded locality must be within an hour's drive of the hub, or
      // the "nearest-first" sequence is sorting nonsense.
      expect(haversineKm(DEFAULT_SERVICE_AREA.hub, p)).toBeLessThan(40);
    }
  });
});
