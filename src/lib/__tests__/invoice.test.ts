/**
 * The invoice is the only document a buyer keeps, and until now its identity
 * was placeholder text nobody re-read: a fabricated Karnataka GSTIN and a
 * Bengaluru address, on a business in Hyderabad that isn't GST-registered.
 * These assertions exist so that can't quietly come back.
 */

import { describe, it, expect } from "vitest";
import { buildInvoiceHTML } from "../invoice-html";
import { canDownloadInvoice, isInvoiceProvisional } from "../format";
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

/**
 * The invoice is issued when the order is placed, not when it is delivered.
 * A wholesale buyer records the purchase against it on the day they order —
 * waiting for the van left them with nothing for ~24 hours.
 *
 * The catch is that the amount is not final until the door, because the buyer
 * inspects and refuses what they don't want. The document has to say so.
 */
describe("when the invoice is available", () => {
  it("exists from the moment the order is placed", () => {
    expect(canDownloadInvoice("CONFIRMED")).toBe(true);
    expect(canDownloadInvoice("PACKED")).toBe(true);
    expect(canDownloadInvoice("SHIPPED")).toBe(true);
    expect(canDownloadInvoice("DELIVERED")).toBe(true);
  });

  it("does not exist for a cancelled order — there is nothing to bill", () => {
    expect(canDownloadInvoice("CANCELLED")).toBe(false);
  });

  it("marks itself provisional until the goods are handed over", () => {
    expect(isInvoiceProvisional("CONFIRMED")).toBe(true);
    expect(isInvoiceProvisional("PACKED")).toBe(true);
    expect(isInvoiceProvisional("DELIVERED")).toBe(false);
  });

  it("warns on the document itself while the amount can still change", () => {
    const html = buildInvoiceHTML(order({ status: "CONFIRMED" }));
    expect(html).toContain("Provisional Invoice");
    expect(html).toContain("not final until delivery");
  });

  it("drops the warning once delivered", () => {
    const html = buildInvoiceHTML(order({ status: "DELIVERED" }));
    expect(html).not.toContain("Provisional Invoice");
    expect(html).not.toContain("not final until delivery");
  });

  it("bills the adjusted amount once a door-side refusal is settled", () => {
    // The whole point of reissuing rather than withholding: the same document
    // prints the current figure. 5 kg of a 20 kg line refused at Rs. 19 = 95
    // off a Rs. 430 bill.
    const html = buildInvoiceHTML(
      order({
        status: "DELIVERED",
        adjustment: {
          status: "AUTO_APPROVED",
          reason: "Bruised",
          photos: [],
          lines: [
            {
              productId: "tomato",
              name: "Tomato",
              unit: "kg",
              rejectedQty: 5,
              unitPrice: 19,
              lineRefund: 95,
            },
          ],
          totalRefund: 95,
          raisedBy: "d1",
          raisedByName: "Ravi",
          raisedAt: "2026-07-30T03:00:00.000Z",
        },
      } as Partial<Order>)
    );
    expect(html).toContain("335"); // 430 - 95
  });

  it("ignores an adjustment still waiting on the office", () => {
    // Nothing has been agreed yet, so the bill must not drop.
    const html = buildInvoiceHTML(
      order({
        status: "DELIVERED",
        adjustment: {
          status: "PENDING",
          reason: "Bruised",
          photos: [],
          lines: [
            {
              productId: "tomato",
              name: "Tomato",
              unit: "kg",
              rejectedQty: 5,
              unitPrice: 19,
              lineRefund: 95,
            },
          ],
          totalRefund: 95,
          raisedBy: "d1",
          raisedByName: "Ravi",
          raisedAt: "2026-07-30T03:00:00.000Z",
        },
      } as Partial<Order>)
    );
    expect(html).toContain("430");
  });
});

/**
 * A deduction produces a NEW invoice. The buyer filed the original against
 * the order the day they placed it; a revised copy carrying the same number
 * but a smaller total would leave two documents in their books claiming to be
 * the same invoice.
 */
describe("the revised invoice after a deduction", () => {
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

  it("issues a new number and says what it replaces", () => {
    const html = buildInvoiceHTML(order({ status: "DELIVERED", adjustment: settled } as Partial<Order>));
    expect(html).toContain("INV-20260729-ABC123-R1");
    expect(html).toContain("Replaces: INV-20260729-ABC123");
    expect(html).toContain("Revised Invoice");
  });

  it("leaves the number alone when nothing was deducted", () => {
    const html = buildInvoiceHTML(order({ status: "DELIVERED" }));
    expect(html).toContain("INV-20260729-ABC123");
    expect(html).not.toContain("-R1");
    expect(html).not.toContain("Replaces:");
  });

  it("does not renumber for an adjustment still awaiting the office", () => {
    // Nothing agreed, nothing deducted, so nothing superseded.
    const html = buildInvoiceHTML(
      order({ status: "DELIVERED", adjustment: { ...settled, status: "PENDING" } } as Partial<Order>)
    );
    expect(html).not.toContain("-R1");
    expect(html).toContain("430");
  });

  it("honours an explicitly stored invoice number over the derived one", () => {
    const html = buildInvoiceHTML(
      order({
        status: "DELIVERED",
        adjustment: settled,
        adjustedInvoiceNumber: "INV-MANUAL-7",
      } as Partial<Order>)
    );
    expect(html).toContain("INV-MANUAL-7");
    expect(html).not.toContain("-R1");
  });
});

/**
 * Rendered inside the app's own viewer, the document must not carry advice
 * meant for a bare browser tab. "Press Ctrl+P" is wrong on a phone, and wrong
 * anywhere the viewer supplies its own Download button.
 */
describe("the embedded invoice", () => {
  it("drops the press-Ctrl+P hint", () => {
    const plain = buildInvoiceHTML(order());
    const embedded = buildInvoiceHTML(order(), { embedded: true });
    expect(plain).toContain("Ctrl+P");
    expect(embedded).not.toContain("Ctrl+P");
  });

  it("still contains the bill itself", () => {
    // The only difference is chrome — the numbers must be identical.
    const embedded = buildInvoiceHTML(order(), { embedded: true });
    expect(embedded).toContain("INV-20260729-ABC123");
    expect(embedded).toContain("430");
    expect(embedded).toContain("Tomato");
  });

  it("escapes buyer-supplied fields exactly as the plain one does", () => {
    // The viewer renders this in a script-free sandbox, but the escaping is
    // the primary defence and must not be weakened by the embedded path.
    const embedded = buildInvoiceHTML(
      order({
        delivery: {
          name: '<script>alert("x")</script>',
          phone: "9812345678",
          city: "Hyderabad",
          address: "12, Sarojini Devi Road",
          pincode: "500028",
        },
      }),
      { embedded: true }
    );
    expect(embedded).not.toContain("<script>alert");
    expect(embedded).toContain("&lt;script&gt;");
  });
});

