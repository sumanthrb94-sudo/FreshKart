/** CSV serialisation, shared by every report generator.
 *
 *  Lives apart from `reports.ts` so callers can serialise without pulling in
 *  that module's mock-store import.
 */

/**
 * A cell that a spreadsheet would run instead of read.
 *
 * Excel, LibreOffice and Google Sheets all treat a cell beginning `=`, `+`,
 * `-` or `@` as a formula. That is a problem here because these reports carry
 * text a BUYER typed — business name, contact name, phone, address, order
 * number — straight into a file the admin opens in Excel. `firestore.rules`
 * does not constrain those strings at all (verified against the real rules on
 * the emulator: a plain signed-in buyer can store any string in them), so a
 * shop could register as `=HYPERLINK("https://…","Click")` and have the admin's
 * own spreadsheet build the lure. The nastier payloads reach further —
 * `=cmd|'/c …'!A1` is the classic DDE one.
 *
 * The fix is the standard one: prefix the cell with a single quote, which
 * forces the spreadsheet to treat it as text and is not itself displayed.
 */
const FORMULA_LEAD = /^[=+@-]/;

function neutralizeFormula(value: string | number): string {
  // A number is a number. It carries no leading character a spreadsheet can
  // mistake for an operator, whatever its sign.
  if (typeof value === "number") return String(value);

  const s = String(value ?? "");
  // Leading whitespace is stripped before testing, because a tab or carriage
  // return in front of `=` still leaves a formula for the spreadsheet to run —
  // and because a cell that is ONLY whitespace is harmless and should be left
  // alone.
  const lead = s.trimStart();
  if (!FORMULA_LEAD.test(lead)) return s;

  // A signed number is not a formula, and quoting it would turn it into text —
  // breaking every SUM the admin runs over a column of refunds. This is the
  // one case worth excluding, and it is worth excluding precisely.
  if (/^[+-]/.test(lead) && Number.isFinite(Number(lead))) return s;

  return `'${s}`;
}

/** One CSV field: made inert, then quoted if the format requires it. */
export function csvCell(value: string | number): string {
  const s = neutralizeFormula(value);
  // \r matters as much as \n — a lone carriage return splits the row in some
  // parsers.
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** One CSV line from a row of values. */
export function csvRow(values: (string | number)[]): string {
  return values.map(csvCell).join(",");
}

export function reportToCSV(headers: string[], rows: (string | number)[][]): string {
  return [csvRow(headers), ...rows.map(csvRow)].join("\n");
}

/** Triggers a browser download of `content` as `filename`. Client-side only. */
export function downloadCSV(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
