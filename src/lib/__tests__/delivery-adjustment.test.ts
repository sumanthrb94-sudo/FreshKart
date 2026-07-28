/**
 * Door-side adjustments replace post-delivery returns entirely, so these
 * rules decide real money at the doorstep with a customer waiting. The two
 * that matter most:
 *
 *   1. How much a driver may settle without an admin — too low and every
 *      delivery run stalls on a phone call; too high and write-offs go
 *      unsupervised.
 *   2. That the buyer is billed only for what they kept, whichever way an
 *      escalation is decided.
 */

import { describe, it, expect } from "vitest";
import type { DeliveryAdjustment, Order, OrderItem } from "../types";
import {
  DRIVER_APPROVAL_FLOOR_RUPEES,
  buildAdjustmentLine,
  driverApprovalLimit,
  isCollectable,
  isWithinDriverAuthority,
  payableTotal,
  shouldRestock,
  totalRefundOf,
} from "../delivery-adjustment";

const item = (over: Partial<OrderItem> = {}): OrderItem => ({
  productId: "tomato",
  name: "Tomato",
  unit: "kg",
  price: 20,
  qty: 20,
  lineTotal: 400,
  ...over,
});

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    buyerId: "b1",
    businessName: "Shop",
    items: [item()],
    status: "SHIPPED",
    paymentMethod: "COD",
    paymentStatus: "UNPAID",
    subtotal: 400,
    deliveryFee: 50,
    total: 450,
    delivery: { name: "Shop", phone: "9", city: "c", address: "a", pincode: "1" },
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...over,
  }) as Order;

const adjustment = (over: Partial<DeliveryAdjustment> = {}): DeliveryAdjustment => ({
  lines: [buildAdjustmentLine(item(), 5)],
  totalRefund: 100,
  reason: "Bruised",
  photos: [],
  status: "AUTO_APPROVED",
  raisedBy: "d1",
  raisedAt: "2026-07-28T10:00:00.000Z",
  ...over,
});

describe("driver authority limit", () => {
  it("gives small orders a flat floor rather than a useless percentage", () => {
    // 10% of a ₹300 order is ₹30 — less than a kilo of most produce, which
    // would send nearly every rejection for approval.
    expect(driverApprovalLimit(300)).toBe(DRIVER_APPROVAL_FLOOR_RUPEES);
    expect(isWithinDriverAuthority(400, 300)).toBe(true);
  });

  it("scales with the order once 10% exceeds the floor", () => {
    expect(driverApprovalLimit(20_000)).toBe(2000);
    expect(isWithinDriverAuthority(1800, 20_000)).toBe(true);
    expect(isWithinDriverAuthority(2100, 20_000)).toBe(false);
  });

  it("treats the limit itself as still within authority", () => {
    expect(isWithinDriverAuthority(500, 1000)).toBe(true);
    expect(isWithinDriverAuthority(501, 1000)).toBe(false);
  });
});

describe("buildAdjustmentLine", () => {
  it("prices the refused quantity at the ordered unit price", () => {
    const line = buildAdjustmentLine(item({ price: 20 }), 5);
    expect(line.lineRefund).toBe(100);
  });

  it("can never refund more than was delivered", () => {
    const line = buildAdjustmentLine(item({ qty: 20 }), 999);
    expect(line.rejectedQty).toBe(20);
  });

  it("ignores a negative quantity", () => {
    expect(buildAdjustmentLine(item(), -5).rejectedQty).toBe(0);
  });

  it("sums line refunds", () => {
    expect(totalRefundOf([buildAdjustmentLine(item(), 5), buildAdjustmentLine(item(), 3)])).toBe(160);
  });
});

describe("what the buyer actually pays", () => {
  it("is the full total when nothing was refused", () => {
    expect(payableTotal(order())).toBe(450);
  });

  it("drops by the refund once settled on the spot", () => {
    expect(payableTotal(order({ adjustment: adjustment({ status: "AUTO_APPROVED" }) }))).toBe(350);
  });

  it("bills only for goods kept whether an admin approves OR rejects", () => {
    // This is the crux: the decision changes what happens to the STOCK, not
    // what the buyer hands over. They never pay for produce they refused.
    const approved = payableTotal(order({ adjustment: adjustment({ status: "APPROVED" }) }));
    const rejected = payableTotal(order({ adjustment: adjustment({ status: "REJECTED" }) }));
    expect(approved).toBe(350);
    expect(rejected).toBe(350);
  });

  it("holds the full amount while an escalation is undecided", () => {
    const pending = order({ adjustment: adjustment({ status: "PENDING" }) });
    expect(payableTotal(pending)).toBe(450);
    expect(isCollectable(pending)).toBe(false);
  });

  it("never goes negative", () => {
    expect(payableTotal(order({ adjustment: adjustment({ totalRefund: 99_999 }) }))).toBe(0);
  });
});

describe("restocking", () => {
  it("returns refused goods to inventory only when the claim is rejected", () => {
    // Rejected = the produce was fine, so it is resaleable.
    expect(shouldRestock(adjustment({ status: "REJECTED" }))).toBe(true);
    // Approved = it really was bad; restocking it would put spoiled produce
    // back on the shelf and hide the loss.
    expect(shouldRestock(adjustment({ status: "APPROVED" }))).toBe(false);
    expect(shouldRestock(adjustment({ status: "AUTO_APPROVED" }))).toBe(false);
  });
});
