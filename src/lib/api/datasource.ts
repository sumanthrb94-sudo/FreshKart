import type {
  AdminStats,
  CreateOrderInput,
  Credentials,
  Customer,
  Order,
  OrderStatus,
  ProfileSetupInput,
  Product,
  RegisterInput,
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
  login(creds: Credentials): Promise<User>;
  register(input: RegisterInput): Promise<User>;
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

  // --- Catalog ------------------------------------------------------------
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Admin: edit price / stock / active. */
  updateProduct(id: string, patch: Partial<Product>): Promise<Product>;

  // --- Orders -------------------------------------------------------------
  createOrder(buyerId: string, input: CreateOrderInput): Promise<Order>;
  /** buyerId omitted → all orders (admin). */
  listOrders(buyerId?: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;
  cancelOrder(id: string): Promise<Order>;

  // --- Admin --------------------------------------------------------------
  listCustomers(): Promise<Customer[]>;
  getAdminStats(): Promise<AdminStats>;
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
