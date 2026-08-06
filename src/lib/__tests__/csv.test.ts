/**
 * CSV formula injection.
 *
 * The admin's reports carry text a BUYER typed — business name, contact name,
 * phone, address, order number — into a file that gets opened in Excel. Excel,
 * LibreOffice and Sheets all execute a cell that begins `=`, `+`, `-` or `@`.
 * `firestore.rules` does not constrain any of those strings (checked against
 * the real rules on the emulator — a plain signed-in buyer can store anything
 * in them), so the payload arrives through ordinary use of the app: register a
 * shop under a formula, place an order, wait for the admin to export.
 *
 * The other half of this file matters just as much: a report whose numbers
 * have been turned into text is a broken report. The financial columns must
 * come out exactly as they went in.
 */

import { describe, it, expect } from "vitest";
import { reportToCSV, csvCell } from "../csv";

describe("a spreadsheet must never run what a buyer typed", () => {
  const payloads = [
    ["=HYPERLINK", '=HYPERLINK("https://evil.example","Click for refund")'],
    ["=cmd DDE", `=cmd|'/c calc'!A1`],
    ["+ lead", "+HYPERLINK(1)"],
    ["@ lead", "@SUM(1+1)*cmd|'/c calc'!A1"],
    ["- lead", "-2+3+cmd|'/c calc'!A1"],
    ["tab then =", "\t=1+1"],
    ["CR then =", "\r=1+1"],
  ] as const;

  for (const [name, payload] of payloads) {
    it(`neutralises ${name}`, () => {
      const cell = csvCell(payload);
      // Quoted or not, the first character the spreadsheet sees must be the
      // apostrophe that forces text.
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    });
  }

  it("neutralises a buyer's business name in a real export", () => {
    const csv = reportToCSV(
      ["Business", "Order #", "Total"],
      [[`=HYPERLINK("https://evil.example","Refund")`, "ORD-20260805-AAA111", 430]]
    );
    expect(csv).not.toMatch(/(^|,|")=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("but the report itself must still be a report", () => {
  it("leaves negative numbers alone so SUM still works", () => {
    // A refund column is full of these. Quoting them would turn the column to
    // text and silently break every total the admin adds up.
    expect(csvCell(-380)).toBe("-380");
    expect(csvCell("-380")).toBe("-380");
    expect(csvCell("-380.50")).toBe("-380.50");
  });

  it("leaves ordinary values untouched", () => {
    expect(csvCell("Tomato")).toBe("Tomato");
    expect(csvCell("500028")).toBe("500028");
    expect(csvCell(430)).toBe("430");
    expect(csvCell(0)).toBe("0");
  });

  it("still quotes and escapes the things CSV requires", () => {
    expect(csvCell("12, Sarojini Devi Road")).toBe('"12, Sarojini Devi Road"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    // A lone carriage return splits the row in some parsers.
    expect(csvCell("line\rbreak")).toBe('"line\rbreak"');
  });

  it("quotes a neutralised value that also needs quoting", () => {
    expect(csvCell("=A1,B1")).toBe(`"'=A1,B1"`);
  });

  it("produces the same shape as before for a clean report", () => {
    const csv = reportToCSV(
      ["Product", "Qty", "Price"],
      [
        ["Tomato", 20, 19],
        ["Onion", 50, 24],
      ]
    );
    expect(csv).toBe("Product,Qty,Price\nTomato,20,19\nOnion,50,24");
  });
});
