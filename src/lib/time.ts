/**
 * IST-aware helpers for the daily price-update gate.
 *
 * The cutoff is 07:00 Asia/Kolkata. A publication is valid for "today" only
 * when it happened at or after that cutoff on the current IST day.
 */

const IST = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
});

/** Returns the IST calendar date as "YYYY-MM-DD". */
export function getIstDateString(date: Date): string {
  return dateFormatter.format(date);
}

/** Builds the IST 07:00 cutoff timestamp for the given UTC instant's IST day. */
function getIstCutoff(date: Date): Date {
  const istDate = getIstDateString(date);
  // +05:30 is the fixed IST offset; this gives the exact Unix timestamp.
  return new Date(`${istDate}T07:00:00+05:30`);
}

/**
 * True when `publishedAt` represents a publication made today (IST) at or after
 * the 07:00 cutoff.
 */
export function isDailyPriceUpdatePublished(publishedAt: string | undefined | null): boolean {
  if (!publishedAt) return false;
  const now = new Date();
  const updated = new Date(publishedAt);
  if (Number.isNaN(updated.getTime())) return false;
  return (
    getIstDateString(updated) === getIstDateString(now) &&
    updated.getTime() >= getIstCutoff(now).getTime()
  );
}

/** Human-readable last-published time in IST, e.g. "7:05 AM, 9 Jul". */
export function formatLastPublished(publishedAt: string): string {
  const d = new Date(publishedAt);
  const date = d.toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
  });
  const time = timeFormatter.format(d);
  return `${time}, ${date}`;
}

// ─── Business-day ranges (daily reports) ─────────────────────────

/** Today's IST calendar date as "YYYY-MM-DD". */
export function getIstToday(): string {
  return getIstDateString(new Date());
}

/** Shifts an IST date string by N days. shiftIstDate("2026-07-17", -1) → "2026-07-16". */
export function shiftIstDate(istDate: string, days: number): string {
  // Anchored at noon UTC so a ±1 day step can never cross a DST or offset
  // boundary into the wrong calendar date.
  const anchor = new Date(`${istDate}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/**
 * The business day for an IST date: [07:00 IST, next 00:00 IST).
 *
 * The 07:00 start mirrors the price-publish cutoff — orders cannot exist before
 * it, because `createOrder` rejects while today's prices are unpublished and
 * `isDailyPriceUpdatePublished` only accepts a publish at or after 07:00 IST.
 * The end runs to midnight so late-evening orders can't fall into a gap.
 *
 * Returns UTC ISO strings in the same format `Order.createdAt` is written with
 * (`new Date().toISOString()`), so they compare correctly against it — both as
 * Date values and lexicographically, which is what makes the Firestore string
 * range query in `FirebaseDataSource.listOrdersByRange` exact.
 */
export function getIstBusinessDayRange(istDate: string): { startIso: string; endIso: string } {
  // +05:30 is the fixed IST offset; this pins the exact Unix timestamp.
  return {
    startIso: new Date(`${istDate}T07:00:00+05:30`).toISOString(),
    endIso: new Date(`${shiftIstDate(istDate, 1)}T00:00:00+05:30`).toISOString(),
  };
}

/** Report-header date label, e.g. "Fri, 17 Jul 2026". */
export function formatIstDateLabel(istDate: string): string {
  return new Date(`${istDate}T12:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Filters to records created within [startIso, endIso). Used by the adapters
 *  that have no server-side query (mock / http). */
export function filterOrdersByRange<T extends { createdAt: string }>(
  orders: T[],
  startIso: string,
  endIso: string
): T[] {
  return orders.filter((o) => o.createdAt >= startIso && o.createdAt < endIso);
}
