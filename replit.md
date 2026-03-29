# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is a production-ready eSIM marketplace where users can browse destinations, view data plans, purchase eSIMs via Stripe, and receive QR codes for instant activation. Features multi-provider routing, a full customer account system with dashboard, eSIM management, top-ups via Stripe, and order history. Webhook-driven fulfillment via Stripe ensures reliable post-payment eSIM provisioning.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Payments**: Stripe (via Replit integration) — Stripe Checkout, webhooks, stripe-replit-sync
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query
- **Auth**: JWT in httpOnly cookies (bcryptjs + jsonwebtoken + cookie-parser)

## Project Structure
- `client/src/pages/` — Page components (home, destinations, destination-detail, checkout, checkout-success, checkout-cancel, orders, order-detail, admin, dashboard, login, signup, forgot-password)
- `client/src/components/` — Reusable components (navbar, theme-toggle)
- `client/src/lib/` — Utilities (queryClient, theme provider, auth context)
- `server/` — Express server, routes, storage layer, seed data, auth helpers
- `server/providers/` — eSIM provider integrations (esimgo, esimAccess, providerManager)
- `server/providers/adapters/` — Provider adapter layer (base interface, mock adapter, index)
- `server/services/` — Business logic services (stripeService, fulfillment, usageSync, notifications)
- `server/stripeClient.ts` — Stripe client + stripe-replit-sync setup
- `server/webhookHandlers.ts` — Stripe webhook processing (stripe-replit-sync)
- `shared/schema.ts` — Drizzle schemas for all tables

## Database Schema
- **users** — Customer accounts (id, name, email, passwordHash nullable, authProvider, stripeCustomerId, isAdmin, createdAt, updatedAt)
- **destinations** — Countries with images, flags, regions, corridor assignments
- **plans** — eSIM data plans (externalPlanCode, price, dataAmount, dataAmountGb, validity, validityDays, coverage, features, wholesaleCost, planStatus, isActive, provider, stripePriceId, updatedAt)
- **orders** — Payment/billing records with full Stripe + provider data (subtotalMinor, totalMinor, stripeCheckoutSessionId, stripePaymentIntentId, stripeCustomerId, purchaseType, providerName, providerEsimId, dataTotalMb, dataUsedMb, dataRemainingMb, daysRemaining, expiresAt, lastSyncedAt, updatedAt)
- **orderItems** — Line items within an order (orderId, itemType, planId, name, destination, region, dataMb, durationDays, unitAmountMinor, quantity, metadataJson)
- **esims** — Standalone eSIM entity created on fulfillment (userId, orderId, planId, providerName, providerEsimId, providerIccid, providerReference, qrCodeUrl, manualCode, destination, region, planName, activationStatus, dataTotalMb, dataUsedMb, dataRemainingMb, validityDays, daysRemaining, activatedAt, expiresAt, lastSyncedAt, updatedAt)
- **topups** — Paid top-ups linked to orders and esims (orderId, esimId, optionCode, name, price, currency, status, stripeCheckoutSessionId, fulfilledAt, updatedAt)
- **paymentEvents** — Idempotency log for Stripe webhook events (externalEventId, eventType, status, processedAt)
- **providerSyncLogs** — Provider API call logs (orderId, esimId, syncType, providerName, requestSummary, responseSummary, status)
- **notifications** — Notification log (userId, esimId, type, channel, status, payloadJson, sentAt)

## Authentication
- JWT tokens stored in httpOnly cookies (`globe_session`, 30-day expiry)
- `server/auth.ts` — hashPassword, verifyPassword, signToken, verifyToken, requireAuth middleware
- Post-purchase auto-link: orders with matching email are linked to user account on login/signup
- Routes: `/login`, `/signup`, `/forgot-password`, `/dashboard`

## Stripe Integration
- Stripe connected via Replit integration (conn_stripe_01KMT3186VPPB8MA9B9KRQDSFZ)
- `server/stripeClient.ts` — getUncachableStripeClient(), getStripePublishableKey(), getStripeSync()
- `server/services/stripeService.ts` — createPlanCheckoutSession(), createTopupCheckoutSession(), handleCheckoutCompleted()
- `server/webhookHandlers.ts` — WebhookHandlers.processWebhook() using stripe-replit-sync
- Webhook route `/api/stripe/webhook` registered BEFORE express.json() for raw body access
- Stripe schema initialized on startup via stripe-replit-sync runMigrations()
- Managed webhook auto-configured via findOrCreateManagedWebhook()
- Idempotency: paymentEvents table prevents duplicate fulfillment
- Success URL: /checkout-success?session_id={CHECKOUT_SESSION_ID}
- Cancel URL: /checkout-cancel?planId={planId}

