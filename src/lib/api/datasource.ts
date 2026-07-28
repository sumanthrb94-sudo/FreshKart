import type {
  AdminStats,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderStatus,
  ProfileSetupInput,
  Product,
  ProductInput,
  StoreOverride,
  StoreSettings,
  User,
} from "@/lib/types";
import type {
  CreateReturnInput,
  ReturnRequest,
  ReturnStatus,
} from "@/lib/returns";
import type {
  CreateSupportTicketInput,
  SupportTicket,
  TicketSender,
} from "@/lib/support-tickets";
import type { Coupon } from "@/lib/coupons";
import type { InAppNotification, InAppNotificationType } from "@/lib/in-app-notifications";

/**
 * The contract every backend must satisfy. The UI depends ONLY on this
 * interface — never on a concrete implementation. Today it is fulfilled by
 * `MockDataSource` (pure in-memory, dev/demo only); pointing `NEXT_PUBLIC_API_BASE_URL`
 * at a GCP service swaps in `HttpDataSource` with zero UI changes.
 *
 * The REST endpoints in `docs/BACKEND.md` map 1:1 onto these methods.
 */
export interface DataSource {
  // --- Auth ---------------------------------------------------------------
  // Phone OTP and Google sign-in are the only supported auth methods.
  // (Phone is handled directly by firebase/auth; Google via signInWithGoogle.)
  updateProfile(userId: string, patch: Partial<User>): Promise<User>;
  /**
   * Optional: end the backend session (e.g. Firebase signOut). Adapters that
   * keep no server session (mock / simple HTTP) may omit this.
   */
  logout?(): Promise<void>;
  /**
   * Optional: subscribe to backend-managed auth state (e.g. Firebase
   * onAuthStateChanged). When provided, it is treated as the source of truth
   * for the current user. Returns an unsubscribe function.
   */
  subscribeAuth?(cb: (user: User | null) => void): () => void;
  /**
   * Optional: read the currently signed-in user's profile (e.g. after a phone
   * OTP confirm). Returns null if signed in but no profile exists yet.
   */
  getCurrentUser?(): Promise<User | null>;
  /**
   * Optional: create/complete the signed-in user's profile (phone onboarding
   * "set up your shop" step). The new user is a BUYER.
   */
  completeProfile?(input: ProfileSetupInput): Promise<User>;
  /**
   * Optional: email/password sign-in (used by mock/demo mode). Returns the
   * authenticated user profile.
   */
  login?(credentials: { email: string; password: string }): Promise<User>;
  /**
   * Optional: complete admin sign-in on the separate `/admin-login` route.
   * The buyer-side phone OTP flow must already have verified the currently
   * signed-in Firebase user; this checks their phone against the admin
   * allowlist and either promotes/creates their profile as ADMIN, or signs
   * them out and throws if the number isn't authorized. Phone is the only
   * source of truth for identity — there is no separate admin credential.
   */
  completeAdminLogin?(): Promise<User>;

  // --- Catalog ------------------------------------------------------------
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Admin: edit any product field (price / stock / active / details). */
  updateProduct(
    id: string,
    patch: Partial<Omit<Product, "imageUrl">> & { imageUrl?: string | null }
  ): Promise<Product>;
  /** Admin: add a new product to the catalog. */
  createProduct(input: ProductInput): Promise<Product>;
  /** Admin: bulk update prices for the daily price sheet. */
  updateProductPrices(updates: { id: string; price: number }[]): Promise<Product[]>;

