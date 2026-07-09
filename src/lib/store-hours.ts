/** FreshKart store operating hours and price update schedule.
 *  All times are in IST (UTC+5:30).
 */

export const STORE_OPEN_HOUR = 8; // 8:00 AM IST
export const STORE_OPEN_MINUTE = 0;
export const STORE_CLOSE_HOUR = 23; // 11:45 PM IST
export const STORE_CLOSE_MINUTE = 45;
export const PRICE_UPDATE_HOUR = 7; // 7:00 AM IST

const OPEN_MINUTES = STORE_OPEN_HOUR * 60 + STORE_OPEN_MINUTE; // 480
const CLOSE_MINUTES = STORE_CLOSE_HOUR * 60 + STORE_CLOSE_MINUTE; // 1425

/** Store status at a given time (defaults to now, IST). */
export function getStoreStatus(now = new Date()): {
  isOpen: boolean;
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

  const isOpen = minutesSinceMidnight >= OPEN_MINUTES && minutesSinceMidnight < CLOSE_MINUTES;

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

  const minutesUntilOpen = isOpen ? 0 : Math.floor((nextOpen.getTime() - ist.getTime()) / 60000);
  const minutesUntilClose = isOpen ? Math.floor((nextClose.getTime() - ist.getTime()) / 60000) : 0;

  // Price update window: 6:30 AM - 7:30 AM (30 min before and after)
  const isPriceUpdateWindow = minutesSinceMidnight >= (PRICE_UPDATE_HOUR * 60 - 30) &&
    minutesSinceMidnight < (PRICE_UPDATE_HOUR * 60 + 30);

  return {
    isOpen,
    nextOpen,
    nextClose,
    minutesUntilOpen,
    minutesUntilClose,
    canPlaceOrders: isOpen && !isPriceUpdateWindow,
    isPriceUpdateWindow,
  };
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
