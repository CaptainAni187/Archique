# Archiverse

**Live:** [https://archiverse-art.vercel.app/](https://archiverse-art.vercel.app/)

Archiverse is a React + Vite storefront with Supabase-backed catalog and order management, Razorpay checkout, admin controls, and a Vercel-friendly backend verification layer.

It extends beyond a basic storefront by adding **behavior-based personalization, intelligent search, and optimized purchase flows (combos + upsell)** without relying on paid AI APIs.

---

## Core System Additions

* Behavior-based recommendation engine (no explicit user input)
* Smart search using local AI (Ollama) with deterministic fallback
* Dynamic combo/upsell system with discount logic
* Commission brief parsing (unstructured → structured)
* Admin-controlled tagging, combos, and activity tracking
* Optional image similarity (PyTorch, offline)
* **"See It On Your Wall" — true-to-scale AR preview from the artwork page (no app install)**

---

## Environment

Frontend:

* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`
* `VITE_RAZORPAY_KEY_ID`

Backend:

* `SUPABASE_URL`
* `SUPABASE_SERVICE_ROLE_KEY`
* `RAZORPAY_KEY_ID`
* `RAZORPAY_KEY_SECRET`
* `ADMIN_EMAIL`
* `ADMIN_PASSWORD`
* `ADMIN_SESSION_SECRET`

Optional notifications:

* `ADMIN_NOTIFICATION_WEBHOOK_URL`
* `ADMIN_NOTIFICATION_EMAIL`
* `RESEND_API_KEY`
* `FROM_EMAIL`

---

## Database migration

Apply the production hardening migration before deploying the checkout flow:

* `supabase/migrations/20260420_archiverse_order_hardening.sql`

Also ensure later migrations include:

* artwork tags (`tags`)
* combo system (`combos`)
* visitor tracking (`visitor_sessions`, `visitor_events`)
* admin activity logs

---

## Backend routes

Serverless routes live in `/api`:

* `POST /api/payment-order` → creates Razorpay order
* `POST /api/verify-payment` → verifies payment
* `POST /api/orders` → creates order + handles multi-artwork purchase
* `GET /api/orders?payment_id=...` → recovers orders

Additional logic:

* combo handling (inside existing routes)
* inventory-safe validation
* analytics + behavior tracking
* admin session + activity logging

---

## Key Features

### Personalized Discovery

* Tracks views, clicks, dwell time
* Builds session-level taste profile
* Dynamically ranks artworks (“For You”)
* Shows reasoning (“Why this is shown”)

### Smart Search

* Natural language queries
* Uses Ollama (local LLM) when available
* Falls back to tag + keyword + category scoring
* No paid API dependency

### Combo & Upsell System

* Admin-defined curated combos
* Smart “pair with” suggestions
* Pricing:

  * 2 items → 10%
  * 3+ items → 15%
* Inventory-safe multi-item handling

### See It On Your Wall (AR)

* One tap on the artwork page launches augmented reality — no separate app
* Renders each piece at its **true real-world size** (`ar-scale="fixed"`), anchored to a vertical wall
* Uses Google's `<model-viewer>` so AR is handled by each platform's built-in, device-tested viewer:

  * iOS Safari → AR Quick Look (`.usdz`)
  * Android → Scene Viewer / WebXR (`.glb`)
  * Desktop → interactive 3D preview + QR code to continue on a phone
* Camera runs entirely on-device; no room images are uploaded or stored
* AR assets (`.glb` + `.usdz`) are generated offline per artwork by `scripts/build-ar-assets.mjs` (three.js exporters + node-canvas polyfill), written to `public/ar/`, and indexed in `public/ar/manifest.json`
* `.github/workflows/build-ar-assets.yml` regenerates assets on demand / daily and commits them back (artwork data lives in Supabase, not git)
* The heavy viewer library is code-split and loaded only when the buyer opts in

### Commission Builder

* Converts vague input → structured brief
* Reduces manual clarification

### Admin Layer

* Artwork + tag management
* Combo control
* Activity logs
* Recommendation debug insights

### Image Intelligence (Optional)

* PyTorch-based similarity
* Duplicate detection
* Offline execution

---

## Problems Faced & Solutions

### Weak recommendation accuracy

**Problem:** system behaved like keyword search
**Fix:** introduced structured tags + scoring system + audit tooling

### Dependency on external AI APIs

**Problem:** cost + latency
**Fix:** switched to local LLM (Ollama) + fallback logic

### Inventory issues in combos

**Problem:** multi-item overselling risk
**Fix:** validation + safe stock handling

### Poor search relevance

**Problem:** keyword-only search
**Fix:** hybrid retrieval (embeddings + tags + scoring)

### Overengineering AI

**Problem:** unnecessary frameworks
**Fix:** used lightweight, explainable logic instead

---

## Tech Stack

Frontend:

* React (Vite)

Backend:

* Node.js (serverless)

Database:

* Supabase (PostgreSQL)

AI / ML:

* Ollama (local LLM)
* LangChain (integration)
* PyTorch (image similarity)

Infra:

* Vercel
* Docker (dev usage)

---

## What Could Have Been Better (Tech Decisions)

* Could have used **managed LLM APIs (OpenAI / Gemini)** for better semantic accuracy
  → avoided due to cost, latency, and dependency concerns

* Could have used **vector databases (Pinecone, Weaviate)**
  → avoided to keep system simple and local

* Could have used **TensorFlow / deep models for tagging**
  → avoided due to lack of dataset and overengineering risk

* Could have used **microservices architecture**
  → kept monolithic serverless structure for simplicity and Vercel limits

Overall choice:
**prioritized control, cost-efficiency, and simplicity over complexity**

---

## Future Improvements

* Proper tagging system for all artworks (critical for accuracy)
* Improved recommendation weighting and ranking tuning
* Better UI explanation for discounts and combos
* Real-time inventory locking using DB transactions
* Enhanced semantic search quality with better embeddings
* Auto-tagging pipeline using image + text signals
* User accounts + persistent taste profiles
* Analytics dashboard for conversion tracking

---

## Runbook

1. Configure environment variables
2. Apply Supabase migrations
3. Deploy to Vercel
4. Verify checkout and order flow
5. Generate AR assets: `npm run build:ar-assets` (or run the "Build AR assets" GitHub Action). This needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set — locally as env vars, and in the repo as GitHub Actions secrets for the automated workflow.

---

## Admin Credentials

Use environment variables:

* `ADMIN_EMAIL`
* `ADMIN_PASSWORD`
* `ADMIN_SESSION_SECRET`

Do not expose credentials in frontend.

---

## Note

Built independently as a full-stack system (frontend + backend + AI + infra), focused on real-world constraints like cost, latency, and reliability.

Also partly built as a personal project for sister — not just another generic portfolio build.
