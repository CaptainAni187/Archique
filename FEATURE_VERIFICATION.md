# Archiverse — Feature Verification & Fixes

Verified 2026-07-16 by running the app (Vite + dev API) against the live Supabase and driving each flow. Lint: 0 errors · Tests: 19/19 · Build: OK.

---

## ✅ Fixed in this pass (code — live now, no DB needed)

1. **Orphaned pages were unreachable** — Commission, About, and Policies are fully built but had **no links anywhere**. Added a **site-wide footer** (Explore / Studio / Legal columns + socials) shown on all non-immersive pages, and added **ABOUT + COMMISSION** to the header ABOUT dropdown. All pages are now reachable. (`src/components/SiteFooter.jsx`, `src/App.jsx`, `src/components/SiteHeader.jsx`, footer CSS in `App.css`.)
2. **Admin artwork upload/edit/delete was blocked** — `registerTags` threw when the `tag_registry` table is missing, aborting the whole create/update before the artwork was saved. Made it fault-tolerant (consistent with the existing missing-column fallbacks). **Verified end-to-end: create (201) → edit (200) → delete (200) → gone (404).** (`api/artworks.js`)
3. **Console leaked the admin token + every API payload** in production — `console.log('API RESPONSE', …)` in `backendApiService.js` and `adminAuthService.js` (the latter logs the login token). Gated behind `import.meta.env.DEV`. (Store's `debug:` line was already `DEV`-gated — no change needed.)

## ✅ Verified working (no change needed)

- **Home, Store (16 artworks, filters, Ask-AI, mood chips), Product (price/stock/shipping/Save/Buy/room-visualizer), Room Match (upload UI), About, Policies, Privacy, Commission form, User Login/Signup UI** all render cleanly, no console errors.
- **Admin login** (env bootstrap admin) works.
- **Admin dashboard + all 9 tabs** (Dashboard, Artworks, Combos, Orders, Testimonials, Inquiries, Commissions, Settings, AI Studio) load and **degrade gracefully** when their tables are missing (show 0s instead of crashing).
- **Room Match** page renders and the upload/take-photo controls work (matching is client-side).

---

## ✅ DB migrations APPLIED (2026-07-16) — previously-blocked features now verified

All 8 pending migrations were applied to the live Supabase DB (via the Mumbai pooler, single transaction). One data conflict handled: `analytics_events`/`visitor_events` `event_type` CHECK constraints were applied `NOT VALID` so pre-existing `recommendation_*` rows are grandfathered. Verified after applying:

- ✅ **User signup → login → /me** — end-to-end via API **and** through the real UI (redirects to My Account; `provider`/`login_count` populate). Was failing before with `PGRST204 provider column`.
- ✅ **Admin artwork create → edit → delete** — full cycle, tags now register into `tag_registry`.
- Now unblocked (schema present; wired correctly): save-to-collection, saved artworks, room profiles, digest personalization, commission submission (`commissions` columns), room-match save (`user_room_profiles`), AI Studio tag governance/feedback, admin password reset (`admin_password_reset_tokens`).

Test accounts/artworks created during verification were deleted (0 test rows remain).

## ✅ User "forgot password" flow — ADDED & verified (2026-07-16)

Built a full user-facing password reset, mirroring the admin flow and its security model:
- **DB:** `user_password_reset_tokens` table (SHA-256 hash only, single-use, 30-min expiry) — created live.
- **API:** `POST /api/user/forgot-password` (rate-limited, CSRF-guarded, **generic response to prevent email enumeration**) and `POST /api/user/reset-password` (validates token, rotates password). Routing added to `vercel.json` (+ dev server handles it generically).
- **UI:** "Forgot password?" toggle on the login page reveals a request-token + set-new-password panel, styled to match.
- **Verified end-to-end:** signup → forgot (generic 200) → mint token → reset (200) → token reuse rejected (401) → login with new password (200) → old password rejected (401). Test users cleaned up.
- **Note:** delivering the token to the user requires email configured (below). The flow is correct; the email just won't send until then.

## ⚙️ Email delivery (Resend) — wire-up done, key needed

All emails (admin + user password-reset tokens, welcome, order/commission notifications) go through Resend. `.env` now documents the exact setup steps. **Action for you:** create a Resend API key + verify a sending domain, then set `RESEND_API_KEY` and `FROM_EMAIL`. Until then, emails are silently skipped and the rest of each flow still works.

---

### Next step
Apply `supabase/SYNC_PENDING_MIGRATIONS.sql` (Supabase SQL Editor, or give me the DB connection string). After that I'll re-run signup, login, Google, collections, commission submit, and room-save to confirm the whole set is green.
