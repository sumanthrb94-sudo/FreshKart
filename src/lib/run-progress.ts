import type { Order, User } from "@/lib/types";
import { planRun, type RunVisit, type ServiceArea } from "./service-area";
import { summarizeCashRun } from "./cash-run";

/**
 * Where a driver has got to, right now.
 *
 * The office could already see each order's status change, but not the thing
 * anyone actually asks: how far through is he, which door is he at, and is
 * the van still moving. That question gets asked every time a buyer rings to
 * ask when the van will reach them, and answering it by counting DELIVERED
 * rows in a list is how it gets answered wrong.
 *
 * Derived entirely from the orders — no new writes, no location tracking, no
 * "driver is here" beacon to keep alive on a cheap handset. The cost is that
 * progress only moves when he completes a stop; that is the honest limit of
 * what the data knows, and the screen says so rather than implying live GPS.
 */

/** How long a run may go without any update before it's worth a phone call. */
export const SILENT_RUN_MINUTES = 45;

export interface RunProgress {
  driver: User;
  /** Doors on today's run, done and remaining. */
  stopsTotal: number;
  stopsDone: number;
  ordersTotal: number;
  ordersDone: number;
  /** The next door he should be at — null once the run is finished. */
  currentStop: RunVisit | null;
  /** Distance from the hub through every stop; done counts settled ones. */
  kmTotal: number;
  kmDone: number;
  /** Cash taken so far today (excludes anything prepaid online). */
  cashCollected: number;
  /** Escalations of his waiting on an office decision — he is blocked. */
  waitingOnOffice: number;
  /** Most recent change to any of his orders. */
  lastUpdateAt: string | null;
  /** Minutes since that change; null when nothing has happened yet. */
  silentMinutes: number | null;
  /** True when the run is unfinished and has gone quiet for too long. */
  isStalled: boolean;
  finished: boolean;
}

export function runProgress(
  driver: User,
  orders: Order[],
  area: ServiceArea,
  now: Date = new Date()
): RunProgress {
  const mine = orders.filter((o) => o.driverId === driver.id && o.status !== "CANCELLED");
  const outstanding = mine.filter((o) => o.status !== "DELIVERED");
  const done = mine.filter((o) => o.status === "DELIVERED");

  // The route as the driver sees it: every door still to work, plus the ones
  // already worked, so "stop 4 of 9" counts the same stops he counts.
  const remainingVisits = planRun(outstanding, area);
  const allVisits = planRun(mine, area);
  const stopsTotal = allVisits.length;
  const stopsDone = stopsTotal - remainingVisits.length;

  const kmTotal = allVisits.reduce((sum, v) => sum + (v.legKm ?? 0), 0);
  const kmRemaining = remainingVisits.reduce((sum, v) => sum + (v.legKm ?? 0), 0);

  const lastUpdateAt = mine.reduce<string | null>((latest, o) => {
    const stamp = o.deliveredAt ?? o.updatedAt;
    if (!stamp) return latest;
    return !latest || stamp > latest ? stamp : latest;
  }, null);

  const silentMinutes = lastUpdateAt
    ? Math.max(0, Math.round((now.getTime() - new Date(lastUpdateAt).getTime()) / 60_000))
    : null;

  const finished = outstanding.length === 0 && mine.length > 0;

  return {
    driver,
    stopsTotal,
    stopsDone,
    ordersTotal: mine.length,
    ordersDone: done.length,
    currentStop: remainingVisits[0] ?? null,
    kmTotal,
    // Distance is only known for the doors he has finished — the leg he is
    // driving right now is in progress, so it isn't counted yet.
    kmDone: Math.max(0, kmTotal - kmRemaining),
    cashCollected: summarizeCashRun(done).cashDue,
    waitingOnOffice: mine.filter((o) => o.adjustment?.status === "PENDING").length,
    lastUpdateAt,
    silentMinutes,
    isStalled: !finished && mine.length > 0 && (silentMinutes ?? 0) >= SILENT_RUN_MINUTES,
    finished,
  };
}

/** "just now" / "12 min ago" / "2h 05m ago" / "3 days ago" — a line an admin
 *  skims. Past a day it switches to days: an order assigned on Tuesday and
 *  still undelivered on Friday should read as three days, not "73h 40m". */
export function sinceLabel(minutes: number | null): string {
  if (minutes === null) return "no updates yet";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${String(m).padStart(2, "0")}m ago`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
