import {
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
  AdjustmentLine,
  AdminStats,
  DeliveryAdjustment,
  CreateOrderInput,
  Customer,
  DailyPricesSettings,
  Order,
  OrderItem,
  OrderStatus,
  ProfileSetupInput,
  Product,
  ProductInput,
  StoreOverride,
  StoreSettings,
  User,
} from "@/lib/types";
import { openNewTicket, buildTicketMessage, ESCALATION_NOTICE } from "@/lib/support-tickets";
import type {
  CreateSupportTicketInput,
  SupportTicket,
  TicketSender,
  TicketMessage,
} from "@/lib/support-tickets";
import type { Coupon } from "@/lib/coupons";
import type { ServiceArea } from "@/lib/service-area";
import { radiusOf } from "@/lib/service-area";
import type { InAppNotification, InAppNotificationType } from "@/lib/in-app-notifications";
import { generateOrderNumber, MAX_ORDER_TOTAL_QTY } from "@/lib/format";
import { calculateDeliveryFee } from "@/lib/delivery";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { effectiveOverride, getStoreStatus, nextStoreClose } from "@/lib/store-hours";
import { isWithinDriverAuthority, totalRefundOf } from "@/lib/delivery-adjustment";
import { authReady, getDb, getFirebaseAuth } from "@/lib/firebase/client";
// Shared with the sign-in UI, which routes allowlisted numbers straight to
// admin; rules-side enforcement is the matching isAdminPhone() in
// firestore.rules.
import { isAdminPhone } from "@/lib/admin-phones";
import { DataSource, ApiError, type WipeResult } from "./datasource";

const COL = {
  users: "users",
  products: "products",
  orders: "orders",
  supportTickets: "supportTickets",
  coupons: "coupons",
  notifications: "notifications",
  settings: "settings",
  emailIndex: "emailIndex",
  phoneIndex: "phoneIndex",
} as const;


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
 * Write a signed-in user's own doc, forcing a fresh ID token first and
 * retrying once on `permission-denied`. Firestore's client can briefly lag
 * behind Auth right after a sign-in (the token hasn't propagated to the
 * outgoing request yet) — worse on browsers with slower/partitioned storage
 * (iOS Safari, Brave, in-app browsers) — so the very first write after
 * sign-in can race ahead of what the security rules see, producing a
 * spurious "Missing or insufficient permissions" error during onboarding.
 */
async function writeUserDoc(
  fbUser: FirebaseUser,
  ref: DocumentReference<DocumentData>,
  data: DocumentData,
  ms: number
): Promise<void> {
  await fbUser.getIdToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await withTimeout(setDoc(ref, data, { merge: true }), ms);
      return;
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code !== "permission-denied" || attempt === 1) throw e;
      await fbUser.getIdToken(true);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/**
 * Same token-refresh-and-retry idea as writeUserDoc(), generalized for any
 * write (in particular runTransaction calls, which can't reuse writeUserDoc
 * directly). Placing an order/cancelling/returning shortly after sign-in —
 * or just after a long-idle tab wakes back up — can race Firestore's client
 * ahead of a stale ID token, producing a spurious "Missing or insufficient
 * permissions" for a perfectly legitimate write. Only retries on the
 * Firestore SDK's own `permission-denied` code; app-level ApiErrors (out of
 * stock, cart empty, etc.) always propagate immediately on first try.
 */
