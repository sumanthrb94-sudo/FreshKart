/**
 * The admin's Stock, Sales and Invoices reports.
 *
 * These generators used to read `store.get()` — the in-memory DEMO backend —
 * directly, so all three tabs showed invented figures in production no matter
 * what was in Firestore. They take their data as arguments now; these tests
 * exist so nobody quietly reconnects them to a fixed dataset, and so the
 * arithmetic the admin makes money decisions on is pinned.
 */

import { describe, it, expect } from "vitest";
import {
  generateInventoryReport,
  generateSalesReport,
  generateInvoiceReportPerCustomer,
} from "../reports";
import type { Order, Product } from "../types";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "tomato",
    name: "Tomato",
    category: "vegetables",
    unit: "kg",
    price: 19,
    minOrderQty: 1,
    stock: 100,
    origin: "Kurnool",
    active: true,
    ...over,
  }) as Product;

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    orderNumber: "ORD-20260805-AAA111",
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
      address: "12 Road",
      pincode: "500028",
    },
    createdAt: "2026-08-05T07:30:00.000Z",
    updatedAt: "2026-08-05T07:30:00.000Z",
    ...over,
  }) as Order;

describe("stock report", () => {
  it("reports stock on hand from the catalogue, not from the orders", () => {
    const r = generateInventoryReport([order()], [product({ stock: 100 })]);
    expect(r.lines[0].stockOnHand).toBe(100);
    expect(r.lines[0].stockValue).toBe(1900);
  });

  it("counts what sold in the period, across orders", () => {
    const r = generateInventoryReport(
      [order(), order({ id: "o2" })],
      [product()]
    );
    expect(r.lines[0].soldQty).toBe(40);
  });

  it("never counts a cancelled order as sold", () => {
    const r = generateInventoryReport(
      [order(), order({ id: "o2", status: "CANCELLED" })],
      [product()]
    );
    expect(r.lines[0].soldQty).toBe(20);
  });

  it("puts what is about to run out at the top", () => {
    // This list drives a reorder decision, so ordering is the feature.
    const r = generateInventoryReport(
      [],
      [
        product({ id: "a", name: "Plenty", stock: 500 }),
        product({ id: "b", name: "Nearly out", stock: 5 }),
        product({ id: "c", name: "Getting low", stock: 25 }),
      ]
    );
    expect(r.lines.map((l) => l.productName)).toEqual(["Nearly out", "Getting low", "Plenty"]);
    expect(r.criticalStockCount).toBe(1);
    expect(r.lowStockCount).toBe(1);
  });

  it("ignores delisted products", () => {
    const r = generateInventoryReport([], [product({ active: false })]);
    expect(r.lines).toHaveLength(0);
  });
});

describe("sales report", () => {
  it("uses what was actually billed, not today's price", () => {
    // The old version computed qty × current catalogue price, so publishing a
    // new rate silently rewrote last week's revenue and the report stopped
    // agreeing with the invoices.
    const r = generateSalesReport(
      [order({ items: [{ productId: "tomato", name: "Tomato", unit: "kg", price: 15, qty: 20, lineTotal: 300 }] as Order["items"] })],
      [product({ price: 19 })]
    );
    expect(r.lines[0].revenue).toBe(300);
    expect(r.totalRevenue).toBe(300);
  });

  it("counts each order once per product", () => {
    const r = generateSalesReport([order(), order({ id: "o2" })], [product()]);
    expect(r.lines[0].orderCount).toBe(2);
    expect(r.lines[0].soldQty).toBe(40);
  });

  it("excludes cancelled orders from revenue and the order count", () => {
    const r = generateSalesReport(
      [order(), order({ id: "o2", status: "CANCELLED" })],
      [product()]
    );
    expect(r.totalRevenue).toBe(380);
    expect(r.totalOrders).toBe(1);
  });

  it("still reports a product that has been delisted since the sale", () => {
    const r = generateSalesReport([order()], []);
    expect(r.lines[0].productName).toBe("Tomato");
    expect(r.lines[0].revenue).toBe(380);
  });

  it("ranks by revenue", () => {
    const r = generateSalesReport(
      [
        order({
          items: [
            { productId: "tomato", name: "Tomato", unit: "kg", price: 19, qty: 1, lineTotal: 19 },
            { productId: "ginger", name: "Ginger", unit: "kg", price: 210, qty: 10, lineTotal: 2100 },
          ] as Order["items"],
        }),
      ],
      [product(), product({ id: "ginger", name: "Ginger", price: 210 })]
    );
    expect(r.lines.map((l) => l.productName)).toEqual(["Ginger", "Tomato"]);
  });
});

