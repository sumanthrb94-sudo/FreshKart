import type { OrderStatus, PaymentMethod, Unit, CartLine } from "./types";

/** Whole-order maximum quantity (in kg / units) for a buyer-placed order —
 *  mirrored in firestore.rules' isOrderWeightValid() (real enforcement,
 *  since the browser talks to Firestore directly) and in mock.ts/firebase.ts
 *  createOrder (friendly client-side error before attempting the write).
 *  Admin/POS orders are exempt, same as every other buyer-only order rule.
 *
 *  There is deliberately NO whole-cart minimum: each product carries its own
 *  minOrderQty (1kg leafy greens, 20kg onion/potato/tomato/banana, 6pc
 *  cauliflower, 3kg for everything else), which the cart's quantity stepper
 *  enforces per line. A single 1kg bunch of coriander is a valid order. */
export const MAX_ORDER_TOTAL_QTY = 500;

/** True when a cart's total quantity is orderable: it must contain something
 *  and stay under the ceiling. Per-product minimums are handled per line, not
 *  here. Single source of truth for checkout/mock.ts/firebase.ts. */
export function isValidOrderWeight(totalQty: number): boolean {
  return totalQty > 0 && totalQty <= MAX_ORDER_TOTAL_QTY;
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

/**
 * The 10 local digits of an Indian mobile, whatever shape it arrives in.
 *
 * Every phone field in the app draws its own "+91" prefix, so the value
 * behind it must be the bare national number. Firebase Auth hands back E.164
 * ("+918639766053"), and storing that verbatim put the country code INSIDE
 * the field: checkout rendered "+91 | +918639766053", validation counted 12
 * digits and refused to place the order, and backspacing through the "+91"
 * fought the sanitiser on every keystroke.
 *
 * A prefix is only stripped at a length that cannot be a real mobile — 12
 * digits led by 91, or 11 led by a trunk 0. At 10 or fewer the digits are
 * taken as typed, so a number legitimately beginning 91 survives, and typing
 * an 11th digit is ignored rather than silently shifting the whole number
 * along (which is what taking the last 10 would do).
 */
export function toLocalMobile(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, PHONE_DIGIT_LENGTH);
}

/**
 * A `tel:` target for a stored number.
 *
 * Numbers are held as 10 local digits, which dials fine from an Indian
 * handset but not from a roaming one — and old records still hold E.164. Put
 * the country code back on at the point of dialling, where it belongs, and
 * leave anything already carrying one alone.
 *
 * Gated on `isPlausibleIndianMobile`, NOT on `toLocalMobile` alone. The two
 * disagree on purpose: the normaliser is forgiving because it is reshaping
 * something a person is looking at, while this is choosing what a phone will
 * actually dial. Trusting the normaliser here turned the landline
 * "040 2345 6789" into "+91 40 2345 6789" — the trunk zero stripped, the STD
 * code read as the start of a mobile, and a stranger's number dialled.
 */
export function telHref(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "tel:";
  if (raw.startsWith("+")) return `tel:${raw.replace(/[^\d+]/g, "")}`;
  if (isPlausibleIndianMobile(raw)) return `tel:+91${toLocalMobile(raw)}`;
  return `tel:${raw.replace(/\D/g, "")}`;
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

// ---------------------------------------------------------------------------
// Phone ↔ account linking: fake-number reduction
//
// `isValidPhoneDigits` (length-only) is the right gate for free-text phone
// fields where all we care about is that the value fits the packing slip.
// But when a phone number is being *tied to an account* — the sign-in OTP
// step and the onboarding "add your mobile" link step — length alone lets
// throwaway numbers (0000000000, 1234567890, 9999999999) create real
// accounts. The helpers below add the cheap, always-true-for-India checks
// that turn most of those away without adding friction for genuine buyers.
// ---------------------------------------------------------------------------

/** Every dialable Indian mobile number starts with 6, 7, 8, or 9 (TRAI
 *  numbering). A 10-digit value beginning 0–5 is never a real mobile — it's a
 *  typo or a deliberately-fake entry. */
export const INDIAN_MOBILE_FIRST_DIGIT = /^[6-9]/;

/** True when a digit string is an obvious throwaway that a bare length check
 *  would wave through: all identical digits (9999999999), or a strict
 *  single-step run either ascending (2345678901) or descending (9876543210).
 *  Operates on already-sanitized digits. */
export function isRepeatedOrSequentialDigits(digits: string): boolean {
  if (digits.length < 2) return false;
  const allSame = /^(\d)\1+$/.test(digits);
  if (allSame) return true;
  // Full-length rotations of a 0–9 run — catches wrap-arounds a strict
  // monotonic scan misses (6789012345, 3210987654). A real number being an
  // exact rotation of every digit 0–9 is vanishingly unlikely, so this is a
  // safe reject. Only meaningful at the full 10-digit length.
  if (digits.length === PHONE_DIGIT_LENGTH) {
    const asc = "01234567890123456789";
    const desc = "98765432109876543210";
    if (asc.includes(digits) || desc.includes(digits)) return true;
  }
  // Strict single-step run (non-wrapping), either direction, any length.
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1) - 48;
    const cur = digits.charCodeAt(i) - 48;
    if (cur !== prev + 1) ascending = false;
    if (cur !== prev - 1) descending = false;
  }
  return ascending || descending;
}

