/** In-App Notification System for Green Basket Customers
 *  Generates and manages notifications shown inside the app.
 *  Persists to localStorage. Separate from email/SMS (in notifications.ts).
 */

export type InAppNotificationType =
  | "order_confirmed"
  | "order_packed"
  | "order_delivered"
  | "order_cancelled"
  | "return_approved"
  | "return_rejected"
  | "return_refunded"
  | "coupon_applied"
  | "payment_reminder";

export interface InAppNotification {
  id: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  orderId?: string;
  createdAt: string;
}

const STORAGE_KEY = "green_basket_inapp_notifications";

function loadNotifications(): InAppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveNotifications(notifs: InAppNotification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 100)));
  } catch {
    // Storage full
  }
}

let notifs: InAppNotification[] = loadNotifications();
let listeners: ((notifs: InAppNotification[]) => void)[] = [];

function notify() {
  listeners.forEach((l) => l([...notifs]));
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

export function addInAppNotification(
  type: InAppNotificationType,
  title: string,
  message: string,
  options?: { actionUrl?: string; orderId?: string }
): InAppNotification {
  const notification: InAppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    message,
    read: false,
    ...options,
    createdAt: new Date().toISOString(),
  };
  notifs = [notification, ...notifs].slice(0, 100);
  saveNotifications(notifs);
  notify();
  return notification;
}

export function markInAppAsRead(id: string) {
  notifs = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(notifs);
  notify();
}

export function markAllInAppAsRead() {
  notifs = notifs.map((n) => ({ ...n, read: true }));
  saveNotifications(notifs);
  notify();
}

export function deleteInAppNotification(id: string) {
  notifs = notifs.filter((n) => n.id !== id);
  saveNotifications(notifs);
  notify();
}

export function clearAllInAppNotifications() {
  notifs = [];
  saveNotifications(notifs);
  notify();
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