  // --- Orders -------------------------------------------------------------
  createOrder(buyerId: string, input: CreateOrderInput): Promise<Order>;
  /** buyerId omitted → all orders (admin). */
  listOrders(buyerId?: string): Promise<Order[]>;
  /**
   * Admin: orders created in the half-open instant range [startIso, endIso).
   * Both bounds are UTC ISO-8601 strings as produced by `getIstBusinessDayRange()`.
   * Powers the daily dashboard totals and the packing report.
   *
   * Deliberately does NOT filter by status: adding one would turn the
   * single-field range into a composite query (manual index required) for a
   * result set already small enough to filter in JS.
   */
  listOrdersByRange(startIso: string, endIso: string): Promise<Order[]>;
  /**
   * Real-time subscription to order changes. Fires immediately with current
   * data, then on every create/update/delete. Used by admin dashboard for
   * instant new-order notifications without page refresh.
   */
  subscribeOrders?(buyerId?: string, cb?: (orders: Order[]) => void): () => void;
  getOrder(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;
  /** Bulk update status for multiple orders at once (morning delivery batch processing). */
  bulkUpdateOrderStatus(ids: string[], status: OrderStatus): Promise<Order[]>;
  cancelOrder(id: string): Promise<Order>;
  /** Admin: mark an order paid / unpaid (COD settlement). */
  setOrderPaid(id: string, paid: boolean): Promise<Order>;

  // --- Admin --------------------------------------------------------------
  listCustomers(): Promise<Customer[]>;
  getAdminStats(): Promise<AdminStats>;
  /** Admin: read any user's full profile. */
  getUser(id: string): Promise<User | null>;

  // --- Returns --------------------------------------------------------------
  /** buyerId omitted → all returns (admin). */
  listReturns(buyerId?: string): Promise<ReturnRequest[]>;
  /**
   * Real-time subscription to return changes. Fires immediately with current
   * data, then on every create/update/delete. Used by admin for instant
   * new-return-request notifications.
   */
  subscribeReturns?(buyerId?: string, cb?: (returns: ReturnRequest[]) => void): () => void;
  getReturn(id: string): Promise<ReturnRequest | null>;
  createReturn(input: CreateReturnInput): Promise<ReturnRequest>;
  updateReturnStatus(id: string, status: ReturnStatus): Promise<ReturnRequest>;
  addReturnMessage(id: string, sender: "buyer" | "admin", text: string): Promise<ReturnRequest>;
  updateReturnAdminNotes(id: string, notes: string): Promise<ReturnRequest>;
  /**
   * Optional: heartbeat a self-expiring "is typing" signal on a return
   * thread (see lib/typing-indicator.ts — TTL-based, no explicit "stopped
   * typing" call needed). Best-effort: callers must never let this failing
   * block or surface an error for an otherwise-successful message send.
   */
  setReturnTyping?(id: string, sender: "buyer" | "admin"): Promise<void>;
  /**
   * Optional: buyer-triggered nudge on a REJECTED return asking an admin to
   * take another look. Does NOT reopen the return itself — only an admin
   * transition (REJECTED → REQUESTED) does that; this just raises a flag
   * (`reopenRequestedAt`) and appends a buyer message so the ask is visible
   * in both the admin's return list and the thread.
   */
  requestReturnReopen?(id: string): Promise<ReturnRequest>;

  // --- Support tickets --------------------------------------------------------
  /** buyerId omitted → all tickets (admin). */
  listSupportTickets(buyerId?: string): Promise<SupportTicket[]>;
  /**
   * Real-time subscription to ticket changes, same shape as subscribeOrders /
   * subscribeReturns. Used by admin for instant "needs a human" alerts.
   */
  subscribeSupportTickets?(buyerId?: string, cb?: (tickets: SupportTicket[]) => void): () => void;
  getSupportTicket(id: string): Promise<SupportTicket | null>;
  /**
   * Returns the buyer's current OPEN ticket, creating one (seeded with the
   * assistant greeting) if none exists. At most one OPEN ticket per buyer —
   * this is the single entry point the AI chat widget calls on open.
   */
  getOrCreateSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket>;
  addSupportTicketMessage(
    id: string,
    sender: Extract<TicketSender, "buyer" | "admin" | "assistant">,
    text: string,
    suggestions?: string[]
  ): Promise<SupportTicket>;
  /** Buyer-triggered: adds a system "connected to support" message and flags the ticket for a human. */
  escalateSupportTicket(id: string): Promise<SupportTicket>;
  /** Ends the conversation — locks the thread (mirrors return REJECTED/COMPLETED). */
  closeSupportTicket(id: string): Promise<SupportTicket>;
  /** Reopens a closed conversation so admin (and the buyer) can reply again. */
  reopenSupportTicket(id: string): Promise<SupportTicket>;
  /**
   * Optional: heartbeat a self-expiring "is typing" signal on a support
   * ticket (see lib/typing-indicator.ts). Same best-effort contract as
   * setReturnTyping — never let a failure here interrupt messaging.
   */
  setSupportTicketTyping?(id: string, sender: "buyer" | "admin"): Promise<void>;

  // --- Coupons ----------------------------------------------------------------
  /** World-readable — buyers see active promo codes; admin manages them. */
  listCoupons(): Promise<Coupon[]>;
  /** Admin: create a new coupon. */
  createCoupon(input: Omit<Coupon, "id" | "usageCount" | "createdAt" | "updatedAt">): Promise<Coupon>;
  /** Admin: edit any coupon field (discount, validity, active flag, etc). */
  updateCoupon(id: string, patch: Partial<Coupon>): Promise<Coupon>;
  /** Admin: remove a coupon. */
  deleteCoupon(id: string): Promise<void>;

  // --- In-app notifications ----------------------------------------------------
  /** This buyer's notification history, newest first. */
  listInAppNotifications(userId: string): Promise<InAppNotification[]>;
  /** Real-time subscription, same shape as subscribeOrders/subscribeReturns. */
  subscribeInAppNotifications?(userId: string, cb: (notifs: InAppNotification[]) => void): () => void;
  addInAppNotification(
    userId: string,
    type: InAppNotificationType,
    title: string,
    message: string,
    options?: { actionUrl?: string; orderId?: string }
  ): Promise<InAppNotification>;
  markInAppNotificationRead(userId: string, id: string): Promise<void>;
  markAllInAppNotificationsRead(userId: string): Promise<void>;
  deleteInAppNotification(userId: string, id: string): Promise<void>;
  clearAllInAppNotifications(userId: string): Promise<void>;

  // --- Settings -------------------------------------------------------------
  /** Read the daily price-update gate status (world-readable). */
  getDailyPricesSettings(): Promise<DailyPricesSettings | null>;
  /** Admin: mark today's prices as published. */
  publishDailyPrices(userId: string): Promise<DailyPricesSettings>;
  /**
   * Optional — admin: take today's prices back down, returning the shop to
   * "waiting for tomorrow's prices". The counterpart to publishDailyPrices,
   * for when a price sheet goes out wrong and ordering must stop until it's
   * corrected.
   */
  unpublishDailyPrices?(): Promise<void>;
  /**
   * Optional: read the admin store-open override (world-readable — buyers
   * need it to know whether the shop is live). Null means never set, which
   * is treated as AUTO.
   */
  getStoreSettings?(): Promise<StoreSettings | null>;
  /** Optional — admin: force the shop open/closed, or hand control back to
   *  the 8 AM – 9 PM schedule. */
  setStoreOverride?(userId: string, override: StoreOverride): Promise<StoreSettings>;

  // --- Danger zone ------------------------------------------------------------
  /**
   * Optional: admin-only reset for test/demo data. Deletes every buyer
   * account plus their orders, returns, support tickets, and notifications —
   * so mobile numbers that were used for testing start fresh from onboarding
   * next time they sign in. Admin accounts, the product catalog, prices, and
   * coupons are left untouched so the shop keeps working right after a wipe.
   */
  wipeDatabase?(): Promise<WipeResult>;
}

/** Summary of what a wipeDatabase() call actually deleted. */
export interface WipeResult {
  deletedUsers: number;
  deletedOrders: number;
  deletedReturns: number;
  deletedTickets: number;
  deletedNotifications: number;
}

/** Thrown for expected, user-facing failures (bad creds, validation, etc.). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
