import type {
  AdminStats,
  CreateOrderInput,
  Customer,
  Order,
  OrderStatus,
  Product,
  ProductInput,
  User,
} from "@/lib/types";
import { DataSource, ApiError } from "./datasource";

/**
 * Talks to a real backend over REST. Activated automatically when
 * NEXT_PUBLIC_API_BASE_URL is set (see ./index.ts). The endpoint shapes match
 * docs/BACKEND.md exactly, so a GCP Cloud Run service implementing that
 * contract is a drop-in replacement for the mock — no UI changes required.
 */
export class HttpDataSource implements DataSource {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { auth?: boolean }
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // The backend is expected to use httpOnly cookies for the session.
      credentials: "include",
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.message) message = body.message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(message, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // Phone OTP and Google sign-in are handled client-side via Firebase.
  // This HTTP backend does not expose email/password auth endpoints.

  updateProfile(userId: string, patch: Partial<User>) {
    return this.request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  listProducts() {
    return this.request<Product[]>("/products");
  }

  getProduct(id: string) {
    return this.request<Product | null>(`/products/${id}`);
  }

  updateProduct(id: string, patch: Partial<Product>) {
    return this.request<Product>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  createProduct(input: ProductInput) {
    return this.request<Product>("/products", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createOrder(buyerId: string, input: CreateOrderInput) {
    return this.request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify({ buyerId, ...input }),
    });
  }

  listOrders(buyerId?: string) {
    const qs = buyerId ? `?buyerId=${encodeURIComponent(buyerId)}` : "";
    return this.request<Order[]>(`/orders${qs}`);
  }

  getOrder(id: string) {
    return this.request<Order | null>(`/orders/${id}`);
  }

  updateOrderStatus(id: string, status: OrderStatus) {
    return this.request<Order>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  cancelOrder(id: string) {
    return this.request<Order>(`/orders/${id}/cancel`, { method: "POST" });
  }

  setOrderPaid(id: string, paid: boolean) {
    return this.request<Order>(`/orders/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ paid }),
    });
  }

  listCustomers() {
    return this.request<Customer[]>("/customers");
  }

  getAdminStats() {
    return this.request<AdminStats>("/admin/stats");
  }

  getUser(id: string) {
    return this.request<User | null>(`/users/${id}`);
  }
}
