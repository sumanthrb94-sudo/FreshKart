import type {
  AdjustmentLine,
  AdminStats,
  DeliveryAdjustment,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderStatus,
  OrderItem,
  Product,
  ProductInput,
  StoreOverride,
  StoreSettings,
  User,
} from "@/lib/types";
import { openNewTicket, buildTicketMessage, ESCALATION_NOTICE } from "@/lib/support-tickets";
import type { CreateSupportTicketInput, SupportTicket, TicketSender } from "@/lib/support-tickets";
import type { Coupon } from "@/lib/coupons";
import type { ServiceArea } from "@/lib/service-area";
import { radiusOf } from "@/lib/service-area";
import type { InAppNotification, InAppNotificationType } from "@/lib/in-app-notifications";
import { generateOrderNumber, MAX_ORDER_TOTAL_QTY } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { filterOrdersByRange, isDailyPriceUpdatePublished } from "@/lib/time";
import { effectiveOverride, getStoreStatus, nextStoreClose } from "@/lib/store-hours";
import { isWithinDriverAuthority, totalRefundOf } from "@/lib/delivery-adjustment";
import { DataSource, ApiError, type WipeResult } from "./datasource";
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
      if (totalQty > MAX_ORDER_TOTAL_QTY) {
        error = `Maximum order is ${MAX_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`;
        return;
      }
      // The shop is shut outside 8 AM – 9 PM IST unless an admin has forced
      // it live. The cart screen already knows this, but a tab left open past
      // the close would otherwise still be able to place an order — and that
      // order would join a load that was packed hours earlier.
      if (!getStoreStatus(new Date(), effectiveOverride(s.storeSettings)).isOpen) {
        error = "The shop is closed. Orders reopen at 8 AM for the next day's delivery.";
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
        // Per-product wholesale minimum — 20 kg of onion, 1 kg of leafy, and
        // so on. The quantity stepper enforces this in the cart, which is a
        // convenience, not a control: the order is created here.
        const min = p.minOrderQty ?? 1;
        if (line.qty < min) {
          error = `${p.name} is sold in a minimum of ${min} ${p.unit}.`;
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
    let blocked = false;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === id);
      if (!o) return;
      if (status === "DELIVERED" && o.paymentMethod === "COD" && o.paymentStatus !== "PAID") {
        blocked = true;
        return;
      }
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
    if (blocked) {
      throw new ApiError(
        "Cash payment must be confirmed before marking a COD order as delivered.",
        400
      );
    }
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
        if (status === "DELIVERED" && o.paymentMethod === "COD" && o.paymentStatus !== "PAID") {
          continue;
        }
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

  /**
   * Buyer-facing cancel. Once an order is with a driver the crates are on the
   * van, and cancelling would take the stop off his run with nothing telling
   * him why — from that point the office cancels it (updateOrderStatus) and
   * can tell him.
   */
  async cancelOrder(id: string): Promise<Order> {
    const existing = store.get().orders.find((o) => o.id === id);
    if (existing?.driverId && existing.status !== "DELIVERED") {
      throw new ApiError(
        "This order is already with the delivery executive. Call us to stop it, or refuse what you don't want at the door.",
        409
      );
    }
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

  // --- Delivery run ---------------------------------------------------------
  async listDriverOrders(driverId: string): Promise<Order[]> {
    const list = store
      .get()
      .orders.filter(
        (o) => o.driverId === driverId && o.status !== "CANCELLED"
      )
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return delay(structuredClone(list));
  }

  subscribeDriverOrders(driverId: string, cb: (orders: Order[]) => void): () => void {
    const emit = () => {
      const list = store
        .get()
        .orders.filter((o) => o.driverId === driverId && o.status !== "CANCELLED")
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      cb(structuredClone(list));
    };
    emit();
    return store.subscribe(emit);
  }

  async listDrivers(): Promise<User[]> {
    return delay(structuredClone(store.get().users.filter((u) => u.role === "DRIVER")));
  }

  async assignDriver(orderId: string, driverId: string, driverName: string): Promise<Order> {
    let updated: Order | null = null;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      o.driverId = driverId;
      o.driverName = driverName;
      o.assignedAt = new Date().toISOString();
      o.updatedAt = o.assignedAt;
      updated = o;
    });
    if (!updated) throw new ApiError("Order not found.", 404);
    return delay(structuredClone(updated));
  }

  async createDeliveryAdjustment(
    orderId: string,
    input: { lines: AdjustmentLine[]; reason: string; photos: string[] }
  ): Promise<Order> {
    let updated: Order | null = null;
    let error: string | null = null;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      if (o.adjustment) {
        error = "An adjustment has already been recorded for this delivery.";
        return;
      }
      const lines = input.lines.filter((l) => l.rejectedQty > 0);
      if (!lines.length) {
        error = "Select at least one item the buyer refused.";
        return;
      }
      const totalRefund = totalRefundOf(lines);
      if (totalRefund > o.total) {
        error = "The adjustment can't exceed the order value.";
        return;
      }
      const now = new Date().toISOString();
      const adjustment: DeliveryAdjustment = {
        lines,
        totalRefund,
        reason: input.reason.trim(),
        photos: input.photos,
        // Settle on the spot when it is within the driver's authority — a
        // delivery run must not block on an admin answering their phone.
        status: isWithinDriverAuthority(totalRefund, o.total) ? "AUTO_APPROVED" : "PENDING",
        raisedBy: o.driverId ?? "driver",
        raisedByName: o.driverName,
        raisedAt: now,
      };
      o.adjustment = adjustment;
      o.updatedAt = now;
      updated = o;
    });
    if (error) throw new ApiError(error, 409);
    if (!updated) throw new ApiError("Order not found.", 404);
    return delay(structuredClone(updated));
  }

  async decideDeliveryAdjustment(
    orderId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string
  ): Promise<Order> {
    let updated: Order | null = null;
    let error: string | null = null;
    store.mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      const adj = o.adjustment;
      if (!adj) {
        error = "This delivery has no adjustment to decide.";
        return;
      }
      if (adj.status !== "PENDING") {
        error = "This adjustment has already been settled.";
        return;
      }
      const now = new Date().toISOString();
      adj.status = decision;
      adj.decidedAt = now;
      if (note?.trim()) adj.decisionNote = note.trim();
      // Rejected means the produce was saleable after all, so it goes back
      // into stock. Approved is a write-off and must NOT be restocked.
      if (decision === "REJECTED") {
        for (const line of adj.lines) {
          const p = s.products.find((x) => x.id === line.productId);
          if (p) p.stock += line.rejectedQty;
        }
      }
      o.updatedAt = now;
      updated = o;
    });
    if (error) throw new ApiError(error, 409);
    if (!updated) throw new ApiError("Order not found.", 404);
    return delay(structuredClone(updated));
  }

  // --- Support tickets ------------------------------------------------------
  async listSupportTickets(buyerId?: string): Promise<SupportTicket[]> {
    const all = store.get().supportTickets;
    const list = buyerId ? all.filter((t) => t.buyerId === buyerId) : all;
    const sorted = [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return delay(structuredClone(sorted));
  }

  /** Real-time support-ticket subscription — fires immediately and on every
   *  mutation, so chat threads update live for both buyer and admin. */
  subscribeSupportTickets(buyerId?: string, cb?: (tickets: SupportTicket[]) => void): () => void {
    const deliver = () => {
      const all = store.get().supportTickets;
      const list = buyerId ? all.filter((t) => t.buyerId === buyerId) : all;
      const sorted = [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
      cb?.(structuredClone(sorted));
    };
    deliver();
    return store.subscribe(deliver);
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

  async reopenSupportTicket(id: string): Promise<SupportTicket> {
    let updated: SupportTicket | null = null;
    store.mutate((s) => {
      const t = s.supportTickets.find((x) => x.id === id);
      if (!t) return;
      const now = new Date().toISOString();
      t.status = "OPEN";
      t.closedAt = undefined;
      t.updatedAt = now;
      t.thread.push({
        id: `tm-${Date.now()}-sys`,
        sender: "system",
        text: "Conversation reopened.",
        sentAt: now,
      });
      updated = t;
    });
    if (!updated) throw new ApiError("Support ticket not found.", 404);
    return delay(structuredClone(updated));
  }

  /** Heartbeat only — deliberately does NOT touch `updatedAt`, or every
   *  keystroke would reorder the admin's ticket list mid-type. */
  async setSupportTicketTyping(id: string, sender: "buyer" | "admin"): Promise<void> {
    store.mutate((s) => {
      const t = s.supportTickets.find((x) => x.id === id);
      if (!t) return;
      if (sender === "buyer") t.buyerTypingAt = new Date().toISOString();
      else t.adminTypingAt = new Date().toISOString();
    });
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

  // --- Coupons ----------------------------------------------------------------
  async listCoupons(): Promise<Coupon[]> {
    return delay(structuredClone(store.get().coupons));
  }

  async createCoupon(
    input: Omit<Coupon, "id" | "usageCount" | "createdAt" | "updatedAt">
  ): Promise<Coupon> {
    let created: Coupon | null = null;
    store.mutate((s) => {
      const now = new Date().toISOString();
      const coupon: Coupon = { ...input, id: `coupon-${Date.now()}`, usageCount: 0, createdAt: now, updatedAt: now };
      s.coupons.push(coupon);
      created = coupon;
    });
    return delay(structuredClone(created!), 200);
  }

  async updateCoupon(id: string, patch: Partial<Coupon>): Promise<Coupon> {
    let updated: Coupon | null = null;
    store.mutate((s) => {
      const c = s.coupons.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, patch, { id: c.id, updatedAt: new Date().toISOString() });
      updated = c;
    });
    if (!updated) throw new ApiError("Coupon not found.", 404);
    return delay(structuredClone(updated));
  }

  async deleteCoupon(id: string): Promise<void> {
    store.mutate((s) => {
      s.coupons = s.coupons.filter((c) => c.id !== id);
    });
    return delay(undefined);
  }

  // --- In-app notifications ----------------------------------------------------
  private sortedNotifs(userId: string): InAppNotification[] {
    return store
      .get()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 100);
  }

  async listInAppNotifications(userId: string): Promise<InAppNotification[]> {
    return delay(structuredClone(this.sortedNotifs(userId)));
  }

  subscribeInAppNotifications(userId: string, cb: (notifs: InAppNotification[]) => void): () => void {
    const deliver = () => cb(structuredClone(this.sortedNotifs(userId)));
    deliver();
    return store.subscribe(deliver);
  }

  async addInAppNotification(
    userId: string,
    type: InAppNotificationType,
    title: string,
    message: string,
    options?: { actionUrl?: string; orderId?: string }
  ): Promise<InAppNotification> {
    let created: InAppNotification | null = null;
    store.mutate((s) => {
      const notification: InAppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        type,
        title,
        message,
        read: false,
        ...options,
        createdAt: new Date().toISOString(),
      };
      s.notifications.unshift(notification);
      created = notification;
    });
    return delay(structuredClone(created!));
  }

  async markInAppNotificationRead(userId: string, id: string): Promise<void> {
    store.mutate((s) => {
      const n = s.notifications.find((x) => x.id === id && x.userId === userId);
      if (n) n.read = true;
    });
    return delay(undefined);
  }

  async markAllInAppNotificationsRead(userId: string): Promise<void> {
    store.mutate((s) => {
      s.notifications.forEach((n) => {
        if (n.userId === userId) n.read = true;
      });
    });
    return delay(undefined);
  }

  async deleteInAppNotification(userId: string, id: string): Promise<void> {
    store.mutate((s) => {
      s.notifications = s.notifications.filter((n) => !(n.id === id && n.userId === userId));
    });
    return delay(undefined);
  }

  async clearAllInAppNotifications(userId: string): Promise<void> {
    store.mutate((s) => {
      s.notifications = s.notifications.filter((n) => n.userId !== userId);
    });
    return delay(undefined);
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

  async unpublishDailyPrices(): Promise<void> {
    store.mutate((s) => {
      s.dailyPrices = null;
    });
    return delay(undefined);
  }

  async getStoreSettings(): Promise<StoreSettings | null> {
    return delay(structuredClone(store.get().storeSettings) ?? null);
  }

  async setStoreOverride(userId: string, override: StoreOverride): Promise<StoreSettings> {
    // A forced state lapses at the next 9 PM IST, so the shop returns to its
    // schedule on its own even if nobody remembers to undo a test.
    const settings: StoreSettings = {
      override,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      ...(override === "AUTO" ? {} : { expiresAt: nextStoreClose().toISOString() }),
    };
    store.mutate((s) => {
      s.storeSettings = settings;
    });
    return delay(structuredClone(settings));
  }

  async getServiceArea(): Promise<ServiceArea | null> {
    return delay(structuredClone(store.get().serviceArea) ?? null);
  }

  async saveServiceArea(userId: string, area: ServiceArea): Promise<ServiceArea> {
    const next: ServiceArea = {
      hub: area.hub,
      radiusKm: radiusOf(area),
      pincodes: [...area.pincodes]
        .filter((p, i, all) => all.findIndex((q) => q.code === p.code) === i)
        .sort((a, b) => a.code.localeCompare(b.code)),
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
    store.mutate((s) => {
      s.serviceArea = next;
    });
    return delay(structuredClone(next));
  }

  async createDriverAccount(input: {
    name: string;
    username: string;
    phone?: string;
    password: string;
  }): Promise<User> {
    const email = `${input.username.trim().toLowerCase()}@green-basket.in`;
    if (store.get().users.some((u) => u.email === email)) {
      throw new ApiError(`The username "${input.username}" is already taken.`, 409);
    }
    const user: User = {
      id: `user-driver-${Date.now()}`,
      name: input.name,
      email,
      phone: input.phone ?? "",
      role: "DRIVER",
      businessName: "Green Basket Delivery",
      createdAt: new Date().toISOString(),
    };
    store.mutate((s) => {
      s.users.push(user);
      s.credentials[email] = input.password;
    });
    return delay(structuredClone(user));
  }

  async setDriverActive(driverId: string, active: boolean): Promise<void> {
    store.mutate((s) => {
      const u = s.users.find((x) => x.id === driverId);
      if (u) u.disabled = !active;
    });
    return delay(undefined);
  }

  // --- Danger zone ------------------------------------------------------------
  async wipeDatabase(): Promise<WipeResult> {
    let deletedUsers = 0;
    let deletedOrders = 0;
    let deletedTickets = 0;
    let deletedNotifications = 0;
    store.mutate((s) => {
      const keepUsers = s.users.filter((u) => u.role === "ADMIN");
      deletedUsers = s.users.length - keepUsers.length;
      s.users = keepUsers;
      deletedOrders = s.orders.length;
      s.orders = [];
      deletedTickets = s.supportTickets.length;
      s.supportTickets = [];
      deletedNotifications = s.notifications.length;
      s.notifications = [];
    });
    return delay({ deletedUsers, deletedOrders, deletedTickets, deletedNotifications }, 300);
  }
}
