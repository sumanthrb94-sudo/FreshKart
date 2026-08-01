import type { Order, User } from "@/lib/types";
import { getIstDateString, shiftIstDate } from "./time";

/**
 * Which day's van an order rides on.
 *
 * The business runs on a fixed daily cycle:
 *
 *   07:00–08:00  admin back from the mandi publishes the day's rates
 *   08:00–21:00  the shop takes orders
 *   21:00        the cart closes; the day's orders are final
 *   overnight    packed, assigned, loaded
 *   08:00–09:00  next morning, delivered
 *
 * So an order taken on Monday is delivered Tuesday morning, and a RUN is a
 * driver plus a delivery date — not merely "every order ever assigned to
 * him". Without that date the office's run board had nothing to forget with:
 * a run finished on Friday was still displayed as in progress on Saturday,
 * ageing quietly ("23h 16m ago"), and Saturday's first assignment merged into
 * its totals so the board read "8 stops · 18/19 orders" across two days.
 */

/** When the van leaves. Assignments made after this go on tomorrow's run. */
export const DELIVERY_WINDOW_START_HOUR = 8;

const IST = "Asia/Kolkata";

/** The IST hour, 0–23, at a given instant. */
function istHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
}

/**
 * The run an order assigned at `now` belongs to.
 *
 * Before the van leaves, an assignment still catches this morning's run — the
 * admin loading crates at 07:30 is loading them for today. Once it has gone,
 * everything assigned is for tomorrow. Anchoring on the departure hour rather
 * than on the 21:00 cart close matters because packing happens across
 * midnight: an order assigned at 23:00 Monday and one assigned at 01:00
 * Tuesday are the same van, and a date-only rule would split them.
 */
export function nextDeliveryDate(now: Date = new Date()): string {
  const today = getIstDateString(now);
  return istHour(now) < DELIVERY_WINDOW_START_HOUR ? today : shiftIstDate(today, 1);
}

/**
 * The delivery date of an order, for orders that predate the field.
 *
 * Every order assigned before this existed has no deliveryDate, and filtering
 * them out would have quietly emptied the office's board while the driver's
 * handset still showed the stops. Falling back to the assignment time puts
 * them on the run they were actually loaded for.
 */
export function deliveryDateOf(order: Order): string | null {
  if (order.deliveryDate) return order.deliveryDate;
  const stamp = order.assignedAt ?? order.createdAt;
  if (!stamp) return null;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return null;
  return nextDeliveryDate(at);
}

/** True once the office has settled the run this order belongs to. */
export function isRunClosed(order: Order): boolean {
  return Boolean(order.runClosedAt);
}

export interface RunKey {
  driverId: string;
  deliveryDate: string;
}

/**
 * Every open run: one per driver per delivery date, oldest first.
 *
 * "Open" means the office has not closed it. A run is NOT dropped just
 * because its stops are all delivered — closing is a deliberate act, because
 * that is the moment the cash is handed over and counted. An old run
 * therefore stays visible, which is correct, and the board is expected to
 * mark it as overdue rather than pass it off as today's work.
 */
export function openRunKeys(orders: Order[], drivers: User[]): RunKey[] {
  const known = new Set(drivers.map((d) => d.id));
  const seen = new Map<string, RunKey>();
  for (const order of orders) {
    if (!order.driverId || !known.has(order.driverId)) continue;
    if (order.status === "CANCELLED" || isRunClosed(order)) continue;
    const date = deliveryDateOf(order);
    if (!date) continue;
    const key = `${order.driverId}::${date}`;
    if (!seen.has(key)) seen.set(key, { driverId: order.driverId, deliveryDate: date });
  }
  return [...seen.values()].sort((a, b) =>
    a.deliveryDate === b.deliveryDate
      ? a.driverId.localeCompare(b.driverId)
      : a.deliveryDate.localeCompare(b.deliveryDate)
  );
}

/** The orders making up one run. */
export function ordersInRun(orders: Order[], key: RunKey): Order[] {
  return orders.filter(
    (o) =>
      o.driverId === key.driverId &&
      o.status !== "CANCELLED" &&
      !isRunClosed(o) &&
      deliveryDateOf(o) === key.deliveryDate
  );
}

/** "today" / "tomorrow" / "Fri 1 Aug" — how the office refers to a run. */
export function runDayLabel(deliveryDate: string, now: Date = new Date()): string {
  const today = getIstDateString(now);
  if (deliveryDate === today) return "today";
  if (deliveryDate === shiftIstDate(today, 1)) return "tomorrow";
  if (deliveryDate === shiftIstDate(today, -1)) return "yesterday";
  const [y, m, d] = deliveryDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** True when a run's delivery morning has already passed. */
export function isOverdueRun(deliveryDate: string, now: Date = new Date()): boolean {
  return deliveryDate < getIstDateString(now);
}
