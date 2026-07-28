/**
 * The driver walks back in carrying several thousand rupees. These numbers
 * are the only thing that says how much that should be, so they have to
 * account for produce refused at the door — not what was ordered.
 */

import { describe, it, expect } from "vitest";
import type { Order } from "../types";
import { onIstDay, summarizeCashRun } from "../cash-run";

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    buyerId: "b1",
    businessName: "Shop",
    items: [],
    status: "DELIVERED",
    paymentMethod: "COD",
    paymentStatus: "PAID",
    subtotal: 1000,
    deliveryFee: 50,
    total: 1050,
    delivery: { name: "Shop", phone: "9", city: "c", address: "a", pincode: "500048" },
    createdAt: "2026-07-29T02:00:00.000Z",
    updatedAt: "2026-07-30T03:00:00.000Z",
    ...over,
  }) as Order;

const adjustment = (totalRefund: number, status: "APPROVED" | "PENDING" = "APPROVED") =>
  ({
    lines: [],
    totalRefund,
    reason: "Bruised",
    photos: [],
    status,
    raisedBy: "d1",
    raisedAt: "2026-07-30T03:00:00.000Z",
  }) as Order["adjustment"];

describe("what the driver should hand in", () => {
  it("counts the adjusted amount, not what was ordered", () => {
    const run = summarizeCashRun([order({ adjustment: adjustment(200) })]);
    expect(run.cashDue).toBe(850);
    expect(run.refunded).toBe(200);
  });

  it("leaves prepaid orders out of the cash figure", () => {
    const run = summarizeCashRun([
      order({ id: "cod" }),
      order({ id: "online", paymentMethod: "ONLINE" }),
    ]);
    expect(run.cashDue).toBe(1050);
    expect(run.prepaid).toBe(1050);
  });

  it("ignores orders that were never delivered", () => {
    const run = summarizeCashRun([order({ status: "SHIPPED" }), order({ id: "done" })]);
    expect(run.delivered).toBe(1);
    expect(run.cashDue).toBe(1050);
  });

  it("holds the full amount while an escalation is undecided", () => {
    // Nothing has been settled, so nothing comes off what he owes.
    const run = summarizeCashRun([order({ adjustment: adjustment(400, "PENDING") })]);
    expect(run.cashDue).toBe(1050);
  });

  it("flags a delivered COD order that was never marked paid", () => {
    const run = summarizeCashRun([order({ paymentStatus: "UNPAID" })]);
    expect(run.unpaid).toHaveLength(1);
    expect(run.unpaid[0].orderNumber).toBe("ORD-1");
  });

  it("is zero for a run with nothing delivered", () => {
    const run = summarizeCashRun([]);
    expect(run.cashDue).toBe(0);
    expect(run.delivered).toBe(0);
  });
});

describe("which day a delivery belongs to", () => {
  it("uses IST, so an early-morning drop isn't filed under yesterday", () => {
    // 03:00 UTC on the 30th is 08:30 IST on the 30th.
    const orders = [order({ deliveredAt: "2026-07-30T03:00:00.000Z" })];
    expect(onIstDay(orders, "2026-07-30")).toHaveLength(1);
    expect(onIstDay(orders, "2026-07-29")).toHaveLength(0);
  });

  it("files a 21:00 UTC delivery under the NEXT IST day", () => {
    // 21:00 UTC is 02:30 IST tomorrow — an edge a UTC-based filter gets wrong.
    const orders = [order({ deliveredAt: "2026-07-29T21:00:00.000Z" })];
    expect(onIstDay(orders, "2026-07-30")).toHaveLength(1);
  });

  it("falls back to updatedAt when deliveredAt is missing", () => {
    const orders = [order({ deliveredAt: undefined, updatedAt: "2026-07-30T05:00:00.000Z" })];
    expect(onIstDay(orders, "2026-07-30")).toHaveLength(1);
  });
});
