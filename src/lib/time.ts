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
