import { NextRequest, NextResponse } from "next/server";
import {
  generateInventoryReport,
  generatePurchaseReport,
  generatePackagingReport,
  generateInvoiceReportPerCustomer,
  reportToCSV,
} from "@/lib/reports";

/**
 * GET /api/reports?type=inventory|purchase|packaging|invoices&format=csv|json
 *
 * Generates various admin reports:
 *   - inventory: End-of-day inventory report (for 10PM closing)
 *   - purchase: Purchase/sales report
 *   - packaging: Packaging cost report
 *   - invoices: Invoice report per customer
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "inventory";
    const format = searchParams.get("format") || "json";
    const businessName = searchParams.get("business") || undefined;

    let data: unknown;
    let filename: string;

    switch (type) {
      case "inventory":
        data = generateInventoryReport();
        filename = `green-basket-inventory-report-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      case "purchase":
        data = generatePurchaseReport();
        filename = `green-basket-purchase-report-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      case "packaging":
        data = generatePackagingReport();
        filename = `green-basket-packaging-report-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      case "invoices":
        data = generateInvoiceReportPerCustomer(businessName);
        filename = `green-basket-invoice-report-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }

    if (format === "csv") {
      let csv = "";
      switch (type) {
        case "inventory": {
          const r = data as ReturnType<typeof generateInventoryReport>;
          csv = reportToCSV(
            ["Product", "Category", "Unit", "Opening", "Sold", "Returned", "Closing", "Price", "Stock Value", "Status"],
            r.lines.map((l) => [l.productName, l.category, l.unit, l.openingStock, l.soldQty, l.returnedQty, l.closingStock, l.unitPrice, l.stockValue, l.status])
          );
          break;
        }
        case "purchase": {
          const r = data as ReturnType<typeof generatePurchaseReport>;
          csv = reportToCSV(
            ["Product", "Category", "Qty Sold", "Revenue", "Avg Order", "Orders", "Trend"],
            r.lines.map((l) => [l.productName, l.category, l.totalSoldQty, l.totalRevenue, l.avgOrderQty, l.orderCount, l.trend])
          );
          break;
        }
        case "packaging": {
          const r = data as ReturnType<typeof generatePackagingReport>;
          csv = reportToCSV(
            ["Product", "Unit", "Orders", "Total Qty", "Packaging Type", "Est. Cost"],
            r.lines.map((l) => [l.productName, l.unit, l.orderCount, l.totalQty, l.packagingType, l.estPackagingCost])
          );
          break;
        }
        case "invoices": {
          const r = data as ReturnType<typeof generateInvoiceReportPerCustomer>;
          const rows: (string | number)[][] = [];
          for (const c of r) {
            for (const l of c.lines) {
              rows.push([c.businessName, l.orderNumber, l.date, l.total, l.paymentMethod, l.paymentStatus, l.status, l.invoiceNumber]);
            }
          }
          csv = reportToCSV(["Business", "Order #", "Date", "Total", "Payment", "Paid", "Status", "Invoice"], rows);
          break;
        }
      }
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
