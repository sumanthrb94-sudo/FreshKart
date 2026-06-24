# FreshKart — Backend Integration Contract

This front end is **backend-agnostic**. It talks to whatever you point
`NEXT_PUBLIC_API_BASE_URL` at, through the typed
[`DataSource`](../src/lib/api/datasource.ts) interface. This document is the
contract a real backend (e.g. on Google Cloud) must satisfy.

Everything below is **already implemented** in two places you can read as an
executable spec:

- **TypeScript contract** — [`src/lib/api/datasource.ts`](../src/lib/api/datasource.ts)
- **HTTP client** — [`src/lib/api/http.ts`](../src/lib/api/http.ts) (what the browser sends)
- **Reference server** — [`src/app/api/`](../src/app/api) + [`src/lib/server/repository.ts`](../src/lib/server/repository.ts) (a working in-memory implementation)

Reproduce the same routes + shapes against a real database and the app works
unchanged.

---

## 1. Data model

All shapes are defined in [`src/lib/types.ts`](../src/lib/types.ts). Summary:

| Entity | Key fields |
|--------|-----------|
| **User** | `id, name, email, phone, role(BUYER\|ADMIN\|SELLER), businessName?, city?, address?, pincode?, gstin?, createdAt` |
| **Product** | `id, name, category, unit(kg\|pc), price, minOrderQty, stock, origin, active, imageUrl?` |
| **Order** | `id, orderNumber, buyerId, businessName, items[], status, paymentMethod, paymentStatus, subtotal, deliveryFee, total, delivery, notes?, createdAt, updatedAt` |
| **OrderItem** | `productId, name, unit, price, qty, lineTotal, imageUrl?` |
| **DeliveryDetails** | `name, phone, city, address, pincode` |
| **Customer** (admin view) | `id, name, businessName?, phone, city?, orderCount, totalSpent` |
| **AdminStats** | `revenue, orderCount, productCount, activeProductCount, customerCount, lowStockCount, ordersByStatus` |

**Enums**
- `OrderStatus`: `PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`, plus `CANCELLED`
- `PaymentMethod`: `COD | CREDIT | ONLINE`
- `PaymentStatus`: `UNPAID | PAID`

**Conventions**
- Currency: whole rupees (integers), formatted client-side as `₹1,250` (`en-IN`).
- `orderNumber` format: `ORD-YYYYMMDD-XXXXXX`.
- `deliveryFee` is always `0` (free delivery); `total = subtotal`.
- Low stock = `active && stock <= minOrderQty * 2`.
- Cancelling an order **releases** its reserved stock back to the catalog.

---

## 2. REST endpoints

Base URL = `NEXT_PUBLIC_API_BASE_URL`. All bodies are JSON. Errors return
`{ "message": string }` with an appropriate 4xx/5xx status.

### Auth
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/login` | `{ email, password }` | `User` (401 on bad creds) |
| POST | `/auth/register` | `{ name, businessName, email, phone, city, password }` | `User` (409 on duplicate email) |
| PATCH | `/users/:id` | `Partial<User>` (email & role ignored) | `User` |

### Catalog
| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/products` | — | `Product[]` |
| GET | `/products/:id` | — | `Product \| null` |
| PATCH | `/products/:id` | `{ price?, stock?, active? }` | `Product` |

### Orders
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/orders` | `{ buyerId, items: [{productId, qty}], delivery, paymentMethod, paid }` | `Order` (validates stock) |
| GET | `/orders?buyerId=…` | — | `Order[]` (omit `buyerId` ⇒ all, for admin) |
| GET | `/orders/:id` | — | `Order \| null` |
| PATCH | `/orders/:id/status` | `{ status }` | `Order` |
| POST | `/orders/:id/cancel` | — | `Order` (releases stock) |

### Admin
| Method | Path | Returns |
|--------|------|---------|
| GET | `/customers` | `Customer[]` |
| GET | `/admin/stats` | `AdminStats` |

### Ops
| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{ status: "ok" }` |

---

## 3. Auth notes for production

The reference implementation returns the `User` directly and the browser stores
the session in `localStorage` (fine for a demo). For production:

- Issue an **httpOnly, Secure session cookie** on `/auth/login` and `/auth/register`.
  The `HttpDataSource` already sends `credentials: "include"` on every request.
- Enforce authorization server-side: buyers may only read/cancel **their own**
  orders; only `ADMIN` may call `/products/:id` (PATCH), `/orders/:id/status`,
  `/customers`, and `/admin/stats`.
- Hash passwords (e.g. bcrypt/argon2). Never store plaintext (the in-memory
  reference does, intentionally, for clarity only).

---

## 4. Recommended GCP architecture

```
            ┌──────────────────────┐         ┌───────────────────────────┐
  Browser ─▶│  Vercel (Next.js FE)  │ ──────▶ │  Cloud Run (FreshKart API) │
            └──────────────────────┘  HTTPS   └───────────┬───────────────┘
                NEXT_PUBLIC_API_BASE_URL                   │
                = https://…run.app              ┌──────────┴───────────┐
                                                │  Cloud SQL (Postgres) │
                                                │  + Secret Manager      │
                                                │  + Cloud Storage (imgs)│
                                                └────────────────────────┘
```

- **Cloud Run** — containerized API implementing the routes above. Stateless,
  autoscaling. Put it behind a custom domain or use the `*.run.app` URL.
- **Cloud SQL (PostgreSQL)** — `users`, `products`, `orders`, `order_items`.
  Connect from Cloud Run via the Cloud SQL connector (`DATABASE_URL`).
- **Secret Manager** — `DATABASE_URL`, `AUTH_SECRET`, payment keys.
- **Cloud Storage** — product images; serve via CDN and store the URL in
  `Product.imageUrl` (the UI falls back to emoji tiles when absent).
- **Payments** — the UI ships a *simulated* gateway. To go live, implement a
  real provider (e.g. Razorpay) server-side and only mark `paymentStatus: PAID`
  after a verified webhook.

Any language/framework works (Node/Express, Go, Python/FastAPI, …) — only the
JSON contract matters.

---

## 5. Suggested Postgres schema (starting point)

```sql
create type role as enum ('BUYER','ADMIN','SELLER');
create type unit as enum ('kg','pc');
create type order_status as enum ('PENDING','CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED');
create type payment_method as enum ('COD','CREDIT','ONLINE');
create type payment_status as enum ('UNPAID','PAID');

create table users (
  id            text primary key,
  name          text not null,
  email         text unique not null,
  password_hash text not null,
  phone         text not null,
  role          role not null default 'BUYER',
  business_name text,
  city          text,
  address       text,
  pincode       text,
  gstin         text,
  created_at    timestamptz not null default now()
);

create table products (
  id            text primary key,
  name          text not null,
  category      text not null,
  unit          unit not null,
  price         integer not null,
  min_order_qty integer not null,
  stock         integer not null,
  origin        text not null,
  active        boolean not null default true,
  image_url     text
);

create table orders (
  id             text primary key,
  order_number   text unique not null,
  buyer_id       text not null references users(id),
  business_name  text not null,
  status         order_status not null default 'PENDING',
  payment_method payment_method not null,
  payment_status payment_status not null default 'UNPAID',
  subtotal       integer not null,
  delivery_fee   integer not null default 0,
  total          integer not null,
  delivery       jsonb not null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table order_items (
  order_id   text not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  name       text not null,
  unit       unit not null,
  price      integer not null,
  qty        integer not null,
  line_total integer not null
);
```
