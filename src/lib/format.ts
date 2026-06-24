import type { OrderStatus, PaymentMethod, Unit } from "./types";

/** ₹24, ₹1,250 — Indian Rupee, no decimals, en-IN grouping. */
export function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** 15 Jun 2026 — day, short month, year, en-IN. */
export function formatDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function unitLabel(unit: Unit): string {
  return unit === "kg" ? "kg" : "pc";
}

/** "₹24 / kg" style price line. */
export function pricePerUnit(price: number, unit: Unit): string {
  return `${formatCurrency(price)} / ${unitLabel(unit)}`;
}

/** ORD-20260622-AB12CD */
export function generateOrderNumber(seed: string, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  // Deterministic-ish suffix derived from a seed so the same call is stable.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 6; i++) {
    suffix += chars[h % chars.length];
    h = Math.floor(h / chars.length) + (i + 1) * 7;
  }
  return `ORD-${y}${m}${d}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Order status presentation (brief §3.4 + §9.3)
// ---------------------------------------------------------------------------

export interface StatusMeta {
  label: string;
  /** Tailwind classes for the badge background + text */
  badge: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: { label: "Pending", badge: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Confirmed", badge: "bg-blue-100 text-blue-800" },
  PACKED: { label: "Packed", badge: "bg-indigo-100 text-indigo-800" },
  SHIPPED: { label: "Shipped", badge: "bg-purple-100 text-purple-800" },
  DELIVERED: { label: "Delivered", badge: "bg-brand-100 text-brand-800" },
  CANCELLED: { label: "Cancelled", badge: "bg-red-100 text-red-700" },
};

/** Forward status machine: PENDING→CONFIRMED→PACKED→SHIPPED→DELIVERED */
export const STATUS_FLOW: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
];

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  if (i === -1 || i === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
}

/** Buyer may cancel only while the order is still early. */
export function canBuyerCancel(status: OrderStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

// 5-stage buyer tracking timeline (brief §9.3)
export interface TimelineStage {
  status: OrderStatus;
  label: string;
  note: string;
}

export const TRACKING_STAGES: TimelineStage[] = [
  { status: "PENDING", label: "Order placed", note: "We've received your order." },
  { status: "CONFIRMED", label: "Confirmed", note: "Seller accepted your order." },
  { status: "PACKED", label: "Packed & ready", note: "Your produce is packed fresh." },
  { status: "SHIPPED", label: "Out for delivery", note: "On the way to you." },
  { status: "DELIVERED", label: "Delivered", note: "Order delivered. Enjoy!" },
];

// ---------------------------------------------------------------------------
// Payment presentation (brief §9.4)
// ---------------------------------------------------------------------------

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  COD: "Cash on delivery",
  CREDIT: "Business credit",
  ONLINE: "Online payment",
};

export const PAYMENT_LONG: Record<PaymentMethod, string> = {
  COD: "Cash on delivery",
  CREDIT: "Credit (pay later)",
  ONLINE: "Pay online",
};
