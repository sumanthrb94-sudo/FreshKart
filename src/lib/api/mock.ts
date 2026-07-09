import type {
  AdminStats,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderStatus,
  OrderItem,
  Product,
  ProductInput,
  User,
} from "@/lib/types";
import { generateOrderNumber } from "@/lib/format";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { DataSource, ApiError } from "./datasource";
import { store } from "./mock-store";

/** Minimal delay for UI loading state realism in demo mode. */
function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let orderSeq = 0;

export class MockDataSource implements DataSource {
  // --- Auth ---------------------------------------------------------------
  // This mock backend is for catalog/order demo data only. It does not model
  // auth because the production app uses Firebase Phone OTP / Google sign-in.

  async login({ email, password }: { email: string; password: string }): Promise<User> {
    const expected = store.get().credentials[email];
    if (!expected || expected !== password) {
      throw new ApiError("Invalid email or password.", 401);
    }
    const user = store.get().users.find((u) => u.email === email);
    if (!user) throw new ApiError("User not found.", 404);
    return delay(structuredClone(user));
  }

  async updateProfile(userId: string, patch: Partial<User>): Promise<User> {
    let updated: User | null = null;
    store.mutate((s) => {
      const u = s.users.find((x) => x.id === userId);
      if (!u) return;
      // email + role are immutable from the profile screen
      Object.assign(u, patch, { email: u.email, role: u.role, id: u.id });
      updated = u;
    });
    if (!updated) throw new ApiError("User not found.", 404);
    return delay(structuredClone(updated));
  }

  // --- Catalog ------------------------------------------------------------
  async listProducts(): Promise<Product[]> {
    return delay(structuredClone(store.get().products));
  }

  async getProduct(id: string): Promise<Product | null> {
    const p = store.get().products.find((x) => x.id === id) ?? null;
    return delay(p ? structuredClone(p) : null);
  }

