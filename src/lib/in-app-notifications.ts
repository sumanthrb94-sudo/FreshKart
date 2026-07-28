/** In-App Notification System for Green Basket Customers.
 *  Generates and manages notifications shown inside the app. Backed by
 *  Firestore (collection `notifications`, scoped by `userId`) so history and
 *  read-state follow the account across devices — no client storage of any
 *  kind. Separate from email/SMS (in notifications.ts).
 */
import { api } from "@/lib/api";

export type InAppNotificationType =
  | "order_confirmed"
  | "order_packed"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "return_refunded"
  | "coupon_applied"
  | "payment_reminder";

export interface InAppNotification {
  id: string;
  userId: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  orderId?: string;
  createdAt: string;
}

let activeUserId: string | null = null;
let notifs: InAppNotification[] = [];
let listeners: ((notifs: InAppNotification[]) => void)[] = [];
let unsubscribeLive: (() => void) | null = null;

function notify() {
  listeners.forEach((l) => l([...notifs]));
}

/** Switch the active account these notifications belong to — call with the
 *  signed-in user's id on login/session-restore, and `null` on logout. */
export function setNotificationUser(userId: string | null) {
  if (userId === activeUserId) return;
  activeUserId = userId;
  unsubscribeLive?.();
  unsubscribeLive = null;
  notifs = [];
  notify();
  if (!userId) return;

  if (typeof api.subscribeInAppNotifications === "function") {
    unsubscribeLive = api.subscribeInAppNotifications(userId, (fresh) => {
      if (userId !== activeUserId) return; // a fast account switch outran this subscription
      notifs = fresh;
      notify();
    });
  } else {
    api
      .listInAppNotifications(userId)
      .then((fresh) => {
        if (userId !== activeUserId) return;
        notifs = fresh;
        notify();
      })
      .catch(() => {});
  }
}

export function subscribeInAppNotifications(callback: (notifs: InAppNotification[]) => void) {
  listeners.push(callback);
  callback([...notifs]);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function getUnreadCount(): number {
  return notifs.filter((n) => !n.read).length;
}

/** Fire-and-forget: the live subscription (or the next poll) reflects the
 *  new notification once the write lands, so this doesn't need to be awaited
 *  by any caller — matches how every other notify* helper below is used. */
export function addInAppNotification(
  type: InAppNotificationType,
  title: string,
  message: string,
  options?: { actionUrl?: string; orderId?: string }
): void {
  if (!activeUserId) return;
  api.addInAppNotification(activeUserId, type, title, message, options).catch(() => {});
}

// Read/delete actions update the local cache immediately (optimistic) for a
// snappy UI, then sync to Firestore in the background; the live subscription
// reconciles if the write fails.
export function markInAppAsRead(id: string) {
  notifs = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
  notify();
  if (activeUserId) api.markInAppNotificationRead(activeUserId, id).catch(() => {});
}

export function markAllInAppAsRead() {
  notifs = notifs.map((n) => ({ ...n, read: true }));
  notify();
  if (activeUserId) api.markAllInAppNotificationsRead(activeUserId).catch(() => {});
}

export function deleteInAppNotification(id: string) {
  notifs = notifs.filter((n) => n.id !== id);
  notify();
  if (activeUserId) api.deleteInAppNotification(activeUserId, id).catch(() => {});
}

export function clearAllInAppNotifications() {
  notifs = [];
  notify();
  if (activeUserId) api.clearAllInAppNotifications(activeUserId).catch(() => {});
}

// ── Pre-built notification generators ────────────────────────────────────

export function notifyOrderConfirmed(orderNumber: string, total: number, orderId: string) {
  return addInAppNotification(
    "order_confirmed",
    "Order Confirmed",
    `Your order ${orderNumber} for Rs. ${total} has been confirmed. We'll pack it for tomorrow's morning delivery.`,
    { actionUrl: `/orders/${orderId}`, orderId }
  );
}

export function notifyOrderPacked(orderNumber: string, orderId: string) {
  return addInAppNotification(
    "order_packed",
    "Order Packed",
    `Your order ${orderNumber} has been packed and is ready for tomorrow's morning delivery before 7 AM.`,
    { actionUrl: `/orders/${orderId}`, orderId }
  );
}

export function notifyOrderShipped(orderNumber: string, orderId: string) {
  return addInAppNotification(
    "order_shipped",
    "Out for Delivery",
    `Your order ${orderNumber} is out for delivery and will arrive soon.`,
    { actionUrl: `/orders/${orderId}`, orderId }
  );
}

export function notifyOrderDelivered(orderNumber: string, orderId: string) {
  return addInAppNotification(
    "order_delivered",
    "Delivered",
    `Your order ${orderNumber} has been delivered. Enjoy your fresh produce!`,
    { actionUrl: `/orders/${orderId}`, orderId }
  );
}

export function notifyOrderCancelled(orderNumber: string, reason?: string) {
  return addInAppNotification(
    "order_cancelled",
    "Order Cancelled",
    `Your order ${orderNumber} was cancelled. ${reason || "Any amount paid will be refunded within 5-7 business days."}`,
    { actionUrl: "/orders" }
  );
}

export function notifyReturnRequested(orderNumber: string, returnId: string, refundAmount: number) {
  return addInAppNotification(
    "return_requested",
    "Return Request Submitted",
    `Refund of Rs. ${refundAmount} for order ${orderNumber} will be processed in 3-5 days. Our team will review within 24 hours.`,
    { actionUrl: `/returns/${returnId}` }
  );
}

export function notifyReturnApproved(returnId: string) {
  return addInAppNotification(
    "return_approved",
    "Return Approved",
    `Your return request ${returnId} has been approved. A pickup will be scheduled soon.`,
    { actionUrl: `/returns/${returnId}` }
  );
}

export function notifyReturnRejected(returnId: string, reason?: string) {
  return addInAppNotification(
    "return_rejected",
    "Return Rejected",
    `Your return request ${returnId} was rejected. ${reason || "Please contact support for more details."}`,
    { actionUrl: `/returns/${returnId}` }
  );
}

export function notifyReturnRefunded(returnId: string, amount: number) {
  return addInAppNotification(
    "return_refunded",
    "Refund Processed",
    `Rs. ${amount} has been refunded for return ${returnId}. It will reflect in your account within 5-7 business days.`,
    { actionUrl: `/returns/${returnId}` }
  );
}

export function notifyCouponApplied(code: string, discount: number) {
  return addInAppNotification(
    "coupon_applied",
    "Coupon Applied",
    `Coupon ${code} applied successfully. You saved Rs. ${discount}!`,
    { actionUrl: "/orders" }
  );
}

export function notifyPaymentReminder(orderNumber: string, amount: number, orderId: string) {
  return addInAppNotification(
    "payment_reminder",
    "Payment Pending",
    `Please pay Rs. ${amount} for order ${orderNumber} before delivery.`,
    { actionUrl: `/orders/${orderId}`, orderId }
  );
}
