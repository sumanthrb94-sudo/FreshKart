import type { Order } from "./types";
import { buildInvoiceModel, SELLER, type InvoiceModel } from "./invoice-model";

/**
 * The invoice as a real PDF.
 *
 * Drawn as vectors, not photographed. The obvious alternative — screenshot the
 * rendered HTML with html2canvas and paste the image into a PDF — produces a
 * file where the text is a picture: unsearchable, unselectable, blurry the
 * moment anyone zooms, and 1–3 MB on a customer's data plan. A buyer files
 * this with their accounts; it has to behave like a document.
 *
 * The whole thing costs no font file, because the invoice writes money as
 * "Rs." rather than "₹". The rupee sign is absent from the PDF standard
 * fonts, so using it would have forced a ~200 KB embedded font into the
 * download. That was a lucky accident of the existing copy; if the currency
 * ever changes to "₹", a font must be embedded or the glyph will silently
 * vanish from the file.
 *
 * jsPDF and autoTable are imported INSIDE the function. Together they are
 * ~128 KB gzipped — more than the rest of the app's UI — and nobody who never
 * taps Download should pay for them.
 */

// A4 portrait, millimetres.
const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Matches the HTML header's gradient endpoints and the app's brand green.
const GREEN: [number, number, number] = [5, 150, 105];
const GREEN_DARK: [number, number, number] = [4, 120, 87];
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];
const CREDIT: [number, number, number] = [5, 150, 105];
const WARN: [number, number, number] = [180, 83, 9];

type Doc = import("jspdf").jsPDF;

export async function downloadInvoicePdf(order: Order): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const model = buildInvoiceModel(order);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  let y = drawHeader(doc, model);
  y = drawParties(doc, model, y + 10);
  if (model.notes) y = drawNotes(doc, model.notes, y + 6);
  y = drawItems(doc, model, autoTable, y + 6);
  y = drawTotals(doc, model, y + 4);
  if (model.adjustment) y = drawAdjustment(doc, model.adjustment, y + 8);
  drawTerms(doc, model, y + 10);
  drawFooters(doc, model);

  doc.save(model.fileName);
}

