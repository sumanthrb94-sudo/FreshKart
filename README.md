# 🥦 FreshKart — B2B Wholesale Produce Marketplace

A Ninjacart-style **B2B wholesale fresh-produce marketplace** connecting buyers
(kirana stores, retailers, HoReCa) with fresh fruit & vegetable supply — priced
per kg / per piece, ordered in bulk with minimum-order quantities.

This repository is a **complete, production-shaped front end** (Next.js 14) built
to the [FreshKart design brief](./docs/DESIGN_BRIEF.md), with a clean,
**backend-ready** data layer so a real API (e.g. on Google Cloud) can be wired in
without touching any UI code.

> **Tagline:** Wholesale B2B · per kg
> **Promise:** Live B2B rates · order in bulk · pay COD, credit or online · 1–2 day delivery.

---

## ✨ What's included

**Buyer app**
- **Phone-OTP onboarding / sign-in** (mobile number → 6-digit code → shop setup) powered by Firebase Phone Auth — no passwords, no demo accounts. The app is **auth-gated**: logged-out visitors land directly on the phone sign-in screen
- **Shop** (search + category filter, promo banner, MOQ quantity steppers, stock caps, sticky cart bar)
- **Checkout** bottom sheet (items, delivery details, payment method, bill)
- **Mock payment** sheet (Card / UPI, TEST MODE, simulated gateway)
- **Order success** overlay + page, **Orders list**, **Order tracking** (5-stage timeline + cancelled state)
- **Account** profile management

**Admin console**
- **Overview** (revenue, orders, products, customers, low-stock; orders-by-status; recent orders)
- **Orders** (advance status PENDING→…→DELIVERED / cancel, releasing stock)
- **Products** (edit price & stock, toggle active, low-stock flagging, dirty-aware Save)
- **Customers** (order count + total spent)

**System**: loading, 404, and error screens. Every screen has its empty / loading / error / success states.

---

## 🚀 Quickstart

```bash
npm install
npm run dev
# open http://localhost:3000
```

Sign-in is **phone/OTP** via Firebase Phone Auth. New users walk the onboarding
flow (mobile number → 6-digit code → set up shop); returning users land straight
in the shop. **Admins** are phone users whose Firestore profile has
`role: "ADMIN"` (set once in the console — see
[docs/FIREBASE.md](./docs/FIREBASE.md)).

> Configure the Firebase env vars (below) to enable sign-in. For local testing
> without real SMS, add a **test phone number** in Firebase console → Auth →
> Sign-in method → Phone. Sign-in is **required** — the app opens on the phone
> login screen, so Firebase must be configured to get past it.

---

## 🧱 Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** with design tokens from the brief (brand green `#16bd5f`)
- **lucide-react** icons · **Inter** font
- **Firebase** (Firestore + Auth + Storage) backend, client-SDK direct
- Zero runtime backend dependency in the default (mock) mode

---

## 🗂️ Project structure

```
src/
├── app/                      # Routes (App Router)
│   ├── page.tsx              # / — Shop (primary screen)
│   ├── login, register, onboarding, account
│   ├── orders/, orders/[id]/, order-success/[id]/
│   ├── admin/, admin/orders, admin/products, admin/customers
│   ├── api/                  # Reference REST backend (see docs/BACKEND.md)
│   ├── layout.tsx, loading.tsx, not-found.tsx, error.tsx
│   └── globals.css
├── components/
│   ├── ui/                   # Atoms/molecules: Button, Field, Badge, Card, Sheet, …
│   ├── buyer/                # Buyer organisms + screens
│   ├── admin/                # Admin shell + screens
│   ├── auth/                 # Login/Register
│   ├── onboarding/           # Onboarding flow
│   ├── layout/               # AppShell (480px column)
│   └── providers/            # Auth + Cart React contexts
└── lib/
    ├── types.ts              # Domain model (single source of truth)
    ├── format.ts             # Currency/date/status/payment presentation
    ├── mock-data.ts          # Real catalog, demo accounts, seed orders
    ├── produce.ts            # Emoji thumbnail mapping
    ├── hooks.ts              # useAsync, useRequireAuth
    ├── firebase/             # Firebase client init (lazy, authReady)
    ├── api/                  # ⭐ Swappable data layer (the backend seam)
    │   ├── datasource.ts     #    DataSource interface (the contract)
    │   ├── firebase.ts       #    FirebaseDataSource (Firestore + Auth) ⭐
    │   ├── mock.ts           #    MockDataSource (in-browser, default)
    │   ├── http.ts           #    HttpDataSource (optional custom REST API)
    │   └── index.ts          #    Selects adapter from env
    └── server/               # In-memory reference backend for /api routes

firestore.rules, storage.rules, firestore.indexes.json, firebase.json  # Firebase config
scripts/seed-firestore.ts     # Seed catalog + demo accounts (Admin SDK)
```

---

## 🔌 Backend: Firebase (Firestore + Auth + Storage)

The production backend is **Firebase**, reached **directly from the browser**
via the client SDK — no separate API server. The UI depends **only** on the
[`DataSource`](./src/lib/api/datasource.ts) interface, and the adapter is chosen
at runtime from environment variables:

| Env present | Data source used |
|-------------|------------------|
| `NEXT_PUBLIC_FIREBASE_*` | **`FirebaseDataSource`** — Firestore + Firebase Auth (production) |
| `NEXT_PUBLIC_API_BASE_URL` | `HttpDataSource` — a custom REST backend (optional alternative) |
| _neither_ (default) | `MockDataSource` — in-browser, `localStorage` (zero-config local dev) |

So switching from the local mock to live Firebase is **just adding env vars** —
no UI changes. Authorization is enforced by
[`firestore.rules`](./firestore.rules) / [`storage.rules`](./storage.rules), and
stock updates use Firestore transactions so concurrent orders can't oversell.

**👉 Full setup (project, rules, indexes, seeding, deploy): [docs/FIREBASE.md](./docs/FIREBASE.md).**

> The repo also ships a backend-agnostic REST contract
> ([docs/BACKEND.md](./docs/BACKEND.md)) + Next.js route handlers under
> `src/app/api/` — handy if you ever want a non-Firebase backend.

See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for the **Vercel (frontend) +
Firebase (backend)** deploy.

---

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

---

## 🎨 Design

Built mobile-first as a centered **480px column** (soft shadow on desktop). The
full design system — color/type/spacing tokens, components, screen specs,
business cycles and real content — lives in
**[docs/DESIGN_BRIEF.md](./docs/DESIGN_BRIEF.md)**.
