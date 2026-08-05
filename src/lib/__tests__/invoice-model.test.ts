/**
 * The invoice is decided once, here, and drawn twice — as HTML in the viewer
 * and as a PDF in the download. These assertions guard the thing that would
 * be worst to get wrong: the two renderers disagreeing about what the customer
 * owes.
 */

import { describe, it, expect } from "vitest";
import { buildInvoiceModel } from "../invoice-model";
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

const settled = {
  status: "AUTO_APPROVED",
  reason: "Bruised",
  photos: [],
  lines: [
    { productId: "tomato", name: "Tomato", unit: "kg", rejectedQty: 5, unitPrice: 19, lineRefund: 95 },
  ],
  totalRefund: 95,
  raisedBy: "d1",
  raisedByName: "Ravi",
  raisedAt: "2026-07-30T03:00:00.000Z",
};

const grandOf = (m: ReturnType<typeof buildInvoiceModel>) =>
  m.totals.find((t) => t.grand)?.value;

describe("the invoice model", () => {
  it("labels itself by where the order has got to", () => {
    expect(buildInvoiceModel(order({ status: "CONFIRMED" })).docLabel).toBe("Provisional Invoice");
    expect(buildInvoiceModel(order()).docLabel).toBe("Invoice");
    expect(buildInvoiceModel(order({ adjustment: settled } as Partial<Order>)).docLabel).toBe(
      "Revised Invoice"
    );
  });

  it("warns only while the amount can still change", () => {
    expect(buildInvoiceModel(order({ status: "PACKED" })).provisionalNote).toContain("not final");
    expect(buildInvoiceModel(order()).provisionalNote).toBeNull();
  });

  it("renumbers and records what it supersedes after a deduction", () => {
    const m = buildInvoiceModel(order({ adjustment: settled } as Partial<Order>));
    expect(m.invoiceNumber).toBe("INV-20260729-ABC123-R1");
    expect(m.supersedes).toBe("INV-20260729-ABC123");
    expect(m.fileName).toBe("Invoice-INV-20260729-ABC123-R1.pdf");
  });

  it("leaves the number alone when nothing was deducted", () => {
    const m = buildInvoiceModel(order());
    expect(m.invoiceNumber).toBe("INV-20260729-ABC123");
    expect(m.supersedes).toBeNull();
  });

  it("bills the adjusted amount once a refusal is settled", () => {
    const m = buildInvoiceModel(order({ adjustment: settled } as Partial<Order>));
    expect(grandOf(m)).toBe("Rs. 335"); // 430 - 95
    expect(m.totals.some((t) => t.credit && t.value === "-Rs. 95")).toBe(true);
    expect(m.adjustment?.detail).toContain("Rs. 95 was taken off");
  });

  it("ignores an adjustment still waiting on the office", () => {
    // Nothing agreed, so nothing comes off and nothing is renumbered.
    const m = buildInvoiceModel(
      order({ adjustment: { ...settled, status: "PENDING" } } as Partial<Order>)
    );
    expect(grandOf(m)).toBe("Rs. 430");
    expect(m.invoiceNumber).toBe("INV-20260729-ABC123");
    expect(m.adjustment).toBeNull();
    expect(m.totals.some((t) => t.credit)).toBe(false);
  });

  it("writes money as Rs., never as the rupee sign", () => {
    // Not cosmetic: ₹ is absent from the PDF standard fonts, so it would
    // silently vanish from the download unless a ~200 KB font were embedded.
    const m = buildInvoiceModel(order({ adjustment: settled } as Partial<Order>));
    const money = [
      ...m.totals.map((t) => t.value),
      ...m.items.map((i) => i.unitPrice),
      ...m.items.map((i) => i.amount),
      m.adjustment!.detail,
    ].join(" ");
    expect(money).not.toContain("₹");
    expect(money).toContain("Rs.");
  });

  it("says FREE rather than Rs. 0 when delivery is not charged", () => {
    const m = buildInvoiceModel(order({ deliveryFee: 0, total: 380 }));
    expect(m.totals.find((t) => t.label === "Delivery Fee")?.value).toBe("FREE");
  });

  it("carries every line through to the items table", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      productId: `p${i}`,
      name: `Item ${i}`,
      unit: "kg" as const,
      price: 10,
      qty: 2,
      lineTotal: 20,
    }));
    const m = buildInvoiceModel(order({ items: many }));
    expect(m.items).toHaveLength(30);
    expect(m.items[0].index).toBe(1);
    expect(m.items[29].index).toBe(30);
  });

  it("leaves escaping to the renderer", () => {
    // HTML needs entities and PDF does not; escaping here would put "&amp;"
    // in the downloaded file.
    const m = buildInvoiceModel(
      order({
        delivery: {
          name: "Ram & Co <Traders>",
          phone: "9812345678",
          city: "Hyderabad",
          address: "12, Sarojini Devi Road",
          pincode: "500028",
        },
      })
    );
    expect(m.billedToName).toBe("Ram & Co <Traders>");
  });
});