/** Stronger phone gate for the phone↔account linking step: a real, dialable
 *  10-digit Indian mobile — right length, valid leading digit (6–9), and not
 *  an obvious throwaway pattern. Formatting (spaces, dashes, a +91 prefix) is
 *  tolerated; only the trailing 10 national digits are judged, so a pasted
 *  "+91 98765 43210" is accepted while "1234567890" / "9999999999" are not.
 *  Use `isValidPhoneDigits` (length-only) for free-text fields that just need
 *  to fit; use THIS wherever a phone is being bound to an account. */
export function isPlausibleIndianMobile(value: string): boolean {
  let digits = value.replace(/\D/g, "");
  // Strip ONLY a recognized prefix, never a stray digit — reshaping an
  // extra-digit typo into a different valid-looking number would link the
  // wrong phone. +91/91 country code (12 digits) and a trunk 0 (11 digits)
  // are the two we trust; every other length is a typo and is rejected.
  if (digits.length === PHONE_DIGIT_LENGTH + 2 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === PHONE_DIGIT_LENGTH + 1 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length !== PHONE_DIGIT_LENGTH) return false;
  if (!INDIAN_MOBILE_FIRST_DIGIT.test(digits)) return false;
  if (isRepeatedOrSequentialDigits(digits)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Email ↔ account linking: fake / disposable reduction
// ---------------------------------------------------------------------------

/** Trim + lowercase — the single normal form an email is compared and stored
 *  in, so "You@Shop.COM " and "you@shop.com" resolve to one account (matches
 *  the lowercasing completeProfile already does before the emailIndex claim). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Pragmatic email-shape check: exactly one @, non-empty local part, and a
 *  dot-bearing domain, with no spaces. Deliberately not RFC-5322-exhaustive
 *  (that both rejects real addresses and accepts nonsense) — it only keeps
 *  typos and junk ("a@b", "foo@bar", "no-at-sign") out of the linking step. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Return the lowercased domain of an email, or null if it has no single @. */
export function emailDomain(value: string): string | null {
  const parts = normalizeEmail(value).split("@");
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

/** Well-known disposable / throwaway-inbox domains. A buyer signing up with
 *  one of these is almost always evading the one-account-per-email rule — the
 *  address stops receiving mail minutes later, so it can't anchor a real
 *  account. Curated and intentionally small; extend as abuse is observed. */
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "trashmail.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mohmal.com",
  "moakt.com",
  "emailondeck.com",
]);

/** True when an email's domain is a known disposable-inbox provider. */
export function isDisposableEmail(value: string): boolean {
  const domain = emailDomain(value);
  return domain !== null && DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/** The one call the linking step needs: a well-formed, non-disposable email
 *  fit to anchor an account. */
export function isLinkableEmail(value: string): boolean {
  return isValidEmail(value) && !isDisposableEmail(value);
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
/**
 * A buyer may call off an order right up until it is handed to a driver —
 * after that the crates are physically on the van, and a cancellation would
 * take the stop off his run with nothing telling him why. From that point the
 * office cancels it, and can tell the driver.
 *
 * Assignment deliberately does not change the order's status, so status alone
 * cannot answer this — the driver is the signal.
 */
export function canBuyerCancel(status: OrderStatus, driverId?: string | null): boolean {
  if (driverId) return false;
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
