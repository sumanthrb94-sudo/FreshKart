/**
 * The two documents this app builds as raw HTML strings, tested against the
 * data a hostile buyer can actually store.
 *
 * Both bypass React's escaping entirely — the invoice through the viewer's
 * iframe `srcDoc` (and a Blob + window.open fallback), the packing slip
 * through `document.write` into a fresh tab in the ADMIN's browser. React is
 * not protecting either of them; the escaping in those two modules is.
 *
 * These were written after a live test found a real hole. `firestore.rules` is
 * the app's only authorization layer — the browser writes to Firestore
 * directly — and it validates `qty`, `subtotal` and `total` by doing
 * arithmetic on them, which rejects a string. It never touches
 * `items[].price` or `items[].lineTotal`: per-item price validation was moved
 * to the server for read-budget reasons (see firestore.rules). Verified
 * against the real rules on the Firestore emulator, a plain signed-in buyer
 * CAN store a string in those two fields. Both then reached the invoice's HTML
 * unescaped, because `rupees()` calls `toLocaleString()` and
 * `String.prototype.toLocaleString` hands the string straight back.
 *
 * So: never trust a field's declared type in these two files. The data comes
 * off the wire, and TypeScript is not there at runtime.
 */

import { describe, it, expect } from "vitest";
import { buildInvoiceHTML } from "../invoice-html";
import { generateDailyPackingReport } from "../packing";
import { buildPackingSlipsHTML } from "../packing-slip-html";
import type { Order, Product } from "../types";

const PAYLOAD = `<img src=x onerror="alert(1)">`;

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

/** A value the type system says is a number and the database says otherwise. */
const poisoned = PAYLOAD as unknown as number;

const item = (over: Record<string, unknown>) => [
  { productId: "tomato", name: "Tomato", unit: "kg", price: 19, qty: 20, lineTotal: 380, ...over },
] as unknown as Order["items"];

describe("invoice HTML never emits live markup", () => {
  /** Every field a buyer controls, including the ones typed as numbers. */
  const fields: Array<[string, Order]> = [
    ["items[].price", order({ items: item({ price: poisoned }) })],
    ["items[].lineTotal", order({ items: item({ lineTotal: poisoned }) })],
    ["items[].qty", order({ items: item({ qty: poisoned }) })],
    ["items[].name", order({ items: item({ name: PAYLOAD }) })],
    ["items[].unit", order({ items: item({ unit: PAYLOAD }) })],
    ["subtotal", order({ subtotal: poisoned })],
    ["deliveryFee", order({ deliveryFee: poisoned })],
    ["total", order({ total: poisoned })],
    ["orderNumber", order({ orderNumber: PAYLOAD })],
    ["businessName", order({ businessName: PAYLOAD })],
    ["notes", order({ notes: PAYLOAD })],
    [
      "delivery.name",
      order({ delivery: { ...order().delivery, name: PAYLOAD } }),
    ],
    [
      "delivery.address",
      order({ delivery: { ...order().delivery, address: PAYLOAD } }),
    ],
    [
      "delivery.city",
      order({ delivery: { ...order().delivery, city: PAYLOAD } }),
    ],
    [
      "delivery.pincode",
      order({ delivery: { ...order().delivery, pincode: PAYLOAD } }),
    ],
    [
      "delivery.phone",
      order({ delivery: { ...order().delivery, phone: PAYLOAD } }),
    ],
  ];

  for (const [field, o] of fields) {
    it(`escapes ${field}`, () => {
      // Both renderings: the viewer's iframe, and the Blob fallback that opens
      // in a plain unsandboxed tab where a script WOULD run.
      //
      // The invariant is that no raw `<` from the payload reaches the output.
      // Asserting on "onerror=" would be wrong — the correctly escaped form,
      // `&lt;img src=x onerror=&quot;…&quot;&gt;`, still contains that text and
      // is inert, because the browser never opens a tag.
      for (const html of [buildInvoiceHTML(o), buildInvoiceHTML(o, { embedded: true })]) {
        expect(html).not.toContain("<img");
        expect(html).not.toContain('="alert(1)"');
      }
    });
  }

  it("does not silently zero a price it cannot read", () => {
    // A corrupt price is not a free one. Showing 0 would understate the bill.
    const html = buildInvoiceHTML(order({ items: item({ price: poisoned }) }));
    expect(html).toContain("Rs. —");
    expect(html).not.toContain("Rs. 0<");
  });

  it("still prints a normal invoice unchanged", () => {
    const html = buildInvoiceHTML(order());
    expect(html).toContain("Rs. 19");
    expect(html).toContain("Rs. 430");
    expect(html).toContain("20 kg");
  });
});

describe("packing slip HTML never emits live markup", () => {
  // This one is written with document.write into a same-origin, unsandboxed
  // tab in the admin's own browser, so a script here runs as the admin.
  const products = [
    {
      id: "tomato",
      name: "Tomato",
      category: "vegetables",
      unit: "kg",
      price: 19,
      minOrderQty: 1,
      stock: 999,
      origin: "Kurnool",
      active: true,
    },
  ] as unknown as Product[];

  const render = (o: Order) =>
    buildPackingSlipsHTML(generateDailyPackingReport([o], "2026-07-29", products));

  const fields: Array<[string, Order]> = [
    ["items[].qty", order({ status: "CONFIRMED", items: item({ qty: poisoned }) })],
    ["items[].name", order({ status: "CONFIRMED", items: item({ name: PAYLOAD }) })],
    ["items[].unit", order({ status: "CONFIRMED", items: item({ unit: PAYLOAD }) })],
    ["businessName", order({ status: "CONFIRMED", businessName: PAYLOAD })],
    ["orderNumber", order({ status: "CONFIRMED", orderNumber: PAYLOAD })],
    [
      "delivery.name",
      order({ status: "CONFIRMED", delivery: { ...order().delivery, name: PAYLOAD } }),
    ],
    [
      "delivery.address",
      order({ status: "CONFIRMED", delivery: { ...order().delivery, address: PAYLOAD } }),
    ],
    [
      "delivery.label",
      order({ status: "CONFIRMED", delivery: { ...order().delivery, label: PAYLOAD } }),
    ],
  ];

  for (const [field, o] of fields) {
    it(`escapes ${field}`, () => {
      const html = render(o);
      expect(html).not.toContain("<img");
      expect(html).not.toContain('="alert(1)"');
    });
  }

  it("still prints a normal slip unchanged", () => {
    const html = render(order({ status: "CONFIRMED" }));
    expect(html).toContain("Tomato");
    expect(html).toContain("20 ");
  });
});