## API Endpoints
- `GET /api/destinations` — List all (or `?popular=true`)
- `GET /api/destinations/:id` — Single destination
- `GET /api/plans?destinationId=X` — Plans for a destination
- `GET /api/plans/:id` — Single plan
- `POST /api/plans` — Create plan
- `PATCH /api/plans/:id` — Update plan (status, pricing, etc.)
- `GET /api/orders?email=X` — Orders by email
- `GET /api/orders/:id` — Single order
- `POST /api/orders` — Legacy direct order creation (non-Stripe path for admin)
- `PATCH /api/orders/:id` — Update order (status, esimStatus)
- `GET /api/admin/stats` — Admin dashboard statistics
- `GET /api/providers/plans?countryCode=X` — Fetch plans from configured providers
- `POST /api/providers/best-plan` — Find cheapest provider plan
- `POST /api/auth/signup` — Create account (name, email, password)
- `POST /api/auth/login` — Login (email, password) → httpOnly cookie
- `POST /api/auth/logout` — Clear session cookie
- `GET /api/auth/me` — Get current user from cookie
- `PATCH /api/auth/profile` — Update name or password (auth required)
- `GET /api/dashboard/orders` — Get user's orders (auth required)
- `POST /api/dashboard/topup/:orderId` — Mock top-up (auth required, legacy)
- `GET /api/stripe/config` — Get Stripe publishable key
- `POST /api/checkout/plan` — Create Stripe Checkout session for plan purchase → returns {url, sessionId}
- `POST /api/checkout/topup` — Create Stripe Checkout session for top-up (auth required)
- `GET /api/checkout/session/:sessionId` — Retrieve Stripe session status
- `GET /api/esims` — All eSIMs for authenticated user
- `GET /api/esims/:id` — Single eSIM detail (auth required)
- `GET /api/esims/:id/usage` — Sync and return live usage (auth required)
- `GET /api/esims/:id/topups/options` — Get top-up options from provider
- `POST /api/esims/:id/topups/checkout` — Create Stripe Checkout for top-up (auth required)
- `POST /api/stripe/webhook` — Stripe webhook (raw body, no json middleware)
- `POST /api/internal/sync/esim/:orderId` — Manual eSIM usage sync
- `POST /api/internal/sync/user/:userId` — Sync all user eSIMs
- `POST /api/internal/sync/all-active` — Sync all active eSIMs (async)
- `GET /api/internal/provider/health` — Provider health check
- `POST /api/gift` — Gift eSIM stub

## Provider System
- `server/providers/adapters/base.ts` — ProviderAdapter interface (provisionEsim, getUsage, getTopupOptions, executeTopup)
- `server/providers/adapters/mock.ts` — MockProviderAdapter with realistic responses
- `server/providers/adapters/esimgo.ts` — eSIMGo adapter (LIVE, uses ESIMGO_API_KEY)
- `server/providers/adapters/esimAccess.ts` — eSIM Access adapter (LIVE, HMAC-SHA256 auth)
- `server/providers/adapters/failover.ts` — Failover wrapper: eSIMGo primary → eSIM Access fallback
- `server/providers/adapters/index.ts` — getActiveProvider(); auto-detects esimgo+esimAccess if both keys present
- `server/providers/esimgo.ts` — eSIMGo provider client
- `server/providers/providerManager.ts` — Routes purchases to correct provider

## Multi-Provider Routing (DB layer)
- **providers** — Registry of eSIM providers (key, name, enabled, priority, healthStatus)
  - eSIMGo: priority=1, enabled=true
  - eSIM Access: priority=2, enabled=true
  - Zendit: priority=3, enabled=false (no API key yet)
  - Mock: priority=99, enabled=false (dev only)
