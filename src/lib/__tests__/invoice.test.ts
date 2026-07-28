/**
 * The invoice is the only document a buyer keeps, and until now its identity
 * was placeholder text nobody re-read: a fabricated Karnataka GSTIN and a
 * Bengaluru address, on a business in Hyderabad that isn't GST-registered.
 * These assertions exist so that can't quietly come back.
 */

import { describe, it, expect } from "vitest";
import { buildInvoiceHTML } from "../invoice-html";
import type { Order } from "../types";

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    orderNumber: "ORD-20260729-ABC123",
    buyerId: "b1",
    businessName: "Suresh Kirana Store",
    items: [
      { productId: "tomato", name: "Tomato", unit: "kg", price: 19, qty: 20, lineTotal: 380 },
    ],
    status: "DELIVERED",
    paymentMethod: "COD",
    paymentStatus: "PAID",
    subtotal: 380,
    deliveryFee: 50,
    total: 430,
    delivery: {
      name: "Suresh Kirana Store",
      phone: "9812345678",
      city: "Hyderabad",
      address: "12, Sarojini Devi Road",
      pincode: "500028",
    },
    createdAt: "2026-07-29T02:42:00.000Z",
    updatedAt: "2026-07-30T03:00:00.000Z",
    ...over,
  }) as Order;

describe("who the invoice says we are", () => {
  const html = buildInvoiceHTML(order());

  it("carries the registered name and the hub address", () => {
    expect(html).toContain("Green Basket");
    expect(html).toContain("Yerraboda, Upperpally, Hyderabad, Telangana — 500048");
  });

  it("claims no GST registration anywhere", () => {
    // Printing a GSTIN we don't hold, on a document a business files, is the
    // kind of error that is nobody's bug until it is everybody's problem.
    expect(html).not.toMatch(/GSTIN/i);
    expect(html).not.toMatch(/Tax Invoice/i);
    expect(html).toMatch(/not registered under GST/i);
  });

  it("has no trace of the old placeholder identity", () => {
    expect(html).not.toMatch(/Whitefield|Bengaluru|29FRESH/i);
  });

  it("states the doorstep policy instead of a returns policy", () => {
    expect(html).toMatch(/checked with the driver at handover/i);
  });
});

describe("what the invoice charges", () => {
  it("bills the full total when nothing was refused", () => {
    expect(buildInvoiceHTML(order())).toContain("430");
  });

  it("bills the adjusted amount once a refusal is settled", () => {
    const html = buildInvoiceHTML(
      order({
        adjustment: {
          lines: [
            { productId: "tomato", name: "Tomato", unit: "kg", rejectedQty: 5, unitPrice: 19, lineRefund: 95 },
          ],
          totalRefund: 95,
          reason: "Bruised",
          photos: [],
          status: "APPROVED",
          raisedBy: "d1",
          raisedAt: "2026-07-30T03:00:00.000Z",
        },
      })
    );
    expect(html).toContain("335"); // 430 − 95
    expect(html).toMatch(/taken off this bill at handover/i);
  });

  it("does NOT reduce the bill while a refusal is still undecided", () => {
    // Nothing has been agreed yet, so the invoice must not pre-empt the office.
    const html = buildInvoiceHTML(
      order({
        adjustment: {
          lines: [],
          totalRefund: 95,
          reason: "Bruised",
          photos: [],
          status: "PENDING",
          raisedBy: "d1",
          raisedAt: "2026-07-30T03:00:00.000Z",
        },
      })
    );
    expect(html).not.toMatch(/taken off this bill/i);
  });

  it("escapes a delivery name that contains markup", () => {
    // The invoice bills to delivery.name (the snapshot taken at checkout),
    // not the account's businessName.
    const html = buildInvoiceHTML(
      order({
        delivery: {
          name: '<script>alert("x")</script>',
          phone: "9812345678",
          city: "Hyderabad",
          address: "12, Sarojini Devi Road",
          pincode: "500028",
        },
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
