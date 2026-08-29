/**
 * Ask the server to push an order-status change to the buyer.
 *
 * Fire-and-forget by design: the status change itself already succeeded and is
 * the thing that matters, so a failed or unavailable push must never surface
 * as an error to the person who moved the order.
 *
 * Only staff on the web build reach the route — the Android build has no
 * server routes at all (they're excluded from the static export), and a buyer
 * cancelling their own order is rejected by the route anyway.
 */
import { getFirebaseAuth } from "../firebase/client";
import { IS_MOBILE_BUILD } from "../order-route";

/** Transitions the route will actually send; anything else is a wasted call. */
const PUSHABLE = new Set(["PACKED", "SHIPPED", "DELIVERED"]);

export function notifyBuyerOfStatus(orderId: string, status: string): void {
  if (IS_MOBILE_BUILD || !PUSHABLE.has(status)) return;

  void (async () => {
    try {
      const me = getFirebaseAuth().currentUser;
      if (!me) return;
      const idToken = await me.getIdToken();
      await fetch("/api/notifications/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, orderId, status }),
      });
    } catch {
      /* The buyer still sees the change in-app; a missed push is not worth an
         error in the admin's face. */
    }
  })();
}