- **normalized_plans** — Provider-agnostic plan definitions (regionCode, name, dataMb, validityDays, retailPriceUsd) — 24 seeded
- **provider_offers** — Maps each normalized plan to provider-specific bundle codes with wholesale prices — 54 seeded
- `server/services/providerRegistry.ts` — Core routing service:
  - `getEnabledProviders()` — enabled providers sorted by priority
  - `getProviderByKey(key)` — single provider lookup
  - `upsertProvider(data)` — insert or update by key
  - `updateProviderHealth(key, status)` — health status updates
  - `getAllNormalizedPlans()`, `getNormalizedPlansByRegion(code)` — plan lookups
  - `getOffersForNormalizedPlan(planId)` — returns offers enriched with provider priority, filtered to enabled only
  - `getBestOffersForRequirement(regionCode, minDataMb, minValidityDays)` — top-level routing: finds cheapest valid offer sorted by provider priority
  - `upsertProviderOffer(data)` — idempotent offer upsert
  - `deactivateProviderOffers(providerKey)` — bulk deactivate on provider outage
- `server/seeds/providerRegistry.ts` — Idempotent seed; run via `npx tsx -e "import('./server/seeds/providerRegistry').then(m => m.seedProviderRegistry())"`

## Services
- `server/services/stripeService.ts` — Checkout session creation, payment completion handlers
- `server/services/fulfillment.ts` — fulfillInitialPurchase(), fulfillTopupPurchase() — provisions eSIM via provider after payment
- `server/services/usageSync.ts` — syncEsimUsage(), syncUserEsims(), syncAllActiveEsims() — periodic usage sync with low-data and expiry alerts
- `server/services/notifications.ts` — Email stub methods (sendPurchaseConfirmation, sendEsimReadyEmail, sendLowDataAlert, sendExpiryReminder, sendPaymentFailedEmail)

## Customer Dashboard
- `/dashboard` — Main customer dashboard with 3 tabs:
  1. **My eSIMs** — Active eSIM cards with usage bars, QR modal, top-up modal
  2. **Order History** — Full purchase history with links to order details
  3. **Settings** — Profile name, password change
- Stats strip: Active eSIMs count, total orders, total spent

## Key Features
- **Stripe Checkout** — Full hosted payment flow with redirect to Stripe, 2-step checkout (details → upsell → Stripe)
- **Webhook fulfillment** — checkout.session.completed triggers eSIM provisioning and email delivery; state machine: paid → fulfilling → fulfilled/fulfillment_failed
- **Idempotent webhooks** — paymentEvents table prevents double-fulfillment; events marked 'processed' or 'failed'
- **Fulfillment retry** — Transient provider errors (network timeouts etc.) trigger one automatic retry before marking fulfillment_failed
- **Top-up via Stripe** — Dashboard TopupModal loads real options from provider API, redirects to Stripe Checkout; webhook fulfills topup
- **Provider adapter layer** — Abstract interface for any eSIM provider; mock adapter with seeded-per-ICCID realistic scenarios (issued/installed/active/low-data/expiring)
- **Real usage data** — Dashboard uses backend dataTotalMb/dataUsedMb/dataRemainingMb/daysRemaining; falls back gracefully to plan validity
- **Usage sync** — syncEsimUsage() pulls live data from provider, alerts on low data / expiry
- **Order polling on success** — GET /api/checkout/order-by-session/:sessionId lets success page poll for order readiness after webhook fires; shows fulfillment progress
- **Premium landing page** with 14+ sections
- **Customer accounts** — post-purchase, low-friction (no forced signup before checkout)
- **eSIM dashboard** — real usage tracking from backend, status badges, QR viewer, Stripe-backed top-up
- **Context-aware navbar** — shows "Log In" or "Dashboard" depending on auth state
- **Destination detail** with Data Usage Estimator
- **Checkout** with trust badges, upsell step, and Stripe redirect
- **Checkout Success** page — polls for order (via session ID), shows processing/fulfilled/failed states, links to order and dashboard
- **Checkout Cancel** page — reassures user, provides retry and browse buttons
- **Order detail** with QR code, install guide, "Go to Dashboard" CTA
- **Admin dashboard** (5 tabs): Dashboard stats, Plans, Orders, eSIM Inventory, Margins
- **190+ country coverage** across 7 regions including Africa
- Dark/light theme toggle
- Device Compatibility Checker page (/compatibility)

## Regions
- Africa (Nigeria, Kenya, South Africa, Egypt, Morocco, Ghana)
- Asia, Europe, Middle East, North America, Southeast Asia, Global

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
- PROVIDER_NAME env var selects provider adapter (default: mock)
- Stripe auto-configured on startup via stripe-replit-sync
