/**
 * Where an order lives, per build target.
 *
 * On the web an order is a real URL: `/orders/<id>`. The Android build is a
 * Capacitor shell around a Next.js **static export**, and a static export can
 * only contain files that existed at build time — order ids don't, so the
 * `/orders/[id]` segment ships no pages there. The mobile build addresses the
 * same screen through `/orders/detail?id=…`, which is a single static page that
 * reads the id at runtime.
 *
 * Always link to an order through `orderHref` so both targets stay correct.
 */
export const IS_MOBILE_BUILD = process.env.NEXT_PUBLIC_MOBILE_BUILD === "1";

export function orderHref(orderId: string) {
  return IS_MOBILE_BUILD
    ? `/orders/detail?id=${encodeURIComponent(orderId)}`
    : `/orders/${orderId}`;
}
