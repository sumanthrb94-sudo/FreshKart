# FreshKart — Vercel Production Launch Checklist

Reviewed against the [Vercel Production Checklist](https://vercel.com/docs/production-checklist).

**Context for this review**
- **Plan:** Hobby (Free) — Pro/Enterprise-only items are marked N/A.
- **Domain:** custom domain planned (not yet added) — DNS/SSL items are "do at cutover".
- **Architecture:** Next.js 14 (App Router) on Vercel. The browser talks to
  **Firebase Auth + Firestore directly** (no app server in the hot path). A set of
  `/api/*` route handlers exist as an alternative REST backend but are **not used**
  by the Firebase deployment. Maps use OpenStreetMap (tiles + Nominatim). Images
  come from Unsplash / Google avatars.

Legend: ✅ done · 🟡 action needed (dashboard/process) · 🔜 do at domain cutover ·
⬜ N/A for this plan/architecture · 📘 read/understand

---

## What was implemented in this pass (code)

| Change | File | Checklist item |
|---|---|---|
| Content Security Policy + full security header set (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control) | `next.config.mjs` | Security → CSP & headers |
| `poweredByHeader: false` (stop advertising framework) | `next.config.mjs` | Security hardening |
| Service worker served `no-cache` so updates ship immediately | `next.config.mjs` | Reliability → caching headers |
| Converted product image to `next/image` (optimization, lazy-load, modern formats) | `src/components/ui/ProductThumb.tsx` | Performance → Image Optimization |
| Vercel Speed Insights + Web Analytics wired in | `src/app/layout.tsx` | Performance → Speed Insights |
| Bumped Next.js 14.2.15 → **14.2.35** (clears the **critical** CVE + practically-exploitable ones, non-breaking) | `package.json` | Security → dependency vulns |

After deploying, **verify three flows** (the CSP allow-lists are scoped to these):
1. Google login (Firebase auth iframe + popup)
2. The address map (OpenStreetMap tiles + Nominatim search)
3. Product images (Unsplash + Google avatars)

If anything is blocked, the browser console names the origin — add it to the matching
directive in `next.config.mjs`.

---

## Operational excellence

| Item | Status | Notes |
|---|---|---|
| Incident response plan | 🟡 | Starter template below. Define escalation, comms channel, rollback owner before launch. |
| Stage / promote / rollback deployments | 🟡 📘 | Every push → **Preview** deploy. Merge to the production branch (or **Promote to Production** on a preview) → Production. **Instant Rollback**: Project → Deployments → pick a previous good deploy → **Promote/Rollback**. Practice this once before launch. |
| Monorepo (Turborepo) build caching | ⬜ | Single app, not a monorepo. Vercel's build cache already applies. |
| Zero-downtime DNS migration | 🔜 | Do at cutover (see "Custom domain cutover" below). |

**Incident response starter (fill in and keep somewhere the team can reach offline):**
- **Sev levels:** Sev1 = checkout/auth down · Sev2 = degraded (maps/images) · Sev3 = cosmetic.
- **Escalation:** on-call → owner → Firebase/Vercel support.
- **Comms channel:** (e.g. a WhatsApp/Slack group) + a status note for buyers.
- **Rollback:** Vercel Instant Rollback (frontend) · Firestore rules revert (Console → Rules → history) · Firebase Auth provider toggle.

## Security

| Item | Status | Notes |
|---|---|---|
| CSP + security headers | ✅ | Implemented in `next.config.mjs`. |
| Deployment Protection | 🟡 | Hobby includes **Vercel Authentication** — enable on Preview (and optionally Production) at Project → Settings → Deployment Protection so unfinished previews aren't public. (Password protection is Pro.) |
| WAF (custom rules, IP blocking, managed rulesets) | 🟡 ⬜ | Hobby has the **Firewall** tab with custom rules, IP blocking, and **Attack Challenge Mode** (turn on if attacked). Managed rulesets / advanced bot management are Pro+. |
| Log Drains | ⬜ | Pro+ only. On Hobby use the dashboard runtime logs (short retention). |
| SSL certificate issues | 🔜 | Vercel auto-provisions & renews certs. Just ensure DNS is correct at cutover; nothing to do now on `*.vercel.app`. |
| Preview Deployment Suffix w/ custom domain | ⬜ | Pro feature. N/A on Hobby. |
| Commit lockfiles | ✅ | `package-lock.json` is committed. |
| Rate limiting | 🟡 | App hits Firebase directly, so enforce at the Firebase layer: enable **Firebase App Check** (reCAPTCHA Enterprise/v3) and keep tight Firestore rules (already in `firestore.rules`). For the unused `/api/*` routes, add a Vercel Firewall rate-limit rule **or remove them** (see below). |
| Access roles for team | ⬜ | Hobby is single-user. Configure roles when you move to a Team/Pro plan. |
| SAML SSO | ⬜ | Pro add-on / Enterprise. |
| SCIM | ⬜ | Enterprise. |
| Audit Logs | ⬜ | Enterprise. |
| Cookie policy compliance | ⬜ | Enterprise item. (Separately: if you add marketing/analytics for EU users, add a consent banner — not required for the current auth-only cookies.) |
| Firewall rule to block bots | 🟡 | Enable **Attack Challenge Mode** in the Firewall tab when needed; add a `robots` disallow for admin paths if you want them out of crawlers. Full Bot Management is Pro+. |

**Recommendation — the unused `/api/*` routes:** they deploy as public serverless
functions but aren't used by the Firebase client. Either delete them before launch
(smaller attack surface, fewer functions) or protect them with a Firewall rule. Low
risk today (they're thin), but dead public endpoints are worth closing.

## Reliability

| Item | Status | Notes |
|---|---|---|
| Observability Plus | ⬜ | Pro/Enterprise. |
| Function failover (multi-region) | ⬜ | Enterprise. |
| Secure Compute passive failover | ⬜ | Enterprise. |
| Caching headers (static + function) | ✅ | `/_next/static` is auto-`immutable` by Next.js; `sw.js` now `no-cache`; `/api/*` are `force-dynamic` (correctly uncached). |
| Caching headers vs ISR (understand) | 📘 | This app has **no ISR pages** — buyer/admin screens are client-rendered against live Firebase data, so ISR doesn't apply. Static shells are CDN-cached; dynamic data is fetched client-side. |
| Distributed tracing | 🟡 | Optional. Next supports `instrumentation.ts` (OpenTelemetry). Not needed pre-launch on Hobby; revisit if you add server-side logic. |
| Load test | ⬜ | Listed Enterprise-only. Firebase scales independently; you can still do a light manual load check if desired. |

## Performance

| Item | Status | Notes |
|---|---|---|
| Speed Insights | ✅ | `@vercel/speed-insights` wired in `layout.tsx`. Data appears in the **Speed Insights** tab after the first production deploy (free tier on Hobby). |
| TTFB review | 🟡 | Most routes are statically prerendered (good TTFB). Re-check in Speed Insights after deploy. |
| Image Optimization | ✅ | `next/image` now used for product images (`ProductThumb`). Remote hosts already allow-listed in `next.config.mjs`. |
| Script Optimization | ✅ | No third-party `<script>` tags. Analytics use Vercel's optimized loader. |
| Font Optimization | ✅ | `next/font` self-hosts Inter — zero external font requests. |
| Function region == DB region | ✅ 🟡 | `vercel.json` pins `bom1` (Mumbai). **Verify your Firestore location is `asia-south1` (Mumbai/Delhi region)** to keep them co-located. |
| Third-party proxy limits | ⬜ | Enterprise. |

## Cost optimization

| Item | Status | Notes |
|---|---|---|
| Fluid compute | 🟡 | Enable at Project → Settings → Functions → **Fluid Compute** (available on Hobby) to cut cold starts for the `/api/*` functions. |
| Manage/optimize usage | 📘 | Watch the Usage tab; the Firebase-direct architecture keeps Vercel function usage near zero. |
| Spend Management + alerts | 🟡 ⬜ | Hobby has a built-in **hard usage cap** (the project pauses instead of incurring overage) — you're protected by default. Custom spend thresholds/alerts are Pro. |
| Function max duration / memory | 🟡 | Defaults are fine for the thin `/api/*` handlers. Tune only if you keep & grow them. |
| ISR revalidation times | ⬜ | No ISR in use. |
| New image optimization pricing | 🟡 | Only relevant to teams created **before 2025-02-18**. If your account is newer, already on new pricing — nothing to do. |
| Move large media to blob storage | ✅ | No large media in the repo (produce images are remote URLs; icons are generated by `next/og`). |

---

## Custom domain cutover (zero-downtime) — do when you buy the domain

1. **Lower TTL** on the current DNS records (e.g. to 300s) ~24–48h before cutover so changes propagate fast.
2. In Vercel: Project → Settings → **Domains** → add your domain. Vercel shows the exact records.
3. Either point an **A record** (`76.76.21.21`) + **CNAME** for `www` to `cname.vercel-dns.com`, **or** switch to **Vercel nameservers** for full management.
4. Vercel **auto-issues the SSL cert** once DNS resolves — wait for "Valid Configuration".
5. Verify HTTPS + redirect (apex ↔ www) before announcing. Keep the old host live until the new one is green = zero downtime.
6. After cutover, update Firebase Auth **Authorized domains** (Console → Authentication → Settings) to include the new domain, or Google login will fail.

## Priority do-now list (Hobby)

1. ✅ Deploy this branch and **verify login / map / images** (CSP).
2. 🟡 Turn on **Vercel Authentication** for Preview deployments.
3. 🟡 Enable **Fluid Compute**.
4. 🟡 Enable **Firebase App Check** (rate-limit/abuse protection for the direct-to-Firebase calls).
5. 🟡 Confirm **Firestore region == `asia-south1`** to match `bom1`.
6. 🟡 Decide on the unused `/api/*` routes (delete or firewall).
7. 📘 Practice an **Instant Rollback** once so you know the muscle memory.
8. 🔜 Plan a **Next.js 15 upgrade** (tested, not a blind bump) to fully clear the remaining advisories — most don't apply to this app's feature usage today, so this is important-but-not-blocking.
