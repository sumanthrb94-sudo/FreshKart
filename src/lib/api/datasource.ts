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

/**
 * The contract every backend must satisfy. The UI depends ONLY on this
 * interface — never on a concrete implementation. Today it is fulfilled by
 * `MockDataSource` (in-memory + localStorage); pointing `NEXT_PUBLIC_API_BASE_URL`
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
   * Optional: sign in with Google. Uses a popup where supported, falling back
   * to a full-page redirect where it isn't (iOS Safari, in-app browsers that
   * don't support `window.open`). Returns the existing profile, `null` when
   * the Google account is new and still needs the "set up shop" step, or
   * `undefined` when the browser navigated away for the redirect fallback
   * (the result arrives later via `completeGoogleRedirect`).
   */
  signInWithGoogle?(): Promise<User | null | undefined>;
  /**
   * Optional: pick up the result of a Google sign-in that continued via
   * full-page redirect. Call once on app load. Returns `null` when there is
   * no pending redirect result, or `{ user }` when one just completed
   * (`user` is `null` for a brand-new account still needing "set up shop").
   */
  completeGoogleRedirect?(): Promise<{ user: User | null } | null>;
  /**
   * Optional: email/password sign-in (used by mock/demo mode). Returns the
   * authenticated user profile.
   */
  login?(credentials: { email: string; password: string }): Promise<User>;

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

  // --- Settings -------------------------------------------------------------
  /** Read the daily price-update gate status (world-readable). */
  getDailyPricesSettings(): Promise<DailyPricesSettings | null>;
  /** Admin: mark today's prices as published. */
  publishDailyPrices(userId: string): Promise<DailyPricesSettings>;
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