async function withFreshTokenRetry<T>(op: () => Promise<T>): Promise<T> {
  const fbUser = getFirebaseAuth().currentUser;
  if (fbUser) await fbUser.getIdToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await op();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code !== "permission-denied" || attempt === 1 || !fbUser) throw e;
      await fbUser.getIdToken(true);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  // Unreachable: the loop above always returns or throws.
  throw new ApiError("Could not complete the request. Please try again.");
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
  // Phone OTP (handled directly by firebase/auth in the onboarding screen) is
  // the ONLY sign-in method — the single source of truth for identity is the
  // verified mobile number. There is no Google sign-in and no email/password
  // sign-in for buyers; admin uses the same OTP flow on a separate route
  // (/admin-login → completeAdminLogin below), gated by phone allowlist
  // instead of a separate credential.

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

  /**
   * Email + password sign-in for STAFF — the admin console at /admin-login
   * and the delivery app at /driver-login. Buyers never see it; they sign in
   * with phone OTP, which remains the single source of truth for customer
   * identity. The credential lives in Firebase Auth (hashed); nothing about
   * it is stored in this repo.
   *
   * Signs out again and throws unless the account carries a staff role, so a
   * stray buyer credential can't linger as a half-session. Each screen then
   * checks for the specific role it needs.
   */
  async login({ email, password }: { email: string; password: string }): Promise<User> {
    await this.ready();
    const auth = getFirebaseAuth();
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found") ||
        code.includes("invalid-email")
      ) {
        throw new ApiError("Incorrect username or password.", 401);
      }
      if (code.includes("too-many-requests")) {
        throw new ApiError("Too many failed attempts. Please wait a few minutes.", 429);
      }
      if (code.includes("user-disabled")) {
        throw new ApiError("This account has been disabled.", 403);
      }
      throw new ApiError(e instanceof Error ? e.message : "Sign-in failed.", 401);
    }

    const snap = await readDoc(doc(getDb(), COL.users, cred.user.uid));
    const profile = snap.exists() ? snapToUser(snap) : null;
    // Staff only — admins and delivery drivers. A buyer credential (or an
    // account with no profile) is signed straight back out rather than left
    // as a half-session the UI would have to defend against.
    if (!profile || (profile.role !== "ADMIN" && profile.role !== "DRIVER")) {
      await signOut(auth);
      throw new ApiError("This account doesn't have staff access.", 403);
    }
    return profile;
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

    // Phone is always the OTP-verified number itself — Firebase Auth already
    // guarantees at most one account per verified number, so no separate
    // uniqueness claim is needed (unlike the old Google flow, where a
    // manually-typed, unverified phone needed an index doc to enforce
    // one-account-per-number; that whole mechanism is gone along with Google).
    const phone = fb.phoneNumber || "";

    // Force a fresh ID token before the write below — right after sign-in,
    // Firestore's client can briefly lag behind Auth (worse on browsers with
    // slower/partitioned storage), and a stale token here can produce a
    // spurious permission-denied on this very first write.
    await fb.getIdToken();

    const db = getDb();
    const name = input.name?.trim() || fb.displayName || phone || "Customer";
    const profile: Omit<User, "id"> = {
      name,
      email: "",
      phone,
      role: isAdminPhone(phone) ? "ADMIN" : "BUYER",
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
      await writeUserDoc(fb, doc(db, COL.users, fb.uid), data, 12000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 599) {
        throw new ApiError("Couldn't save — your connection dropped. Please try again.", 599);
      }
      throw e;
    }
    return { ...profile, id: fb.uid };
  }

  /**
   * Complete admin sign-in on the separate `/admin-login` route: the phone
   * OTP flow there already verified the currently signed-in Firebase user;
   * this only needs to check their number against the admin allowlist and
   * upsert/promote their profile to ADMIN. Rejects (and signs out) any
   * number that isn't on the allowlist, so a regular buyer can't land here
   * and end up with a stray account from the wrong entry point.
   */
  async completeAdminLogin(): Promise<User> {
    const auth = getFirebaseAuth();
    const fb = auth.currentUser;
    if (!fb) throw new ApiError("Not signed in.", 401);

    const phone = fb.phoneNumber || "";
    if (!isAdminPhone(phone)) {
      await signOut(auth);
      throw new ApiError("This number isn't authorized for admin access.", 403);
    }

    await fb.getIdToken();
    const db = getDb();
    const ref = doc(db, COL.users, fb.uid);
    const snap = await readDoc(ref);
    if (snap.exists()) {
      const profile = snapToUser(snap);
      if (profile.role === "ADMIN") return profile;
      await writeUserDoc(fb, ref, { role: "ADMIN" }, 12000);
      return { ...profile, role: "ADMIN" };
    }

    const adminProfile: Omit<User, "id"> = {
      name: fb.displayName || "Admin",
      email: "",
      phone,
      role: "ADMIN",
      businessName: "Green Basket Admin",
      createdAt: new Date().toISOString(),
    };
    await writeUserDoc(fb, ref, adminProfile as DocumentData, 12000);
    return { ...adminProfile, id: fb.uid };
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
    // Mirror any price change into settings/priceSheet — the order-create
    // rule reads this single doc (one get() call, regardless of cart size)
    // instead of one get() per line item, which is what let the item cap be
    // lifted. Must stay in lockstep or orders start failing with
    // "Missing or insufficient permissions" again.
    if (patch.price !== undefined || patch.minOrderQty !== undefined) {
      const mirror: DocumentData = {};
      if (patch.price !== undefined) mirror.prices = { [id]: patch.price };
      if (patch.minOrderQty !== undefined) mirror.minQty = { [id]: patch.minOrderQty };
      await setDoc(doc(db, COL.settings, "priceSheet"), mirror, { merge: true });
    }
    const snap = await getDoc(doc(db, COL.products, id));
    if (!snap.exists()) throw new ApiError("Product not found.", 404);
    return { ...(snap.data() as Omit<Product, "id">), id: snap.id };
  }

  async createProduct(input: ProductInput): Promise<Product> {
    const db = getDb();
    const ref = doc(collection(db, COL.products));
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
    await setDoc(
      doc(db, COL.settings, "priceSheet"),
      { prices: { [ref.id]: normalised.price }, minQty: { [ref.id]: normalised.minOrderQty } },
      { merge: true }
    );
    return { ...normalised, id: ref.id };
  }

  async updateProductPrices(updates: { id: string; price: number }[]): Promise<Product[]> {
    await this.ready();
    const db = getDb();
    const batch = writeBatch(db);
    const refs = updates.map((u) => doc(db, COL.products, u.id));
    const priceMap: Record<string, number> = {};
    for (let i = 0; i < updates.length; i++) {
      batch.update(refs[i], { price: updates[i].price });
      priceMap[updates[i].id] = updates[i].price;
    }
    // Same batch, same atomicity guarantee as the product price writes.
    batch.set(doc(db, COL.settings, "priceSheet"), { prices: priceMap }, { merge: true });
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
    if (totalQty > MAX_ORDER_TOTAL_QTY) {
      throw new ApiError(
        `Maximum order is ${MAX_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`
      );
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

    // The shop is shut outside 8 AM – 9 PM IST unless an admin has forced it
    // live. The cart screen already knows this; enforcing it here as well
    // stops a tab left open past the close from adding an order to a load
    // that was packed hours ago.
    const storeSnap = await readDoc(doc(db, COL.settings, "store"));
    const storeSettings = storeSnap.exists() ? (storeSnap.data() as StoreSettings) : null;
    if (!getStoreStatus(new Date(), effectiveOverride(storeSettings)).isOpen) {
      throw new ApiError(
        "The shop is closed. Orders reopen at 8 AM for the next day's delivery."
      );
    }

    const buyerSnap = await getDoc(doc(db, COL.users, buyerId));
    if (!buyerSnap.exists()) throw new ApiError("Buyer not found.", 404);
    const buyer = buyerSnap.data() as User;

    const orderRef = doc(collection(db, COL.orders));
    const now = new Date();
    let built: Order | null = null;

    await withFreshTokenRetry(() => runTransaction(db, async (tx) => {
      const refs = input.items.map((i) => doc(db, COL.products, i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      const items: OrderItem[] = snaps.map((s, idx) => {
        if (!s.exists()) throw new ApiError("Product no longer available.");
        const p = s.data() as Product;
        const qty = input.items[idx].qty;
        // Treat a missing/corrupt stock value as zero rather than letting it
        // through: `qty > undefined` is false, which would sail past this
        // guard and then write NaN (or a negative) into the stock field —
        // a write the security rules reject as "Missing or insufficient
        // permissions", giving the buyer no idea the item was out of stock.
        const available = typeof p.stock === "number" && Number.isFinite(p.stock) ? p.stock : 0;
        if (qty > available) {
          throw new ApiError(`Only ${available} ${p.unit} of ${p.name} left in stock.`);
        }
        // Per-product wholesale minimum. The cart's stepper enforces this for
        // convenience; the order is created here, so this is the control.
        const min = typeof p.minOrderQty === "number" && p.minOrderQty > 0 ? p.minOrderQty : 1;
        if (qty < min) {
          throw new ApiError(`${p.name} is sold in a minimum of ${min} ${p.unit}.`);
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
    })).catch((e) => this.explainOrderRejection(e, input));

    return built!;
  }

  /**
   * Turn a rules rejection on the checkout write into something a buyer can
   * act on. Firestore reports EVERY rule failure — a stale price, a stock
   * decrement that would go negative, a cart that outgrew the weight limits —
   * with the single opaque string "Missing or insufficient permissions",
   * which reads as an account/login problem and is none of those things.
   *
   * Rather than guess at a cause, this re-reads the catalog and reports the
   * specific mismatch it finds, falling back to a plain "try again" only when
   * nothing identifiable turns up. Anything that isn't a rules rejection
   * (out of stock, cart empty, prices not published) already carries its own
   * message and passes straight through.
   */
  private async explainOrderRejection(e: unknown, input: CreateOrderInput): Promise<never> {
    const code = (e as { code?: string })?.code ?? "";
    if (e instanceof ApiError || code !== "permission-denied") throw e;

    try {
      const db = getDb();
      const sheetSnap = await readDoc(doc(db, COL.settings, "priceSheet"));
      const sheet = (sheetSnap.data()?.prices ?? {}) as Record<string, number>;
      const snaps = await Promise.all(
        input.items.map((i) => getDoc(doc(db, COL.products, i.productId)))
      );

      for (let i = 0; i < snaps.length; i++) {
        const s = snaps[i];
        const qty = input.items[i].qty;
        if (!s.exists()) throw new ApiError("An item in your cart is no longer available. Please remove it and try again.");
        const p = s.data() as Product;
        if (qty > p.stock) {
          throw new ApiError(`Only ${p.stock} ${p.unit} of ${p.name} left in stock. Please reduce the quantity.`);
        }
        if (sheet[s.id] === undefined || sheet[s.id] !== p.price) {
          throw new ApiError(
            `The price of ${p.name} was just updated. Please refresh the page and place the order again.`
          );
        }
      }

      const totalQty = input.items.reduce((sum, i) => sum + i.qty, 0);
      if (totalQty > MAX_ORDER_TOTAL_QTY) {
        throw new ApiError(
          `Orders can be at most ${MAX_ORDER_TOTAL_QTY} kgs. Your cart is ${totalQty} kgs.`
        );
      }
    } catch (inner) {
      if (inner instanceof ApiError) throw inner;
      // Diagnosis itself failed — fall through to the generic message below.
    }

    throw new ApiError(
      "We couldn't place your order — prices or stock may have changed while you were checking out. Please refresh and try again.",
      403
    );
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

  /**
   * `createdAt` is always written as `new Date().toISOString()` — fixed-width
   * and Z-suffixed — so lexicographic order is chronological order and a string
   * range is exact. The range and the orderBy sit on the same single field,
   * which Firestore indexes automatically: no composite index is needed, and
   * only that day's docs are read rather than the whole collection.
   */
  async listOrdersByRange(startIso: string, endIso: string): Promise<Order[]> {
    await this.ready();
    const snap = await getDocs(
      query(
        collection(getDb(), COL.orders),
        where("createdAt", ">=", startIso),
        where("createdAt", "<", endIso),
        orderBy("createdAt", "desc")
      )
    );
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

    await withFreshTokenRetry(() => runTransaction(db, async (tx) => {
      const oRef = doc(db, COL.orders, id);
      const oSnap = await tx.get(oRef);
      if (!oSnap.exists()) throw new ApiError("Order not found.", 404);
      const order = { ...(oSnap.data() as Omit<Order, "id">), id: oRef.id } as Order;

      if (status === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus !== "PAID") {
        throw new ApiError("Cash payment must be confirmed before marking a COD order as delivered.", 400);
      }

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
    }));

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

      // Skip COD orders whose cash hasn't been confirmed as received yet.
      if (status === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus !== "PAID") {
        continue;
      }

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

  // --- Delivery run ---------------------------------------------------------
  async listDriverOrders(driverId: string): Promise<Order[]> {
    await this.ready();
    // Equality-only filter (no composite index needed); the "still to run"
    // filter and sort happen in memory, same pattern as listOrders.
    const snap = await getDocs(
      query(collection(getDb(), COL.orders), where("driverId", "==", driverId))
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as Omit<Order, "id">), id: d.id }))
      .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED")
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  /**
   * Live version of listDriverOrders. The driver's phone must learn the
   * office's decision while he is still standing at the door — asking him to
   * pull-to-refresh with a customer waiting is how a delivery run stalls.
   */
  subscribeDriverOrders(driverId: string, cb: (orders: Order[]) => void): () => void {
    const q = query(collection(getDb(), COL.orders), where("driverId", "==", driverId));
    return onSnapshot(
      q,
      (snap) => {
        const orders = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Order, "id">), id: d.id }))
          .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED")
          .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        cb(orders);
      },
      () => {
        // A dropped listener (mandi-area signal) must not blank the run —
        // keep whatever the driver already has on screen.
      }
    );
  }

  async listDrivers(): Promise<User[]> {
    await this.ready();
    const snap = await getDocs(
      query(collection(getDb(), COL.users), where("role", "==", "DRIVER"))
    );
    return snap.docs.map(snapToUser);
  }

  async assignDriver(orderId: string, driverId: string, driverName: string): Promise<Order> {
    await this.ready();
    const db = getDb();
    await updateDoc(doc(db, COL.orders, orderId), {
      driverId,
      driverName,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const snap = await getDoc(doc(db, COL.orders, orderId));
    if (!snap.exists()) throw new ApiError("Order not found.", 404);
    return { ...(snap.data() as Omit<Order, "id">), id: snap.id };
  }

  /**
   * Record what the buyer refused at the door.
   *
   * Settles on the spot when the refund is inside the driver's authority,
   * because a delivery run must never block on someone answering a phone.
   * Anything larger is stored PENDING and the driver cannot collect until an
   * admin decides — see decideDeliveryAdjustment.
   *
   * Stock is deliberately NOT touched here: an auto-approved rejection is a
   * write-off (bad produce doesn't go back on the shelf), and a pending one
   * isn't settled yet. Only an admin REJECTION restocks.
   */
  async createDeliveryAdjustment(
    orderId: string,
    input: { lines: AdjustmentLine[]; reason: string; photos: string[] }
  ): Promise<Order> {
    await this.ready();
    const db = getDb();
    const me = getFirebaseAuth().currentUser;
    if (!me) throw new ApiError("Not signed in.", 401);

    const ref = doc(db, COL.orders, orderId);
    const snap = await readDoc(ref);
    if (!snap.exists()) throw new ApiError("Order not found.", 404);
    const order = { ...(snap.data() as Omit<Order, "id">), id: snap.id } as Order;
    if (order.adjustment) {
      throw new ApiError("An adjustment has already been recorded for this delivery.", 409);
    }

    const lines = input.lines.filter((l) => l.rejectedQty > 0);
    if (!lines.length) throw new ApiError("Select at least one item the buyer refused.");
    const totalRefund = totalRefundOf(lines);
    if (totalRefund > order.total) {
      throw new ApiError("The adjustment can't exceed the order value.");
    }

    const auto = isWithinDriverAuthority(totalRefund, order.total);
    const now = new Date().toISOString();
    const adjustment: DeliveryAdjustment = {
      lines,
      totalRefund,
      reason: input.reason.trim(),
      photos: input.photos,
      status: auto ? "AUTO_APPROVED" : "PENDING",
      raisedBy: me.uid,
      raisedByName: me.displayName ?? undefined,
      raisedAt: now,
    };

    await withFreshTokenRetry(() =>
      updateDoc(ref, {
        adjustment: Object.fromEntries(
          Object.entries(adjustment).filter(([, v]) => v !== undefined)
        ) as DocumentData,
        updatedAt: now,
      })
    );
    return { ...order, adjustment, updatedAt: now };
  }

  /**
   * Settle an escalated adjustment.
   *
   * The buyer is billed identically either way — they never pay for produce
   * they refused and the driver took back. The decision only determines what
   * happens to that stock: APPROVED means it really was bad, so it is a
   * write-off; REJECTED means it was saleable, so it goes back into
   * inventory in the same transaction.
   */
  async decideDeliveryAdjustment(
    orderId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string
  ): Promise<Order> {
    await this.ready();
    const db = getDb();
    const me = getFirebaseAuth().currentUser;
    let updated: Order | null = null;

    await withFreshTokenRetry(() =>
      runTransaction(db, async (tx) => {
        const ref = doc(db, COL.orders, orderId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new ApiError("Order not found.", 404);
        const order = { ...(snap.data() as Omit<Order, "id">), id: snap.id } as Order;
        const adj = order.adjustment;
        if (!adj) throw new ApiError("This delivery has no adjustment to decide.", 409);
        if (adj.status !== "PENDING") {
          throw new ApiError("This adjustment has already been settled.", 409);
        }

        // Reads must all happen before writes inside a transaction.
        const productRefs = adj.lines.map((l) => doc(db, COL.products, l.productId));
        const productSnaps =
          decision === "REJECTED" ? await Promise.all(productRefs.map((r) => tx.get(r))) : [];

        const now = new Date().toISOString();
        const settled: DeliveryAdjustment = {
          ...adj,
          status: decision,
          decidedBy: me?.uid,
          decidedAt: now,
          ...(note?.trim() ? { decisionNote: note.trim() } : {}),
        };

        if (decision === "REJECTED") {
          // Goods were fine — they come back on the vehicle and are resaleable.
          productSnaps.forEach((s, i) => {
            if (!s.exists()) return;
            const p = s.data() as Product;
            tx.update(productRefs[i], { stock: p.stock + adj.lines[i].rejectedQty });
          });
        }

        tx.update(ref, {
          adjustment: Object.fromEntries(
            Object.entries(settled).filter(([, v]) => v !== undefined)
          ) as DocumentData,
          updatedAt: now,
        });
        updated = { ...order, adjustment: settled, updatedAt: now };
      })
    );

    return updated!;
  }

  // --- Support tickets ------------------------------------------------------
  subscribeSupportTickets(buyerId?: string, cb?: (tickets: SupportTicket[]) => void): () => void {
    const db = getDb();
    const base = collection(db, COL.supportTickets);
    const q = buyerId
      ? query(base, where("buyerId", "==", buyerId))
      : query(base, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const tickets = snap.docs.map((d) => ({
          ...(d.data() as Omit<SupportTicket, "id">),
          id: d.id,
        }));
        const sorted = tickets.sort(
          (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
        );
        cb?.(sorted);
      },
      (err) => {
        console.warn("Support tickets subscription error:", err.message);
      }
    );

    return unsubscribe;
  }

  async listSupportTickets(buyerId?: string): Promise<SupportTicket[]> {
    await this.ready();
    const base = collection(getDb(), COL.supportTickets);
    const snap = buyerId
      ? await getDocs(query(base, where("buyerId", "==", buyerId)))
      : await getDocs(query(base, orderBy("updatedAt", "desc")));
    const tickets = snap.docs.map((d) => ({
      ...(d.data() as Omit<SupportTicket, "id">),
      id: d.id,
    }));
    return tickets.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }

  async getSupportTicket(id: string): Promise<SupportTicket | null> {
    await this.ready();
    const snap = await getDoc(doc(getDb(), COL.supportTickets, id));
    return snap.exists() ? { ...(snap.data() as Omit<SupportTicket, "id">), id: snap.id } : null;
  }

  async getOrCreateSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
    await this.ready();
    const db = getDb();

    const existingSnap = await getDocs(
      query(
        collection(db, COL.supportTickets),
        where("buyerId", "==", input.buyerId),
        where("status", "==", "OPEN")
      )
    );
    if (!existingSnap.empty) {
      const d = existingSnap.docs[0];
      return { ...(d.data() as Omit<SupportTicket, "id">), id: d.id };
    }

    const ref = doc(collection(db, COL.supportTickets));
    const ticket = { ...openNewTicket(input), id: ref.id };
    const { id: _id, ...data } = ticket;
    void _id;
    await withFreshTokenRetry(() =>
      setDoc(ref, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as DocumentData)
    );
    return ticket;
  }

  async addSupportTicketMessage(
    id: string,
    sender: Extract<TicketSender, "buyer" | "admin" | "assistant">,
    text: string,
    suggestions?: string[]
  ): Promise<SupportTicket> {
    await this.ready();
    const ref = doc(getDb(), COL.supportTickets, id);
    const message = buildTicketMessage(sender, text, suggestions);
    const patch: DocumentData = { thread: arrayUnion(message), updatedAt: new Date().toISOString() };
    // A human reply resolves the "needs a human" flag that got it here.
    if (sender === "admin") patch.needsHuman = false;
    await withFreshTokenRetry(() => updateDoc(ref, patch));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Support ticket not found.", 404);
    return { ...(snap.data() as Omit<SupportTicket, "id">), id: snap.id };
  }

  async escalateSupportTicket(id: string): Promise<SupportTicket> {
    await this.ready();
    const ref = doc(getDb(), COL.supportTickets, id);
    const message = buildTicketMessage("system", ESCALATION_NOTICE);
    await withFreshTokenRetry(() =>
      updateDoc(ref, {
        thread: arrayUnion(message),
        needsHuman: true,
        updatedAt: new Date().toISOString(),
      })
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Support ticket not found.", 404);
    return { ...(snap.data() as Omit<SupportTicket, "id">), id: snap.id };
  }

  async closeSupportTicket(id: string): Promise<SupportTicket> {
    await this.ready();
    const ref = doc(getDb(), COL.supportTickets, id);
    const now = new Date().toISOString();
    await withFreshTokenRetry(() =>
      updateDoc(ref, { status: "CLOSED", closedAt: now, updatedAt: now })
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Support ticket not found.", 404);
    return { ...(snap.data() as Omit<SupportTicket, "id">), id: snap.id };
  }

  async reopenSupportTicket(id: string): Promise<SupportTicket> {
    await this.ready();
    const ref = doc(getDb(), COL.supportTickets, id);
    const now = new Date().toISOString();
    const systemMessage: TicketMessage = {
      id: `tm-${Date.now()}-sys`,
      sender: "system",
      text: "Conversation reopened.",
      sentAt: now,
    };
    await withFreshTokenRetry(() =>
      updateDoc(ref, {
        status: "OPEN",
        closedAt: deleteField(),
        updatedAt: now,
        thread: arrayUnion(systemMessage),
      })
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiError("Support ticket not found.", 404);
    return { ...(snap.data() as Omit<SupportTicket, "id">), id: snap.id };
  }

  /** Heartbeat only — deliberately does NOT touch `updatedAt`, or every
   *  keystroke would reorder the admin's ticket list mid-type. Best-effort,
   *  same as setReturnTyping. */
  async setSupportTicketTyping(id: string, sender: "buyer" | "admin"): Promise<void> {
    try {
      const field = sender === "buyer" ? "buyerTypingAt" : "adminTypingAt";
      await updateDoc(doc(getDb(), COL.supportTickets, id), { [field]: new Date().toISOString() });
    } catch {
      /* cosmetic — never let this interrupt messaging */
    }
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

  // --- Coupons ----------------------------------------------------------------
  async listCoupons(): Promise<Coupon[]> {
    await this.ready();
    const snap = await getDocs(collection(getDb(), COL.coupons));
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Coupon, "id">), id: d.id }));
  }

  async createCoupon(
    input: Omit<Coupon, "id" | "usageCount" | "createdAt" | "updatedAt">
  ): Promise<Coupon> {
    await this.ready();
    const db = getDb();
    const ref = doc(collection(db, COL.coupons));
    const now = new Date().toISOString();
    const coupon: Coupon = { ...input, id: ref.id, usageCount: 0, createdAt: now, updatedAt: now };
    const { id: _id, ...data } = coupon;
    await setDoc(ref, data as DocumentData);
    return coupon;
  }

  async updateCoupon(id: string, patch: Partial<Coupon>): Promise<Coupon> {
    await this.ready();
    const db = getDb();
    const { id: _id, ...safe } = patch;
    await updateDoc(doc(db, COL.coupons, id), { ...safe, updatedAt: new Date().toISOString() } as DocumentData);
    const snap = await getDoc(doc(db, COL.coupons, id));
    if (!snap.exists()) throw new ApiError("Coupon not found.", 404);
    return { ...(snap.data() as Omit<Coupon, "id">), id: snap.id };
  }

  async deleteCoupon(id: string): Promise<void> {
    await this.ready();
    await deleteDoc(doc(getDb(), COL.coupons, id));
  }

  // --- In-app notifications ----------------------------------------------------
  async listInAppNotifications(userId: string): Promise<InAppNotification[]> {
    await this.ready();
    const snap = await getDocs(query(collection(getDb(), COL.notifications), where("userId", "==", userId)));
    const notifs = snap.docs.map((d) => ({ ...(d.data() as Omit<InAppNotification, "id">), id: d.id }));
    return notifs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 100);
  }

  subscribeInAppNotifications(userId: string, cb: (notifs: InAppNotification[]) => void): () => void {
    const db = getDb();
    const q = query(collection(db, COL.notifications), where("userId", "==", userId));
    return onSnapshot(
      q,
      (snap) => {
        const notifs = snap.docs.map((d) => ({ ...(d.data() as Omit<InAppNotification, "id">), id: d.id }));
        cb(notifs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 100));
      },
      (err) => console.warn("Notification subscription error:", err.message)
    );
  }

  async addInAppNotification(
    userId: string,
    type: InAppNotificationType,
    title: string,
    message: string,
    options?: { actionUrl?: string; orderId?: string }
  ): Promise<InAppNotification> {
    await this.ready();
    const db = getDb();
    const ref = doc(collection(db, COL.notifications));
    const notification: InAppNotification = {
      id: ref.id,
      userId,
      type,
      title,
      message,
      read: false,
      ...options,
      createdAt: new Date().toISOString(),
    };
    const { id: _id, ...data } = notification;
    await setDoc(ref, data as DocumentData);
    return notification;
  }

  async markInAppNotificationRead(_userId: string, id: string): Promise<void> {
    await this.ready();
    await updateDoc(doc(getDb(), COL.notifications, id), { read: true });
  }

  async markAllInAppNotificationsRead(userId: string): Promise<void> {
    await this.ready();
    const db = getDb();
    const snap = await getDocs(
      query(collection(db, COL.notifications), where("userId", "==", userId), where("read", "==", false))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  async deleteInAppNotification(_userId: string, id: string): Promise<void> {
    await this.ready();
    await deleteDoc(doc(getDb(), COL.notifications, id));
  }

  async clearAllInAppNotifications(userId: string): Promise<void> {
    await this.ready();
    const db = getDb();
    const snap = await getDocs(query(collection(db, COL.notifications), where("userId", "==", userId)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
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
    // Rebuild the ENTIRE settings/priceSheet mirror from the catalog on every
    // publish — not just the rows edited today. Per-edit mirroring alone left
    // products whose price never changed since the mirror shipped absent from
    // the sheet, and the order-create rule rejects any cart containing an
    // unlisted product ("Missing or insufficient permissions" for buyers).
    // A full replace also drops stale entries for deleted products.
    const productsSnap = await getDocs(collection(db, COL.products));
    const prices: Record<string, number> = {};
    const minQty: Record<string, number> = {};
    productsSnap.docs.forEach((d) => {
      const p = d.data() as Product;
      prices[d.id] = p.price;
      minQty[d.id] = typeof p.minOrderQty === "number" && p.minOrderQty > 0 ? p.minOrderQty : 1;
    });
    const settings: DailyPricesSettings = {
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, COL.settings, "priceSheet"), { prices, minQty });
    batch.set(doc(db, COL.settings, "dailyPrices"), settings, { merge: true });
    await batch.commit();
    return settings;
  }

  /**
   * Take today's prices back down — the shop returns to "waiting for the
   * next price update" and stops accepting orders. Deletes the field rather
   * than blanking it, so isDailyPriceUpdatePublished() sees no timestamp at
   * all (a blank string would be a truthy-looking but invalid date).
   */
  async unpublishDailyPrices(): Promise<void> {
    await this.ready();
    await setDoc(
      doc(getDb(), COL.settings, "dailyPrices"),
      { publishedAt: deleteField(), publishedBy: deleteField() },
      { merge: true }
    );
  }

  async getStoreSettings(): Promise<StoreSettings | null> {
    await this.ready();
    const snap = await readDoc(doc(getDb(), COL.settings, "store"));
    return snap.exists() ? (snap.data() as StoreSettings) : null;
  }

  async setStoreOverride(userId: string, override: StoreOverride): Promise<StoreSettings> {
    await this.ready();
    // A forced state lapses at the next 9 PM IST, so the shop returns to its
    // schedule on its own even if nobody remembers to undo a test.
    const settings: StoreSettings = {
      override,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      ...(override === "AUTO" ? {} : { expiresAt: nextStoreClose().toISOString() }),
    };
    await setDoc(doc(getDb(), COL.settings, "store"), settings, { merge: true });
    return settings;
  }

  /**
   * The delivery hub and the pincodes we serve. World-readable — the driver
   * app needs it to sequence a run, and it is not secret.
   */
  async getServiceArea(): Promise<ServiceArea | null> {
    await this.ready();
    const snap = await readDoc(doc(getDb(), COL.settings, "serviceArea"));
    return snap.exists() ? (snap.data() as ServiceArea) : null;
  }

  async saveServiceArea(userId: string, area: ServiceArea): Promise<ServiceArea> {
    await this.ready();
    const next: ServiceArea = {
      hub: area.hub,
      radiusKm: radiusOf(area),
      // Stored sorted and de-duplicated so the admin list, the map legend and
      // the driver's pincode chips all agree on one order.
      pincodes: [...area.pincodes]
        .filter((p, i, all) => all.findIndex((q) => q.code === p.code) === i)
        .sort((a, b) => a.code.localeCompare(b.code)),
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
    await setDoc(doc(getDb(), COL.settings, "serviceArea"), next);
    return next;
  }

  /**
   * Create a delivery executive. The heavy lifting happens in /api/staff —
   * see the note there on why this cannot be done from the browser — and the
   * caller's Firebase ID token is what proves to that route we are an admin.
   */
  async createDriverAccount(input: {
    name: string;
    username: string;
    phone?: string;
    password: string;
  }): Promise<User> {
    await this.ready();
    const me = getFirebaseAuth().currentUser;
    if (!me) throw new ApiError("Not signed in.", 401);
    const idToken = await me.getIdToken();

    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, ...input }),
    });
    const json = (await res.json()) as { user?: User; error?: string };
    if (!res.ok || !json.user) {
      throw new ApiError(json.error ?? "Could not create the executive.", res.status);
    }
    return json.user;
  }

  async setDriverActive(driverId: string, active: boolean): Promise<void> {
    await this.ready();
    const me = getFirebaseAuth().currentUser;
    if (!me) throw new ApiError("Not signed in.", 401);
    const idToken = await me.getIdToken();

    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, driverId, active }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(json.error ?? "Could not change that account.", res.status);
    }
  }

  // --- Danger zone ------------------------------------------------------------
  /**
   * Deletes every buyer account plus their orders, returns, support tickets,
   * and notifications — also sweeping any leftover emailIndex/phoneIndex
   * claim docs from before phone became the sole auth method. Admin
   * accounts, the product catalog, prices, and coupons are left alone.
   * Firestore has no client-side "delete collection" call, so each
   * collection is read in full and deleted in batches of 450 (under the
   * 500-op batch limit).
   */
  async wipeDatabase(): Promise<WipeResult> {
    await this.ready();
    const db = getDb();

    async function deleteAll(
      colName: string,
      filter?: (data: DocumentData) => boolean
    ): Promise<number> {
      const snap = await getDocs(collection(db, colName));
      const targets = filter ? snap.docs.filter((d) => filter(d.data())) : snap.docs;
      for (let i = 0; i < targets.length; i += 450) {
        const chunk = targets.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      return targets.length;
    }

    const [deletedOrders, deletedTickets, deletedNotifications, deletedUsers] =
      await Promise.all([
        deleteAll(COL.orders),
        deleteAll(COL.supportTickets),
        deleteAll(COL.notifications),
        deleteAll(COL.users, (data) => (data as User).role !== "ADMIN"),
      ]);
    // Best-effort cleanup of the retired uniqueness-claim collections —
    // nothing writes to these anymore, but old docs may still be lying
    // around from before Google sign-in was removed.
    await Promise.all([deleteAll(COL.emailIndex), deleteAll(COL.phoneIndex)]);

    return { deletedUsers, deletedOrders, deletedTickets, deletedNotifications };
  }
}