  async updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
    let updated: Product | null = null;
    store.mutate((s) => {
      const p = s.products.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p, patch, { id: p.id });
      updated = p;
    });
    if (!updated) throw new ApiError("Product not found.", 404);
    return delay(structuredClone(updated));
  }

  async createProduct(input: ProductInput): Promise<Product> {
    let created: Product | null = null;
    store.mutate((s) => {
      const id = `prod-${Date.now()}-${s.products.length + 1}`;
      const product: Product = { ...input, id };
      s.products.push(product);
      created = product;
    });
    return delay(structuredClone(created!), 200);
  }

  // --- Orders -------------------------------------------------------------
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<Order> {
    if (input.paymentMethod === "CREDIT") {
      throw new ApiError("Business credit is not available.");
    }
    if (!isDailyPriceUpdatePublished(store.get().dailyPrices?.publishedAt)) {
      throw new ApiError(
        "Getting best live prices for you. Orders open after today's prices are published."
      );
    }
    let created: Order | null = null;
    let error: string | null = null;
    store.mutate((s) => {
      const buyer = s.users.find((u) => u.id === buyerId);
      if (!buyer) {
        error = "You must be signed in to place an order.";
        return;
      }
      if (!input.items.length) {
        error = "Your cart is empty.";
        return;
      }
      const items: OrderItem[] = [];
      for (const line of input.items) {
        const p = s.products.find((x) => x.id === line.productId);
        if (!p) {
          error = `Product no longer available.`;
          return;
        }
        if (line.qty > p.stock) {
          error = `Only ${p.stock} ${p.unit} of ${p.name} left in stock.`;
          return;
        }
        items.push({
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          qty: line.qty,
          lineTotal: p.price * line.qty,
          imageUrl: p.imageUrl,
        });
      }
      // Reserve stock
      for (const line of input.items) {
        const p = s.products.find((x) => x.id === line.productId)!;
        p.stock -= line.qty;
      }
      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      const now = new Date();
      const id = `order-${Date.now()}-${++orderSeq}`;
      const order: Order = {
        id,
        orderNumber: generateOrderNumber(id, now),
        buyerId,
        businessName: input.delivery.name || buyer.businessName || buyer.name,
        items,
        status: "CONFIRMED", // Orders are auto-confirmed — pre-order for next-day delivery
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paid ? "PAID" : "UNPAID",
        subtotal,
        deliveryFee: 0,
        total: subtotal,
        delivery: input.delivery,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      s.orders.unshift(order);
      created = order;
    });
    if (error) throw new ApiError(error, 400);
    // Fast return — no artificial delay for order creation (was 600ms)
    return structuredClone(created!);
  }

  /**
   * Real-time subscription to mock order changes.
   * Fires immediately and on every mutation.
   */
  subscribeOrders(buyerId?: string, cb?: (orders: Order[]) => void): () => void {
    const deliver = () => {
      const all = store.get().orders;
      const list = buyerId ? all.filter((o) => o.buyerId === buyerId) : all;
      const sorted = [...list].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
      );
      cb?.(structuredClone(sorted));
    };
    // Fire immediately with current data
    deliver();
    // Subscribe to store mutations
    return store.subscribe(deliver);
  }

  async listOrders(buyerId?: string): Promise<Order[]> {
    const all = store.get().orders;
    const list = buyerId ? all.filter((o) => o.buyerId === buyerId) : all;
    const sorted = [...list].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    );
    return delay(structuredClone(sorted));
  }

  async getOrder(id: string): Promise<Order | null> {
    const o = store.get().orders.find((x) => x.id === id) ?? null;
    return delay(o ? structuredClone(o) : null);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    let updated: Order | null = null;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === id);
      if (!o) return;
      // Cancelling releases reserved stock back to the catalog.
      if (status === "CANCELLED" && o.status !== "CANCELLED") {
        for (const i of o.items) {
          const p = s.products.find((x) => x.id === i.productId);
          if (p) p.stock += i.qty;
        }
        o.notes = "Order cancelled — stock was released.";
      }
      o.status = status;
      o.updatedAt = new Date().toISOString();
      updated = o;
    });
    if (!updated) throw new ApiError("Order not found.", 404);
    return delay(structuredClone(updated));
  }

  /** Bulk update status for multiple orders */
  async bulkUpdateOrderStatus(ids: string[], status: OrderStatus): Promise<Order[]> {
    const updated: Order[] = [];
    store.mutate((s) => {
      for (const id of ids) {
        const o = s.orders.find((x) => x.id === id);
        if (!o) continue;
        if (status === "CANCELLED" && o.status !== "CANCELLED") {
          for (const i of o.items) {
            const p = s.products.find((x) => x.id === i.productId);
            if (p) p.stock += i.qty;
          }
        }
        o.status = status;
        o.updatedAt = new Date().toISOString();
        updated.push(structuredClone(o));
      }
    });
    return delay(updated, 200);
  }

  async cancelOrder(id: string): Promise<Order> {
    return this.updateOrderStatus(id, "CANCELLED");
  }

  async setOrderPaid(id: string, paid: boolean): Promise<Order> {
    let updated: Order | null = null;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === id);
      if (!o) return;
      o.paymentStatus = paid ? "PAID" : "UNPAID";
      o.updatedAt = new Date().toISOString();
      updated = o;
    });
    if (!updated) throw new ApiError("Order not found.", 404);
    return delay(structuredClone(updated));
  }

  // --- Admin --------------------------------------------------------------
  async listCustomers(): Promise<Customer[]> {
    const s = store.get();
    const buyers = s.users.filter((u) => u.role === "BUYER");
    const customers: Customer[] = buyers.map((b) => {
      const orders = s.orders.filter(
        (o) => o.buyerId === b.id && o.status !== "CANCELLED"
      );
      return {
        id: b.id,
        name: b.name,
        businessName: b.businessName,
        phone: b.phone,
        city: b.city,
        orderCount: orders.length,
        totalSpent: orders.reduce((sum, o) => sum + o.total, 0),
      };
    });
    return delay(customers);
  }

  async getAdminStats(): Promise<AdminStats> {
    const s = store.get();
    const nonCancelled = s.orders.filter((o) => o.status !== "CANCELLED");
    const ordersByStatus = {
      PENDING: 0,
      CONFIRMED: 0,
      PACKED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    } as AdminStats["ordersByStatus"];
    for (const o of s.orders) ordersByStatus[o.status]++;

    const stats: AdminStats = {
      revenue: nonCancelled.reduce((sum, o) => sum + o.total, 0),
      orderCount: s.orders.length,
      productCount: s.products.length,
      activeProductCount: s.products.filter((p) => p.active).length,
      customerCount: s.users.filter((u) => u.role === "BUYER").length,
      lowStockCount: s.products.filter((p) => p.active && p.stock <= p.minOrderQty * 2)
        .length,
      ordersByStatus,
    };
    return delay(stats);
  }

  async getUser(id: string): Promise<User | null> {
    const u = store.get().users.find((x) => x.id === id) ?? null;
    return delay(u ? structuredClone(u) : null);
  }

  // --- Settings -------------------------------------------------------------
  async getDailyPricesSettings(): Promise<DailyPricesSettings | null> {
    return delay(structuredClone(store.get().dailyPrices) ?? null);
  }

  async publishDailyPrices(userId: string): Promise<DailyPricesSettings> {
    const settings: DailyPricesSettings = {
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    };
    store.mutate((s) => {
      s.dailyPrices = settings;
    });
    return delay(structuredClone(settings));
  }
}
