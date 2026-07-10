# Green Basket on Firebase (Firestore + Phone Auth + Storage)

The production backend: the Next.js front end (on Vercel) talks to **Firebase
directly from the browser** — **Firestore** for data, **Firebase Phone Auth**
(mobile + OTP) for accounts, **Cloud Storage** for product images. There is **no
separate API server**; authorization is enforced by
[`firestore.rules`](../firestore.rules) and [`storage.rules`](../storage.rules).

```
Browser ──(Firebase Web SDK)──▶  Firebase
  Vercel-hosted Next.js            ├─ Phone Auth  (mobile number + OTP)
  NEXT_PUBLIC_FIREBASE_*           ├─ Firestore   (users, products, orders)
                                   └─ Storage     (product images)
                Security Rules enforce ownership + admin gating
```

The app auto-selects Firebase whenever the `NEXT_PUBLIC_FIREBASE_*` env vars are
present (see [`src/lib/api/index.ts`](../src/lib/api/index.ts)).

---

## 1. Create / configure the project

1. [Firebase console](https://console.firebase.google.com/) → your project (`freshkart-e0479`).
2. **Build → Firestore Database → Create database.** Pick a region. (Use the
   **Firestore** product — *not* the Realtime Database.)
3. **Build → Authentication → Sign-in method → enable Phone.**
4. **Build → Storage → Get started** (optional, for product images).
5. **Project settings → General → Your apps → Web app** → copy the config into
   `.env.local` (and Vercel). These `NEXT_PUBLIC_*` values are **not secrets**.

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=freshkart-e0479.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=freshkart-e0479
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=freshkart-e0479.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=…   # optional (Analytics)
```

## 2. Open Firestore rules

> ⚠️ A freshly created Firestore is **locked** (`PERMISSION_DENIED` on every
> read/write). "Test mode" set on the Realtime Database does **not** apply to
> Firestore. Do one of:

**Quick (test mode):** Firestore → **Rules** → publish, temporarily:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}
```
**Proper (recommended before launch):** deploy the repo's hardened rules:
```bash
npm i -g firebase-tools
firebase login
firebase use freshkart-e0479
firebase deploy --only firestore:rules,firestore:indexes,storage
```
The index in `firestore.indexes.json` (orders by `buyerId` + `createdAt`) backs
the buyer "My orders" query.

## 3. Seed the catalog (39 products)

**With test-mode rules open** (web SDK, no service account):
```bash
npm run seed:firestore:client
```
**With the hardened rules / locked rules** (Admin SDK bypasses rules — grab a
service-account key from Project settings → Service accounts):
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
export FIREBASE_PROJECT_ID=freshkart-e0479
npm run seed:firestore
```

## 4. Add a test phone number (so you can sign in without SMS)

Auth → Sign-in method → Phone → **Phone numbers for testing** → e.g.
`+91 98765 43210` → code `123456`. Then on the Vercel/preview domain add it under
Auth → Settings → **Authorized domains** (localhost is allowed by default).

> **Note:** if you add a real phone number here, it will **not** receive an SMS;
> sign in with the fixed test code instead.

## 5. Make yourself an admin

Auth is phone-only, so there are no preset admin accounts. After your **first
phone sign-in** a `users/<uid>` profile is created with `role: "BUYER"`. To get
the admin console: Firestore → `users` → your doc → set **`role`** to `ADMIN`.
Reload — the **Admin** pill appears and `/admin` is unlocked.

## 6. Run

```bash
npm run dev   # → http://localhost:3000
```
Open the app → onboarding → enter your (test) number → code → set up shop → shop.

---

## Auth & sign-in flow

| Who | Flow |
|-----|------|
| New user | onboarding: mobile → OTP → **set up shop** (creates `users/<uid>`, `role: BUYER`) → shop |
| Returning buyer | onboarding: mobile → OTP → shop |
| Admin | same phone flow; their `users/<uid>` doc has `role: ADMIN` → `/admin` |

Phone Auth uses a **visible reCAPTCHA v2** checkbox (handled in
[`src/lib/firebase/phone-auth.ts`](../src/lib/firebase/phone-auth.ts)). Sessions
persist across reloads; `onAuthStateChanged` is the app's source of truth.

## Data model (Firestore collections)

| Collection | Doc id | Shape |
|-----------|--------|-------|
| `users` | Firebase Auth `uid` | `User` minus `id` (`role` = `BUYER`/`ADMIN`) |
| `products` | product slug (e.g. `tomato`) | `Product` minus `id` |
| `orders` | auto id | `Order` minus `id` (`buyerId` = owner uid) |
| `settings/dailyPrices` | `dailyPrices` | `DailyPricesSettings` — last daily price-update timestamp |

Shapes are in [`src/lib/types.ts`](../src/lib/types.ts).

## How integrity is enforced (hardened rules)

- **Catalog** is world-readable; only **admins** edit price/active; signed-in
  users may change **only `stock`** (so buyer order/cancel transactions can
  reserve/release stock without tampering with prices).
- **Users** read/edit only their own profile; no self-promotion to admin; admins
  read all (Customers screen).
- **Orders**: a buyer creates/reads only their own and may cancel only while
  `PENDING`/`CONFIRMED`; admins read all and advance status. Stock changes run
  in Firestore **transactions** so concurrent orders can't oversell.
- **Daily price-update gate**: `/settings/dailyPrices` is world-readable and
  admin-writable. Orders are rejected until an admin publishes today's prices
  (IST 07:00 cutoff). Admins see a **"Publish today's prices"** button on the
  dashboard and inventory screens.

> **Hardening note:** because writes are client-side, a signed-in user could
> still abuse the `stock`-only allowance. For bank-grade integrity, move
> `createOrder`/`cancel` to a **Cloud Function** and forbid client stock writes —
> the `DataSource` seam makes that swap invisible to the UI.

## Product images (Cloud Storage)

Upload under `products/…` and store the download URL in the product's `imageUrl`.
When empty, the UI shows a tinted emoji tile, so images are optional.

## Vercel

Add the `NEXT_PUBLIC_FIREBASE_*` vars in **Vercel → Settings → Environment
Variables**, and add your Vercel domain to **Firebase Auth → Settings →
Authorized domains**. See [DEPLOYMENT.md](./DEPLOYMENT.md).
