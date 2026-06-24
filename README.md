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
- Polished **onboarding** flow (welcome → mobile → OTP → shop setup → done)
- **Login / Register** with one-tap demo accounts
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

By default the app runs on an **in-browser mock backend** (seeded with the real
catalog and demo accounts, persisted to `localStorage`) — no backend or database
required.

**Demo accounts** (password `password123`):
| Role | Email |
|------|-------|
| Buyer | `customer@freshkart.in` |
| Admin | `admin@freshkart.in` |

Both are available as **one-tap buttons** on the login screen. Or click
**Get started** to walk the onboarding flow.

---

## 🧱 Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** with design tokens from the brief (brand green `#16bd5f`)
- **lucide-react** icons · **Inter** font
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
    └── api/                  # ⭐ Swappable data layer (the backend seam)
        ├── datasource.ts     #    DataSource interface (the contract)
        ├── mock.ts           #    MockDataSource (in-browser, default)
        ├── http.ts           #    HttpDataSource (talks to your GCP API)
        └── index.ts          #    Selects adapter from env
    └── server/               # In-memory reference backend for /api routes
```

---

## 🔌 Backend-ready by design

The UI depends **only** on the [`DataSource`](./src/lib/api/datasource.ts)
interface — never on a concrete implementation. The adapter is chosen at runtime
from a single environment variable:

| `NEXT_PUBLIC_API_BASE_URL` | Data source used |
|----------------------------|------------------|
| _empty / unset_ (default)  | `MockDataSource` — in-browser, `localStorage`-backed |
| `/api`                     | The bundled Next.js **reference API** (same origin) |
| `https://…run.app`         | Your **GCP backend** (Cloud Run, etc.) |

So wiring a real backend is a **one-line env change** — no UI rewrites. The
exact REST contract your backend must implement (endpoints, request/response
shapes) is documented in **[docs/BACKEND.md](./docs/BACKEND.md)**, and is also
implemented end-to-end by the route handlers under `src/app/api/` as an
executable spec.

See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for the recommended
**Vercel (frontend) + GCP (backend)** topology and step-by-step deploy.

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
