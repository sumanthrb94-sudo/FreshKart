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
import type {
  CreateReturnInput,
  ReturnRequest,
  ReturnStatus,
  ReturnMessage,
} from "@/lib/returns";
import { RETURN_REASON_LABELS, generateAdjustedInvoiceNumber, buildStatusChangeMessage } from "@/lib/returns";
import { openNewTicket, buildTicketMessage, ESCALATION_NOTICE } from "@/lib/support-tickets";
import type { CreateSupportTicketInput, SupportTicket, TicketSender } from "@/lib/support-tickets";
import { generateOrderNumber, MIN_ORDER_TOTAL_QTY, MAX_ORDER_TOTAL_QTY } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { filterOrdersByRange, isDailyPriceUpdatePublished } from "@/lib/time";
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

  async updateProduct(
    id: string,
    patch: Partial<Omit<Product, "imageUrl">> & { imageUrl?: string | null }
  ): Promise<Product> {
    let updated: Product | null = null;
    store.mutate((s) => {
      const p = s.products.find((x) => x.id === id);
      if (!p) return;
      const normalized = { ...patch } as Partial<Product> & { imageUrl?: string | null };
      if (normalized.imageUrl === null) {
        delete normalized.imageUrl;
      }
      Object.assign(p, normalized as Partial<Product>, { id: p.id });
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

  async updateProductPrices(updates: { id: string; price: number }[]): Promise<Product[]> {
    const result: Product[] = [];
    store.mutate((s) => {
      for (const u of updates) {
        const p = s.products.find((x) => x.id === u.id);
        if (p) {
          p.price = u.price;
          result.push(p);
        }
      }
    });
    return delay(structuredClone(result));
  }

  // --- Orders -------------------------------------------------------------
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<Order> {
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
      const totalQty = input.items.reduce((sum, i) => sum + i.qty, 0);
      if (totalQty < MIN_ORDER_TOTAL_QTY) {
        error = `Minimum order is ${MIN_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`;
        return;
      }
      if (totalQty > MAX_ORDER_TOTAL_QTY) {
        error = `Maximum order is ${MAX_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`;
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
      const deliveryFee = calculateDeliveryFee(subtotal);
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
        deliveryFee,
        total: subtotal + deliveryFee,
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

  async listOrdersByRange(startIso: string, endIso: string): Promise<Order[]> {
    const list = filterOrdersByRange(store.get().orders, startIso, endIso);
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
      if (status === "DELIVERED" && o.status !== "DELIVERED") {
        o.deliveredAt = new Date().toISOString();
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
        if (status === "DELIVERED" && o.status !== "DELIVERED") {
          o.deliveredAt = new Date().toISOString();
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

  // --- Returns --------------------------------------------------------------
  async listReturns(buyerId?: string): Promise<ReturnRequest[]> {
    const all = store.get().returns;
    const list = buyerId ? all.filter((r) => r.buyerId === buyerId) : all;
    const sorted = [...list].sort(
      (a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt)
    );
    return delay(structuredClone(sorted));
  }

  async getReturn(id: string): Promise<ReturnRequest | null> {
    const r = store.get().returns.find((x) => x.id === id) ?? null;
    return delay(r ? structuredClone(r) : null);
  }

  async createReturn(input: CreateReturnInput): Promise<ReturnRequest> {
    const existing = store.get().returns.find((r) => r.orderId === input.orderId);
    if (existing) {
      throw new ApiError("A return request already exists for this order.", 409);
    }
    let created: ReturnRequest | null = null;
    store.mutate((s) => {
      const id = `RET-${Date.now()}-${s.returns.length + 1}`;
      const now = new Date().toISOString();
      const items = input.items.map((item) => ({
        ...item,
        lineRefund: item.returnQty * item.unitPrice,
      }));
      const totalRefund = items.reduce((sum, item) => sum + item.lineRefund, 0);
      const systemMessage: ReturnMessage = {
        id: `msg-${Date.now()}-sys`,
        sender: "system",
        text: `Return request ${id} created for order ${input.orderNumber}. Status: REQUESTED. Reason: ${RETURN_REASON_LABELS[input.reason]}. Estimated refund: Rs. ${totalRefund}.`,
        sentAt: now,
      };
      const returnReq: ReturnRequest = {
        id,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        buyerId: input.buyerId,
        businessName: input.businessName,
        buyerPhone: input.buyerPhone,
        items,
        status: "REQUESTED",
        reason: input.reason,
        notes: input.notes,
        requestedAt: now,
        totalRefund,
        adjustedInvoiceNumber: generateAdjustedInvoiceNumber(`INV-${input.orderNumber}`, 1),
        images: input.images,
        thread: [systemMessage],
      };
      s.returns.unshift(returnReq);
      created = returnReq;
    });
    return delay(structuredClone(created!), 200);
  }

  async updateReturnStatus(id: string, status: ReturnStatus): Promise<ReturnRequest> {
    let updated: ReturnRequest | null = null;
    store.mutate((s) => {
      const r = s.returns.find((x) => x.id === id);
      if (!r) return;
      const now = new Date().toISOString();
      r.status = status;
      r.updatedAt = now;
      if ((["REJECTED", "REFUNDED", "COMPLETED"] as ReturnStatus[]).includes(status)) {
        r.resolvedAt = now;
      }
      // Company policy: every status change gets its own confirmed system
      // message — the buyer shouldn't have to infer the outcome from the
      // original "Estimated refund" message.
      r.thread.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: "system",
        text: buildStatusChangeMessage(status, r.totalRefund),
        sentAt: now,
      });
      // When a refund is processed, adjust the parent order's total so the
      // customer's invoice reflects the refund immediately — mirrors
      // FirebaseDataSource.updateReturnStatus's transactional order patch.
      if (status === "REFUNDED") {
        const order = s.orders.find((o) => o.id === r.orderId);
        if (order) {
          const originalTotal = order.subtotal + order.deliveryFee;
          order.refundAmount = r.totalRefund;
          order.refundedAt = now;
          order.adjustedInvoiceNumber = r.adjustedInvoiceNumber;
          order.total = Math.max(0, originalTotal - r.totalRefund);
          order.updatedAt = now;
        }
      }
      updated = r;
    });
    if (!updated) throw new ApiError("Return request not found.", 404);
    return delay(structuredClone(updated));
  }

  async addReturnMessage(id: string, sender: "buyer" | "admin", text: string): Promise<ReturnRequest> {
    let updated: ReturnRequest | null = null;
    store.mutate((s) => {
      const r = s.returns.find((x) => x.id === id);
      if (!r) return;
      const message: ReturnMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender,
        text: text.trim(),
        sentAt: new Date().toISOString(),
      };
      r.thread.push(message);
      r.updatedAt = new Date().toISOString();
      updated = r;
    });
    if (!updated) throw new ApiError("Return request not found.", 404);
    return delay(structuredClone(updated));
  }

  async updateReturnAdminNotes(id: string, notes: string): Promise<ReturnRequest> {
    let updated: ReturnRequest | null = null;
    store.mutate((s) => {
      const r = s.returns.find((x) => x.id === id);
      if (!r) return;
      r.adminNotes = notes;
      r.updatedAt = new Date().toISOString();
      updated = r;
    });
    if (!updated) throw new ApiError("Return request not found.", 404);
    return delay(structuredClone(updated));
  }

  // --- Support tickets ------------------------------------------------------
  async listSupportTickets(buyerId?: string): Promise<SupportTicket[]> {
    const all = store.get().supportTickets;
    const list = buyerId ? all.filter((t) => t.buyerId === buyerId) : all;
    const sorted = [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return delay(structuredClone(sorted));
  }

  async getSupportTicket(id: string): Promise<SupportTicket | null> {
    const t = store.get().supportTickets.find((x) => x.id === id) ?? null;
    return delay(t ? structuredClone(t) : null);
  }

  async getOrCreateSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const existing = store.get().supportTickets.find(
      (t) => t.buyerId === input.buyerId && t.status === "OPEN"
    );
    if (existing) return delay(structuredClone(existing));

    let created: SupportTicket | null = null;
    store.mutate((s) => {
      const ticket = { ...openNewTicket(input), id: `TCK-${Date.now()}-${s.supportTickets.length + 1}` };
      s.supportTickets.unshift(ticket);
      created = ticket;
    });
    return delay(structuredClone(created!), 200);
  }

  async addSupportTicketMessage(
    id: string,
    sender: Extract<TicketSender, "buyer" | "admin" | "assistant">,
    text: string,
    suggestions?: string[]
  ): Promise<SupportTicket> {
    let updated: SupportTicket | null = null;
    store.mutate((s) => {
      const t = s.supportTickets.find((x) => x.id === id);
      if (!t) return;
      t.thread.push(buildTicketMessage(sender, text, suggestions));
      if (sender === "admin") t.needsHuman = false;
      t.updatedAt = new Date().toISOString();
      updated = t;
    });
    if (!updated) throw new ApiError("Support ticket not found.", 404);
    return delay(structuredClone(updated));
  }

  async escalateSupportTicket(id: string): Promise<SupportTicket> {
    let updated: SupportTicket | null = null;
    store.mutate((s) => {
      const t = s.supportTickets.find((x) => x.id === id);
      if (!t) return;
      t.thread.push(buildTicketMessage("system", ESCALATION_NOTICE));
      t.needsHuman = true;
      t.updatedAt = new Date().toISOString();
      updated = t;
    });
    if (!updated) throw new ApiError("Support ticket not found.", 404);
    return delay(structuredClone(updated));
  }

  async closeSupportTicket(id: string): Promise<SupportTicket> {
    let updated: SupportTicket | null = null;
    store.mutate((s) => {
      const t = s.supportTickets.find((x) => x.id === id);
      if (!t) return;
      const now = new Date().toISOString();
      t.status = "CLOSED";
      t.closedAt = now;
      t.updatedAt = now;
      updated = t;
    });
    if (!updated) throw new ApiError("Support ticket not found.", 404);
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