describe("invoices report", () => {
  it("separates what is owed from what is billed", () => {
    const r = generateInvoiceReportPerCustomer([
      order({ id: "o1", paymentStatus: "PAID", total: 430 }),
      order({ id: "o2", paymentStatus: "UNPAID", total: 1000 }),
    ]);
    expect(r[0].totalBilled).toBe(1430);
    expect(r[0].totalUnpaid).toBe(1000);
  });

  it("puts whoever owes the most first", () => {
    const r = generateInvoiceReportPerCustomer([
      order({ id: "o1", businessName: "Pays On Time", paymentStatus: "PAID", total: 9000 }),
      order({ id: "o2", businessName: "Owes A Lot", paymentStatus: "UNPAID", total: 500 }),
    ]);
    expect(r.map((c) => c.businessName)).toEqual(["Owes A Lot", "Pays On Time"]);
  });

  it("groups a customer's orders together, newest first", () => {
    const r = generateInvoiceReportPerCustomer([
      order({ id: "o1", orderNumber: "ORD-A", createdAt: "2026-08-01T00:00:00.000Z" }),
      order({ id: "o2", orderNumber: "ORD-B", createdAt: "2026-08-05T00:00:00.000Z" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].lines.map((l) => l.orderNumber)).toEqual(["ORD-B", "ORD-A"]);
  });

  it("uses the reissued invoice number when a deduction produced one", () => {
    const r = generateInvoiceReportPerCustomer([
      order({ adjustedInvoiceNumber: "INV-20260805-AAA111-R1" } as Partial<Order>),
    ]);
    expect(r[0].lines[0].invoiceNumber).toBe("INV-20260805-AAA111-R1");
  });

  it("derives the invoice number from the order when there is no reissue", () => {
    const r = generateInvoiceReportPerCustomer([order()]);
    expect(r[0].lines[0].invoiceNumber).toBe("INV-20260805-AAA111");
  });

  it("leaves cancelled orders out entirely", () => {
    const r = generateInvoiceReportPerCustomer([order({ status: "CANCELLED" })]);
    expect(r).toHaveLength(0);
  });

  it("filters by business name when asked", () => {
    const orders = [
      order({ id: "o1", businessName: "Suresh Kirana Store" }),
      order({ id: "o2", businessName: "Spice Leaf Restaurant" }),
    ];
    expect(generateInvoiceReportPerCustomer(orders, "spice")).toHaveLength(1);
    expect(generateInvoiceReportPerCustomer(orders, "spice")[0].businessName).toBe(
      "Spice Leaf Restaurant"
    );
  });
});

describe("no generator reaches for a fixed dataset", () => {
  it("returns nothing when given nothing", () => {
    // If any of these ever reports figures from an empty input, it has been
    // reconnected to the demo store and the admin is reading fiction again.
    expect(generateInventoryReport([], []).lines).toHaveLength(0);
    expect(generateInventoryReport([], []).totalStockValue).toBe(0);
    expect(generateSalesReport([], []).lines).toHaveLength(0);
    expect(generateSalesReport([], []).totalRevenue).toBe(0);
    expect(generateInvoiceReportPerCustomer([])).toHaveLength(0);
  });
});
