# FreshKart on Firebase (Firestore + Auth + Storage)

This is the **chosen production backend**: the Next.js front end (on Vercel)
talks to **Firebase directly from the browser** via the client SDK — Firestore
for data, Firebase Auth for accounts, Cloud Storage for product images. There is
**no separate API server**; authorization is enforced by
[`firestore.rules`](../firestore.rules) and [`storage.rules`](../storage.rules).

```
Browser ──(Firebase Web SDK)──▶  Firebase
  Vercel-hosted Next.js            ├─ Auth        (email/password)
  NEXT_PUBLIC_FIREBASE_*           ├─ Firestore   (users, products, orders)
                                   └─ Storage     (product images)
                Security Rules enforce ownership + admin gating
```

The app auto-selects the Firebase backend whenever the `NEXT_PUBLIC_FIREBASE_*`
env vars are present (see [`src/lib/api/index.ts`](../src/lib/api/index.ts));
otherwise it runs the in-browser mock so local dev needs zero config.

---

## 1. Create the Firebase project

1. [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. **Build → Authentication → Get started →** enable **Email/Password**.
3. **Build → Firestore Database → Create database** (Production mode).
4. **Build → Storage → Get started** (for product images; optional).
5. **Project settings → General → Your apps → Web app** → copy the config.

## 2. Configure the app

Copy the web config into `.env.local` (and into Vercel env vars):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
```

> These `NEXT_PUBLIC_*` values are **not secrets** — the Firebase web config is
> meant to be public. Your data is protected by Security Rules, not by hiding
> the config.

## 3. Deploy rules & indexes

Install the Firebase CLI and deploy the rules + the composite index this app
needs (`orders` by `buyerId` + `createdAt`):

```bash
npm i -g firebase-tools
firebase login
firebase use your-project-id
firebase deploy --only firestore:rules,firestore:indexes,storage
```

(`firebase.json`, `firestore.rules`, `firestore.indexes.json`, and
`storage.rules` are all in the repo root.)

## 4. Seed data (catalog, demo accounts, sample orders)

The seed uses the Admin SDK and bypasses rules. Create a service account
(**Project settings → Service accounts → Generate new private key**), then:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json   # gitignored
export FIREBASE_PROJECT_ID=your-project-id
npm run seed:firestore
```

This creates:
- **Auth users + profiles** for the demo accounts (password `password123`):
  `customer@freshkart.in` (BUYER) and `admin@freshkart.in` (ADMIN).
- All **39 products** and a handful of **sample orders** so the admin dashboard
  isn't empty.

Re-running is safe (idempotent upserts).

## 5. Run

```bash
npm run dev
```
Log in with a demo account (one-tap on the login screen) — you're now reading
and writing live Firestore data.

---

## Data model (Firestore collections)

| Collection | Doc id | Shape |
|-----------|--------|-------|
| `users` | Firebase Auth `uid` | `User` minus `id` (role is `BUYER`/`ADMIN`) |
| `products` | product slug (e.g. `tomato`) | `Product` minus `id` |
| `orders` | auto id | `Order` minus `id` (`buyerId` = owner uid) |

Shapes are defined in [`src/lib/types.ts`](../src/lib/types.ts).

## How integrity is enforced

- **Catalog** is world-readable; only **admins** can create/delete or edit
  price/active. Signed-in users may change **only `stock`** — this is what lets
  a buyer's order/cancel transaction reserve/release stock without being able to
  tamper with prices.
- **Users** can read/edit only their own profile and cannot self-promote to
  admin; admins can read all (for the Customers screen).
- **Orders**: a buyer creates/reads only their own and may cancel only while
  `PENDING`/`CONFIRMED`; admins read all and advance status. Stock changes run
  inside Firestore **transactions** so concurrent orders can't oversell.

> **Hardening note:** because writes happen client-side, a determined signed-in
> user could still abuse the `stock`-only write allowance. For bank-grade
> integrity, move `createOrder` / `cancel` to a **Cloud Function** (callable or
> Firestore trigger) and tighten the rules to forbid client stock writes. The
> `DataSource` seam makes that swap invisible to the UI.

## Product images (Cloud Storage)

Upload images under `products/…` in Storage and store the resulting download URL
in the product's `imageUrl` field. When `imageUrl` is empty the UI shows a tinted
emoji tile, so images are optional.

## Vercel env

Add the same `NEXT_PUBLIC_FIREBASE_*` variables in **Vercel → Project →
Settings → Environment Variables**, then redeploy. Add your Vercel domain under
**Firebase Auth → Settings → Authorized domains** so sign-in works in
production. See [DEPLOYMENT.md](./DEPLOYMENT.md).
