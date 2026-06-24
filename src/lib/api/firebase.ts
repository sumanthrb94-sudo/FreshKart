import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateAuthProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import type {
  AdminStats,
  CreateOrderInput,
  Credentials,
  Customer,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  RegisterInput,
  User,
} from "@/lib/types";
import { generateOrderNumber } from "@/lib/format";
import { authReady, getDb, getFirebaseAuth } from "@/lib/firebase/client";
import { DataSource, ApiError } from "./datasource";

const COL = { users: "users", products: "products", orders: "orders" } as const;

function snapToUser(snap: DocumentSnapshot<DocumentData>): User {
  return { ...(snap.data() as Omit<User, "id">), id: snap.id };
}

function friendlyAuthError(e: unknown): never {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    throw new ApiError("Invalid email or password.", 401);
  }
  if (code.includes("email-already-in-use")) {
    throw new ApiError("An account with this email already exists.", 409);
  }
  if (code.includes("weak-password")) {
    throw new ApiError("Password must be at least 6 characters.", 400);
  }
  throw new ApiError(e instanceof Error ? e.message : "Authentication failed.", 400);
}

/**
 * Firestore + Firebase Auth implementation of the app's DataSource. The browser
 * talks to Firebase directly; integrity (ownership, admin gating) is enforced by
 * Firestore Security Rules (see firestore.rules). Stock changes use transactions
 * so concurrent orders can't oversell.
 */
export class FirebaseDataSource implements DataSource {
  /** Ensure auth is initialized and the first auth state has settled. */
  private async ready(): Promise<void> {
    getFirebaseAuth();
    await authReady;
  }

