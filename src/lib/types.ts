/**
 * Green Basket domain model.
 *
 * These types are the single source of truth shared by the UI, the mock data
 * layer, and the (future) GCP backend. The REST contract in `docs/BACKEND.md`
 * is expressed in terms of exactly these shapes — keep them in sync.
 */

export type Role = "BUYER" | "ADMIN" | "SELLER" | "DRIVER";

export type Unit = "kg" | "pc";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod = "COD" | "ONLINE";

export type PaymentStatus = "UNPAID" | "PAID";

export interface DailyPricesSettings {
  /** ISO 8601 timestamp of the latest daily price update. */
  publishedAt: string;
  /** User id of the admin who published the update. */
  publishedBy?: string;
}

/**
 * Admin override for the 8 AM – 9 PM IST schedule.
 * - AUTO   — follow the clock (the normal case)
 * - OPEN   — force the shop live regardless of the hour (demos, late runs)
 * - CLOSED — force it shut regardless of the hour (holiday, no stock)
 */
export type StoreOverride = "AUTO" | "OPEN" | "CLOSED";

export interface StoreSettings {
  override: StoreOverride;
  /**
   * When the override stops applying and the shop reverts to the schedule —
   * the next 9 PM IST after it was set. An override that never expired would
   * silently leave the shop open (or shut) indefinitely the moment someone
   * forgot to undo a test. Unset/absent = no expiry (AUTO).
   */
  expiresAt?: string;
  /** ISO 8601 timestamp of the last override change. */
  updatedAt?: string;
  /** User id of the admin who set it. */
  updatedBy?: string;
}

export interface Category {
  /** slug, e.g. "vegetables" */
  id: string;
  /** display label, e.g. "Vegetables" */
  name: string;
}

export interface Product {
  id: string;
  name: string;
  /** Category slug (see Category.id) */
  category: string;
  unit: Unit;
  /** Price per unit in whole rupees */
  price: number;
  /** Minimum order quantity; cart steps by this amount */
  minOrderQty: number;
  /** Available stock in units */
  stock: number;
  /** Sourcing origin, e.g. "Kurnool, Andhra Pradesh" */
  origin: string;
  active: boolean;
  imageUrl?: string;
}

/** Payload to create a catalog product (admin inventory). */
export type ProductInput = Omit<Product, "id">;

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  businessName?: string;
  /** Set during phone onboarding: Kirana store / Restaurant / Hotel / … */
  businessType?: string;
  city?: string;
  address?: string;
  pincode?: string;
  /** Geocoded pin for the saved delivery address (map picker). */
  lat?: number;
  lng?: number;
  /** Address label, e.g. Home / Work / Other. */
  addressLabel?: string;
  gstin?: string;
  createdAt: string;
  /** Cart contents, synced to this account only — never shared across
   *  accounts on the same device (see CartProvider). */
  cart?: StoredCartLine[];
  /** Display preferences, synced to this account instead of localStorage —
   *  so they follow the buyer across devices/browsers instead of resetting
   *  every time they sign in somewhere new. Unset = default (dark, English). */
  theme?: "dark" | "light";
  lang?: "en" | "hi" | "te" | "mr";
  /** Admin dashboard "Manage" tiles the admin has pinned to the front. */
  pinnedTiles?: string[];
  /** Staff only: access revoked without deleting the person's history. */
  disabled?: boolean;
}

/** Cart line as persisted server-side: just the productId + qty, rehydrated
 *  against the live catalog on load so price/stock are never stale. */
export interface StoredCartLine {
  productId: string;
  qty: number;
}

/** Address payload captured during onboarding / address edit (map picker). */
export interface ProfileSetupInput {
  name?: string;
  businessName?: string;
  businessType?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  addressLabel?: string;
}

export interface DeliveryDetails {
  name: string;
  phone: string;
  city: string;
  address: string;
  pincode: string;
  /** Geocoded delivery pin (from the map picker), carried onto the order. */
  lat?: number;
  lng?: number;
  label?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  unit: Unit;
  /** Unit price captured at order time */
  price: number;
  qty: number;
  lineTotal: number;
  imageUrl?: string;
}

export interface Order {
  id: string;
  /** Human-facing ref: ORD-YYYYMMDD-XXXXXX */
  orderNumber: string;
  buyerId: string;
  /** Denormalized for admin lists (buyer's business name) */
  businessName: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  delivery: DeliveryDetails;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the order is marked DELIVERED; used for the return window. */
  deliveredAt?: string;
  /** Refund amount (in rupees) after a return is marked REFUNDED. */
  refundAmount?: number;
  /** ISO timestamp when the refund was processed. */
  refundedAt?: string;
  /** Adjusted invoice number generated for the refund. */
  adjustedInvoiceNumber?: string;
  /** Delivery executive assigned to run this order. */
  driverId?: string;
  /** Denormalised for the admin order list. */
  driverName?: string;
  assignedAt?: string;
  /** Door-side rejection raised by the driver at handover, if any. */
  adjustment?: DeliveryAdjustment;
}

/** One rejected line, captured at the door before money changes hands. */
export interface AdjustmentLine {
  productId: string;
  name: string;
  unit: Unit;
  /** How much of the delivered quantity the buyer refused. */
  rejectedQty: number;
  unitPrice: number;
  /** rejectedQty * unitPrice */
  lineRefund: number;
}

export type AdjustmentStatus = "AUTO_APPROVED" | "PENDING" | "APPROVED" | "REJECTED";

/**
 * A door-side quantity adjustment: the buyer inspects the goods at handover
 * and refuses part of the delivery, the driver photographs it, and the
 * payable amount drops BEFORE cash changes hands. There is no post-delivery
 * return path — this is the only way an order's value can be reduced.
 *
 * Either outcome bills the buyer only for what they kept. The difference is
 * internal: APPROVED means our produce was genuinely bad, so the refused
 * stock is a write-off; REJECTED means it was saleable, so it returns to
 * inventory and no loss is recorded.
 */
export interface DeliveryAdjustment {
  lines: AdjustmentLine[];
  /** Sum of lineRefund — the amount taken off the bill. */
  totalRefund: number;
  reason: string;
  /** Photo evidence captured at the door (data URLs or storage URLs). */
  photos: string[];
  status: AdjustmentStatus;
  /** Driver user id. */
  raisedBy: string;
  raisedByName?: string;
  raisedAt: string;
  /** Admin who approved/rejected — absent when auto-approved under the limit. */
  decidedBy?: string;
  decidedAt?: string;
  /** Admin's note when rejecting. */
  decisionNote?: string;
}

/** Aggregated buyer view for the admin "Customers" screen. */
export interface Customer {
  id: string;
  name: string;
  businessName?: string;
  phone: string;
  city?: string;
  orderCount: number;
  totalSpent: number;
}

/** A single line in a cart (qty is in units, stepped by product.minOrderQty). */
export interface CartLine {
  product: Product;
  qty: number;
}

export interface AdminStats {
  revenue: number;
  orderCount: number;
  productCount: number;
  activeProductCount: number;
  customerCount: number;
  lowStockCount: number;
  ordersByStatus: Record<OrderStatus, number>;
}

/** Payload to create an order (what the checkout sheet submits). */
export interface CreateOrderInput {
  items: { productId: string; qty: number }[];
  delivery: DeliveryDetails;
  paymentMethod: PaymentMethod;
  paid: boolean;
}

