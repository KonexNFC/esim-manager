# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is a production-ready eSIM marketplace designed for users to browse, purchase, and manage eSIM data plans. It facilitates instant eSIM activation via QR codes, offers a comprehensive customer account system including a dashboard for eSIM management and order history, and supports top-ups. The platform prioritizes reliable post-payment eSIM provisioning through webhook-driven fulfillment via Stripe, and features multi-provider routing for optimal plan selection. The project's vision is to become a leading global platform for seamless and accessible mobile connectivity through eSIM technology, expanding its reach and continuously integrating new providers and advanced features.

## User Preferences
I prefer detailed explanations. I want iterative development where I am asked before major changes are made. I like functional programming paradigms where it makes sense, but pragmatism is key.

## System Architecture
GlobeSIM is built with a modern web stack. The **frontend** uses React with TypeScript, Vite, Tailwind CSS, and shadcn/ui for a responsive and consistent user experience. The **backend** is an Express.js application, also in TypeScript, handling API requests, authentication, and business logic. Data persistence is managed by **PostgreSQL** using Drizzle ORM.

**Key Technical Implementations:**
-   **Authentication:** JWT tokens are secured in httpOnly cookies, with a 30-day expiry.
-   **Payment Processing:** Integrated with Stripe for all payment flows, including Stripe Checkout for plan purchases and top-ups. Webhooks are critical for reliable post-payment fulfillment.
-   **eSIM Provisioning:** A robust provider adapter layer allows integration with various eSIM providers (e.g., eSIMGo, eSIM Access). This layer provides an abstract interface for common operations like eSIM provisioning, usage retrieval, and top-up execution. A failover mechanism ensures resilience.
-   **Multi-Provider Routing Engine:** A sophisticated routing engine selects the best provider for a given plan based on strategies like `cheapest_cost`, `highest_margin`, `best_health`, or a `blended_score`. This engine evaluates factors such as wholesale price, margin, provider health, and priority, with every decision auditable in the `routing_decisions` table.
-   **Pricing Engine** (`server/services/pricingEngine.ts`): `calculateRetailPrice(wholesaleCost, options)` runs a four-stage pipeline — apply markup % → enforce minimum margin % → apply floor price → charm pricing (rounds up to nearest .49/.99 cent ending, never reducing margin). Returns full `PricingResult` with margin %, markup %, applied flags, and stage-by-stage breakdown.
-   **Per-Plan Target Margin**: `plans.target_margin` (nullable float 0–1) lets individual plans override the global `targetMarginPercent` setting. When set, the auto-pricing formula uses this value instead of the global one — respected in checkout, plan PATCH, and the batch reprice endpoint.
-   **Margin Engine** (`server/services/marginEngine.ts`): Single authoritative source for the gross margin formula `(retail − cost) / retail × 100`. All backend code (admin stats route, routing engine scoring, pricing engine) imports from here. Includes guards (`isMarginSufficient`), inverses (`costToRetailViaMargin`, `costToRetailViaMarkup`), and display helpers (`calculateMarginRounded`). Frontend uses the same formula inline (UI only — not yet wired to this service).
-   **Checkout Pricing Integration:** `stripeService.ts::createPlanCheckoutSession()` is the single server-authoritative pricing point. It first tries to find a matching normalized plan (by `countryCode`, `dataMb`, `validityDays`). If found: calls the routing engine, then computes retail price via the pricing engine from the winner's wholesale cost. If not found: falls back to `plan.price` from the DB (already server-controlled). The routing decision (decisionId, selectedProviderKey, fallback chain) is stored in Stripe metadata and persisted to the order record post-payment.
-   **Fulfillment Fallback Chain:** `fulfillment.ts::fulfillInitialPurchase()` checks if the order has routing data (`selectedProviderKey` + `fallbackProvidersJson`). If yes: tries each provider in the fallback chain in order, logging every attempt to the `provider_attempts` table. If no routing data: uses `getActiveProvider()` (legacy transparent failover, unchanged). Every attempt — success or failure — is recorded.
-   **Provider Attempts Table:** `provider_attempts` logs each provisioning attempt: `orderId`, `providerKey`, `providerPlanCode`, `attemptNumber`, `status` (ok/error/skipped), `errorMessage`, `durationMs`.
-   **Fulfillment System:** Payment completion triggers automated eSIM provisioning and email delivery via Stripe webhook → `fulfillment.ts`. Full state machine: `paid → fulfilling → fulfilled` (or `fulfillment_failed`). Idempotency via `paymentEvents` table. Retry for transient errors. Fallback chain iterates providers in priority order, logging every attempt to `provider_attempts`. Admin can manually re-trigger fulfillment for failed/stuck orders via the `POST /api/admin/orders/:id/refulfill` endpoint (amber "Re-fulfill" button in Orders tab).
-   **Provider Key Normalisation:** `getProviderAdapterByKey()` accepts any capitalisation variant (`esimAccess`, `esimaccess`, `ESIMACCESS`) — normalised to lowercase before lookup, preventing silent misses when routing engine records vs. adapter keys differ.
-   **Email Notifications:** Transactional emails sent via Resend (`RESEND_API_KEY`). Graceful fallback to console logging when key absent. Templates: eSIM Ready (QR code + iOS/Android install guide), Purchase Confirmation, Fulfillment Failed, Top-up Confirmation, Low Data Alert, Expiry Reminder. `EMAIL_FROM_ADDRESS` env var configures sender (default: `noreply@globesim.app`).
-   **Destination Performance Tracking** (`server/services/destinationStats.ts`): Maintains rolling performance memory per `(providerKey, destination)` pair in the `destination_provider_stats` table. Updated after every fulfillment attempt — success, failure, or fallback (skipped providers are ignored). Uses exponential moving average (EMA) so recent outcomes weight more heavily than old ones: alpha = `1/min(count, 20)`, giving each new event ~5% weight after 20+ orders. Metrics tracked: `fulfilmentSuccessRate`, `avgLatencyMs`, `avgMarginPercent`, `failoverRate` (how often used as non-primary). Service is non-throwing — stats writes never block fulfillment. `getDestinationStats(providerKey, destination)` returns `null` when no data exists yet; callers handle gracefully.
-   **Usage Synchronization:** Scheduled processes (`usageSync`) pull live data from providers, updating user dashboards and triggering low-data or expiry notifications.
-   **Customer Dashboard:** Provides users with a centralized view of their active eSIMs (with usage bars, QR codes, and top-up options), order history, and profile settings.
-   **Admin Dashboard:** Offers comprehensive administrative capabilities including:
    -   **Profit Stats**: 8 live stat cards — Total Revenue, Total Profit, Weighted Margin, Avg Profit/Order, Orders, Live Plans, Destinations, Active eSIMs.
    -   **Provider Cost Breakdown**: Per-provider table showing revenue, cost, profit, and margin % (sorted by profit), built from order-level `wholesaleCostUsd` with plan-level fallback.
    -   **Profit Optimisation Mode**: Three preset modes (Growth 30%, Balanced 50%, Profit 70%) plus a custom margin input. Selecting a preset atomically updates both `profitMode` and `targetMarginPercent` in the settings table. Stored as `profitMode` setting key; auto-detected when manually entering a margin that matches a preset.
    -   Plan management with **per-plan pricing mode toggle** (Auto ⚡ / Manual 🔧), profit % badge, and color-coded margin indicators.
    -   **Live Catalogue Sync** (`POST /api/admin/providers/sync`): Fetches live plans from all configured providers (eSIMGo, eSIM Access), upserts `normalizedPlans` + `providerOffers`, and auto-updates `wholesaleCost` + `provider` on internal plans to always reflect the cheapest available offer. Scheduler starts 60s after boot then runs every 6 hours. Results tracked in `provider_sync_runs` table. Manual trigger via "Sync Providers Now" button in admin Routing tab.

**UI/UX Design:**
-   The application features a premium landing page with various sections showcasing features and benefits.
-   A context-aware navigation bar adapts based on user authentication status.
-   Destination detail pages include data usage estimators.
-   Checkout process includes trust badges and an upsell step before redirecting to Stripe.
-   Comprehensive checkout success and cancel pages provide clear user feedback and next steps.
-   Support for dark/light theme toggle.
-   Device compatibility checker page.

## External Dependencies
-   **Stripe:** Used for all payment processing, including Stripe Checkout, webhooks, and `stripe-replit-sync` for schema management and webhook configuration.
-   **eSIMGo:** An external eSIM provider integrated via its API.
-   **eSIM Access:** Another external eSIM provider integrated via its API (HMAC-SHA256 authentication).
-   **PostgreSQL:** The primary database for storing all application data.
-   **bcryptjs:** Used for password hashing.
-   **jsonwebtoken:** Used for creating and verifying JWTs.
-   **cookie-parser:** Middleware for parsing cookies in Express.js.
-   **TanStack React Query:** Used for data fetching, caching, and state management on the frontend.
-   **wouter:** A small routing library for the frontend.