/** Green band across the top: who is billing, and which document this is. */
function drawHeader(doc: Doc, m: InvoiceModel): number {
  const H = 42;
  // The HTML header is a 135° gradient. jsPDF has no gradient fill, and two
  // flat rectangles left a hard vertical seam down the middle that read as a
  // rendering fault. Painting thin slices interpolates it properly for a
  // handful of bytes.
  const SLICES = 60;
  for (let i = 0; i < SLICES; i++) {
    const t = i / (SLICES - 1);
    doc.setFillColor(
      Math.round(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t),
      Math.round(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t),
      Math.round(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t)
    );
    // Overlap by a hair so antialiasing cannot leave hairlines between slices.
    doc.rect((PAGE_W / SLICES) * i, 0, PAGE_W / SLICES + 0.3, H, "F");
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text(SELLER.name, MARGIN, 15);
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  doc.text(SELLER.tagline, MARGIN, 20.5);
  doc.setFontSize(7);
  const addressLines = doc.splitTextToSize(SELLER.address, 92);
  doc.text(addressLines, MARGIN, 27);
  // Follows the address rather than sitting at a fixed y — the address wraps
  // to one or two lines depending on the font metrics.
  doc.text(SELLER.phone, MARGIN, 27 + 3.4 * addressLines.length + 1);

  const right = PAGE_W - MARGIN;
  // Badge pill.
  doc.setFont("helvetica", "bold").setFontSize(7);
  const label = m.docLabel.toUpperCase();
  const pillW = doc.getTextWidth(label) + 7;
  doc.setFillColor(255, 255, 255);
  doc.setGState(doc.GState({ opacity: 0.22 }));
  doc.roundedRect(right - pillW, 8.5, pillW, 6, 3, 3, "F");
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.text(label, right - pillW / 2, 12.6, { align: "center" });

  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text(m.invoiceNumber, right, 22, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(`Date: ${m.invoiceDate}`, right, 27, { align: "right" });
  doc.text(`Order: ${m.orderNumber}`, right, 31.5, { align: "right" });
  if (m.supersedes) doc.text(`Replaces: ${m.supersedes}`, right, 36, { align: "right" });

  return H;
}

/** Billed To on the left, delivery status on the right. */
function drawParties(doc: Doc, m: InvoiceModel, y: number): number {
  const colW = (CONTENT_W - 8) / 2;
  const rightX = MARGIN + colW + 8;

  sectionTitle(doc, "Billed To", MARGIN, y);
  sectionTitle(doc, "Delivery Details", rightX, y);

  let ly = y + 6;
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(9.5);
  doc.text(doc.splitTextToSize(m.billedToName, colW), MARGIN, ly);
  ly += 5;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  for (const line of m.billedToLines) {
    const wrapped = doc.splitTextToSize(line, colW);
    doc.text(wrapped, MARGIN, ly);
    ly += 4.2 * wrapped.length;
  }

  let ry = y + 6;
  doc.setFontSize(8.5);
  const [statusRow, ...restRows] = m.deliveryRows;
  ry = labelledRow(doc, statusRow.label, statusRow.value, rightX, ry, colW);
  if (m.provisionalNote) {
    doc.setTextColor(...WARN).setFont("helvetica", "normal").setFontSize(8);
    const wrapped = doc.splitTextToSize(m.provisionalNote, colW);
    doc.text(wrapped, rightX, ry + 0.5);
    ry += 4 * wrapped.length + 1.5;
    doc.setFontSize(8.5);
  }
  for (const row of restRows) ry = labelledRow(doc, row.label, row.value, rightX, ry, colW);

  return Math.max(ly, ry);
}

function drawNotes(doc: Doc, notes: string, y: number): number {
  sectionTitle(doc, "Notes", MARGIN, y);
  doc.setTextColor(...INK).setFont("helvetica", "normal").setFontSize(8.5);
  const wrapped = doc.splitTextToSize(notes, CONTENT_W);
  doc.text(wrapped, MARGIN, y + 6);
  return y + 6 + 4.2 * wrapped.length;
}

/**
 * The item table. autoTable owns this because it owns pagination: an order may
 * carry up to 50 lines, and a table that silently runs off page one would be a
 * worse bug than having no PDF. The header repeats on every page it spans.
 */
function drawItems(
  doc: Doc,
  m: InvoiceModel,
  autoTable: typeof import("jspdf-autotable").autoTable,
  y: number
): number {
  sectionTitle(doc, "Items", MARGIN, y);
  autoTable(doc, {
    startY: y + 4,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Item", "Qty", "Unit Price", "Amount"]],
    body: m.items.map((i) => [String(i.index), i.name, i.qty, i.unitPrice, i.amount]),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.4, textColor: INK },
    headStyles: {
      fontStyle: "bold",
      fontSize: 7,
      textColor: MUTED,
      fillColor: [249, 250, 251],
      lineWidth: { bottom: 0.2 },
      lineColor: RULE,
    },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: RULE },
    columnStyles: {
      0: { cellWidth: 10, halign: "center", textColor: MUTED },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 24, halign: "center", textColor: MUTED },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
  });
  return (doc as Doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Right-aligned totals stack, ending in the grand total. */
function drawTotals(doc: Doc, m: InvoiceModel, y: number): number {
  const boxW = 78;
  const x = PAGE_W - MARGIN - boxW;
  let cursor = y;
  for (const row of m.totals) {
    if (row.grand) {
      cursor += 2;
      doc.setDrawColor(...RULE).setLineWidth(0.2);
      doc.line(x, cursor, x + boxW, cursor);
      cursor += 5.5;
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
    } else {
      cursor += 5.5;
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.setTextColor(...(row.credit ? CREDIT : MUTED));
    }
    doc.text(row.label, x, cursor);
    if (row.credit) doc.setFont("helvetica", "bold");
    doc.text(row.value, x + boxW, cursor, { align: "right" });
  }
  return cursor;
}

/** Why the bill is smaller than the order — printed, not left to be asked. */
function drawAdjustment(
  doc: Doc,
  adjustment: NonNullable<InvoiceModel["adjustment"]>,
  y: number
): number {
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  const headline = doc.splitTextToSize(adjustment.headline, CONTENT_W - 10);
  const detail = doc.splitTextToSize(adjustment.detail, CONTENT_W - 10);
  const boxH = 12 + 4.2 * (headline.length + detail.length);

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, "F");
  doc.setTextColor(6, 95, 70).setFont("helvetica", "bold").setFontSize(7);
  doc.text("DELIVERY ADJUSTMENT", MARGIN + 5, y + 6);
  doc.setTextColor(...INK).setFont("helvetica", "normal").setFontSize(8.5);
  doc.text(headline, MARGIN + 5, y + 11.5);
  doc.text(detail, MARGIN + 5, y + 11.5 + 4.2 * headline.length);
  return y + boxH;
}

function drawTerms(doc: Doc, m: InvoiceModel, y: number): number {
  // Terms are long; start a page rather than let them collide with the footer.
  if (y > 245) {
    doc.addPage();
    y = 24;
  }
  doc.setDrawColor(...RULE).setLineWidth(0.2);
  doc.line(MARGIN, y - 4, PAGE_W - MARGIN, y - 4);
  sectionTitle(doc, "Terms & Conditions", MARGIN, y);
  let cursor = y + 6;
  doc.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(7.5);
  for (const term of m.terms) {
    const wrapped = doc.splitTextToSize(term, CONTENT_W);
    doc.text(wrapped, MARGIN, cursor);
    cursor += 3.6 * wrapped.length + 1.5;
  }
  return cursor;
}

/** Footer on EVERY page — a page two that did not say who issued it, or which
 *  of several pages it was, would be useless on its own in a filing cabinet. */
function drawFooters(doc: Doc, m: InvoiceModel): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const base = 297 - 16;
    doc.setDrawColor(...RULE).setLineWidth(0.2);
    doc.line(MARGIN, base - 5, PAGE_W - MARGIN, base - 5);
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...GREEN_DARK);
    doc.text(SELLER.name, PAGE_W / 2, base, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...MUTED);
    doc.text(m.footer.join("  ·  "), PAGE_W / 2, base + 4, { align: "center" });
    if (pages > 1) {
      doc.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, base + 4, { align: "right" });
    }
  }
}

function sectionTitle(doc: Doc, text: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
  doc.text(text.toUpperCase(), x, y);
}

function labelledRow(
  doc: Doc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
): number {
  doc.setFont("helvetica", "bold").setTextColor(...INK);
  const labelText = `${label}:`;
  doc.text(labelText, x, y);
  doc.setFont("helvetica", "normal");
  // Measured WITHOUT the trailing space and gapped explicitly: getTextWidth
  // ignores trailing whitespace, so "Status: " measured the same as "Status:"
  // and the value landed hard against the colon — "Status:Shipped".
  const offset = doc.getTextWidth(labelText) + 1.4;
  const wrapped = doc.splitTextToSize(value, width - offset);
  doc.text(wrapped, x + offset, y);
  return y + 4.6 * wrapped.length;
}
