/** Green Basket report generators.
 *
 *  Pure functions: they are handed the orders and products to report on and
 *  compute from those alone. They used to read `store.get()` — the in-memory
 *  DEMO backend — directly, which meant the admin's Inventory, Purchase and
 *  Invoices tabs showed fabricated figures in production, unconditionally,
 *  regardless of whether Firebase was configured. Taking the data as arguments
 *  is what makes them usable against the real backend, and it also keeps
 *  `mock-data.ts` out of every bundle that imports this file.
 *
 *  Every generator reports on the orders it is given. Scoping to a date range
 *  is the CALLER's job — see AdminReportsHub, which fetches a period through
 *  `api.listOrdersByRange`.
 */

import type { Order, Product } from "./types";

/** Stock at or below this is an emergency; at or below LOW, order soon. */
const STOCK_CRITICAL = 15;
const STOCK_LOW = 30;

export type StockStatus = "OK" | "LOW" | "CRITICAL";

function classifyStock(stock: number): StockStatus {
  if (stock <= STOCK_CRITICAL) return "CRITICAL";
  if (stock <= STOCK_LOW) return "LOW";
  return "OK";
}

/** Cancelled orders released their stock and were never charged for. */
const isBillable = (o: Order) => o.status !== "CANCELLED";

// ─── Inventory ──────────────────────────────────────────────────
//
// "What is on the shelf, and what should I reorder?"

export interface InventoryReportLine {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  /** Stock on hand right now. Not scoped to the period — stock is a level. */
  stockOnHand: number;
  /** Sold within the reported period. */
  soldQty: number;
  unitPrice: number;
  stockValue: number;
  status: StockStatus;
}

export interface InventoryReport {
  generatedAt: string;
  lines: InventoryReportLine[];
  totalStockValue: number;
  totalItems: number;
  lowStockCount: number;
  criticalStockCount: number;
}

export function generateInventoryReport(
  orders: Order[],
  products: Product[]
): InventoryReport {
  const billable = orders.filter(isBillable);

  // One pass over every line, rather than re-scanning all orders per product.
  // With a month of real orders the old nested filter was quadratic.
  const soldByProduct = new Map<string, number>();
  for (const order of billable) {
    for (const item of order.items) {
      soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.qty);
    }
  }

  const lines: InventoryReportLine[] = products
    .filter((p) => p.active)
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      category: product.category,
      unit: product.unit,
      stockOnHand: product.stock,
      soldQty: soldByProduct.get(product.id) ?? 0,
      unitPrice: product.price,
      stockValue: product.stock * product.price,
      status: classifyStock(product.stock),
    }));

  // Urgent first — this list exists to drive a reorder decision, and the thing
  // about to run out is the only row that needs acting on today.
  const rank: Record<StockStatus, number> = { CRITICAL: 0, LOW: 1, OK: 2 };
  lines.sort((a, b) => rank[a.status] - rank[b.status] || b.stockValue - a.stockValue);

  return {
    generatedAt: new Date().toISOString(),
    lines,
    totalStockValue: lines.reduce((s, l) => s + l.stockValue, 0),
    totalItems: lines.length,
    lowStockCount: lines.filter((l) => l.status === "LOW").length,
    criticalStockCount: lines.filter((l) => l.status === "CRITICAL").length,
  };
}

// ─── Sales ──────────────────────────────────────────────────────
//
// "What sold, and what did it bring in?" Named `purchase` in the UI until it
// became clear that read as "what we buy from suppliers" — which is the
// supplier report, a different screen entirely.

export interface SalesReportLine {
  productId: string;
  productName: string;
  unit: string;
  soldQty: number;
  /** Actual money billed for this product. */
  revenue: number;
  orderCount: number;
}

export interface SalesReport {
  generatedAt: string;
  lines: SalesReportLine[];
  totalRevenue: number;
  totalQtySold: number;
  totalOrders: number;
}

