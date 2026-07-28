/** Green Basket store operating hours and price update schedule.
 *  All times are in IST (UTC+5:30).
 */

import type { StoreOverride, StoreSettings } from "@/lib/types";

export const STORE_OPEN_HOUR = 8; // 8:00 AM IST
export const STORE_OPEN_MINUTE = 0;
/** The cart closes at 9:00 PM IST — orders placed after this go to the next
 *  day's delivery run, so ordering is shut off until the store reopens. */
export const STORE_CLOSE_HOUR = 21; // 9:00 PM IST
export const STORE_CLOSE_MINUTE = 0;
export const PRICE_UPDATE_HOUR = 7; // 7:00 AM IST

const OPEN_MINUTES = STORE_OPEN_HOUR * 60 + STORE_OPEN_MINUTE; // 480
const CLOSE_MINUTES = STORE_CLOSE_HOUR * 60 + STORE_CLOSE_MINUTE; // 1260

/**
 * Store status at a given time (defaults to now, IST).
 *
 * `override` lets an admin force the shop open or shut regardless of the
 * clock — for a demo, a late delivery run, or a day with no stock. "AUTO"
 * (the default) follows the 8 AM – 9 PM schedule. `isOnSchedule` always
 * reports what the clock alone would say, so the admin UI can show both
 * "the schedule says closed" and "you have forced it open".
 */
export function getStoreStatus(now = new Date(), override: StoreOverride = "AUTO"): {
  isOpen: boolean;
  isOnSchedule: boolean;
  override: StoreOverride;
  nextOpen: Date;
  nextClose: Date;
  minutesUntilOpen: number;
  minutesUntilClose: number;
  canPlaceOrders: boolean;
  isPriceUpdateWindow: boolean;
} {
  // Convert to IST
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = ist.getHours();
  const minute = ist.getMinutes();
  const minutesSinceMidnight = hour * 60 + minute;

  const isOnSchedule = minutesSinceMidnight >= OPEN_MINUTES && minutesSinceMidnight < CLOSE_MINUTES;
  const isOpen = override === "OPEN" ? true : override === "CLOSED" ? false : isOnSchedule;

  // Next open: tomorrow at open time if closed, otherwise today open time (already passed)
  const nextOpen = new Date(ist);
  nextOpen.setHours(STORE_OPEN_HOUR, STORE_OPEN_MINUTE, 0, 0);
  if (minutesSinceMidnight >= OPEN_MINUTES) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  // Next close: today at close time if open, otherwise today close time
  const nextClose = new Date(ist);
  nextClose.setHours(STORE_CLOSE_HOUR, STORE_CLOSE_MINUTE, 0, 0);
  if (minutesSinceMidnight >= CLOSE_MINUTES) {
    nextClose.setDate(nextClose.getDate() + 1);
  }

  const minutesUntilOpen = isOnSchedule ? 0 : Math.floor((nextOpen.getTime() - ist.getTime()) / 60000);
  const minutesUntilClose = isOnSchedule ? Math.floor((nextClose.getTime() - ist.getTime()) / 60000) : 0;

  // Price update window: 6:30 AM - 7:30 AM (30 min before and after)
  const isPriceUpdateWindow = minutesSinceMidnight >= (PRICE_UPDATE_HOUR * 60 - 30) &&
    minutesSinceMidnight < (PRICE_UPDATE_HOUR * 60 + 30);

  return {
    isOpen,
    isOnSchedule,
    override,
    nextOpen,
    nextClose,
    minutesUntilOpen,
    minutesUntilClose,
    canPlaceOrders: isOpen && !isPriceUpdateWindow,
    isPriceUpdateWindow,
  };
}

/**
 * The next 9:00 PM IST strictly after `from` — when an admin override lapses
 * and the shop goes back to following the schedule. Matches the operating
 * rule "it auto-offs at 9 PM that day": open the shop at 10 AM and it shuts
 * itself at 9 PM the same evening, so a forgotten override can't leave the
 * store trading overnight.
 */
export function nextStoreClose(from = new Date()): Date {
  // IST is a fixed UTC+5:30 with no DST, so plain arithmetic is exact.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const closeToday = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    STORE_CLOSE_HOUR,
    STORE_CLOSE_MINUTE
  );
  const closeUtcMs = closeToday - IST_OFFSET_MS;
  const DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(closeUtcMs > from.getTime() ? closeUtcMs : closeUtcMs + DAY_MS);
}

/**
 * The override actually in force right now. An override past its expiry is
 * treated as AUTO, so the schedule silently resumes without anyone having to
 * remember to switch it back.
 */
export function effectiveOverride(
  settings: StoreSettings | null | undefined,
  now = new Date()
): StoreOverride {
  if (!settings || settings.override === "AUTO") return "AUTO";
  if (settings.expiresAt && new Date(settings.expiresAt).getTime() <= now.getTime()) {
    return "AUTO";
  }
  return settings.override;
}

/** Format remaining time as "Opens in 2h 15m" or "Closes in 3h 30m". */
export function formatRemainingMinutes(minutes: number): string {
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
