# Deployment — Vercel (frontend) + Firebase (backend)

The production topology: host the **Next.js front end on Vercel**, and use
**Firebase** (Firestore + Auth + Storage) as the backend, reached **directly
from the browser** — there is no separate API server to deploy.

```
Vercel (Next.js)  ──(Firebase Web SDK)──▶  Firebase: Auth · Firestore · Storage
  NEXT_PUBLIC_FIREBASE_*                    (Security Rules enforce access)
```

**Backend setup (project, rules, indexes, seeding) lives in
[FIREBASE.md](./FIREBASE.md).** This page covers the Vercel side + going live.

> An alternative non-Firebase backend (custom REST on Cloud Run + Cloud SQL) is
> still supported via `NEXT_PUBLIC_API_BASE_URL`; see §3 below and
> [BACKEND.md](./BACKEND.md).

---

## 1. Frontend → Vercel

The app is a standard Next.js 14 project; Vercel auto-detects everything.

1. Push this repo to GitHub (already connected).
2. In Vercel: **New Project → Import** this repository.
3. Framework preset: **Next.js** (auto). Build command `next build`, output auto.
4. **Environment variables** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_FIREBASE_*` (six values) — your Firebase web config. With these
     set, the app uses the live Firebase backend. See [FIREBASE.md](./FIREBASE.md).
   - `NEXT_PUBLIC_APP_NAME` — optional, defaults to `FreshKart`.
   - Leave all of the above empty to ship the **in-browser mock demo** (no
     backend) and wire Firebase later.
5. **Deploy.**
6. In **Firebase → Authentication → Settings → Authorized domains**, add your
   Vercel domain(s) so sign-in works in production.

> Tip: you can ship a fully working demo to Vercel **today** with no backend by
> leaving the env vars empty — the mock data layer runs in the browser. Add the
> Firebase config and redeploy to go live.

### CLI alternative
```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

---

## 2. Backend → Firebase

See **[FIREBASE.md](./FIREBASE.md)** for the full walkthrough: create the
project, enable Email/Password auth + Firestore + Storage, set the
`NEXT_PUBLIC_FIREBASE_*` vars, deploy rules/indexes
(`firebase deploy --only firestore:rules,firestore:indexes,storage`), and seed
the catalog + demo accounts (`npm run seed:firestore`). No server to deploy —
the browser talks to Firebase directly, secured by Security Rules.

---

## 3. Alternative backend → Google Cloud (Cloud Run + Cloud SQL)

Prefer a custom REST API instead of Firebase? The repo also ships a
backend-agnostic **contract** ([BACKEND.md](./BACKEND.md)) and a reference
implementation under `src/app/api/`. Build your service to that contract, set
`NEXT_PUBLIC_API_BASE_URL` to its URL, then:

### a. Database — Cloud SQL (PostgreSQL)
```bash
gcloud sql instances create freshkart-db \
  --database-version=POSTGRES_15 --tier=db-f1-micro --region=asia-south1
gcloud sql databases create freshkart --instance=freshkart-db
gcloud sql users set-password postgres --instance=freshkart-db --password=…
```
Apply the schema from [BACKEND.md §5](./BACKEND.md#5-suggested-postgres-schema-starting-point).

### b. Secrets — Secret Manager
```bash
printf '%s' "postgresql://…" | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create AUTH_SECRET --data-file=-
```

### c. API — Cloud Run
Containerize your API and deploy:
```bash
gcloud run deploy freshkart-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT:asia-south1:freshkart-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest
```
Note the resulting URL, e.g. `https://freshkart-api-xxxx.a.run.app`.

### d. Connect the two
- Set `NEXT_PUBLIC_API_BASE_URL=https://freshkart-api-xxxx.a.run.app` in Vercel → redeploy.
- **CORS**: allow your Vercel origin and `Access-Control-Allow-Credentials: true`
  (the client sends cookies).
- **Cookies**: issue the session cookie with `SameSite=None; Secure` so it works
  cross-site between the Vercel and Cloud Run domains. (Or front both under one
  custom domain to keep it same-site.)

---

## 4. Alternative: everything on Vercel

You can also run the bundled reference API (`src/app/api/`) on Vercel and skip
an external backend — set `NEXT_PUBLIC_API_BASE_URL=/api`. Note the reference
store is **in-memory** (resets on cold start, not shared across instances), so
for real persistence replace `src/lib/server/repository.ts` with a database
client (e.g. Vercel Postgres / Neon) — or use Firebase/GCP as above.

---

## 5. Pre-deploy checklist
```bash
npm run lint
npm run typecheck
npm run build
```
All three are green in CI before every deploy.
