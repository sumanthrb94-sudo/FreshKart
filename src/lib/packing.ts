/** Daily packing report.
 *
 *  Two views over one IST business day's orders:
 *    - a consolidated pick list — how much of each item to pull, in total;
 *    - one packing slip per customer — who, where, and what goes in their crate.
 *
 *  Pure: orders and products flow in as arguments (fetch them with
 *  `api.listOrdersByRange` + `getIstBusinessDayRange`). No store, no api, no
 *  DOM — so it behaves identically under every backend and is directly
 *  testable.
 */

import type { Order, OrderStatus, Product, Unit } from "./types";

/** One product line in the consolidated pick list. */
export interface PackItemLine {
  productId: string;
  name: string;
  unit: Unit;
  category?: string;
  /** Units to pick across every packable order — the headline number. */
  totalQty: number;
  /** Distinct orders containing this item. */
  orderCount: number;
  /** Units in orders that were cancelled. Excluded from totalQty; shown for context. */
  cancelledQty: number;
  packagingType: string;
}

/** One customer's packing slip: a single drop to a single address. */
export interface PackSlip {
  /** buyerId + address fingerprint — see `slipKey`. */
  key: string;
  buyerId: string;
  businessName: string;
  /** Contact on the delivery snapshot; may differ from businessName. */
  contactName: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  label?: string;
  /** Every order this customer placed that day to this address (usually one). */
  orderNumbers: string[];
  /** Item lines merged across those orders — what actually goes in the crate. */
  items: { productId: string; name: string; unit: Unit; qty: number }[];
  totalKg: number;
  totalPieces: number;
  amount: number;
  /** True when a return against one of these orders has been refunded. */
  hasRefund: boolean;
}

export interface DailyPackingReport {
  /** IST business day, "YYYY-MM-DD". */
  istDate: string;
  generatedAt: string;
  /** Consolidated pick list, highest quantity first. */
  items: PackItemLine[];
  /** Per-customer packing lists, by business name. */
  slips: PackSlip[];
  totals: {
    /** Orders to pack (excludes cancelled). */
    orderCount: number;
    /** Placed that day, then cancelled — not packed. */
    cancelledOrderCount: number;
    /** Distinct buyers to pack for. */
    customerCount: number;
    /**
     * kg and pieces are different dimensions and are never summed together —
     * a combined "quantity" would be meaningless on a pick list.
     */
    totalKg: number;
    totalPieces: number;
    /** Sum of order totals. Already net of refunds — see the note on `hasRefund`. */
    revenue: number;
    /** Rupees refunded against that day's orders, via returns processed later. */
    refundedAmount: number;
  };
}

/** Packaging material rule — mirrors the split the old report used. */
export function packagingTypeFor(category?: string): string {
  return category === "leafy-greens" ? "Breathable bag" : "Mesh crate";
}

/**
 * Groups by buyer AND delivery address.
 *
 * `businessName` alone is wrong: it's free text denormalized from
 * `delivery.name || buyer.businessName || buyer.name`, so two buyers collide.
 * `buyerId` alone is also wrong: `delivery` is snapshotted per order, so one
 * buyer ordering twice to two addresses would merge into a single slip with
 * one address — a mis-delivery. Keyed on both: same buyer + same address is
 * one packing run; same buyer + two addresses is two drops.
 */
