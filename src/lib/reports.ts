/** Green Basket Report Generators
 *  - Inventory Report (end-of-day, 10PM)
 *  - Purchase Report
 *  - Packaging Report
 *  - Invoice Report per Customer
 */

import { store } from "./api/mock-store";
import type { Order, Product } from "./types";

// ─── Inventory Report ───────────────────────────────────────────

export interface InventoryReportLine {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  openingStock: number;
  soldQty: number;
  returnedQty: number;
  closingStock: number;
  unitPrice: number;
  stockValue: number;
  status: "OK" | "LOW" | "CRITICAL";
}

export function generateInventoryReport(): {
  generatedAt: string;
  lines: InventoryReportLine[];
  totalStockValue: number;
  totalItems: number;
  lowStockCount: number;
  criticalStockCount: number;
} {
  const s = store.get();
  const products = s.products;
  const orders = s.orders;

  const lines: InventoryReportLine[] = products
    .filter((p) => p.active)
    .map((product) => {
      const soldQty = orders
        .filter((o) => o.status !== "CANCELLED")
        .flatMap((o) => o.items)
        .filter((i) => i.productId === product.id)
        .reduce((sum, i) => sum + i.qty, 0);

      const returnedQty = 0; // TODO: link to returns
      const closingStock = product.stock;
      const openingStock = closingStock + soldQty - returnedQty;
      const stockValue = closingStock * product.price;

      let status: "OK" | "LOW" | "CRITICAL" = "OK";
      if (closingStock <= 15) status = "CRITICAL";
      else if (closingStock <= 30) status = "LOW";

      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        unit: product.unit,
        openingStock,
        soldQty,
        returnedQty,
        closingStock,
        unitPrice: product.price,
        stockValue,
        status,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    lines,
    totalStockValue: lines.reduce((s, l) => s + l.stockValue, 0),
    totalItems: lines.length,
    lowStockCount: lines.filter((l) => l.status === "LOW").length,
    criticalStockCount: lines.filter((l) => l.status === "CRITICAL").length,
  };
}

// ─── Purchase Report ────────────────────────────────────────────

export interface PurchaseReportLine {
  productId: string;
  productName: string;
  category: string;
  totalSoldQty: number;
  totalRevenue: number;
  avgOrderQty: number;
  orderCount: number;
  trend: "UP" | "DOWN" | "STABLE";
}

export function generatePurchaseReport(): {
  generatedAt: string;
  lines: PurchaseReportLine[];
  totalRevenue: number;
  totalQtySold: number;
  totalOrders: number;
} {
  const s = store.get();
  const products = s.products.filter((p) => p.active);
  const orders = s.orders.filter((o) => o.status !== "CANCELLED");

  const lines: PurchaseReportLine[] = products.map((product) => {
    const productOrders = orders.filter((o) =>
      o.items.some((i) => i.productId === product.id)
    );
    const totalSoldQty = productOrders
      .flatMap((o) => o.items)
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + i.qty, 0);
    const totalRevenue = totalSoldQty * product.price;
    const orderCount = productOrders.length;
    const avgOrderQty = orderCount > 0 ? Math.round(totalSoldQty / orderCount) : 0;

    let trend: "UP" | "DOWN" | "STABLE" = "STABLE";
    if (totalSoldQty > 100) trend = "UP";
    else if (totalSoldQty < 20) trend = "DOWN";

    return {
      productId: product.id,
      productName: product.name,
      category: product.category,
      totalSoldQty,
      totalRevenue,
      avgOrderQty,
      orderCount,
      trend,
    };
  });

  // Sort by revenue desc
  lines.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    generatedAt: new Date().toISOString(),
    lines,
    totalRevenue: lines.reduce((s, l) => s + l.totalRevenue, 0),
    totalQtySold: lines.reduce((s, l) => s + l.totalSoldQty, 0),
    totalOrders: orders.length,
  };
}

// ─── Packaging Report ───────────────────────────────────────────

export interface PackagingReportLine {
  productId: string;
  productName: string;
  unit: string;
  orderCount: number;
  totalQty: number;
  packagingType: string;
  estPackagingCost: number;
}

export function generatePackagingReport(): {
  generatedAt: string;
  lines: PackagingReportLine[];
  totalPackagingCost: number;
  totalOrders: number;
} {
  const s = store.get();
  const products = s.products.filter((p) => p.active);
  const orders = s.orders.filter((o) => o.status !== "CANCELLED");

  const lines: PackagingReportLine[] = products.map((product) => {
    const productOrders = orders.filter((o) =>
      o.items.some((i) => i.productId === product.id)
    );
    const totalQty = productOrders
      .flatMap((o) => o.items)
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + i.qty, 0);

    // Estimate packaging: Rs. 2 per kg for veggies, Rs. 5 per unit for special items
    const costPerUnit = product.category === "leafy-greens" ? 3 : 2;
    const estPackagingCost = totalQty * costPerUnit;

    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      orderCount: productOrders.length,
      totalQty,
      packagingType: product.category === "leafy-greens" ? "Breathable bag" : "Mesh crate",
      estPackagingCost,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    lines,
    totalPackagingCost: lines.reduce((s, l) => s + l.estPackagingCost, 0),
    totalOrders: orders.length,
  };
}

// ─── Invoice Report per Customer ────────────────────────────────

export interface CustomerInvoiceLine {
  orderId: string;
  orderNumber: string;
  date: string;
  items: { name: string; qty: number; price: number; total: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  invoiceNumber: string;
}

export interface CustomerInvoiceReport {
  generatedAt: string;
  businessName: string;
  customerPhone: string;
  customerCity: string;
  lines: CustomerInvoiceLine[];
  totalSpent: number;
  totalOrders: number;
  totalItems: number;
}

export function generateInvoiceReportPerCustomer(
  businessName?: string
): CustomerInvoiceReport[] {
  const s = store.get();
  const orders = s.orders.filter((o) => o.status !== "CANCELLED");

  // Group orders by business
  const byBusiness: Record<string, typeof orders> = {};
  for (const order of orders) {
    const key = order.businessName;
    if (!byBusiness[key]) byBusiness[key] = [];
    byBusiness[key].push(order);
  }

  return Object.entries(byBusiness)
    .filter(([name]) => !businessName || name.toLowerCase().includes(businessName.toLowerCase()))
    .map(([name, bizOrders]) => {
      const lines: CustomerInvoiceLine[] = bizOrders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        date: o.createdAt,
        items: o.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          total: i.lineTotal,
        })),
        subtotal: o.subtotal,
        deliveryFee: o.deliveryFee,
        total: o.total,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        status: o.status,
        invoiceNumber: `INV-${o.orderNumber.replace("ORD-", "")}`,
      }));

      return {
        generatedAt: new Date().toISOString(),
        businessName: name,
        customerPhone: bizOrders[0]?.delivery.phone || "",
        customerCity: bizOrders[0]?.delivery.city || "",
        lines,
        totalSpent: lines.reduce((s, l) => s + l.total, 0),
        totalOrders: lines.length,
        totalItems: lines.reduce((s, l) => s + l.items.reduce((is, i) => is + i.qty, 0), 0),
      };
    });
}

// ─── CSV Export ─────────────────────────────────────────────────

// Moved to ./csv so callers can serialise without pulling in this module's
// mock-store import. Re-exported here to keep existing call sites working.
export { reportToCSV } from "./csv";
