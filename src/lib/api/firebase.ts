import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateAuthProfile,
  GoogleAuthProvider,
  signInWithPopup,
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
  type DocumentReference,
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
  ProfileSetupInput,
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

/** Reject if a promise doesn't settle within `ms` — so a stalled Firestore
 *  read can never pin the UI (e.g. the auth gate) on a loader forever. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiError("Connection timed out.", 599)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Read a document, retrying transient connectivity failures and bounding each
 * attempt so it can never hang. Firestore can briefly report "client is
 * offline" (code: unavailable) or stall right after a popup sign-in / on first
 * paint before its connection settles — a short, bounded retry rides over that
 * instead of surfacing a scary error (or hanging).
 */
async function readDoc(
  ref: DocumentReference<DocumentData>
): Promise<DocumentSnapshot<DocumentData>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await withTimeout(getDoc(ref), 6000);
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: string })?.code ?? "";
      const msg = e instanceof Error ? e.message : "";
      const transient =
        code.includes("unavailable") ||
        /offline/i.test(msg) ||
        (e instanceof ApiError && e.status === 599);
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
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
      const snap = await readDoc(doc(getDb(), COL.users, cred.user.uid));
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
        const snap = await readDoc(doc(getDb(), COL.users, fbUser.uid));
        cb(snap.exists() ? snapToUser(snap) : null);
      } catch {
        cb(null);
      }
    });
  }

  async getCurrentUser(): Promise<User | null> {
    const auth = getFirebaseAuth();
    await authReady;
    const fb = auth.currentUser;
    if (!fb) return null;
    const snap = await readDoc(doc(getDb(), COL.users, fb.uid));
    return snap.exists() ? snapToUser(snap) : null;
  }

  async completeProfile(input: ProfileSetupInput): Promise<User> {
    const auth = getFirebaseAuth();
    const fb = auth.currentUser;
    if (!fb) throw new ApiError("Not signed in.", 401);
    const name = input.name?.trim() || fb.displayName || fb.phoneNumber || "Customer";
    const profile: Omit<User, "id"> = {
      name,
      email: fb.email ?? "",
      phone: fb.phoneNumber ?? "",
      role: "BUYER",
      businessName: input.businessName?.trim() || name,
      businessType: input.businessType,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      lat: input.lat,
      lng: input.lng,
      addressLabel: input.addressLabel,
      createdAt: new Date().toISOString(),
    };
    // Firestore rejects `undefined` field values — drop any unset optionals.
    const data = Object.fromEntries(
      Object.entries(profile).filter(([, v]) => v !== undefined)
    ) as DocumentData;
    // Bound the write so a stalled connection surfaces a retryable error
    // instead of hanging forever on "Saving…".
    try {
      await withTimeout(
        setDoc(doc(getDb(), COL.users, fb.uid), data, { merge: true }),
        12000
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 599) {
        throw new ApiError("Couldn't save — your connection dropped. Please try again.", 599);
      }
      throw e;
    }
    return { ...profile, id: fb.uid };
  }

  async signInWithGoogle(): Promise<User | null> {
    const auth = getFirebaseAuth();
    let cred;
    try {
      cred = await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      // User dismissed the popup — surface a sentinel the UI can ignore quietly.
      if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
        throw new ApiError("Sign-in cancelled.", 499);
      }
      if (code.includes("popup-blocked")) {
        throw new ApiError("Your browser blocked the sign-in popup — allow popups and try again.");
      }
      if (code.includes("operation-not-allowed")) {
        throw new ApiError("Google sign-in isn't enabled for this project yet.");
      }
      if (code.includes("unauthorized-domain")) {
        throw new ApiError("This domain isn't authorized for sign-in. Add it in Firebase Auth settings.");
      }
      throw new ApiError(e instanceof Error ? e.message : "Google sign-in failed.");
    }

    // Auth succeeded (the Firebase user now exists). Try to load the profile —
    // but if Firestore is momentarily unreachable, DON'T dead-end the sign-in
    // with an error. Treat it as a fresh account and let the user set up their
    // shop; completeProfile uses { merge: true }, so it's safe even if a
    // profile already exists. This is the fix for "Google created the user but
    // the app showed 'Connection timed out' and never let me in".
    try {
      const snap = await readDoc(doc(getDb(), COL.users, cred.user.uid));
      return snap.exists() ? snapToUser(snap) : null;
    } catch {
      return null;
    }
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
