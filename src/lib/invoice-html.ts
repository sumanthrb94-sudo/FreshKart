import type { Order } from "./types";
import { payableTotal, describeAdjustment } from "./delivery-adjustment";
import {
  formatCurrency,
  formatDate,
  isInvoiceProvisional,
  ORDER_STATUS_META,
  PAYMENT_LONG,
} from "./format";

/**
 * The invoice, as a self-contained HTML document.
 *
 * Kept out of the component (and free of any DOM call) for the same reason
 * packing-slip-html.ts is: this is the only document a buyer keeps, and it
 * should be checkable without opening a browser.
 *
 * Green Basket is not registered under GST, so this is a plain bill — no
 * GSTIN, no tax line, and it is never called a "Tax Invoice".
 */

export function buildInvoiceHTML(
  order: Order,
  /** Rendered inside the app's own invoice viewer rather than a bare browser
   *  tab. The viewer supplies the title bar and the Download/Close buttons, so
   *  the document drops the "press Ctrl+P" hint and the page chrome around
   *  it — that advice is wrong on a phone, where the viewer's own button is
   *  what the reader should press. */
  options: { embedded?: boolean } = {}
): string {
  const embedded = options.embedded === true;
  const itemsHtml = order.items
    .map(
      (item, i) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:500;">${escapeHtml(item.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${item.qty} ${item.unit}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#111827;">Rs. ${item.price.toLocaleString("en-IN")}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#111827;font-weight:600;">Rs. ${item.lineTotal.toLocaleString("en-IN")}</td>
    </tr>`
    )
    .join("");

  const now = new Date();
  const invoiceDate = now.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Only a SETTLED adjustment changes the bill. One still awaiting an admin
  // decision must not reduce the invoice — nothing has been agreed yet.
  const settledAdjustment =
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
  const revised = Boolean(settledAdjustment);
  // Escaped once here — these are system-generated, but they still flow into
  // the invoice's HTML (title + header), so escape as defense-in-depth
  // alongside the buyer-controlled delivery fields below.
  const invoiceNumber = escapeHtml(
    order.adjustedInvoiceNumber || (revised ? `${originalNumber}-R1` : originalNumber)
  );
  const supersedes = revised && !order.adjustedInvoiceNumber ? escapeHtml(originalNumber) : null;
  const orderNumber = escapeHtml(order.orderNumber);
  // The invoice is issued when the order is placed, so for most of its life
  // the amount on it is not yet final: the buyer inspects at the door and
  // refuses what they don't want, and a settled adjustment reduces the bill.
  // Saying so on the document is the difference between a figure that later
  // drops and a figure that later drops WITHOUT WARNING.
  const provisional = isInvoiceProvisional(order.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNumber} — Green Basket</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f3f4f6;
      color: #1f2937;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      max-width: 800px;
      margin: 24px auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      padding: 32px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-left h1 {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .header-left p {
      font-size: 12px;
      opacity: 0.85;
      margin-top: 4px;
    }
    .header-right {
      text-align: right;
    }
    .header-right .badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .body {
      padding: 32px 40px;
    }
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9ca3af;
      margin-bottom: 8px;
    }
    .two-col {
      display: flex;
      gap: 40px;
    }
    .two-col > div {
      flex: 1;
    }
    .info-block p {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
    }
    .info-block p strong {
      color: #111827;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      background: #f9fafb;
      padding: 10px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }
    th:first-child { text-align: center; width: 40px; }
    th:nth-child(3) { text-align: center; }
    th:nth-child(4), th:nth-child(5) { text-align: right; }
    .totals {
      margin-top: 16px;
      border-top: 2px solid #e5e7eb;
      padding-top: 16px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 13px;
      color: #4b5563;
    }
    .total-row.grand {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      border-top: 1px solid #e5e7eb;
      margin-top: 8px;
      padding-top: 12px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px 40px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      font-size: 11px;
      color: #9ca3af;
    }
    .footer .brand {
      font-weight: 700;
      color: #059669;
    }
    .print-hint {
      display: none;
    }
    ${embedded ? `
    body { background: #ffffff; }
    .page { box-shadow: none; margin: 0; border-radius: 0; max-width: 100%; }
    ` : ""}
    @media print {
      body { background: white; }
      .page { box-shadow: none; margin: 0; border-radius: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .print-hint { display: none; }
    }
    @media screen {
      .print-hint {
        display: block;
        background: #fef3c7;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 12px 16px;
        margin: 16px 40px 0;
        font-size: 13px;
        color: #92400e;
        text-align: center;
      }
      .print-hint strong {
        color: #78350f;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <h1>Green Basket</h1>
        <p>Wholesale B2B — Fresh Produce, Per Kg</p>
        <p style="margin-top:8px;font-size:11px;opacity:0.7;">Near Venkateswara Temple, Yerraboda, Upperpally, Hyderabad, Telangana — 500048</p>
        <p style="font-size:11px;opacity:0.7;">Phone: +91 74166 20691</p>
      </div>
      <div class="header-right">
        <div class="badge">${provisional ? "Provisional Invoice" : revised ? "Revised Invoice" : "Invoice"}</div>
        <p style="margin-top:12px;font-size:20px;font-weight:700;">${invoiceNumber}</p>
        <p style="font-size:12px;opacity:0.85;margin-top:2px;">Date: ${invoiceDate}</p>
        <p style="font-size:12px;opacity:0.85;">Order: ${orderNumber}</p>
        ${supersedes ? `<p style="font-size:12px;opacity:0.85;">Replaces: ${supersedes}</p>` : ""}
      </div>
    </div>

    <!-- Body -->
    <div class="body">
      <!-- Bill To + Ship To -->
      <div class="two-col section">
        <div>
          <p class="section-title">Billed To</p>
          <div class="info-block">
            <p><strong>${escapeHtml(order.delivery.name)}</strong></p>
            <p>${escapeHtml(order.delivery.address)}</p>
            <p>${escapeHtml(order.delivery.city)} — ${escapeHtml(order.delivery.pincode)}</p>
            <p>Phone: ${escapeHtml(order.delivery.phone)}</p>
          </div>
        </div>
        <div>
          <p class="section-title">Delivery Details</p>
          <div class="info-block">
            <p><strong>Status:</strong> ${ORDER_STATUS_META[order.status].label}</p>
            ${provisional ? `<p style="margin-top:6px;color:#b45309;font-size:12px;">Amount is not final until delivery — anything refused at the door is deducted.</p>` : ""}
            <p><strong>Payment:</strong> ${PAYMENT_LONG[order.paymentMethod]} (${order.paymentStatus === "PAID" ? "Paid" : "Unpaid"})</p>
            <p><strong>Ordered:</strong> ${formatDate(order.createdAt)}</p>
          </div>
        </div>
      </div>

      ${order.notes ? `
      <div class="section">
        <p class="section-title">Notes</p>
        <div class="info-block">
          <p>${escapeHtml(order.notes)}</p>
        </div>
      </div>
      ` : ""}

      <!-- Items Table -->
      <div class="section">
        <p class="section-title">Items</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals">
          <div class="total-row">
            <span>Subtotal</span>
            <span>Rs. ${order.subtotal.toLocaleString("en-IN")}</span>
          </div>
          <div class="total-row">
            <span>Delivery Fee</span>
            <span>${order.deliveryFee > 0 ? `Rs. ${order.deliveryFee.toLocaleString("en-IN")}` : "FREE"}</span>
          </div>
          ${settledAdjustment ? `
          <div class="total-row">
            <span>Refused at delivery</span>
            <span style="color:#059669;font-weight:600;">-Rs. ${settledAdjustment.totalRefund.toLocaleString("en-IN")}</span>
          </div>` : ""}
          <div class="total-row grand">
            <span>Grand Total</span>
            <span>Rs. ${payableTotal(order).toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      ${settledAdjustment ? `
      <!-- Adjustment note: quality is settled at the door, before payment,
           so this invoice is issued for the adjusted amount rather than a
           credit note being raised against a wrong one. -->
      <div class="section" style="margin-top:24px;padding:16px;background:#ecfdf5;border-radius:8px;">
        <p class="section-title" style="color:#065f46;">Delivery Adjustment</p>
        <div class="info-block">
          <p>${escapeHtml(describeAdjustment(settledAdjustment))}</p>
          <p style="margin-top:6px;">Rs. ${settledAdjustment.totalRefund.toLocaleString("en-IN")} was taken off this bill at handover on ${formatDate(settledAdjustment.raisedAt)}. You were charged only for the goods you accepted.</p>
        </div>
      </div>` : ""}

      <!-- Terms -->
      <div class="section" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p class="section-title">Terms & Conditions</p>
        <div class="info-block">
          <p>1. All prices are in Indian Rupees (Rs.). No tax is charged — Green Basket is not registered under GST, so this bill carries no GST component and no input tax credit is available on it.</p>
          <p>2. Goods are checked with the driver at handover. Anything refused there is deducted from this bill; nothing is taken back or exchanged afterwards.</p>
          <p>3. For disputes, contact: support@green-basket.in</p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="brand">Green Basket</p>
      <p style="margin-top:4px;">Thank you for your business!</p>
      <p style="margin-top:4px;">This is a computer-generated invoice and does not require a signature.</p>
    </div>
  </div>

  <!-- Print hint (screen only) -->
  ${embedded ? "" : `<div class="print-hint no-print">
    <strong>Save as PDF:</strong> Press <strong>Ctrl+P</strong> (or <strong>Cmd+P</strong> on Mac) and select <strong>"Save as PDF"</strong> as the destination.
  </div>`}
</body>
</html>`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Plain string escaping — no DOM. The old version built a detached <div> to
 *  borrow the browser's escaping, which tied invoice generation to a window
 *  and made it impossible to check the output anywhere but a real browser. */
function escapeHtml(text: string): string {
  return String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
