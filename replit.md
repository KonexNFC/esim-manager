# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is an eSIM marketplace where users can browse destinations, view data plans, purchase eSIMs, and receive QR codes for instant activation. Features multi-provider routing for best-price eSIM sourcing.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query

## Project Structure
- `client/src/pages/` - Page components (home, destinations, destination-detail, checkout, orders, order-detail, admin)
- `client/src/components/` - Reusable components (navbar, theme-toggle)
- `client/src/lib/` - Utilities (queryClient, theme provider)
- `server/` - Express server, routes, storage layer, seed data
- `server/providers/` - eSIM provider integrations (esimAccess, zendit, routing logic)
- `shared/schema.ts` - Drizzle schemas for destinations, plans, orders

## Database Schema
- **destinations** - Countries with images, flags, regions, corridor assignments
- **plans** - eSIM data plans (price, data amount, validity, features, wholesaleCost, planStatus, provider)
- **orders** - Purchases linked to plans with QR codes, ICCIDs, esimStatus

## API Endpoints
- `GET /api/destinations` - List all (or `?popular=true`)
- `GET /api/destinations/:id` - Single destination
- `GET /api/plans?destinationId=X` - Plans for a destination
- `GET /api/plans/:id` - Single plan
- `POST /api/plans` - Create plan
- `PATCH /api/plans/:id` - Update plan (status, pricing, etc.)
- `GET /api/orders?email=X` - Orders by email
- `GET /api/orders/:id` - Single order
- `POST /api/orders` - Create order (body: planId, email, totalPrice, currency)
- `PATCH /api/orders/:id` - Update order (status, esimStatus)
- `GET /api/admin/stats` - Admin dashboard statistics
- `GET /api/providers/plans?countryCode=X` - Fetch plans from configured providers
- `POST /api/providers/best-plan` - Find cheapest provider plan (body: countryCode, dataAmountGb, validityDays)

## Provider System
- `server/providers/types.ts` - EsimProvider interface (getPlans, purchaseEsim, getEsimStatus)
- `server/providers/esimgo.ts` - eSIMGo provider (LIVE, uses ESIMGO_API_KEY) - catalogue, ordering, eSIM status
- `server/providers/esimAccess.ts` - eSIM Access provider (scaffold, needs ESIM_ACCESS_API_KEY)
- `server/providers/zendit.ts` - Zendit provider (scaffold, needs ZENDIT_API_KEY)
- `server/providers/index.ts` - Multi-provider router: fetchProviderPlans, getBestPlan, purchaseFromProvider
- eSIMGo is connected and returning live plans; other providers activate when API keys are added
- Order creation attempts provider fulfillment when plan.provider !== "manual", falls back to manual QR generation

## Key Features
- Landing page with hero, corridor selector (UK↔EU, UK↔Nigeria, UK↔UAE, Global), value blocks, how-it-works, FAQ
- Browse/search destinations by region
- View plan details and pricing per destination
- Checkout with email confirmation
- Order detail with QR code and installation guide (iOS/Android)
- Orders lookup by email
- Admin dashboard (5 tabs): Dashboard stats, Plans management, Orders, eSIM Inventory, Margins
- Dark/light theme toggle
- Multi-provider routing scaffold for best-price sourcing

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
