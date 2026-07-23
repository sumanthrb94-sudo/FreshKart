import type { OrderStatus, PaymentMethod, Unit, CartLine } from "./types";

/** Whole-order minimum quantity (in kg / units). */
export const MIN_ORDER_TOTAL_QTY = 10;

/** Whole-order maximum quantity (in kg / units) for a buyer-placed order —
 *  mirrored in firestore.rules' isOrderWeightValid() (real enforcement,
 *  since the browser talks to Firestore directly) and in mock.ts/firebase.ts
 *  createOrder (friendly client-side error before attempting the write).
 *  Admin/POS orders are exempt, same as every other buyer-only order rule. */
export const MAX_ORDER_TOTAL_QTY = 75;

/** True when a cart's total weight (kg) is within [MIN_ORDER_TOTAL_QTY,
 *  MAX_ORDER_TOTAL_QTY] — the single source of truth checkout/mock.ts/
 *  firebase.ts all gate order creation on. */
export function isValidOrderWeight(totalQty: number): boolean {
  return totalQty >= MIN_ORDER_TOTAL_QTY && totalQty <= MAX_ORDER_TOTAL_QTY;
}

/**
 * Max distinct products in a single order. firestore.rules validates prices
 * against a single pre-fetched price-sheet document (one get() call, not one
 * per item), so this is no longer bounded by Firestore's get()-call budget —
 * it only mirrors how far getExpectedSubtotal() in firestore.rules has been
 * hand-unrolled (rules have no loop/reduce to sum an arbitrary-length
 * array). 50 is comfortably above the entire product catalog, so in
 * practice no buyer can ever hit this. Keep both in sync — raising one
 * without the other either re-blocks legitimate carts or lets the client
 * claim a cap the rules won't actually honor.
 */
export const MAX_ORDER_ITEM_TYPES = 50;

/** Indian mobile numbers are exactly 10 digits (matches the OTP login flow's
 *  own validation in OnboardingScreen). Free-text phone fields elsewhere
 *  (checkout, account profile) had no such cap — a pasted or fat-fingered
 *  string of any length would save and print as-is (e.g. on the packing
 *  slip), so every phone input should sanitize on change with
 *  `sanitizePhoneDigits` and gate submission with `isValidPhoneDigits`. */
export const PHONE_DIGIT_LENGTH = 10;

/** Strip everything but digits and cap at PHONE_DIGIT_LENGTH — use as the
 *  onChange transform for every phone <Input>. */
export function sanitizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, PHONE_DIGIT_LENGTH);
}

/** True once a phone value (with or without formatting) has exactly
 *  PHONE_DIGIT_LENGTH digits. */
export function isValidPhoneDigits(value: string): boolean {
  return value.replace(/\D/g, "").length === PHONE_DIGIT_LENGTH;
}

/** Indian PIN codes are exactly 6 digits. Every address is normally captured
 *  via the map-based AddressPicker (reverse-geocoded, already well-formed),
 *  but AccountScreen's profile-edit form also lets a buyer retype it
 *  free-hand — same unbounded-length risk as the phone field. */
export const PINCODE_DIGIT_LENGTH = 6;

/** Strip everything but digits and cap at PINCODE_DIGIT_LENGTH — use as the
 *  onChange transform for every pincode <Input>. */
export function sanitizePincodeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, PINCODE_DIGIT_LENGTH);
}

/** True once a pincode value has exactly PINCODE_DIGIT_LENGTH digits. */
export function isValidPincodeDigits(value: string): boolean {
  return value.replace(/\D/g, "").length === PINCODE_DIGIT_LENGTH;
}

/** Total cart quantity across all lines. */
export function cartTotalQty(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

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

/** Invoices are only issued once an order has actually been delivered —
 *  never for a cancelled order, which has nothing to invoice. */
export function canDownloadInvoice(status: OrderStatus): boolean {
  return status === "DELIVERED";
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
  ONLINE: "Online payment",
};

export const PAYMENT_LONG: Record<PaymentMethod, string> = {
  COD: "Cash on delivery",
  ONLINE: "Pay online",
};
