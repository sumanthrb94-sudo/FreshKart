/** Print layout for the daily packing run.
 *
 *  Sheet 1 is the consolidated pick list — one person walks the cold room with
 *  it. Then one sheet per customer, each starting on a fresh page so it drops
 *  straight into that customer's crate.
 *
 *  Same approach as the invoice: a self-contained HTML string opened in a new
 *  tab and printed. No PDF library, no bundle cost, "Save as PDF" on every
 *  browser.
 */

import type { DailyPackingReport, PackSlip } from "./packing";
import { formatIstDateLabel } from "./time";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Pure — unlike the invoice's DOM-based escaper, this works server-side and in tests. */
function escapeHtml(text: string): string {
  return String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function qtyLabel(kg: number, pieces: number): string {
  const parts: string[] = [];
  if (kg > 0) parts.push(`${kg} kg`);
  if (pieces > 0) parts.push(`${pieces} pc`);
  return parts.join(" · ") || "—";
}

function pickListRows(report: DailyPackingReport): string {
  return report.items
    .filter((l) => l.totalQty > 0)
    .map(
      (l) => `
    <tr>
      <td class="item">${escapeHtml(l.name)}</td>
      <td class="qty">${l.totalQty} <span class="unit">${escapeHtml(l.unit)}</span></td>
      <td class="mid">${l.orderCount}</td>
      <td class="pack">${escapeHtml(l.packagingType)}</td>
      <td class="check">☐</td>
    </tr>`
    )
    .join("");
}

function slipSheet(slip: PackSlip, report: DailyPackingReport, index: number): string {
  const itemRows = slip.items
    .map(
      (i) => `
      <tr>
        <td class="check">☐</td>
        <td class="item">${escapeHtml(i.name)}</td>
        <td class="qty">${i.qty} <span class="unit">${escapeHtml(i.unit)}</span></td>
      </tr>`
    )
    .join("");

  return `
  <section class="sheet slip">
    <header class="slip-head">
      <div>
        <p class="eyebrow">Packing slip · ${escapeHtml(formatIstDateLabel(report.istDate))}</p>
        <h2>${escapeHtml(slip.businessName)}</h2>
      </div>
      <div class="slip-index">${index + 1} / ${report.slips.length}</div>
    </header>

    <div class="addr">
      <p class="label">Deliver to${slip.label ? ` · ${escapeHtml(slip.label)}` : ""}</p>
      <p class="name">${escapeHtml(slip.contactName)}</p>
      <p>${escapeHtml(slip.address)}</p>
      <p>${escapeHtml(slip.city)} — ${escapeHtml(slip.pincode)}</p>
      <p class="phone">${escapeHtml(slip.phone)}</p>
    </div>

    <div class="meta">
      <span><strong>Order${slip.orderNumbers.length > 1 ? "s" : ""}:</strong> ${slip.orderNumbers.map(escapeHtml).join(", ")}</span>
      <span><strong>Items:</strong> ${slip.items.length} · ${escapeHtml(qtyLabel(slip.totalKg, slip.totalPieces))}</span>
    </div>

    ${
      slip.orderNumbers.length > 1
        ? `<p class="note">Merged from ${slip.orderNumbers.length} orders placed the same day — pack as one.</p>`
        : ""
    }

    <table class="items">
      <thead>
        <tr><th class="check"></th><th>Item</th><th class="qty">Qty</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <footer class="sign">
      <div><span class="line"></span><p>Packed by</p></div>
      <div><span class="line"></span><p>Checked by</p></div>
    </footer>
  </section>`;
}

export function buildPackingSlipsHTML(report: DailyPackingReport): string {
  const dateLabel = formatIstDateLabel(report.istDate);
  const { totals } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Packing — ${escapeHtml(dateLabel)}</title>
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
    .sheet {
      max-width: 800px;
      margin: 24px auto;
      background: #fff;
      padding: 32px 40px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .eyebrow {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; color: #9ca3af;
    }
    h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-top: 4px; }
    h2 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-top: 4px; }

    .pick-head {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #fff; margin: -32px -40px 24px; padding: 28px 40px;
      border-radius: 12px 12px 0 0;
    }
    .pick-head .eyebrow { color: rgba(255,255,255,0.75); }
    .summary { display: flex; gap: 28px; margin-top: 16px; flex-wrap: wrap; }
    .summary div p:first-child {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8;
    }
    .summary div p:last-child { font-size: 19px; font-weight: 700; }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th {
      background: #f9fafb; padding: 9px 12px; text-align: left;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb;
    }
    td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    td.item { font-weight: 600; color: #111827; }
    td.qty, th.qty { text-align: right; font-weight: 700; white-space: nowrap; }
    td.mid { text-align: center; color: #6b7280; }
    td.pack { color: #6b7280; font-size: 12px; }
    .unit { font-weight: 500; color: #6b7280; font-size: 11px; }
    .check, th.check { width: 34px; text-align: center; font-size: 17px; color: #9ca3af; }

    .slip-head { display: flex; justify-content: space-between; align-items: flex-start; }
    .slip-index { font-size: 11px; font-weight: 700; color: #9ca3af; white-space: nowrap; }
    .addr {
      margin-top: 18px; padding: 16px; background: #f9fafb;
      border-left: 4px solid #059669; border-radius: 0 8px 8px 0;
    }
    .addr .label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px;
    }
    .addr .name { font-size: 15px; font-weight: 700; color: #111827; }
    .addr p { font-size: 13px; color: #4b5563; }
    .addr .phone { margin-top: 6px; font-weight: 700; color: #111827; font-size: 14px; }
    .meta {
      display: flex; gap: 24px; flex-wrap: wrap; margin-top: 14px;
      font-size: 12px; color: #4b5563;
    }
    .meta strong { color: #111827; }
    .note {
      margin-top: 10px; padding: 8px 12px; background: #fef3c7;
      border-radius: 6px; font-size: 12px; color: #92400e;
    }
    .items { margin-top: 18px; }
    .sign { display: flex; gap: 40px; margin-top: 32px; }
    .sign div { flex: 1; }
    .sign .line { display: block; border-bottom: 1px solid #9ca3af; height: 28px; }
    .sign p {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
      color: #9ca3af; margin-top: 4px;
    }
    .empty { padding: 40px; text-align: center; color: #9ca3af; font-size: 14px; }

    @page { size: A4; margin: 12mm; }
    @media print {
      body { background: #fff; }
      .sheet {
        box-shadow: none; margin: 0; border-radius: 0; max-width: 100%;
        padding: 0;
      }
      .pick-head { margin: 0 0 20px; border-radius: 0; }
      /* Each slip starts its own page so it drops into that customer's crate. */
      .slip { page-break-before: always; break-before: page; }
      .slip-head, .addr, .sign { break-inside: avoid; }
      tr { break-inside: avoid; }
      .no-print { display: none !important; }
    }
    @media screen {
      .hint {
        max-width: 800px; margin: 16px auto 0; padding: 12px 16px;
        background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;
        font-size: 13px; color: #92400e; text-align: center;
      }
    }
    .hint { display: none; }
    @media screen { .hint { display: block; } }
  </style>
</head>
<body>
  <section class="sheet">
    <header class="pick-head">
      <p class="eyebrow">Pick list · FreshKart</p>
      <h1>${escapeHtml(dateLabel)}</h1>
      <div class="summary">
        <div><p>Orders</p><p>${totals.orderCount}</p></div>
        <div><p>Customers</p><p>${totals.customerCount}</p></div>
        <div><p>Drops</p><p>${report.slips.length}</p></div>
        <div><p>To pick</p><p>${escapeHtml(qtyLabel(totals.totalKg, totals.totalPieces))}</p></div>
      </div>
    </header>

    ${
      report.items.filter((l) => l.totalQty > 0).length === 0
        ? `<p class="empty">No orders to pack for ${escapeHtml(dateLabel)}.</p>`
        : `<table>
      <thead>
        <tr><th>Item</th><th class="qty">Total qty</th><th class="mid">Orders</th><th>Packaging</th><th class="check"></th></tr>
      </thead>
      <tbody>${pickListRows(report)}</tbody>
    </table>`
    }
    ${
      totals.cancelledOrderCount > 0
        ? `<p class="note">${totals.cancelledOrderCount} order${totals.cancelledOrderCount === 1 ? " was" : "s were"} cancelled and ${totals.cancelledOrderCount === 1 ? "is" : "are"} excluded from these quantities.</p>`
        : ""
    }
  </section>

  ${report.slips.map((s, i) => slipSheet(s, report, i)).join("")}

  <div class="hint no-print">
    <strong>Save as PDF:</strong> press <strong>Ctrl+P</strong> (or <strong>Cmd+P</strong>) and choose <strong>"Save as PDF"</strong>.
  </div>
</body>
</html>`;
}
