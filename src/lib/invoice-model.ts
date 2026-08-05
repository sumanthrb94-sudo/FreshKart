import type { Order } from "./types";
import { payableTotal, describeAdjustment } from "./delivery-adjustment";
import {
  formatDate,
  isInvoiceProvisional,
  ORDER_STATUS_META,
  PAYMENT_LONG,
} from "./format";

/**
 * The invoice as data, with no idea how it will be drawn.
 *
 * There are two renderers now — the HTML the viewer shows and the PDF the
 * Download button produces — and an invoice that says one thing on screen and
 * another in the customer's filing cabinet is worse than having no PDF at all.
 * So the bill is decided exactly once, here, and both renderers are given the
 * answer. A change to what the invoice SAYS is made in this file; a change to
 * how it LOOKS is made in one of the two renderers.
 *
 * Everything is plain text, already formatted and unescaped. Escaping belongs
 * to the renderer, because it differs by target: HTML needs entities, PDF does
 * not, and escaping here would put `&amp;` in the PDF.
 *
 * Green Basket is not registered under GST, so this is a plain bill — no
 * GSTIN, no tax line, and it is never called a "Tax Invoice". Money is written
 * "Rs." rather than "₹" throughout, which is also what lets the PDF use the
 * standard fonts and ship no font file.
 */

export interface InvoiceItemRow {
  index: number;
  name: string;
  qty: string;
  unitPrice: string;
  amount: string;
}

export interface InvoiceTotalRow {
  label: string;
  value: string;
  /** A deduction — rendered in green with a minus, not as another charge. */
  credit?: boolean;
  /** The bottom line. */
  grand?: boolean;
}

export interface InvoiceLabelledRow {
  label: string;
  value: string;
}

export interface InvoiceModel {
  /** "Invoice" | "Provisional Invoice" | "Revised Invoice" */
  docLabel: string;
  invoiceNumber: string;
  /** The number this one replaces, when a deduction reissued it. */
  supersedes: string | null;
  orderNumber: string;
  invoiceDate: string;
  /** True while the buyer can still refuse goods at the door. */
  provisional: boolean;
  /** Present only when provisional — the warning to print. */
  provisionalNote: string | null;

  billedToName: string;
  billedToLines: string[];
  deliveryRows: InvoiceLabelledRow[];
  notes: string | null;

  items: InvoiceItemRow[];
  totals: InvoiceTotalRow[];

  /** Two sentences describing what was refused, when a deduction was settled. */
  adjustment: { headline: string; detail: string } | null;

  terms: string[];
  footer: string[];

  /** Suggested download name, without a path. */
  fileName: string;
}

const rupees = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

export const SELLER = {
  name: "Green Basket",
  tagline: "Wholesale B2B — Fresh Produce, Per Kg",
  address: "Near Venkateswara Temple, Yerraboda, Upperpally, Hyderabad, Telangana — 500048",
  phone: "Phone: +91 74166 20691",
} as const;

export function buildInvoiceModel(order: Order): InvoiceModel {
  // Only a SETTLED adjustment changes the bill. One still awaiting an admin
  // decision must not reduce the invoice — nothing has been agreed yet.
  const settled =
    order.adjustment && order.adjustment.status !== "PENDING" ? order.adjustment : null;

  /**
   * A deduction produces a NEW invoice, not a quiet edit of the old one.
   *
   * The buyer has already filed the original against the order — that is the
   * whole point of issuing it at order time. If the revised copy came back
   * carrying the same number but a smaller total, their books would hold two
   * different documents claiming to be the same invoice, and no way to tell
   * which is current. The revision suffix makes the replacement identifiable,
   * and the header says what it supersedes.
   *
   * Derived rather than stored: it is a pure function of the adjustment that
   * is already on the order, so it cannot drift out of sync with the amount
   * printed beside it, and no extra write (or Firestore rule) is needed at
   * the doorstep. A stored adjustedInvoiceNumber still wins if one is ever
   * set, so an externally-issued number can override this.
   */
  const originalNumber = `INV-${order.orderNumber.replace("ORD-", "")}`;
  const revised = Boolean(settled);
  const invoiceNumber =
    order.adjustedInvoiceNumber || (revised ? `${originalNumber}-R1` : originalNumber);
  const supersedes = revised && !order.adjustedInvoiceNumber ? originalNumber : null;

  const provisional = isInvoiceProvisional(order.status);

  const totals: InvoiceTotalRow[] = [
    { label: "Subtotal", value: rupees(order.subtotal) },
    {
      label: "Delivery Fee",
      value: order.deliveryFee > 0 ? rupees(order.deliveryFee) : "FREE",
    },
  ];
  if (settled) {
    totals.push({
      label: "Refused at delivery",
      value: `-${rupees(settled.totalRefund)}`,
      credit: true,
    });
  }
  totals.push({ label: "Grand Total", value: rupees(payableTotal(order)), grand: true });

  return {
    docLabel: provisional ? "Provisional Invoice" : revised ? "Revised Invoice" : "Invoice",
    invoiceNumber,
    supersedes,
    orderNumber: order.orderNumber,
    invoiceDate: new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    provisional,
    provisionalNote: provisional
      ? "Amount is not final until delivery — anything refused at the door is deducted."
      : null,

    billedToName: order.delivery.name,
    billedToLines: [
      order.delivery.address,
      `${order.delivery.city} — ${order.delivery.pincode}`,
      `Phone: ${order.delivery.phone}`,
    ],
    deliveryRows: [
      { label: "Status", value: ORDER_STATUS_META[order.status].label },
      {
        label: "Payment",
        value: `${PAYMENT_LONG[order.paymentMethod]} (${
          order.paymentStatus === "PAID" ? "Paid" : "Unpaid"
        })`,
      },
      { label: "Ordered", value: formatDate(order.createdAt) },
    ],
    notes: order.notes || null,

    items: order.items.map((item, i) => ({
      index: i + 1,
      name: item.name,
      qty: `${item.qty} ${item.unit}`,
      unitPrice: rupees(item.price),
      amount: rupees(item.lineTotal),
    })),
    totals,

    adjustment: settled
      ? {
          headline: describeAdjustment(settled),
          detail: `${rupees(settled.totalRefund)} was taken off this bill at handover on ${formatDate(
            settled.raisedAt
          )}. You were charged only for the goods you accepted.`,
        }
      : null,

    terms: [
      "1. All prices are in Indian Rupees (Rs.). No tax is charged — Green Basket is not registered under GST, so this bill carries no GST component and no input tax credit is available on it.",
      "2. Goods are checked with the driver at handover. Anything refused there is deducted from this bill; nothing is taken back or exchanged afterwards.",
      "3. For disputes, contact: support@green-basket.in",
    ],
    footer: [
      "Thank you for your business!",
      "This is a computer-generated invoice and does not require a signature.",
    ],

    fileName: `Invoice-${invoiceNumber}.pdf`,
  };
}
