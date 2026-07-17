import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type User as FirebaseUser,
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

const COL = {
  users: "users",
  products: "products",
  orders: "orders",
  returns: "returns",
  settings: "settings",
  emailIndex: "emailIndex",
  phoneIndex: "phoneIndex",
} as const;

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
 * Claim a unique value (email or phone) for this user via an index doc whose
 * ID is the normalized value itself. Firestore security rules only allow
 * `create` on a slot this user doesn't already own (see firestore.rules) —
 * writing to a slot already claimed by someone else is evaluated as an
 * `update` and denied, which is how "already taken" is detected. No read of
 * other users' data is ever needed, unlike a `list` query across `users`
 * filtered by email/phone (which rules can't safely grant to a non-admin —
 * it would let any signed-in buyer dump every other buyer's profile).
 */
async function claimUnique(
  fbUser: FirebaseUser,
  ref: DocumentReference<DocumentData>,
  label: string
): Promise<void> {
  try {
    await setDoc(ref, { uid: fbUser.uid });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "permission-denied") {
      throw new ApiError(`This ${label} is already linked to another account.`);
    }
    throw e;
  }
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

    // Force a fresh ID token before any of the writes below — right after
    // sign-in, Firestore's client can briefly lag behind Auth (worse on
    // browsers with slower/partitioned storage), and a stale token here would
    // get a spurious permission-denied misread as "already taken" by the
    // claim writes just below.
    await fb.getIdToken();

    // Enforce one account per email and one account per phone via claim docs
    // (id = the normalized value) instead of querying across `users` — a
    // `list` query filtered by email/phone can never be granted to a
    // non-admin without letting them dump every buyer's profile, so
    // Firestore rejected it outright for every sign-up ("Missing or
    // insufficient permissions" on every new Google/phone account). Claiming
    // only ever needs `create` on a doc this user doesn't already own; the
    // rules deny writing to a slot owned by someone else, which is how
    // "taken" is detected — no read of other users' data required.
    const db = getDb();
    if (email) await claimUnique(fb, doc(db, COL.emailIndex, email), "email");
    if (phone) await claimUnique(fb, doc(db, COL.phoneIndex, phone), "phone number");

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
   * Load (or bootstrap) the Firestore profile for a Google-authenticated
   * Firebase user, shared by both the popup and redirect sign-in paths.
   * Configured admin email(s) are promoted to ADMIN here so they land
   * straight in the console — no buyer onboarding.
   */
  private async resolveGoogleUser(fbUser: FirebaseUser): Promise<User | null> {
    // Try to load the profile — but if Firestore is momentarily unreachable,
    // DON'T dead-end the sign-in with an error. Treat it as a fresh account
    // and let the user set up their shop; completeProfile uses { merge: true },
    // so it's safe even if a profile already exists. This is the fix for
    // "Google created the user but the app showed 'Connection timed out' and
    // never let me in".
    const ref = doc(getDb(), COL.users, fbUser.uid);
    const wantsAdmin = isAdminEmail(fbUser.email);
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
          name: fbUser.displayName || "Admin",
          email: fbUser.email || "",
          phone: fbUser.phoneNumber || "",
          role: "ADMIN",
          businessName: "Green Basket Admin",
          createdAt: new Date().toISOString(),
        };
        await setDoc(ref, adminProfile as DocumentData);
        return { ...adminProfile, id: fbUser.uid };
      }
      return null;
    } catch {
      return null;
    }
  }

  async signInWithGoogle(): Promise<User | null | undefined> {
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
      // Popups are blocked or simply unsupported in this environment — the
      // most common reason Google sign-in works on desktop Chrome but fails
      // on iOS Safari (popups routinely blocked) and in-app browsers like
      // Instagram/Facebook (no window.open at all). Fall back to a full-page
      // redirect instead of dead-ending the user with a cryptic Firebase
      // error; the result is picked up by completeGoogleRedirect() on the
      // next page load.
      if (
        code.includes("popup-blocked") ||
        code.includes("operation-not-supported-in-this-environment")
      ) {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return undefined; // browser is navigating away
      }
      if (code.includes("operation-not-allowed")) {
        throw new ApiError("Google sign-in isn't enabled for this project yet.");
      }
      if (code.includes("unauthorized-domain")) {
        throw new ApiError("This domain isn't authorized for sign-in. Add it in Firebase Auth settings.");
      }
      throw new ApiError(e instanceof Error ? e.message : "Google sign-in failed.");
    }
    return this.resolveGoogleUser(cred.user);
  }

  async completeGoogleRedirect(): Promise<{ user: User | null } | null> {
    const auth = getFirebaseAuth();
    let cred;
    try {
      cred = await getRedirectResult(auth);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code.includes("unauthorized-domain")) {
        throw new ApiError("This domain isn't authorized for sign-in. Add it in Firebase Auth settings.");
      }
      throw new ApiError(e instanceof Error ? e.message : "Google sign-in failed.");
    }
    if (!cred) return null; // no redirect sign-in was pending
    return { user: await this.resolveGoogleUser(cred.user) };
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
    if (patch.price !== undefined) {
      await setDoc(
        doc(db, COL.settings, "priceSheet"),
        { prices: { [id]: patch.price } },
        { merge: true }
      );
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
      { prices: { [ref.id]: normalised.price } },
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
    if (totalQty < MIN_ORDER_TOTAL_QTY) {
      throw new ApiError(
        `Minimum order is ${MIN_ORDER_TOTAL_QTY} kgs. You have ${totalQty} kgs.`
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
    }));

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
    await withFreshTokenRetry(() =>
      setDoc(
        ref,
        Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as DocumentData
      )
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
