import { NextRequest, NextResponse } from "next/server";
import { generateSupplierReport, reportToCSV, reportToText } from "@/lib/supplier-report";

/**
 * GET /api/supplier-report
 *
 * Generates a supplier order report based on current stock levels and
 * pending orders. Returns JSON by default, or CSV/text via ?format= query.
 *
 * Query params:
 *   - format: "json" (default) | "csv" | "text"
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    const report = generateSupplierReport();

    switch (format) {
      case "csv": {
        const csv = reportToCSV(report);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="freshkart-supplier-report-${report.reportDate}.csv"`,
          },
        });
      }
      case "text": {
        const text = reportToText(report);
        return new NextResponse(text, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="freshkart-supplier-report-${report.reportDate}.txt"`,
          },
        });
      }
      default:
        return NextResponse.json(report, { status: 200 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate supplier report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
