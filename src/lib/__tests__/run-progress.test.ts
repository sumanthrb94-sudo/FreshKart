/**
 * "How far through is he, and is the van still moving?" — the question the
 * office is asked every time a buyer rings. These assertions are mostly about
 * not overstating what the data knows: progress moves when a stop completes,
 * and a quiet run is reported as quiet rather than as fine.
 */

import { describe, it, expect } from "vitest";
import type { Order, ServiceArea, User } from "../types";
import { runProgress, sinceLabel, SILENT_RUN_MINUTES } from "../run-progress";

const AREA = {
  hub: { name: "Hub", lat: 17.0, lng: 78.0 },
  radiusKm: 15,
  pincodes: [
    { code: "500001", area: "Near", lat: 17.01, lng: 78.0 },
    { code: "500002", area: "Mid", lat: 17.05, lng: 78.0 },
    { code: "500003", area: "Far", lat: 17.1, lng: 78.0 },
  ],
} as unknown as ServiceArea;

const driver: User = {
  id: "d1",
  name: "Ravi",
  email: "driver@green-basket.in",
  phone: "9800000001",
  role: "DRIVER",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const NOW = new Date("2026-07-30T04:00:00.000Z"); // 09:30 IST

const order = (id: string, over: Partial<Order> = {}): Order =>
  ({
    id,
    orderNumber: `ORD-${id}`,
    buyerId: `b-${id}`,
    businessName: `Shop ${id}`,
    items: [],
    status: "SHIPPED",
    paymentMethod: "COD",
    paymentStatus: "UNPAID",
    subtotal: 1000,
    deliveryFee: 50,
    total: 1050,
    driverId: "d1",
    delivery: {
      name: `Shop ${id}`,
      phone: "9",
      city: "Hyderabad",
      address: `${id} Main Rd`,
      pincode: "500002",
    },
    createdAt: "2026-07-29T02:00:00.000Z",
    updatedAt: "2026-07-30T03:50:00.000Z",
    ...over,
  }) as Order;

describe("how far through the run he is", () => {
  it("counts doors, not orders", () => {
    // Two orders from the SAME shop are one stop — the same thing he counts.
    // Same address under a different buyer stays separate: two businesses in
    // one building are two doors, and merging them would hand one shop's
    // crates to the other.
    const p = runProgress(
      driver,
      [
        order("a", { buyerId: "shop-1", delivery: { name: "S", phone: "9", city: "c", address: "1 Rd", pincode: "500002" } }),
        order("b", { buyerId: "shop-1", delivery: { name: "S", phone: "9", city: "c", address: "1 Rd", pincode: "500002" } }),
        order("c", { buyerId: "shop-2", delivery: { name: "T", phone: "9", city: "c", address: "9 Rd", pincode: "500003" } }),
      ],
      AREA,
      NOW
    );
    expect(p.stopsTotal).toBe(2);
    expect(p.ordersTotal).toBe(3);
  });

  it("names the door he should be at next", () => {
    const p = runProgress(
      driver,
      [order("near", { pincode: "500001" } as never), order("far", { status: "DELIVERED" })],
      AREA,
      NOW
    );
    expect(p.currentStop?.orders[0].id).toBe("near");
  });

  it("advances as stops complete", () => {
    const before = runProgress(driver, [order("a"), order("b")], AREA, NOW);
    const after = runProgress(driver, [order("a", { status: "DELIVERED" }), order("b")], AREA, NOW);
    expect(before.stopsDone).toBe(0);
    expect(after.stopsDone).toBe(1);
  });

  it("reports a finished run and stops naming a current door", () => {
    const p = runProgress(driver, [order("a", { status: "DELIVERED" })], AREA, NOW);
    expect(p.finished).toBe(true);
    expect(p.currentStop).toBeNull();
  });

  it("ignores cancelled orders and other drivers' work", () => {
    const p = runProgress(
      driver,
      [order("mine"), order("dead", { status: "CANCELLED" }), order("theirs", { driverId: "d2" })],
      AREA,
      NOW
    );
    expect(p.ordersTotal).toBe(1);
  });

  it("does not credit the leg he is currently driving", () => {
    // Distance is only counted for doors actually reached, so the number
    // never runs ahead of him.
    const p = runProgress(driver, [order("a"), order("b")], AREA, NOW);
    expect(p.kmDone).toBe(0);
    expect(p.kmTotal).toBeGreaterThan(0);
  });
});

describe("money and blockers", () => {
  it("counts only cash actually taken", () => {
    const p = runProgress(
      driver,
      [
        order("paid", { status: "DELIVERED", paymentStatus: "PAID" }),
        order("online", { status: "DELIVERED", paymentStatus: "PAID", paymentMethod: "ONLINE" }),
        order("todo"),
      ],
      AREA,
      NOW
    );
    expect(p.cashCollected).toBe(1050);
  });

  it("flags a driver stuck waiting on an office decision", () => {
    const p = runProgress(
      driver,
      [
        order("stuck", {
          adjustment: {
            lines: [],
            totalRefund: 900,
            reason: "Wilted",
            photos: [],
            status: "PENDING",
            raisedBy: "d1",
            raisedAt: "2026-07-30T03:50:00.000Z",
          },
        }),
      ],
      AREA,
      NOW
    );
    expect(p.waitingOnOffice).toBe(1);
  });
});

describe("a van that has gone quiet", () => {
  it("stays calm while updates are recent", () => {
    const p = runProgress(driver, [order("a", { updatedAt: "2026-07-30T03:50:00.000Z" })], AREA, NOW);
    expect(p.silentMinutes).toBe(10);
    expect(p.isStalled).toBe(false);
  });

  it("flags an unfinished run with no update for too long", () => {
    const stale = new Date(NOW.getTime() - (SILENT_RUN_MINUTES + 5) * 60_000).toISOString();
    const p = runProgress(driver, [order("a", { updatedAt: stale })], AREA, NOW);
    expect(p.isStalled).toBe(true);
  });

  it("never flags a finished run — quiet is the correct state then", () => {
    const stale = new Date(NOW.getTime() - 180 * 60_000).toISOString();
    const p = runProgress(
      driver,
      [order("a", { status: "DELIVERED", updatedAt: stale, deliveredAt: stale })],
      AREA,
      NOW
    );
    expect(p.isStalled).toBe(false);
  });

  it("says nothing about a driver with no run at all", () => {
    const p = runProgress(driver, [], AREA, NOW);
    expect(p.isStalled).toBe(false);
    expect(p.finished).toBe(false);
    expect(p.silentMinutes).toBeNull();
  });
});

describe("sinceLabel", () => {
  it("reads naturally at every scale", () => {
    expect(sinceLabel(null)).toBe("no updates yet");
    expect(sinceLabel(0)).toBe("just now");
    expect(sinceLabel(12)).toBe("12 min ago");
    expect(sinceLabel(125)).toBe("2h 05m ago");
    // An order assigned on Tuesday and still out on Friday must not read
    // as "73h 40m" — nobody converts that in their head.
    expect(sinceLabel(60 * 24)).toBe("1 day ago");
    expect(sinceLabel(60 * 24 * 3)).toBe("3 days ago");
  });
});
