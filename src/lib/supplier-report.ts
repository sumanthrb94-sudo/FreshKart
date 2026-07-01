import type { Order, Product } from "./types";
import { store } from "./api/mock-store";

/** A single line item that needs to be ordered from a supplier. */
export interface SupplierOrderLine {
  /** Product identifier */
  productId: string;
  /** Product name */
  productName: string;
  /** Category */
  category: string;
  /** Unit (kg / pc) */
  unit: string;
  /** Supplier origin / region */
  origin: string;
  /** Current stock on hand */
  currentStock: number;
  /** Stock status classification */
  stockStatus: "CRITICAL" | "LOW" | "NORMAL";
  /** Total quantity needed from pending orders */
  pendingOrderQty: number;
  /** Suggested reorder quantity (covers pending orders + restock buffer) */
  suggestedOrderQty: number;
  /** Price per unit */
  unitPrice: number;
  /** Estimated line cost */
  estimatedCost: number;
  /** Minimum order quantity from supplier */
  minOrderQty: number;
}

/** Aggregated supplier report grouped by origin region. */
export interface SupplierReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Report date (for file naming) */
  reportDate: string;
  /** Unique report ID */
  reportId: string;
  /** Total items that need ordering */
  totalItemsToOrder: number;
  /** Total estimated cost */
  totalEstimatedCost: number;
  /** Items grouped by supplier origin */
  byOrigin: Record<string, SupplierOrderLine[]>;
  /** Flat list of all order lines */
  lines: SupplierOrderLine[];
  /** Summary statistics */
  summary: {
    criticalStockCount: number;
    lowStockCount: number;
    pendingOrderItems: number;
    totalPendingOrderQty: number;
  };
}

const STOCK_CRITICAL = 15;
const STOCK_LOW = 30;
const RESTOCK_BUFFER_DAYS = 2;
const AVG_DAILY_SALES_FACTOR = 0.15; // Assume ~15% of stock sells daily

function classifyStock(stock: number): "CRITICAL" | "LOW" | "NORMAL" {
  if (stock <= STOCK_CRITICAL) return "CRITICAL";
  if (stock <= STOCK_LOW) return "LOW";
  return "NORMAL";
}