export function generateSalesReport(orders: Order[], products: Product[]): SalesReport {
  const billable = orders.filter(isBillable);
  const nameOf = new Map(products.map((p) => [p.id, p.name]));

  const acc = new Map<string, { name: string; unit: string; qty: number; revenue: number; orders: Set<string> }>();
  for (const order of billable) {
    for (const item of order.items) {
      let line = acc.get(item.productId);
      if (!line) {
        // The catalogue name wins when the product still exists — it may have
        // been corrected since the order was placed — but an order for a
        // delisted product still has to appear, so fall back to what was billed.
        line = {
          name: nameOf.get(item.productId) ?? item.name,
          unit: item.unit,
          qty: 0,
          revenue: 0,
          orders: new Set(),
        };
        acc.set(item.productId, line);
      }
      line.qty += item.qty;
      // `lineTotal` is what the buyer was actually charged. Multiplying the
      // quantity by today's catalogue price — which is what this did before —
      // reprices history every time the admin publishes a new rate, so the
      // report disagreed with the invoices.
      line.revenue += item.lineTotal;
      line.orders.add(order.id);
    }
  }

  const lines: SalesReportLine[] = [...acc.entries()]
    .map(([productId, l]) => ({
      productId,
      productName: l.name,
      unit: l.unit,
      soldQty: l.qty,
      revenue: l.revenue,
      orderCount: l.orders.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    generatedAt: new Date().toISOString(),
    lines,
    totalRevenue: lines.reduce((s, l) => s + l.revenue, 0),
    totalQtySold: lines.reduce((s, l) => s + l.soldQty, 0),
    totalOrders: billable.length,
  };
}

// ─── Invoices per customer ──────────────────────────────────────
//
// "Who bought what, and who still owes me?"

export interface CustomerInvoiceLine {
  orderId: string;
  orderNumber: string;
  date: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  invoiceNumber: string;
  paid: boolean;
}

export interface CustomerInvoiceReport {
  generatedAt: string;
  businessName: string;
  customerPhone: string;
  customerCity: string;
  lines: CustomerInvoiceLine[];
  totalBilled: number;
  /** The number this report exists for: what is still owed. */
  totalUnpaid: number;
  totalOrders: number;
}

export function generateInvoiceReportPerCustomer(
  orders: Order[],
  businessName?: string
): CustomerInvoiceReport[] {
  const billable = orders.filter(isBillable);

  const byBusiness = new Map<string, Order[]>();
  for (const order of billable) {
    const key = order.businessName;
    const list = byBusiness.get(key);
    if (list) list.push(order);
    else byBusiness.set(key, [order]);
  }

  const needle = businessName?.toLowerCase();

  return [...byBusiness.entries()]
    .filter(([name]) => !needle || name.toLowerCase().includes(needle))
    .map(([name, bizOrders]) => {
      const lines: CustomerInvoiceLine[] = bizOrders
        .map((o) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          date: o.createdAt,
          total: o.total,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          status: o.status,
          invoiceNumber: o.adjustedInvoiceNumber || `INV-${o.orderNumber.replace("ORD-", "")}`,
          paid: o.paymentStatus === "PAID",
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      return {
        generatedAt: new Date().toISOString(),
        businessName: name,
        customerPhone: bizOrders[0]?.delivery.phone || "",
        customerCity: bizOrders[0]?.delivery.city || "",
        lines,
        totalBilled: lines.reduce((s, l) => s + l.total, 0),
        totalUnpaid: lines.filter((l) => !l.paid).reduce((s, l) => s + l.total, 0),
        totalOrders: lines.length,
      };
    })
    // Whoever owes the most comes first.
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid || b.totalBilled - a.totalBilled);
}

// ─── CSV Export ─────────────────────────────────────────────────

// Lives in ./csv so callers can serialise without importing this module.
// Re-exported to keep existing call sites working.
export { reportToCSV } from "./csv";
