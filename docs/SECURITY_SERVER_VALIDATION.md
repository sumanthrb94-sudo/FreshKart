# Deferred remediation: server-side order & stock validation

Two findings from the red-team pass **cannot be closed by `firestore.rules` alone**.
Both need a trusted server path. This note records exactly why, and the fix to
apply when the server work ("defense we'll do later") is scheduled. Until then the
live rules are unchanged and safe against the *price-lying* class of underpayment;
the residual is documented below.

Status: **not started.** No live change was made for these two items.

---

## Why rules cannot fix these

The order-create rule anchors the declared `subtotal` against catalogue prices with
a hand-unrolled 50-slot sum (`getExpectedSubtotal`), because CEL has no loops. That
ladder already consumes almost the entire **1000-expression evaluation budget** a
single rule gets. Measured on the Firestore emulator (the production engine):

| Subtotal ladder | Largest distinct-product order before the 1000-cap denies it |
|---|---|
| Current, live (no negative-qty guard) | **49** — cap is set to 46 |
| Add inline `&& qty > 0` clamp per slot | **29** — denies 30+ |
| Add clamp via a helper function        | **26** — denies 27+ |

The catalogue is **43 products**. Any per-line positivity/clamp check drops the
ceiling below the catalogue, so a buyer with a large cart is denied at checkout —
a real regression, and it re-introduces the item cap that was deliberately removed.
There is no headroom to add per-line logic inside the rule.

---

## HIGH — negative-quantity underpayment

**The hole.** The subtotal anchor verifies `subtotal == Σ price·qty` using server
prices, which stops a buyer *lying about prices*. It does **not** stop a **negative
quantity**: a crafted order (via the SDK, bypassing the UI) with
`[ginger +50kg, tomato −545kg]` makes `Σ price·qty` reconcile to ₹145, so the rule
accepts an order whose positive goods are worth ₹10,500.

**Why it's currently bounded (not silent theft).** Orders can only be created
`status: CONFIRMED, paymentStatus: UNPAID` (a buyer cannot self-mark PAID — rule
enforced). It is COD, so no money moves at creation. To become a loss, a human must
fulfil an order whose packing slip shows a **−545 kg** line — a glaring anomaly — and
collect the low COD amount. The gate is operational, not automated.

**The fix (server).** Make order creation go through a trusted path instead of a
direct client write:

- **Option A — Callable function `createOrder`** (recommended). The browser calls it
  instead of writing the order doc. The function reads the catalogue once, rejects
  any `qty <= 0`, recomputes `subtotal/deliveryFee/total` server-side (ignoring
  client-sent money), decrements stock, and writes the order with the Admin SDK.
  Then `firestore.rules` **denies all client order creates** (`allow create: if false`)
  — the callable becomes the only way in.
- **Option B — `onCreate` trigger** (lighter, eventually-consistent). Keep the client
  write, but a trigger validates the new order and **cancels** it
  (`status: CANCELLED`, note "invalid quantities") if any `qty <= 0` or the totals
  don't match a server recompute. Weaker: the bad order exists briefly before the
  trigger fires.

Sketch (Option A, `functions/src/index.ts`):

```ts
export const createOrder = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const { items, delivery, paymentMethod } = req.data;
  if (!Array.isArray(items) || items.length === 0 || items.length > 46)
    throw new HttpsError("invalid-argument", "Bad cart.");

  return db.runTransaction(async (tx) => {
    const sheet = (await tx.get(db.doc("settings/priceSheet"))).data()?.prices ?? {};
    let subtotal = 0, totalQty = 0;
    const snaps = await Promise.all(items.map(i => tx.get(db.doc(`products/${i.productId}`))));
    items.forEach((i, k) => {
      const qty = Number(i.qty);
      if (!Number.isFinite(qty) || qty <= 0)          // ← closes the HIGH
        throw new HttpsError("invalid-argument", "Quantities must be positive.");
      const price = sheet[i.productId];
      if (typeof price !== "number") throw new HttpsError("failed-precondition", "Price missing.");
      const p = snaps[k].data();
      if (!p || qty > p.stock) throw new HttpsError("failed-precondition", `Only ${p?.stock ?? 0} left.`);
      tx.update(snaps[k].ref, { stock: p.stock - qty });  // ← server owns stock (closes MEDIUM)
      subtotal += price * qty; totalQty += qty;
    });
    if (totalQty < 10 || totalQty > 500) throw new HttpsError("invalid-argument", "10–500 kg per order.");
    const deliveryFee = expectedDeliveryFee(subtotal);
    const ref = db.collection("orders").doc();
    tx.set(ref, { buyerId: uid, items, subtotal, deliveryFee, total: subtotal + deliveryFee,
      status: "CONFIRMED", paymentMethod, paymentStatus: "UNPAID", delivery,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), orderNumber: makeOrderNumber() });
    return { id: ref.id };
  });
});
```

Client change: `FirebaseDataSource.createOrder` calls `httpsCallable("createOrder")`
rather than running the transaction itself.

Rules change (only after the callable ships):
```
match /orders/{orderId} {
  allow create: if isAdmin();   // buyers now go through the callable
}
```

---

## MEDIUM — stock griefing

**The hole.** `products` update allows any signed-in user to change `stock` by
±10000 (`isStockChangeValid`). A buyer can decrement any product's stock to 0
without placing an order — making the catalogue look sold out — purely to grief.

**Why rules can't stop it.** The stock write and the order are separate documents;
an `update` rule cannot see sibling writes in the same transaction, so it cannot
require "this decrement is backed by a real order." And buyer-facing **cancel
legitimately increases stock** (`src/lib/api/firebase.ts:836`), so the rule can't
even forbid buyer-driven increases without breaking cancellation.

**The fix (server).** Same callable path as above owns every stock mutation
(order = decrement; cancel/reject = increment) with the Admin SDK, and rules then
**forbid all client stock writes**:

```
match /products/{productId} {
  allow read: if true;
  allow create, update, delete: if isAdmin();   // no buyer stock writes at all
}
```

Once stock only ever moves through trusted server code, griefing is gone because a
buyer can no longer write `stock` at all.

---

## Also worth doing at the same time (deferred, low)

- `hasOnlyUserFields()` whitelists `disabled`, so a buyer can self-clear an admin
  "disabled" flag on their own user doc. Split user self-update from the admin-only
  fields (`disabled`, `role`) once there's a server path.

## Account tasks only the owner can do (unrelated to the above, still open)

- Revoke the service-account keys that were shared in chat (Firebase console → IAM).
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel (still unset).
