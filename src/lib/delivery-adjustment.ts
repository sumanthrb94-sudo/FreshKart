import type { AdjustmentLine, DeliveryAdjustment, Order, OrderItem } from "@/lib/types";

/**
 * Door-side adjustments: the only way an order's value can be reduced.
 *
 * The buyer inspects the delivery at handover and refuses what they don't
 * want. The driver records it, the payable amount drops, and cash is
 * collected at the adjusted figure — so money moves exactly once and there
 * is no refund to reverse afterwards. There is deliberately no
 * post-delivery return path: for fresh produce, the only moment ground
 * truth exists is with the goods in hand at the door.
 */

/**
 * How much a driver may write off without waiting for an admin.
 *
 * The doorstep cannot block on someone answering a phone — a delivery run
 * that stalls whenever the admin is driving or asleep is worse than the
 * occasional small write-off. So the driver settles routine rejections on
 * the spot and only genuinely material ones escalate.
 *
 * The allowance is the GREATER of a flat floor and a share of the order:
 * a flat cap alone would send every trivial rejection on a large order for
 * approval, and a percentage alone would leave small orders with almost no
 * headroom (10% of a ₹300 order is ₹30 — less than one kilo of most items).
 */
export const DRIVER_APPROVAL_FLOOR_RUPEES = 500;
export const DRIVER_APPROVAL_SHARE = 0.1; // 10% of order total

/** The most this driver can approve unaided on an order of this size. */
export function driverApprovalLimit(orderTotal: number): number {
  return Math.max(DRIVER_APPROVAL_FLOOR_RUPEES, Math.round(orderTotal * DRIVER_APPROVAL_SHARE));
}

/** True when the driver can settle this refund himself and collect right away. */
export function isWithinDriverAuthority(refund: number, orderTotal: number): boolean {
  return refund <= driverApprovalLimit(orderTotal);
}

/** Build a priced adjustment line from the ordered item and the refused quantity. */
export function buildAdjustmentLine(item: OrderItem, rejectedQty: number): AdjustmentLine {
  const qty = Math.min(Math.max(rejectedQty, 0), item.qty);
  return {
    productId: item.productId,
    name: item.name,
    unit: item.unit,
    rejectedQty: qty,
    unitPrice: item.price,
    lineRefund: qty * item.price,
  };
}

export function totalRefundOf(lines: AdjustmentLine[]): number {
  return lines.reduce((sum, l) => sum + l.lineRefund, 0);
}

/**
 * What the buyer actually hands over. A refund only comes off the bill once
 * it is settled — while an escalated adjustment is still PENDING the driver
 * must not collect, so callers gate on `isCollectable` rather than quietly
 * charging the full amount.
 */
export function payableTotal(order: Order): number {
  const adj = order.adjustment;
  if (!adj || adj.status === "PENDING") return order.total;
  // APPROVED, AUTO_APPROVED and REJECTED all bill only for goods kept — the
  // buyer never pays for produce they refused and the driver took back.
  return Math.max(0, order.total - adj.totalRefund);
}

/** An order is ready for cash only once nothing is awaiting an admin decision. */
export function isCollectable(order: Order): boolean {
  return order.adjustment?.status !== "PENDING";
}

/**
 * Whether the refused stock goes back on the shelf.
 *
 * APPROVED (and AUTO_APPROVED) means the produce really was bad — it is a
 * write-off and must NOT return to sellable inventory. REJECTED means the
 * goods were fine and the buyer simply declined them, so they come back on
 * the vehicle and are restocked. Both outcomes bill the buyer identically;
 * this is the only thing that separates them.
 */
export function shouldRestock(adjustment: DeliveryAdjustment): boolean {
  return adjustment.status === "REJECTED";
}

/** Short human summary for the bill / invoice line. */
export function describeAdjustment(adj: DeliveryAdjustment): string {
  const items = adj.lines
    .filter((l) => l.rejectedQty > 0)
    .map((l) => `${l.rejectedQty} ${l.unit} ${l.name}`)
    .join(", ");
  return items ? `${items} — ${adj.reason}` : adj.reason;
}
