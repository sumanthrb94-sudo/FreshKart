import type { Order } from "@/lib/types";
import { payableTotal } from "./delivery-adjustment";

/**
 * What a driver should hand in at the end of a run.
 *
 * Cash is the least-controlled part of the day: an executive walks back in
 * with several thousand rupees and, until now, nothing in the system said how
 * much that should be. This computes it from the orders themselves — the
 * adjusted amount, not the ordered amount, so produce refused at the door is
 * already accounted for and nobody has to reconcile it by hand.
 *
 * Deliberately derived rather than stored: a counted-cash record that can
 * drift from the orders is worse than no record, because it looks
 * authoritative.
 */

export interface CashLine {
  orderId: string;
  orderNumber: string;
  businessName: string;
  /** What was ordered, before anything was refused. */
  ordered: number;
  /** Taken off at the door. */
  refunded: number;
  /** What the driver should actually have taken. */
  due: number;
  method: Order["paymentMethod"];
  paid: boolean;
}

export interface CashRun {
  lines: CashLine[];
  /** Cash the driver should be carrying. */
  cashDue: number;
  /** Already paid online — never passes through the driver's hands. */
  prepaid: number;
  /** Refused at the door across the whole run. */
  refunded: number;
  delivered: number;
  /** Delivered but still marked unpaid — the ones to ask about. */
  unpaid: CashLine[];
}

/** Summarise one driver's completed deliveries for a day. */
export function summarizeCashRun(orders: Order[]): CashRun {
  const lines: CashLine[] = orders
    .filter((o) => o.status === "DELIVERED")
    .map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      businessName: o.businessName,
      ordered: o.total,
      refunded: o.adjustment && o.adjustment.status !== "PENDING" ? o.adjustment.totalRefund : 0,
      due: payableTotal(o),
      method: o.paymentMethod,
      paid: o.paymentStatus === "PAID",
    }));

  const cashLines = lines.filter((l) => l.method === "COD");
  return {
    lines,
    cashDue: cashLines.reduce((sum, l) => sum + l.due, 0),
    prepaid: lines.filter((l) => l.method !== "COD").reduce((sum, l) => sum + l.due, 0),
    refunded: lines.reduce((sum, l) => sum + l.refunded, 0),
    delivered: lines.length,
    // A delivered COD order that was never marked paid is the one thing worth
    // chasing the same evening, while the driver still remembers the door.
    unpaid: cashLines.filter((l) => !l.paid),
  };
}

/** Orders delivered on the given IST calendar day. */
export function onIstDay(orders: Order[], istDate: string): Order[] {
  return orders.filter((o) => {
    const stamp = o.deliveredAt ?? o.updatedAt;
    if (!stamp) return false;
    return new Date(stamp).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === istDate;
  });
}
