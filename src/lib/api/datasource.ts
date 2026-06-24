import type {
  AdminStats,
  CreateOrderInput,
  Credentials,
  Customer,
  Order,
  OrderStatus,
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
