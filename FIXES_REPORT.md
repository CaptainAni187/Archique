# Archiverse — Security Hardening (Status)

Last updated: 2026-07-16. Scope: auth/session/env/rate-limiting hardening only.
Tests: 19/19 pass · lint: 0 errors · build: OK.

---

## ✅ Fixed in this pass

| # | Issue | What changed |
|---|-------|--------------|
| 1 | **In-memory rate limiting** (useless across serverless instances) | New `rate_limits` table + atomic `consume_rate_limit` SQL RPC. `rateLimit.js` is now shared/DB-backed with a per-instance fallback. Login + reset endpoints `await` it. |
| 2 | **In-memory password-reset tokens** (broken on Vercel) | New `admin_password_reset_tokens` table. Only a **SHA-256 hash** of the token is stored; single-use + expiry enforced in DB. |
| 3 | **Empty/weak JWT secrets** | `adminSession.js` and `userSession.js` now **throw** if their secret is missing or < 32 chars. Signing with `''` is impossible. |
| 4 | **Shared admin/user signing key** | `env.js` no longer falls back `USER_SESSION_SECRET → ADMIN_SESSION_SECRET`. Independent keys, both set in `.env`. |
| 5 | **Hardcoded admin emails in code** | Removed `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_BACKUP_EMAIL`; sourced from env only. |
| 6 | **Hardcoded inquiry recipients** | Moved to `INQUIRY_NOTIFICATION_RECIPIENTS` env var. |
| 7 | **DB-outage → weaker env-admin fallback** | `isAdminStoreUnavailable` now only trips on a genuinely missing table (fresh bootstrap), not transient network/auth errors. |
| 8 | **Non-constant-time signature check** | Razorpay signature now uses `crypto.timingSafeEqual`. |
| 9 | **Two `.env` files + committed template** | Deleted `.env.local` and `.env.example`; everything consolidated into a single `.env`; `loadEnv.js` loads only `.env`. |
| 10 | **No API security headers** | `sendJson` now sets `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `no-store`, and HSTS on every response. |

---

## 🔧 You must do these before going live (I can't do them for you)

1. **ROTATE every secret** — the Supabase service-role key, Razorpay secret, admin password, and session secrets were all exposed in plaintext. Generate new ones in the Supabase / Razorpay dashboards. New strong session secrets are already in `.env`.
2. **Apply the migration** so the new tables/RPC exist:
   `supabase/migrations/20260716_archiverse_rate_limit_and_reset_tokens.sql`
   (Until applied, rate limiting silently falls back to per-instance memory.)
3. **Set env vars in the Vercel dashboard** (production doesn't read `.env`): all keys from `.env`, especially the two distinct session secrets and `INQUIRY_NOTIFICATION_RECIPIENTS`.
4. **Turn on edge protection** — app-level rate limiting stops credential stuffing/bot logins, but *volumetric DDoS must be handled at the edge*. Enable **Vercel Firewall / Attack Challenge Mode**, or put **Cloudflare (free tier)** in front with Bot Fight Mode + rate rules. This is the real "DDoS / bot" defense.

---

## 📋 Recommended admin logging system

You already have the right foundation: an `admin_activity_logs` table (service-role-only RLS) and `logAdminActivity()`. To make it audit-grade:

- **Log every state change, not just login/logout.** Wrap create/update/delete of artworks, combos, orders, tags, and price changes with `logAdminActivity({ action_type, resource_type, resource_id, details })`. Right now coverage is partial.
- **Record the "before/after" in `details`** for updates so you can answer "who changed this price and from what".
- **Always capture IP + user-agent** (already stored on `admin_sessions`; copy onto each log row for tamper-independent history).
- **Log failed auth too** — failed logins currently only `console.warn`. Persist them (with IP) so you can spot brute-force patterns and feed alerting.
- **Make logs append-only** — add a DB policy/trigger blocking `UPDATE`/`DELETE` on `admin_activity_logs` so even a compromised service key can't rewrite history.
- **Retention + export** — keep 90–180 days hot, archive older rows; expose a read-only admin view (you have `fetchAdminActivity`).
- **Alerting** — on sensitive events (password reset, new admin, bulk delete) fire the existing `ADMIN_NOTIFICATION_WEBHOOK_URL`.

Keep app logs (activity) separate from platform logs (Vercel request logs / Supabase logs) — together they give you a full trail.

---

## Not touched (out of scope for this pass)
- AI assistant's hardcoded localhost Ollama dependency (degrades to keyword search in prod).
- Payment verify amount cross-check; upload magic-byte validation.
- Pre-existing `useMemo` lint warnings in card components.
