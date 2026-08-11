# Archique

An e-commerce storefront for original artwork, built for a working studio that sells one-of-a-kind pieces.

**Live:** [archique.in](https://www.archique.in)

Selling originals is not selling inventory. Every piece has a quantity of one, so two buyers reaching checkout at the same moment is a real failure rather than a rounding error. Pieces are physical objects whose dimensions determine both what a buyer is getting and what shipping costs. A wall is not a product page, so size has to be conveyed before purchase rather than discovered on delivery. The system is built around those constraints.

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Implementation notes](#implementation-notes)
- [Discovery and search](#discovery-and-search)
- [Augmented reality preview](#augmented-reality-preview)
- [API](#api)
- [Data model](#data-model)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design decisions](#design-decisions)

---

## Architecture

```
Browser ──▶ Vercel Edge (static assets, CDN cache)
               │
               ├──▶ /api/* — Node serverless functions
               │        │
               │        ├──▶ Supabase (PostgreSQL via PostgREST)
               │        ├──▶ Razorpay (orders, signature verification, webhooks)
               │        ├──▶ Supabase Storage (artwork images)
               │        └──▶ Resend (transactional email)
               │
               └──▶ /ar/* — precomputed GLB + USDZ assets
```

A React single-page application is served as static assets from Vercel's CDN. Every privileged operation happens inside serverless functions, which hold the only credentials permitted to write to the database. The browser never receives a service-role key, and no client-supplied price, discount, or stock figure is trusted: monetary values are recomputed server-side before an order is written.

**Stack:** React 19, Vite 8, React Router 7, Node.js serverless functions, PostgreSQL (Supabase), Razorpay, Resend, Vercel.

---

## Features

### Storefront

The catalogue supports search, sorting, and filtering by category, availability, medium, and size. Sort and filter are two controls rather than a wall of options, matching the pattern buyers already know from larger retailers.

Each artwork page carries full dimensions, medium, provenance, and shipping cost, plus an augmented-reality preview and pairing suggestions. Related pieces are proposed only when they are genuinely similar and the pairing would actually save money.

Visitors can add pieces to a cart or a wishlist without an account. Cart contents survive reloads and stay consistent across browser tabs.

### Purchase flow

Checkout is three steps on three screens rather than one long form:

1. **Delivery details** — name, phone, and a structured address (house, street, landmark, city, state, PIN). Returning customers have this filled from their saved profile.
2. **Review order** — line items, discounts, coupons, shipping, and the final total, itemised before any payment is initiated.
3. **Payment** — handed to Razorpay's checkout.

Several pieces can be bought in one order. Buying more than one costs less than buying them separately, and the saving is calculated and displayed before payment.

### Multi-piece pricing

Two related pieces bought together discount 10%; three or more discount 15%. Where a curated combo also applies, the buyer receives whichever is larger — the two are never stacked, and never silently resolved in the studio's favour.

Shipping is charged as one parcel, not one per piece: the highest single rate plus 25% of each additional piece's rate. Several canvases travel in one box; that box is bigger and heavier, but it is not several boxes. Charging full delivery per artwork would have overcharged every multi-piece order.

### Accounts

Customers sign in with email and password or with Google. New accounts capture phone and delivery address at sign-up, with the email pre-filled, so checkout is not the first time anyone is asked for an address.

Orders are tracked by order code without signing in.

### Commissions

Commission requests accept free text and are parsed into a structured brief — mood, palette, size, deadline — so the studio receives something actionable rather than a paragraph to interpret.

### Administration

A console at `/captain`, authenticated separately from customer accounts, covers catalogue and stock, orders and their lifecycle, coupons, curated combos, commissions, enquiries, and testimonials.

The dashboard reports revenue, order volume, and per-artwork engagement, so attention goes to the pieces attracting interest.

Orders export to CSV for fulfilment. Every privileged action is written to an activity log with the acting administrator and a timestamp.

---

## Implementation notes

### Server-authoritative pricing

The client submits a selection of artwork identifiers. It does not submit prices.

The server loads current prices, recomputes discounts, revalidates any coupon against its own rules and redemption count, recalculates shipping from stored dimensions, and derives the total. A tampered request changes what is *ordered*, never what is *charged*. This also means a price edited in the admin console takes effect immediately, with no stale figure surviving in a client's open tab.

### Stock and concurrency

Serverless functions share no memory, and PostgREST exposes no interactive transactions, so mutual exclusion has to come from the database itself.

Stock is claimed by conditional update — a compare-and-swap that succeeds only if the row still holds the quantity the request observed. Two simultaneous buyers of the same piece produce exactly one success and one clean rejection.

Ordering matters as much as the mechanism: stock is claimed **before** the order row is written. Written the other way around, a failed claim would leave a paid order pointing at a piece someone else had already bought.

### Payment integrity

Payment confirmation is never taken on the client's word.

1. The client requests a Razorpay order and receives an identifier.
2. Razorpay's checkout collects payment and returns a payment identifier and signature.
3. The server recomputes the HMAC-SHA256 signature with the key secret and compares it using a constant-time comparison, so a timing side channel cannot leak the expected value byte by byte.
4. Only then is the order marked paid.

Webhooks are verified against the **raw** request body. Re-serialising parsed JSON changes the bytes and invalidates the signature, so body parsing is disabled on that route. Payment identifiers carry a unique constraint, so a replayed webhook cannot produce a second order.

### Input validation

Every request body is parsed by a Zod schema before reaching business logic. Validation is treated as a boundary rather than a formality: an address is checked for plausible length, a phone number against the Indian mobile numbering plan, and every free-text field carries an upper bound so an oversized payload cannot be used to exhaust storage.

### File uploads

Uploads are capped at 10 MB and restricted to images. The client-declared MIME type is ignored for security purposes — it is trivially spoofable — and the file's actual signature bytes are inspected before anything is stored.

### Rate limiting

Authentication and public write endpoints are limited by a database-backed counter keyed on client IP; administrator sign-in permits five attempts per fifteen minutes. The counter lives in Postgres rather than process memory because serverless instances are short-lived and horizontally scaled, which makes in-process counters close to decorative.

### Caching

Catalogue reads are served with `s-maxage` and `stale-while-revalidate`, so repeat visitors are answered by the CDN rather than a cold function.

Administrator reads bypass that cache explicitly. Without the bypass, deleting an artwork appears to fail: the delete succeeds, the subsequent read is served from cache, and the row seems to return.

### Client state

The cart lives in a small external store consumed through `useSyncExternalStore` rather than context. Every subscriber re-renders together, no provider has to wrap the tree, and non-React code can read the cart directly. It persists to `localStorage` and listens for storage events, so a cart edited in one tab is reflected in the others.

Routes are code-split with `React.lazy`, so the initial download carries the landing and browsing experience and nothing else. The AR viewer — by far the heaviest dependency — is fetched only when a buyer opts into it.

### Adaptive contrast

The homepage places navigation over full-bleed artwork, and artwork is not a predictable background. Fixed text colours fail as soon as a pale canvas follows a dark one.

Instead, the page samples the brightness of the image actually on screen and switches the overlay text between light and dark. Sampling accounts for `object-fit: cover` cropping, so only pixels the visitor can actually see are measured — the edges of a landscape image on a portrait screen are never visible and must not influence the decision. Header and body regions are evaluated separately, since a painting can be dark at the top and pale below.

### Colour and readability

The interface uses a gold accent, which works as a border or fill but fails as text: at `#c6a962` it reaches roughly 2.3:1 against any light background, well under the 4.5:1 needed for body text, and darkening the background makes it worse rather than better.

Text and decoration therefore draw from separate tokens. `--accent-color` keeps the bright gold for borders, fills, and hover states; `--accent-text` carries a darkened variant for anything read as text, measured at about 5:1 in light mode. Dark mode maps both to the bright gold, which is already high-contrast there.

### Transactional email

Customer-facing mail is sent from a domain alias rather than a personal mailbox, with SPF, DKIM, and DMARC configured for the sending domain. The studio's personal address appears nowhere in the interface or the shipped bundle.

Delivery failures are reported by the provider in the response body rather than thrown, so the send path inspects the result explicitly. Treating a resolved promise as success would have logged "delivered" for mail the provider had rejected outright.

---

## Discovery and search

Search and recommendations run on precomputed data and deterministic scoring. No model is loaded at request time and no external inference service is called, which keeps responses fast, free, and identical for identical inputs.

**Semantic similarity.** `npm run build:embeddings` encodes each artwork with `Xenova/all-MiniLM-L6-v2` (384 dimensions) offline and writes the vectors into the repository. At request time a query is matched against those vectors by cosine similarity. The generated file is server-only — importing it in the browser would ship every vector to every visitor.

**Lexical and structural scoring.** Tags, category, medium, and title are scored alongside the semantic signal, which keeps exact-term queries reliable where embeddings alone are vague.

**Behavioural ranking.** Views, clicks, and dwell time build a session-level taste profile that reorders results. Signals are session-scoped and require no sign-in.

An optional offline script, `ml/build_image_intelligence.py`, derives visual similarity and duplicate detection from artwork images using PyTorch. It runs on demand and writes a JSON artifact; the application reads that artifact and never invokes Python at runtime.

---

## Augmented reality preview

A buyer can place a piece on their own wall from the artwork page, at true physical size, without installing anything.

Rendering is delegated to each platform's own viewer through Google's `<model-viewer>`, rather than to a custom renderer:

| Platform | Path |
| --- | --- |
| iOS Safari | AR Quick Look (`.usdz`) |
| Android | Scene Viewer / WebXR (`.glb`) |
| Desktop | Interactive 3D preview, with a QR code to continue on a phone |

Models are scaled from the artwork's recorded dimensions and anchored to a vertical surface, so what appears on the wall is the size that will arrive.

Materials are emissive by design. An exported scene carries no lights, and a material that depends on lighting renders as a black rectangle on any device that supplies none — which is exactly how this failed on iOS before the material model was changed.

Assets are generated offline by `scripts/build-ar-assets.mjs` using three.js exporters, written to `public/ar/`, and indexed in `public/ar/manifest.json`. A GitHub Actions workflow regenerates them on a schedule and commits the result, because artwork data lives in the database rather than in git.

The camera feed is processed entirely on the device. No images of anyone's home are uploaded or stored.

---

## API

Routes are grouped by resource. `vercel.json` rewrites clean paths onto query parameters, so `/api/orders/:id/status` reaches the same function as `/api/orders?id=…&action=status`.

| Route | Responsibility |
| --- | --- |
| `/api/artworks` | Catalogue reads, administrator writes |
| `/api/orders` | Order creation, lookup, status transitions |
| `/api/payments` | Razorpay order creation, signature verification, webhooks |
| `/api/user` | Customer registration, sign-in, delivery profiles |
| `/api/admin` | Administrator authentication, dashboard, order export |
| `/api/coupons` | Validation and redemption |
| `/api/commissions` | Commission requests |
| `/api/inquiries` | Contact form |
| `/api/testimonials` | Customer reviews |
| `/api/assistant` | Search and recommendations |
| `/api/analytics` | Behavioural event ingestion |
| `/api/upload` | Image upload to Supabase Storage |

---

## Data model

PostgreSQL, migrated through ordered SQL files. The principal tables:

| Table | Contents |
| --- | --- |
| `artworks` | Catalogue: dimensions, medium, pricing, stock, images |
| `orders` | Purchases, delivery details, payment status, lifecycle timestamps |
| `payment_logs` | Razorpay event trail for reconciliation |
| `user_accounts` | Customers, including saved delivery profiles |
| `admins`, `admin_sessions`, `admin_activity_logs` | Administrator identity and audit trail |
| `coupons`, `coupon_redemptions` | Discount codes and their use |
| `combos` | Curated multi-piece offers |
| `visitor_sessions`, `visitor_events`, `analytics_events` | Behavioural signals |
| `rate_limits` | Distributed rate-limit counters |

Orders move through `pending → advance_paid → processing → shipped → delivered`, with `cancelled` reachable before dispatch. Transitions are applied server-side and recorded with timestamps.

Behavioural tables grow without bound by nature, so a retention routine prunes them on a schedule. Timestamps are `timestamptz` throughout.

---

## Getting started

**Requirements:** Node.js 20 or newer, a Supabase project, a Razorpay account.

```bash
git clone https://github.com/CaptainAni187/Archique.git
cd Archique
npm install
```

Create a `.env` file with the variables listed under [Configuration](#configuration), then apply the migrations in `supabase/migrations/` in filename order, via the Supabase SQL editor or CLI.

The frontend and the API run as two processes:

```bash
npm run dev       # Vite dev server, port 5173
npm run dev:api   # serverless function host, port 3001
```

Vite proxies `/api` to the function host, so the application behaves as it does in production.

---

## Configuration

Configuration is read from the environment. Nothing is committed; `.env` is git-ignored.

### Client

Compiled into the browser bundle at build time. Publishable values only.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anonymous key, used for Google OAuth |
| `VITE_RAZORPAY_KEY_ID` | Razorpay publishable key |

### Server

Never exposed to the browser.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Falls back to `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access; the most sensitive value here |
| `RAZORPAY_KEY_ID` | Falls back to `VITE_RAZORPAY_KEY_ID` |
| `RAZORPAY_KEY_SECRET` | Signs and verifies payment signatures |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies webhook authenticity |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed administrator credentials |
| `ADMIN_SESSION_SECRET` | Signs administrator tokens |
| `USER_SESSION_SECRET` | Signs customer tokens; must differ from the admin secret |
| `RESEND_API_KEY`, `FROM_EMAIL` | Transactional email |
| `INQUIRY_NOTIFICATION_RECIPIENTS` | Comma-separated recipients for contact form notifications |

Administrator and customer tokens are signed with independent secrets, so compromising one audience's signing key cannot forge tokens for the other.

---

## Project layout

```
api/              serverless functions, one file per route group
  _lib/           shared server modules: sessions, validation, rate
                  limiting, Razorpay, Supabase, email
shared/ai/        ranking, search, and tagging logic used by client and server
src/
  pages/          route components
  components/     shared UI, including the administrator console
  services/       API clients
  state/          cart and order state
  utils/          pricing, image measurement, formatting
  constants/      values referenced across pages
scripts/          offline generators: embeddings, AR assets, audits
supabase/
  migrations/     schema, applied in filename order
tests/            Vitest suites for the server
```

---

## Testing

```bash
npm test     # Vitest
npm run lint # ESLint
npm run build
```

Coverage is concentrated where failure costs money or trust: payment signature verification and replay rejection, order creation, administrator authentication and session handling, request validation, analytics ingestion, and artwork normalisation.

Suites exercise the real handlers through mocked HTTP objects rather than testing helpers in isolation, so a route that stops matching its own validation schema fails the build.

---

## Deployment

Vercel builds the static site and deploys `api/` as serverless functions. Environment variables are read at build time, so changing one requires a redeploy.

Two constraints are worth knowing before adding routes:

**Function count.** The Hobby plan permits twelve serverless functions, and the project sits at twelve. Exceeding the limit does not fail the build — the build succeeds and the deployment silently does not update, which presents as production running stale code. New endpoints therefore belong as an `action` on an existing handler rather than as a new file in `api/`.

**Cache bypass.** Administrator reads must not be served from the CDN. See [Caching](#caching).

Offline generators are run on demand:

```bash
npm run build:embeddings   # regenerate search vectors after catalogue changes
npm run build:ar-assets    # regenerate AR models
```

---

## Design decisions

**Precomputed embeddings over a hosted inference API.** Search quality would improve with a large hosted model, at the cost of per-query spend, added latency, and an availability dependency on someone else's uptime. For a catalogue of this size, offline encoding plus cosine similarity captures most of the benefit with none of those liabilities.

**PostgreSQL over a dedicated vector database.** A few hundred vectors fit comfortably in memory. A vector store would add an operational component to earn its keep at a scale this catalogue will not reach for a long time.

**Conditional updates over transactions.** PostgREST exposes no interactive transactions. Rather than introduce a connection-pooled service to obtain them, stock claims use a compare-and-swap, which is sufficient for single-row exclusivity and keeps the deployment on one platform.

**A modular monolith over microservices.** Route groups own their domains and share a `_lib` layer. Splitting them into services would multiply deployment surface and cold starts without dividing any load that needs dividing.

**Full payment upfront over a partial advance.** A piece leaves the catalogue the moment it is reserved. Holding a one-of-one item against a partial payment transfers the risk of an abandoned order onto the studio, which for a single-artist catalogue is the difference between a sale and a month of lost availability.

---

## License

All rights reserved. The artwork shown is the property of the artist and is not licensed for reuse.