  // --- Auth ---------------------------------------------------------------
  async login({ email, password }: Credentials): Promise<User> {
    const auth = getFirebaseAuth();
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(getDb(), COL.users, cred.user.uid));
      if (!snap.exists()) {
        throw new ApiError("No profile found for this account.", 404);
      }
      return snapToUser(snap);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      friendlyAuthError(e);
    }
  }

  async register(input: RegisterInput): Promise<User> {
    const auth = getFirebaseAuth();
    try {
      const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      await updateAuthProfile(cred.user, { displayName: input.name }).catch(() => {});
      const profile: Omit<User, "id"> = {
        name: input.name,
        email: input.email.trim(),
        phone: input.phone,
        role: "BUYER",
        businessName: input.businessName,
        city: input.city,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(getDb(), COL.users, cred.user.uid), profile);
      return { ...profile, id: cred.user.uid };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      friendlyAuthError(e);
    }
  }

  async updateProfile(userId: string, patch: Partial<User>): Promise<User> {
    const db = getDb();
    // email + role are not editable from the client profile screen.
    const { id: _id, email: _email, role: _role, ...safe } = patch;
    await updateDoc(doc(db, COL.users, userId), safe as DocumentData);
    const snap = await getDoc(doc(db, COL.users, userId));
    if (!snap.exists()) throw new ApiError("User not found.", 404);
    return snapToUser(snap);
  }

  async logout(): Promise<void> {
    await signOut(getFirebaseAuth());
  }

  subscribeAuth(cb: (user: User | null) => void): () => void {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        cb(null);
        return;
      }
      try {
        const snap = await getDoc(doc(getDb(), COL.users, fbUser.uid));
        cb(snap.exists() ? snapToUser(snap) : null);
      } catch {
        cb(null);
      }
    });
  }

  // --- Catalog ------------------------------------------------------------
  async listProducts(): Promise<Product[]> {
    await this.ready();
    const snap = await getDocs(query(collection(getDb(), COL.products), orderBy("name")));
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Product, "id">), id: d.id }));
  }

  async getProduct(id: string): Promise<Product | null> {
    await this.ready();
    const snap = await getDoc(doc(getDb(), COL.products, id));
    return snap.exists() ? { ...(snap.data() as Omit<Product, "id">), id: snap.id } : null;
  }

  async updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
    const db = getDb();
    const allowed: DocumentData = {};
    if (patch.price !== undefined) allowed.price = patch.price;
    if (patch.stock !== undefined) allowed.stock = patch.stock;
    if (patch.active !== undefined) allowed.active = patch.active;
    await updateDoc(doc(db, COL.products, id), allowed);
    const snap = await getDoc(doc(db, COL.products, id));
    if (!snap.exists()) throw new ApiError("Product not found.", 404);
    return { ...(snap.data() as Omit<Product, "id">), id: snap.id };
  }

  // --- Orders -------------------------------------------------------------
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<Order> {
    await this.ready();
    const db = getDb();
    if (!input.items.length) throw new ApiError("Your cart is empty.");

    const buyerSnap = await getDoc(doc(db, COL.users, buyerId));
    if (!buyerSnap.exists()) throw new ApiError("Buyer not found.", 404);
    const buyer = buyerSnap.data() as User;

    const orderRef = doc(collection(db, COL.orders));
    const now = new Date();
    let built: Order | null = null;

    await runTransaction(db, async (tx) => {
      const refs = input.items.map((i) => doc(db, COL.products, i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      const items: OrderItem[] = snaps.map((s, idx) => {
        if (!s.exists()) throw new ApiError("Product no longer available.");
        const p = s.data() as Product;
        const qty = input.items[idx].qty;
        if (qty > p.stock) {
          throw new ApiError(`Only ${p.stock} ${p.unit} of ${p.name} left in stock.`);
        }
        const item: OrderItem = {
          productId: refs[idx].id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          qty,
          lineTotal: p.price * qty,
        };
        if (p.imageUrl) item.imageUrl = p.imageUrl;
        return item;
      });

      snaps.forEach((s, idx) => {
        const p = s.data() as Product;
        tx.update(refs[idx], { stock: p.stock - input.items[idx].qty });
      });

      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      built = {
        id: orderRef.id,
        orderNumber: generateOrderNumber(orderRef.id, now),
        buyerId,
        businessName: input.delivery.name || buyer.businessName || buyer.name,
        items,
        status: "PENDING",
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paid ? "PAID" : "UNPAID",
        subtotal,
        deliveryFee: 0,
        total: subtotal,
        delivery: input.delivery,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      tx.set(orderRef, built as DocumentData);
    });

    return built!;
  }

  async listOrders(buyerId?: string): Promise<Order[]> {
    await this.ready();
    const base = collection(getDb(), COL.orders);
    const q = buyerId
      ? query(base, where("buyerId", "==", buyerId), orderBy("createdAt", "desc"))
      : query(base, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Order, "id">), id: d.id }));
  }

  async getOrder(id: string): Promise<Order | null> {
    await this.ready();
    const snap = await getDoc(doc(getDb(), COL.orders, id));
    return snap.exists() ? { ...(snap.data() as Omit<Order, "id">), id: snap.id } : null;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    await this.ready();
    const db = getDb();
    let updated: Order | null = null;

    await runTransaction(db, async (tx) => {
      const oRef = doc(db, COL.orders, id);
      const oSnap = await tx.get(oRef);
      if (!oSnap.exists()) throw new ApiError("Order not found.", 404);
      const order = { ...(oSnap.data() as Omit<Order, "id">), id: oRef.id } as Order;

      const patch: DocumentData = { status, updatedAt: new Date().toISOString() };

      if (status === "CANCELLED" && order.status !== "CANCELLED") {
        const refs = order.items.map((i) => doc(db, COL.products, i.productId));
        const snaps = await Promise.all(refs.map((r) => tx.get(r))); // reads before writes
        snaps.forEach((s, idx) => {
          if (s.exists()) {
            const p = s.data() as Product;
            tx.update(refs[idx], { stock: p.stock + order.items[idx].qty });
          }
        });
        patch.notes = "Order cancelled — stock was released.";
      }

      tx.update(oRef, patch);
      updated = { ...order, ...(patch as Partial<Order>) };
    });

    return updated!;
  }

  async cancelOrder(id: string): Promise<Order> {
    return this.updateOrderStatus(id, "CANCELLED");
  }

  // --- Admin --------------------------------------------------------------
  async listCustomers(): Promise<Customer[]> {
    await this.ready();
    const db = getDb();
    const [usersSnap, ordersSnap] = await Promise.all([
      getDocs(query(collection(db, COL.users), where("role", "==", "BUYER"))),
      getDocs(collection(db, COL.orders)),
    ]);
    const orders = ordersSnap.docs.map((d) => d.data() as Order);
    return usersSnap.docs.map((d) => {
      const b = { ...(d.data() as Omit<User, "id">), id: d.id };
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
  }

  async getAdminStats(): Promise<AdminStats> {
    await this.ready();
    const db = getDb();
    const [productsSnap, ordersSnap, buyersSnap] = await Promise.all([
      getDocs(collection(db, COL.products)),
      getDocs(collection(db, COL.orders)),
      getDocs(query(collection(db, COL.users), where("role", "==", "BUYER"))),
    ]);
    const products = productsSnap.docs.map((d) => d.data() as Product);
    const orders = ordersSnap.docs.map((d) => d.data() as Order);

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
      customerCount: buyersSnap.size,
      lowStockCount: products.filter((p) => p.active && p.stock <= p.minOrderQty * 2).length,
      ordersByStatus,
    };
  }
}