function slipKey(order: Order): string {
  const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${order.buyerId}::${norm(order.delivery.address)}::${norm(order.delivery.pincode)}`;
}

/** Cancelled orders released their stock and must never be packed. */
function isPackable(status: OrderStatus): boolean {
  return status !== "CANCELLED";
}

/**
 * Builds the day's report from orders already scoped to that day by the caller.
 * Re-filtering is not done here — pass the result of `api.listOrdersByRange`.
 *
 * `products` is optional catalog enrichment: `OrderItem` carries no `category`,
 * so packaging type has to be joined by `productId`.
 */
export function generateDailyPackingReport(
  orders: Order[],
  istDate: string,
  products?: Product[]
): DailyPackingReport {
  const categoryOf = new Map((products ?? []).map((p) => [p.id, p.category]));
  const packable = orders.filter((o) => isPackable(o.status));
  const cancelled = orders.filter((o) => !isPackable(o.status));

  // ── Consolidated pick list ──
  const itemMap = new Map<string, PackItemLine>();
  const lineFor = (productId: string, name: string, unit: Unit): PackItemLine => {
    let line = itemMap.get(productId);
    if (!line) {
      const category = categoryOf.get(productId);
      line = {
        productId,
        name,
        unit,
        category,
        totalQty: 0,
        orderCount: 0,
        cancelledQty: 0,
        packagingType: packagingTypeFor(category),
      };
      itemMap.set(productId, line);
    }
    return line;
  };

  for (const order of packable) {
    for (const item of order.items) {
      const line = lineFor(item.productId, item.name, item.unit);
      line.totalQty += item.qty;
      line.orderCount += 1;
    }
  }
  // Cancelled quantities are context only — they never enter totalQty. An item
  // that appears *only* in cancelled orders still earns a line, so staff can
  // see it was ordered and then dropped.
  for (const order of cancelled) {
    for (const item of order.items) {
      lineFor(item.productId, item.name, item.unit).cancelledQty += item.qty;
    }
  }

  const items = [...itemMap.values()].sort(
    (a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name)
  );

  // ── Per-customer packing slips ──
  const slipMap = new Map<string, PackSlip>();
  for (const order of packable) {
    const key = slipKey(order);
    let slip = slipMap.get(key);
    if (!slip) {
      slip = {
        key,
        buyerId: order.buyerId,
        businessName: order.businessName,
        contactName: order.delivery.name,
        phone: order.delivery.phone,
        address: order.delivery.address,
        city: order.delivery.city,
        pincode: order.delivery.pincode,
        label: order.delivery.label,
        orderNumbers: [],
        items: [],
        totalKg: 0,
        totalPieces: 0,
        amount: 0,
        hasRefund: false,
      };
      slipMap.set(key, slip);
    }

    slip.orderNumbers.push(order.orderNumber);
    slip.amount += order.total;
    if (order.refundAmount) slip.hasRefund = true;

    for (const item of order.items) {
      // Merge repeat buys of the same product across the customer's orders —
      // "each customer as a whole": one crate, one line per item.
      const existing = slip.items.find((i) => i.productId === item.productId);
      if (existing) existing.qty += item.qty;
      else
        slip.items.push({
          productId: item.productId,
          name: item.name,
          unit: item.unit,
          qty: item.qty,
        });
    }
  }

  const slips = [...slipMap.values()]
    .map((slip) => ({
      ...slip,
      items: slip.items.sort((a, b) => a.name.localeCompare(b.name)),
      totalKg: sumQty(slip.items, "kg"),
      totalPieces: sumQty(slip.items, "pc"),
    }))
    .sort((a, b) => a.businessName.localeCompare(b.businessName));

  return {
    istDate,
    generatedAt: new Date().toISOString(),
    items,
    slips,
    totals: {
      orderCount: packable.length,
      cancelledOrderCount: cancelled.length,
      customerCount: new Set(packable.map((o) => o.buyerId)).size,
      totalKg: sumQty(items, "kg"),
      totalPieces: sumQty(items, "pc"),
      revenue: packable.reduce((sum, o) => sum + o.total, 0),
      refundedAmount: packable.reduce((sum, o) => sum + (o.refundAmount ?? 0), 0),
    },
  };
}

function sumQty(lines: { unit: Unit; totalQty?: number; qty?: number }[], unit: Unit): number {
  return lines
    .filter((l) => l.unit === unit)
    .reduce((sum, l) => sum + (l.totalQty ?? l.qty ?? 0), 0);
}
