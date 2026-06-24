# Deployment — Vercel (frontend) + GCP (backend)

The recommended topology: host the **Next.js front end on Vercel** and the
**API + database on Google Cloud**. The front end reaches the backend purely
through `NEXT_PUBLIC_API_BASE_URL`, so the two deploy independently.

```
Vercel  ── NEXT_PUBLIC_API_BASE_URL ──▶  Cloud Run API  ──▶  Cloud SQL (Postgres)
(Next.js)                                (your service)       Secret Manager / GCS
```

---

## 1. Frontend → Vercel

The app is a standard Next.js 14 project; Vercel auto-detects everything.

1. Push this repo to GitHub (already connected).
2. In Vercel: **New Project → Import** this repository.
3. Framework preset: **Next.js** (auto). Build command `next build`, output auto.
4. **Environment variables** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL` — leave **empty** to ship the in-browser mock
     demo, or set it to your Cloud Run URL once the backend is live.
   - `NEXT_PUBLIC_APP_NAME` — optional, defaults to `FreshKart`.
5. **Deploy.**

> Tip: you can ship a fully working demo to Vercel **today** with no backend by
> leaving `NEXT_PUBLIC_API_BASE_URL` empty — the mock data layer runs in the
> browser. Wire the backend later by setting the variable and redeploying.

### CLI alternative
```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

---

## 2. Backend → Google Cloud (Cloud Run + Cloud SQL)

The repo does not ship the backend service itself — it ships the **contract**
(see [BACKEND.md](./BACKEND.md)) and a reference implementation under
`src/app/api/`. Build your service to that contract, then:

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

## 3. Alternative: everything on Vercel

You can also run the bundled reference API (`src/app/api/`) on Vercel and skip
GCP entirely — set `NEXT_PUBLIC_API_BASE_URL=/api`. Note the reference store is
**in-memory** (resets on cold start, not shared across instances), so for real
persistence replace `src/lib/server/repository.ts` with a database client
(e.g. Vercel Postgres / Neon) — or use GCP as above.

---

## 4. Pre-deploy checklist
```bash
npm run lint
npm run typecheck
npm run build
```
All three are green in CI before every deploy.
