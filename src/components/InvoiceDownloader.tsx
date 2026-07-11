"use client";

import { useRef, useCallback, useState } from "react";
import { FileText, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  formatCurrency,
  formatDate,
  PAYMENT_LONG,
  ORDER_STATUS_META,
} from "@/lib/format";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InvoiceDownloaderProps {
  order: Order;
  variant?: "primary" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
}

/** Generates a PDF invoice using browser print-to-PDF.
 *
 *  Opens a styled invoice in a new tab; the user hits Ctrl+P / Cmd+P and
 *  selects "Save as PDF".  No heavy libraries needed — works on every
 *  browser and keeps the bundle lean.
 */
export function InvoiceDownloader({
  order,
  variant = "outline",
  fullWidth = false,
  className,
}: InvoiceDownloaderProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "done">("idle");

  const openInvoice = useCallback(() => {
    setStatus("generating");

    const invoiceHTML = buildInvoiceHTML(order);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("idle");
      alert("Please allow popups to view the invoice.");
      return;
    }

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();

    // Auto-trigger print dialog after a short delay for styles to load
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    }, 400);
  }, [order]);

  return (
    <Button
      variant={variant}
      fullWidth={fullWidth}
      className={cn(className)}
      loading={status === "generating"}
      disabled={status !== "idle"}
      leadingIcon={
        status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <FileText className="h-4 w-4" />
        )
      }
      onClick={openInvoice}
    >
      {status === "generating"
        ? "Opening invoice…"
        : status === "done"
          ? "Invoice opened"
          : "Download Invoice"}
    </Button>
  );
}

/** Builds a self-contained, print-optimized HTML invoice. */
function buildInvoiceHTML(order: Order): string {
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
  const invoiceNumber = order.adjustedInvoiceNumber || `INV-${order.orderNumber.replace("ORD-", "")}`;
  const gstin = "29FRESH9876B1Z2";

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
        <p style="margin-top:8px;font-size:11px;opacity:0.7;">Green Basket Ops, Whitefield, Bengaluru — 560066</p>
        <p style="font-size:11px;opacity:0.7;">GSTIN: ${gstin} · Phone: 9800000000</p>
      </div>
      <div class="header-right">
        <div class="badge">Tax Invoice</div>
        <p style="margin-top:12px;font-size:20px;font-weight:700;">${invoiceNumber}</p>
        <p style="font-size:12px;opacity:0.85;margin-top:2px;">Date: ${invoiceDate}</p>
        <p style="font-size:12px;opacity:0.85;">Order: ${order.orderNumber}</p>
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
            <p>${escapeHtml(order.delivery.city)} — ${order.delivery.pincode}</p>
            <p>Phone: ${order.delivery.phone}</p>
          </div>
        </div>
        <div>
          <p class="section-title">Delivery Details</p>
          <div class="info-block">
            <p><strong>Status:</strong> ${ORDER_STATUS_META[order.status].label}</p>
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
          ${order.refundAmount ? `
          <div class="total-row">
            <span>Refund</span>
            <span style="color:#059669;font-weight:600;">-Rs. ${order.refundAmount.toLocaleString("en-IN")}</span>
          </div>` : ""}
          <div class="total-row grand">
            <span>Grand Total</span>
            <span>Rs. ${order.total.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      ${order.refundAmount ? `
      <!-- Refund Note -->
      <div class="section" style="margin-top:24px;padding:16px;background:#ecfdf5;border-radius:8px;">
        <p class="section-title" style="color:#065f46;">Refund Note</p>
        <div class="info-block">
          <p>A refund of <strong>Rs. ${order.refundAmount.toLocaleString("en-IN")}</strong> was processed on ${formatDate(order.refundedAt || order.updatedAt)}. This invoice has been adjusted accordingly.</p>
        </div>
      </div>` : ""}

      <!-- Terms -->
      <div class="section" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p class="section-title">Terms & Conditions</p>
        <div class="info-block">
          <p>1. All prices are in Indian Rupees (Rs.) and are exclusive of GST unless stated.</p>
          <p>2. Goods once sold will not be taken back or exchanged.</p>
          <p>3. Payment is due within 7 days for credit orders.</p>
          <p>4. For disputes, contact: support@green-basket.in</p>
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
  <div class="print-hint no-print">
    <strong>Save as PDF:</strong> Press <strong>Ctrl+P</strong> (or <strong>Cmd+P</strong> on Mac) and select <strong>"Save as PDF"</strong> as the destination.
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
