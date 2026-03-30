# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is a production-ready eSIM marketplace enabling users to browse, purchase, and manage eSIM data plans. It offers instant eSIM activation, a comprehensive customer account dashboard, and top-up functionalities. The platform ensures reliable post-payment eSIM provisioning via Stripe webhooks and features multi-provider routing for optimal plan selection. The project aims to be a leading global platform for seamless mobile connectivity through eSIM technology, continuously expanding its provider integrations and features.

## User Preferences
I prefer detailed explanations. I want iterative development where I am asked before major changes are made. I like functional programming paradigms where it makes sense, but pragmatism is key.

## System Architecture
GlobeSIM is built with a modern web stack. The **frontend** uses React with TypeScript, Vite, Tailwind CSS, and shadcn/ui. The **backend** is an Express.js application in TypeScript. **PostgreSQL** with Drizzle ORM manages data persistence.

**UI/UX Design:**
-   Premium landing page with feature showcases.
-   Context-aware navigation bar.
-   Destination detail pages with data usage estimators.
-   Checkout process includes trust badges and upsell steps.
-   Checkout success and cancel pages.
-   Dark/light theme toggle.
-   Device compatibility checker.

**Technical Implementations:**
-   **Authentication:** JWT tokens secured in httpOnly cookies.
-   **Payment Processing:** Integrated with Stripe for all payment flows; webhooks ensure reliable post-payment fulfillment.
-   **eSIM Provisioning:** Provider adapter layer supports various eSIM providers (e.g., eSIMGo, eSIM Access, Zendit) with abstract interfaces for common operations and a failover mechanism.
-   **Multi-Provider Routing Engine:** Selects the best provider using strategies like `cheapest_cost`, `highest_margin`, `best_health`, or `blended_score` (based on margin, success rate, destination performance, health, latency). Every decision includes a `confidenceScore` and `confidenceLabel`, and is auditable in `routing_decisions`.
-   **Auto Provider Pause:** System automatically pauses underperforming providers based on success rates or consecutive errors, excluding them from routing.
-   **Routing Margin Protection:** Implements margin gates, health dampening, and success-rate tiebreakers to protect profitability.
-   **Pricing Engine:** Calculates retail prices through a four-stage pipeline: markup, minimum margin enforcement, floor price, and charm pricing.
-   **Per-Plan Target Margin:** Allows individual plans to override the global `targetMarginPercent` setting.
-   **Margin Engine:** Centralized service for gross margin calculation and related utilities.
-   **Checkout Pricing Integration:** Uses `stripeService.ts::createPlanCheckoutSession()` to derive prices from the routing engine's wholesale cost and live margin targets.
-   **Fulfillment Fallback Chain:** Systematically attempts providers in a defined priority order, logging each attempt.
-   **Provider Attempts Table:** Logs detailed information for each eSIM provisioning attempt.
-   **Fulfillment System:** Automated eSIM provisioning and email delivery triggered by Stripe webhooks, with a state machine (`paid → fulfilling → fulfilled` or `fulfillment_failed`) and retry mechanisms.
-   **Email Notifications:** Transactional emails sent via Resend for various events (eSIM Ready, Purchase Confirmation, etc.).
-   **Destination Performance Tracking:** Maintains rolling performance metrics per provider and destination using exponential moving averages.
-   **Usage Synchronization:** Scheduled processes update user dashboards and trigger notifications based on live data from providers.
-   **Customer Dashboard:** Centralized view for active eSIMs, order history, and profile settings.
-   **Admin Dashboard:** Provides comprehensive administrative tools including profit statistics, provider cost breakdown, profit optimization modes, plan management with pricing toggles, and live catalogue syncing with external providers.
-   **Coverage Type Marking:** Categorizes provider offers by `coverageType` (country, regional, global).
-   **Dynamic Global Catalog Engine:** Automated 6-hour provider syncs maintain 17K+ active offers across 194 countries + 10 regional/global plans (GLOBAL, EUROPE, APAC, LATAM, MENA, AFRICA, NORTHAM, SEASIA, SOUTHASIA, CARIBBEAN). eSIM Access fetching is parallelized (10 concurrent requests) with a blocklist of unsupported country codes.
-   **Admin Catalog Health Dashboard:** `/api/admin/catalog-health` endpoint and visual panel in the admin dashboard showing live offer counts, provider distribution, priority market coverage (20 key countries), single-provider risk countries, and last sync status.
-   **Region Slug System:** Canonical region slugs (GLOBAL, EUROPE, etc.) used as `region_code` in `normalized_plans` for multi-country plans. Both eSIMGo and Zendit emit regional/global plans under these slugs. Extended Zendit region name map covers 35+ region name variants.

## External Dependencies
-   **Stripe:** Payment gateway and webhook processing.
-   **eSIMGo:** External eSIM provider API.
-   **eSIM Access:** External eSIM provider API.
-   **Zendit:** External eSIM provider API.
-   **PostgreSQL:** Relational database.
-   **bcryptjs:** Password hashing library.
-   **jsonwebtoken:** JWT creation and verification.
-   **cookie-parser:** Express.js cookie parsing middleware.
-   **TanStack React Query:** Frontend data fetching and state management.
-   **wouter:** Frontend routing library.
-   **Resend:** Email sending service.