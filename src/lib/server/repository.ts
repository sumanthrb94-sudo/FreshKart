import type {
  AdminStats,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  User,
} from "@/lib/types";
import { generateOrderNumber, MIN_ORDER_TOTAL_QTY } from "@/lib/format";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { calculateDeliveryFee } from "@/lib/delivery";
import { ORDERS, PRODUCTS, USERS } from "@/lib/mock-data";

/**
 * Server-side, in-memory reference backend used by the Next.js route handlers
 * in `src/app/api/*`. It is the EXECUTABLE SPEC for the REST contract in
 * docs/BACKEND.md: a real GCP service (Cloud Run + Cloud SQL/Firestore) should
 * reproduce this behavior, swapping these arrays for a persistent database.
 *
 * NOTE: state lives in module memory, so it resets on every cold start and is
 * not shared across serverless instances. That's fine for a reference/demo —
 * it is exactly the layer you replace with a real datastore.
 */

class RepoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export { RepoError };

const products: Product[] = structuredClone(PRODUCTS);
const orders: Order[] = structuredClone(ORDERS);
const users: User[] = structuredClone(USERS);
let dailyPrices: DailyPricesSettings | null = null;
let seq = 0;

export const repository = {
  // This reference backend does not model authentication. The production app
  // uses Firebase Phone OTP / Google sign-in directly from the browser.

  updateProfile(userId: string, patch: Partial<User>): User {
    const u = users.find((x) => x.id === userId);
    if (!u) throw new RepoError("User not found.", 404);
    Object.assign(u, patch, { id: u.id, email: u.email, role: u.role });
    return u;
  },

  listProducts(): Product[] {
    return products;
  },

  getProduct(id: string): Product | null {
    return products.find((p) => p.id === id) ?? null;
  },

  updateProduct(id: string, patch: Partial<Product>): Product {
    const p = products.find((x) => x.id === id);
    if (!p) throw new RepoError("Product not found.", 404);
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.category !== undefined) p.category = patch.category;
    if (patch.unit !== undefined) p.unit = patch.unit;
    if (patch.price !== undefined) p.price = patch.price;
    if (patch.minOrderQty !== undefined) p.minOrderQty = patch.minOrderQty;
    if (patch.stock !== undefined) p.stock = patch.stock;
    if (patch.origin !== undefined) p.origin = patch.origin;
    if (patch.active !== undefined) p.active = patch.active;
    if (patch.imageUrl !== undefined) p.imageUrl = patch.imageUrl;
    return p;
  },

  updateProductPrices(updates: { id: string; price: number }[]): Product[] {
    const result: Product[] = [];
    for (const u of updates) {
      const p = products.find((x) => x.id === u.id);
      if (!p) continue;
      p.price = u.price;
      result.push(p);
    }
    return result;
  },

  createOrder(buyerId: string, input: CreateOrderInput): Order {
    if (input.paymentMethod === "CREDIT") {
      throw new RepoError("Business credit is not available.");
    }
    if (!isDailyPriceUpdatePublished(dailyPrices?.publishedAt)) {
      throw new RepoError(
        "Getting best live prices for you. Orders open after today's prices are published."
      );
    }
    const buyer = users.find((u) => u.id === buyerId);
    if (!buyer) throw new RepoError("Buyer not found.", 404);
    if (!input.items?.length) throw new RepoError("Your cart is empty.");
    const totalQty = input.items.reduce((sum, i) => sum + i.qty, 0);
    if (totalQty < MIN_ORDER_TOTAL_QTY) {
      throw new RepoError(`Minimum order is ${MIN_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`);
    }

    const items: OrderItem[] = input.items.map((line) => {
      const p = products.find((x) => x.id === line.productId);
      if (!p) throw new RepoError("Product no longer available.");
      if (line.qty > p.stock)
        throw new RepoError(`Only ${p.stock} ${p.unit} of ${p.name} left in stock.`);
      return {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        price: p.price,
        qty: line.qty,
        lineTotal: p.price * line.qty,
        imageUrl: p.imageUrl,
      };
    });
    for (const line of input.items) {
      const p = products.find((x) => x.id === line.productId)!;
      p.stock -= line.qty;
    }

    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const deliveryFee = calculateDeliveryFee(subtotal);
    const now = new Date();
    const id = `order-${now.getTime()}-${++seq}`;
    const order: Order = {
      id,
      orderNumber: generateOrderNumber(id, now),
      buyerId,
      businessName: input.delivery.name || buyer.businessName || buyer.name,
      items,
      status: "PENDING",
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paid ? "PAID" : "UNPAID",
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      delivery: input.delivery,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    orders.unshift(order);
    return order;
  },

  listOrders(buyerId?: string): Order[] {
    const list = buyerId ? orders.filter((o) => o.buyerId === buyerId) : orders;
    return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  getOrder(id: string): Order | null {
    return orders.find((o) => o.id === id) ?? null;
  },

  updateOrderStatus(id: string, status: OrderStatus): Order {
    const o = orders.find((x) => x.id === id);
    if (!o) throw new RepoError("Order not found.", 404);
    if (status === "CANCELLED" && o.status !== "CANCELLED") {
      for (const i of o.items) {
        const p = products.find((x) => x.id === i.productId);
        if (p) p.stock += i.qty;
      }
      o.notes = "Order cancelled — stock was released.";
    }
    o.status = status;
    o.updatedAt = new Date().toISOString();
    return o;
  },

  listCustomers(): Customer[] {
    return users
      .filter((u) => u.role === "BUYER")
      .map((b) => {
        const os = orders.filter((o) => o.buyerId === b.id && o.status !== "CANCELLED");
        return {
          id: b.id,
          name: b.name,
          businessName: b.businessName,
          phone: b.phone,
          city: b.city,
          orderCount: os.length,
          totalSpent: os.reduce((s, o) => s + o.total, 0),
        };
      });
  },

  getDailyPricesSettings(): DailyPricesSettings | null {
    return dailyPrices;
  },

  publishDailyPrices(userId: string): DailyPricesSettings {
    dailyPrices = {
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    };
    return dailyPrices;
  },

  getAdminStats(): AdminStats {
    const ordersByStatus = {
      PENDING: 0,
      CONFIRMED: 0,
      PACKED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    } as AdminStats["ordersByStatus"];
    for (const o of orders) ordersByStatus[o.status]++;
    const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
    return {
      revenue: nonCancelled.reduce((s, o) => s + o.total, 0),
      orderCount: orders.length,
      productCount: products.length,
      activeProductCount: products.filter((p) => p.active).length,
      customerCount: users.filter((u) => u.role === "BUYER").length,
      lowStockCount: products.filter((p) => p.active && p.stock <= p.minOrderQty * 2).length,
      ordersByStatus,
    };
  },
};
