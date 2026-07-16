import {
  signOut,
  onAuthStateChanged,
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
  deleteField,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
  onSnapshot,
  arrayUnion,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase/firestore";
import type {
  AdminStats,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderItem,
  OrderStatus,
  ProfileSetupInput,
  Product,
  ProductInput,
  User,
} from "@/lib/types";
import {
  RETURN_REASON_LABELS,
  generateAdjustedInvoiceNumber,
} from "@/lib/returns";
import type {
  CreateReturnInput,
  ReturnRequest,
  ReturnStatus,
  ReturnMessage,
} from "@/lib/returns";
import { generateOrderNumber, MIN_ORDER_TOTAL_QTY } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { authReady, getDb, getFirebaseAuth } from "@/lib/firebase/client";
import { DataSource, ApiError } from "./datasource";

const COL = { users: "users", products: "products", orders: "orders", returns: "returns", settings: "settings" } as const;

// Emails auto-granted ADMIN on Google sign-in. Keep this in sync with the
// `isAdminEmail()` allowlist in firestore.rules (rules can't import from here).
const ADMIN_EMAILS = ["sumanthbolla97@gmail.com", "sivakishore43@gmail.com"];
function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

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
  // Phone OTP is handled directly by firebase/auth in the onboarding screen.
  // Google sign-in is the other supported method (see signInWithGoogle below).
  // Email/password sign-in is intentionally not implemented.

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

  async getUser(id: string): Promise<User | null> {
    const snap = await readDoc(doc(getDb(), COL.users, id));
    return snap.exists() ? snapToUser(snap) : null;
  }

  async completeProfile(input: ProfileSetupInput): Promise<User> {
    const auth = getFirebaseAuth();
    const fb = auth.currentUser;
    if (!fb) throw new ApiError("Not signed in.", 401);

    const email = (fb.email || input.email?.trim() || "").toLowerCase();
    const phone = fb.phoneNumber || input.phone?.trim() || "";

    // Enforce one account per email and one account per phone.
    const db = getDb();
    const checks: Promise<boolean>[] = [];
    if (email) {
      checks.push(
        getDocs(query(collection(db, COL.users), where("email", "==", email)))
          .then((snap) => snap.docs.some((d) => d.id !== fb.uid))
      );
    }
    if (phone) {
      checks.push(
        getDocs(query(collection(db, COL.users), where("phone", "==", phone)))
          .then((snap) => snap.docs.some((d) => d.id !== fb.uid))
      );
    }
    const [emailTaken, phoneTaken] = await Promise.all([
      email ? checks.shift()! : Promise.resolve(false),
      phone ? checks.shift()! : Promise.resolve(false),
    ]);
    if (emailTaken && phoneTaken) {
      throw new ApiError("This email and phone are already linked to another account.");
    }
    if (emailTaken) {
      throw new ApiError("This email is already linked to another account.");
    }
    if (phoneTaken) {
      throw new ApiError("This phone number is already linked to another account.");
    }

    const name = input.name?.trim() || fb.displayName || fb.phoneNumber || "Customer";
    const profile: Omit<User, "id"> = {
      name,
      email,
      phone,
      role: isAdminEmail(fb.email) ? "ADMIN" : "BUYER",
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
        setDoc(doc(db, COL.users, fb.uid), data, { merge: true }),
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
    // Load (or bootstrap) the profile. Configured admin email(s) are promoted to
    // ADMIN here so they land straight in the console — no buyer onboarding.
    const ref = doc(getDb(), COL.users, cred.user.uid);
    const wantsAdmin = isAdminEmail(cred.user.email);
    try {
      const snap = await readDoc(ref);
      if (snap.exists()) {
        const profile = snapToUser(snap);
        if (wantsAdmin && profile.role !== "ADMIN") {
          await setDoc(ref, { role: "ADMIN" }, { merge: true });
          return { ...profile, role: "ADMIN" };
        }
        return profile;
      }
      if (wantsAdmin) {
        const adminProfile: Omit<User, "id"> = {
          name: cred.user.displayName || "Admin",
          email: cred.user.email || "",
          phone: cred.user.phoneNumber || "",
          role: "ADMIN",
          businessName: "Green Basket Admin",
          createdAt: new Date().toISOString(),
        };
        await setDoc(ref, adminProfile as DocumentData);
        return { ...adminProfile, id: cred.user.uid };
      }
      return null;
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

  async updateProduct(
    id: string,
    patch: Partial<Omit<Product, "imageUrl">> & { imageUrl?: string | null }
  ): Promise<Product> {
    const db = getDb();
    const FIELDS = [
      "name", "category", "unit", "price", "minOrderQty", "stock", "origin", "active",
    ] as const;
    const allowed: DocumentData = {};
    for (const k of FIELDS) {
      if (patch[k] !== undefined) allowed[k] = patch[k];
    }
    if (patch.imageUrl === null) {
      allowed.imageUrl = deleteField();
    } else if (patch.imageUrl !== undefined) {
      allowed.imageUrl = patch.imageUrl;
    }
    await updateDoc(doc(db, COL.products, id), allowed);
    const snap = await getDoc(doc(db, COL.products, id));
    if (!snap.exists()) throw new ApiError("Product not found.", 404);
    return { ...(snap.data() as Omit<Product, "id">), id: snap.id };
  }

  async createProduct(input: ProductInput): Promise<Product> {
    const ref = doc(collection(getDb(), COL.products));
    // Normalise minOrderQty so every product defaults to 1 kg/pc if omitted.
    const normalised: ProductInput = {
      ...input,
      minOrderQty: Number.isFinite(input.minOrderQty) && input.minOrderQty > 0 ? input.minOrderQty : 1,
    };
    // Firestore rejects `undefined` field values — drop any unset optionals.
    const data = Object.fromEntries(
      Object.entries(normalised).filter(([, v]) => v !== undefined)
    ) as DocumentData;
    await setDoc(ref, data);
    return { ...normalised, id: ref.id };
  }

  async updateProductPrices(updates: { id: string; price: number }[]): Promise<Product[]> {
    await this.ready();
    const db = getDb();
    const batch = writeBatch(db);
    const refs = updates.map((u) => doc(db, COL.products, u.id));
    for (let i = 0; i < updates.length; i++) {
      batch.update(refs[i], { price: updates[i].price });
    }
    await batch.commit();
    const snaps = await Promise.all(refs.map((r) => getDoc(r)));
    return snaps
      .filter((s) => s.exists())
      .map((s) => ({ ...(s.data() as Omit<Product, "id">), id: s.id }));
  }

  // --- Orders -------------------------------------------------------------
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<Order> {
    await this.ready();
    const db = getDb();
    if (!input.items.length) throw new ApiError("Your cart is empty.");
    const totalQty = input.items.reduce((sum, i) => sum + i.qty, 0);
    if (totalQty < MIN_ORDER_TOTAL_QTY) {
      throw new ApiError(
        `Minimum order is ${MIN_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`
      );
    }
    if (input.paymentMethod === "CREDIT") {
      throw new ApiError("Business credit is not available.");
    }

    const settingsSnap = await readDoc(doc(db, COL.settings, "dailyPrices"));
    const settings = settingsSnap.exists()
      ? (settingsSnap.data() as DailyPricesSettings)
      : null;
    if (!isDailyPriceUpdatePublished(settings?.publishedAt)) {
      throw new ApiError(
        "Getting best live prices for you. Orders open after today's prices are published."
      );
    }

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
      const deliveryFee = calculateDeliveryFee(subtotal);
      built = {
        id: orderRef.id,
        orderNumber: generateOrderNumber(orderRef.id, now),
        buyerId,
        businessName: input.delivery.name || buyer.businessName || buyer.name,
        items,
        status: "CONFIRMED", // Auto-confirmed — morning delivery model
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paid ? "PAID" : "UNPAID",
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        delivery: input.delivery,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      // Firestore rules whitelist the order fields and exclude `id` (the
      // document ID is already the path segment; storing it inside the doc is
      // redundant and breaks the security-rules field allow-list for buyers).
      const { id, ...orderData } = built;
      tx.set(orderRef, orderData as DocumentData);
    });

    return built!;
  }

  /**
   * Real-time order subscription using Firestore onSnapshot.
   * Delivers updates in ~100ms — no page refresh needed.
   */
  subscribeOrders(buyerId?: string, cb?: (orders: Order[]) => void): () => void {
    const db = getDb();
    const base = collection(db, COL.orders);
    // For admin (no buyerId): order by createdAt desc for newest-first.
    // For buyer: filter by buyerId only (avoids composite index requirement).
    const q = buyerId
      ? query(base, where("buyerId", "==", buyerId))
      : query(base, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const orders = snap.docs.map((d) => ({
          ...(d.data() as Omit<Order, "id">),
          id: d.id,
        }));
        // Sort in memory for buyer view (since we can't use orderBy with where)
        const sorted = orders.sort(
          (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
        );
        cb?.(sorted);
      },
      (err) => {
        // Silently ignore permission errors — the UI will show empty state
        // and the user can refresh. This prevents crash loops.
        console.warn("Order subscription error:", err.message);
      }
    );

    return unsubscribe;
  }

  async listOrders(buyerId?: string): Promise<Order[]> {
    await this.ready();
    const base = collection(getDb(), COL.orders);
    // Buyer view filters by buyerId only (equality → no composite index needed)
    // and sorts newest-first in JS. Combining where(buyerId) + orderBy(createdAt)
    // would require a manually-created composite index, whose absence made the
    // query throw and the orders list silently show "No orders yet".
    const snap = buyerId
      ? await getDocs(query(base, where("buyerId", "==", buyerId)))
      : await getDocs(query(base, orderBy("createdAt", "desc")));
    const orders = snap.docs.map((d) => ({ ...(d.data() as Omit<Order, "id">), id: d.id }));
    return orders.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
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
      if (status === "DELIVERED" && order.status !== "DELIVERED") {
        patch.deliveredAt = new Date().toISOString();
      }

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

  /** Bulk update status for multiple orders at once (morning delivery batch processing). */
  async bulkUpdateOrderStatus(ids: string[], status: OrderStatus): Promise<Order[]> {
    await this.ready();
    const db = getDb();
    const updated: Order[] = [];
    const batch = writeBatch(db);

    for (const id of ids) {
      const oRef = doc(db, COL.orders, id);
      const oSnap = await getDoc(oRef);
      if (!oSnap.exists()) continue;
      const order = { ...(oSnap.data() as Omit<Order, "id">), id: oRef.id } as Order;

      if (status === "CANCELLED" && order.status !== "CANCELLED") {
        for (const i of order.items) {
          const pRef = doc(db, COL.products, i.productId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const p = pSnap.data() as Product;
            batch.update(pRef, { stock: p.stock + i.qty });
          }
        }
        batch.update(oRef, {
          status,
          notes: "Order cancelled — stock was released.",
          updatedAt: new Date().toISOString(),
        });
      } else {
        const patch: DocumentData = { status, updatedAt: new Date().toISOString() };
        if (status === "DELIVERED" && order.status !== "DELIVERED") {
          patch.deliveredAt = new Date().toISOString();
        }
        batch.update(oRef, patch);
      }
      updated.push({ ...order, status, deliveredAt: order.deliveredAt });
    }

    await batch.commit();
    return updated;
  }

  async cancelOrder(id: string): Promise<Order> {
    return this.updateOrderStatus(id, "CANCELLED");
  }

  async setOrderPaid(id: string, paid: boolean): Promise<Order> {
    const db = getDb();
    await updateDoc(doc(db, COL.orders, id), {
      paymentStatus: paid ? "PAID" : "UNPAID",
      updatedAt: new Date().toISOString(),
    });
    const snap = await getDoc(doc(db, COL.orders, id));
    if (!snap.exists()) throw new ApiError("Order not found.", 404);
    return { ...(snap.data() as Omit<Order, "id">), id: snap.id };
  }

  // --- Returns --------------------------------------------------------------
  /**
   * Real-time returns subscription. Admin (no buyerId) gets all returns newest-first;
   * buyers get only their own returns.
   */
  subscribeReturns(buyerId?: string, cb?: (returns: ReturnRequest[]) => void): () => void {
    const db = getDb();
    const base = collection(db, COL.returns);
    const q = buyerId
      ? query(base, where("buyerId", "==", buyerId))
      : query(base, orderBy("requestedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const returns = snap.docs.map((d) => ({
          ...(d.data() as Omit<ReturnRequest, "id">),
          id: d.id,
        }));
        const sorted = returns.sort(
          (a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt)
        );
        cb?.(sorted);
      },
      (err) => {
        console.warn("Returns subscription error:", err.message);
      }
    );

    return unsubscribe;
  }

  async listReturns(buyerId?: string): Promise<ReturnRequest[]> {
    await this.ready();
    const base = collection(getDb(), COL.returns);
    const snap = buyerId
      ? await getDocs(query(base, where("buyerId", "==", buyerId)))
      : await getDocs(query(base, orderBy("requestedAt", "desc")));
    const returns = snap.docs.map((d) => ({
      ...(d.data() as Omit<ReturnRequest, "id">),
      id: d.id,
    }));
    return returns.sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt));
  }

  async getReturn(id: string): Promise<ReturnRequest | null> {
    await this.ready();
    const snap = await getDoc(doc(getDb(), COL.returns, id));
    return snap.exists() ? { ...(snap.data() as Omit<ReturnRequest, "id">), id: snap.id } : null;
  }

  async createReturn(input: CreateReturnInput): Promise<ReturnRequest> {
    await this.ready();
    const db = getDb();

    // Prevent duplicate return requests for the same order.
    // Query by buyerId (required by security rules) and filter by orderId in JS.
    const existingSnap = await getDocs(
      query(collection(db, COL.returns), where("buyerId", "==", input.buyerId))
    );
    const existingReturn = existingSnap.docs.find((d) => d.data().orderId === input.orderId);
    if (existingReturn) {
      throw new ApiError("A return request already exists for this order.", 409);
    }

    const ref = doc(collection(db, COL.returns));
    const id = ref.id;
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

    // Strip id before writing — the Firestore document path is the canonical id.
    // Also drop undefined optional fields so Firestore doesn't reject them.
    const { id: _id, ...data } = returnReq;
    void _id;
    await setDoc(
      ref,
      Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as DocumentData
    );
    return returnReq;
  }

  async updateReturnStatus(id: string, status: ReturnStatus): Promise<ReturnRequest> {
    await this.ready();
    const db = getDb();
    const ref = doc(db, COL.returns, id);
    const now = new Date().toISOString();

    // When a refund is processed, adjust the parent order's total so the
    // customer bill reflects the refund.
    if (status === "REFUNDED") {
      const updated = await runTransaction(db, async (tx) => {
        const retSnap = await tx.get(ref);
        if (!retSnap.exists()) throw new ApiError("Return request not found.", 404);
        const ret = { ...(retSnap.data() as Omit<ReturnRequest, "id">), id: retSnap.id };

        const orderRef = doc(db, COL.orders, ret.orderId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new ApiError("Order not found.", 404);
        const order = { ...(orderSnap.data() as Omit<Order, "id">), id: orderSnap.id };

        const originalTotal = order.subtotal + order.deliveryFee;
        const newTotal = Math.max(0, originalTotal - ret.totalRefund);

        const retPatch: DocumentData = {
          status,
          updatedAt: now,
          resolvedAt: now,
        };
        const orderPatch: DocumentData = {
          refundAmount: ret.totalRefund,
          refundedAt: now,
          adjustedInvoiceNumber: ret.adjustedInvoiceNumber,
          total: newTotal,
          updatedAt: now,
        };

        tx.update(ref, retPatch);
        tx.update(orderRef, orderPatch);
        return { ...ret, ...retPatch } as ReturnRequest;
      });
      return updated;
    }

    const patch: DocumentData = { status, updatedAt: now };
    if ((["REJECTED", "COMPLETED"] as ReturnStatus[]).includes(status)) {
      patch.resolvedAt = now;
    }
    await updateDoc(ref, patch);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Return request not found.", 404);
    return { ...(snap.data() as Omit<ReturnRequest, "id">), id: snap.id };
  }

  async addReturnMessage(id: string, sender: "buyer" | "admin", text: string): Promise<ReturnRequest> {
    await this.ready();
    const ref = doc(getDb(), COL.returns, id);
    const message: ReturnMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender,
      text: text.trim(),
      sentAt: new Date().toISOString(),
    };
    await updateDoc(ref, {
      thread: arrayUnion(message),
      updatedAt: new Date().toISOString(),
    });
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Return request not found.", 404);
    return { ...(snap.data() as Omit<ReturnRequest, "id">), id: snap.id };
  }

  async updateReturnAdminNotes(id: string, notes: string): Promise<ReturnRequest> {
    await this.ready();
    const ref = doc(getDb(), COL.returns, id);
    await updateDoc(ref, { adminNotes: notes, updatedAt: new Date().toISOString() });
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Return request not found.", 404);
    return { ...(snap.data() as Omit<ReturnRequest, "id">), id: snap.id };
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

  // --- Settings -------------------------------------------------------------
  async getDailyPricesSettings(): Promise<DailyPricesSettings | null> {
    await this.ready();
    const snap = await readDoc(doc(getDb(), COL.settings, "dailyPrices"));
    return snap.exists() ? (snap.data() as DailyPricesSettings) : null;
  }

  async publishDailyPrices(userId: string): Promise<DailyPricesSettings> {
    await this.ready();
    const db = getDb();
    const settings: DailyPricesSettings = {
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    };
    await setDoc(doc(db, COL.settings, "dailyPrices"), settings, { merge: true });
    return settings;
  }
}
