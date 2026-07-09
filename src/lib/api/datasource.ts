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
   * Optional: sign in with Google (popup). Returns the existing profile, or
   * null when the Google account is new and still needs the "set up shop" step.
   */
  signInWithGoogle?(): Promise<User | null>;
  /**
   * Optional: email/password sign-in (used by mock/demo mode). Returns the
   * authenticated user profile.
   */
  login?(credentials: { email: string; password: string }): Promise<User>;

  // --- Catalog ------------------------------------------------------------
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Admin: edit any product field (price / stock / active / details). */
  updateProduct(id: string, patch: Partial<Product>): Promise<Product>;
  /** Admin: add a new product to the catalog. */
  createProduct(input: ProductInput): Promise<Product>;

  // --- Orders -------------------------------------------------------------
  createOrder(buyerId: string, input: CreateOrderInput): Promise<Order>;
  /** buyerId omitted → all orders (admin). */
  listOrders(buyerId?: string): Promise<Order[]>;
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
  /** Admin: mark an order paid / unpaid (COD / credit settlement). */
  setOrderPaid(id: string, paid: boolean): Promise<Order>;

  // --- Admin --------------------------------------------------------------
  listCustomers(): Promise<Customer[]>;
  getAdminStats(): Promise<AdminStats>;
  /** Admin: read any user's full profile. */
  getUser(id: string): Promise<User | null>;

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
