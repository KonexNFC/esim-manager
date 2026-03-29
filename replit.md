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
-   **Margin Engine** (`server/services/marginEngine.ts`): Single authoritative source for the gross margin formula `(retail − cost) / retail × 100`. All backend code (admin stats route, routing engine scoring, pricing engine) imports from here. Includes guards (`isMarginSufficient`), inverses (`costToRetailViaMargin`, `costToRetailViaMarkup`), and display helpers (`calculateMarginRounded`). Frontend uses the same formula inline (UI only — not yet wired to this service).
-   **Checkout Pricing Integration:** `stripeService.ts::createPlanCheckoutSession()` is the single server-authoritative pricing point. It first tries to find a matching normalized plan (by `countryCode`, `dataMb`, `validityDays`). If found: calls the routing engine, then computes retail price via the pricing engine from the winner's wholesale cost. If not found: falls back to `plan.price` from the DB (already server-controlled). The routing decision (decisionId, selectedProviderKey, fallback chain) is stored in Stripe metadata and persisted to the order record post-payment.
-   **Fulfillment Fallback Chain:** `fulfillment.ts::fulfillInitialPurchase()` checks if the order has routing data (`selectedProviderKey` + `fallbackProvidersJson`). If yes: tries each provider in the fallback chain in order, logging every attempt to the `provider_attempts` table. If no routing data: uses `getActiveProvider()` (legacy transparent failover, unchanged). Every attempt — success or failure — is recorded.
-   **Provider Attempts Table:** `provider_attempts` logs each provisioning attempt: `orderId`, `providerKey`, `providerPlanCode`, `attemptNumber`, `status` (ok/error/skipped), `errorMessage`, `durationMs`.
-   **Fulfillment System:** Payment completion triggers automated eSIM provisioning and email delivery. The system includes idempotency via a `paymentEvents` table to prevent duplicate fulfillment and incorporates retry mechanisms for transient provider errors.
-   **Usage Synchronization:** Scheduled processes (`usageSync`) pull live data from providers, updating user dashboards and triggering low-data or expiry notifications.
-   **Customer Dashboard:** Provides users with a centralized view of their active eSIMs (with usage bars, QR codes, and top-up options), order history, and profile settings.
-   **Admin Dashboard:** Offers comprehensive administrative capabilities including:
    -   **Profit Stats**: 8 live stat cards — Total Revenue, Total Profit, Weighted Margin, Avg Profit/Order, Orders, Live Plans, Destinations, Active eSIMs.
    -   **Provider Cost Breakdown**: Per-provider table showing revenue, cost, profit, and margin % (sorted by profit), built from order-level `wholesaleCostUsd` with plan-level fallback.
    -   **Global Pricing Settings Panel**: Live target margin input + "Reprice Auto Plans" button to batch-recompute all auto-mode plan prices.
    -   Plan management with **per-plan pricing mode toggle** (Auto ⚡ / Manual 🔧), profit % badge, and color-coded margin indicators.

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