/** Build a supplier report from current mock data. */
export function generateSupplierReport(): SupplierReport {
  const s = store.get();
  const products = s.products;
  const orders = s.orders;

  const now = new Date();
  const reportDate = now.toISOString().split("T")[0];
  const reportId = `SUP-${reportDate.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Aggregate quantities needed from PENDING and CONFIRMED orders
  const orderDemand: Record<string, number> = {};
  for (const order of orders) {
    if (order.status === "PENDING" || order.status === "CONFIRMED") {
      for (const item of order.items) {
        orderDemand[item.productId] = (orderDemand[item.productId] || 0) + item.qty;
      }
    }
  }

  const lines: SupplierOrderLine[] = [];
  let criticalStockCount = 0;
  let lowStockCount = 0;
  let totalPendingOrderQty = 0;

  for (const product of products) {
    if (!product.active) continue;

    const pendingQty = orderDemand[product.id] || 0;
    const stockStatus = classifyStock(product.stock);

    // Only include if stock is low/critical OR there are pending orders needing it
    if (stockStatus === "NORMAL" && pendingQty === 0) continue;

    if (stockStatus === "CRITICAL") criticalStockCount++;
    if (stockStatus === "LOW") lowStockCount++;
    totalPendingOrderQty += pendingQty;

    // Calculate suggested order quantity:
    // = pending order qty + restock buffer (2 days of avg sales) - current stock
    const dailySalesEstimate = Math.ceil(product.stock * AVG_DAILY_SALES_FACTOR);
    const restockBuffer = dailySalesEstimate * RESTOCK_BUFFER_DAYS;
    let suggestedQty = pendingQty + restockBuffer - product.stock;

    // Round up to nearest minOrderQty multiple
    if (suggestedQty > 0) {
      suggestedQty = Math.ceil(suggestedQty / product.minOrderQty) * product.minOrderQty;
    } else if (pendingQty > 0) {
      // Even if stock seems sufficient, we need to fulfill pending orders
      suggestedQty = Math.ceil(pendingQty / product.minOrderQty) * product.minOrderQty;
    } else {
      suggestedQty = product.minOrderQty; // Minimum reorder for low stock
    }

    // Ensure suggested qty is at least the min order qty
    suggestedQty = Math.max(suggestedQty, product.minOrderQty);

    lines.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      unit: product.unit,
      origin: product.origin,
      currentStock: product.stock,
      stockStatus,
      pendingOrderQty: pendingQty,
      suggestedOrderQty: suggestedQty,
      unitPrice: product.price,
      estimatedCost: product.price * suggestedQty,
      minOrderQty: product.minOrderQty,
    });
  }

  // Sort: CRITICAL first, then LOW, then by origin
  lines.sort((a, b) => {
    const statusOrder = { CRITICAL: 0, LOW: 1, NORMAL: 2 };
    if (statusOrder[a.stockStatus] !== statusOrder[b.stockStatus]) {
      return statusOrder[a.stockStatus] - statusOrder[b.stockStatus];
    }
    return a.origin.localeCompare(b.origin);
  });

  // Group by origin
  const byOrigin: Record<string, SupplierOrderLine[]> = {};
  for (const line of lines) {
    const origin = line.origin;
    if (!byOrigin[origin]) byOrigin[origin] = [];
    byOrigin[origin].push(line);
  }

  const totalEstimatedCost = lines.reduce((s, l) => s + l.estimatedCost, 0);

  return {
    generatedAt: now.toISOString(),
    reportDate,
    reportId,
    totalItemsToOrder: lines.length,
    totalEstimatedCost,
    byOrigin,
    lines,
    summary: {
      criticalStockCount,
      lowStockCount,
      pendingOrderItems: Object.keys(orderDemand).length,
      totalPendingOrderQty,
    },
  };
}

/** Convert report to CSV format. */
export function reportToCSV(report: SupplierReport): string {
  const headers = [
    "Product",
    "Category",
    "Origin",
    "Unit",
    "Current Stock",
    "Stock Status",
    "Pending Order Qty",
    "Suggested Order Qty",
    "Unit Price (Rs.)",
    "Estimated Cost (Rs.)",
    "Min Order Qty",
  ];

  const rows = report.lines.map((l) => [
    `"${l.productName}"`,
    l.category,
    `"${l.origin}"`,
    l.unit,
    l.currentStock,
    l.stockStatus,
    l.pendingOrderQty,
    l.suggestedOrderQty,
    l.unitPrice,
    l.estimatedCost,
    l.minOrderQty,
  ]);

  const summaryRows = [
    [],
    ["Report Summary"],
    ["Report ID", report.reportId],
    ["Generated", report.generatedAt],
    ["Total Items to Order", report.totalItemsToOrder],
    ["Total Estimated Cost (Rs.)", report.totalEstimatedCost],
    ["Critical Stock Items", report.summary.criticalStockCount],
    ["Low Stock Items", report.summary.lowStockCount],
    ["Pending Order Items", report.summary.pendingOrderItems],
    ["Total Pending Order Qty", report.summary.totalPendingOrderQty],
  ];

  return [headers.join(","), ...rows.map((r) => r.join(",")), ...summaryRows.map((r) => r.join(","))].join("\n");
}

/** Convert report to a human-readable text format. */
export function reportToText(report: SupplierReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push("FRESHKART - DAILY SUPPLIER ORDER REPORT");
  lines.push("=".repeat(70));
  lines.push(`Report ID: ${report.reportId}`);
  lines.push(`Date: ${report.reportDate}`);
  lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
  lines.push("");

  // Summary
  lines.push("-".repeat(70));
  lines.push("SUMMARY");
  lines.push("-".repeat(70));
  lines.push(`Items to Order:     ${report.totalItemsToOrder}`);
  lines.push(`Total Est. Cost:    Rs. ${report.totalEstimatedCost.toLocaleString("en-IN")}`);
  lines.push(`Critical Stock:     ${report.summary.criticalStockCount} items`);
  lines.push(`Low Stock:          ${report.summary.lowStockCount} items`);
  lines.push(`Pending Order Qty:  ${report.summary.totalPendingOrderQty} units`);
  lines.push("");

  // By origin
  for (const [origin, items] of Object.entries(report.byOrigin)) {
    const originTotal = items.reduce((s, i) => s + i.estimatedCost, 0);
    lines.push("-".repeat(70));
    lines.push(`SUPPLIER: ${origin}  |  Items: ${items.length}  |  Est. Cost: Rs. ${originTotal.toLocaleString("en-IN")}`);
    lines.push("-".repeat(70));
    lines.push(
      `${"Product".padEnd(30)} ${"Status".padEnd(10)} ${"Stock".padStart(6)} ${"Need".padStart(6)} ${"Order".padStart(6)} ${"Price".padStart(8)} ${"Cost".padStart(10)}`
    );
    lines.push("-".repeat(70));
    for (const item of items) {
      const statusEmoji = item.stockStatus === "CRITICAL" ? "🔴" : item.stockStatus === "LOW" ? "🟡" : "🟢";
      lines.push(
        `${statusEmoji} ${item.productName.slice(0, 28).padEnd(28)} ${item.stockStatus.padEnd(10)} ${String(item.currentStock).padStart(6)} ${String(item.pendingOrderQty).padStart(6)} ${String(item.suggestedOrderQty).padStart(6)} ${`Rs.${item.unitPrice}`.padStart(8)} ${`Rs.${item.estimatedCost.toLocaleString("en-IN")}`.padStart(10)}`
      );
    }
    lines.push("");
  }

  lines.push("=".repeat(70));
  lines.push("END OF REPORT");
  lines.push("=".repeat(70));

  return lines.join("\n");
}
