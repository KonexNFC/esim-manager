# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is an eSIM marketplace where users can browse destinations, view data plans, purchase eSIMs, and receive QR codes for instant activation. Features multi-provider routing for best-price eSIM sourcing, and a full customer account system with dashboard, eSIM management, top-ups, and order history.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query
- **Auth**: JWT in httpOnly cookies (bcryptjs + jsonwebtoken + cookie-parser)

## Project Structure
- `client/src/pages/` - Page components (home, destinations, destination-detail, checkout, orders, order-detail, admin, dashboard, login, signup, forgot-password)
- `client/src/components/` - Reusable components (navbar, theme-toggle)
- `client/src/lib/` - Utilities (queryClient, theme provider, auth context)
- `server/` - Express server, routes, storage layer, seed data, auth helpers
- `server/providers/` - eSIM provider integrations (esimAccess, zendit, routing logic)
- `shared/schema.ts` - Drizzle schemas for users, destinations, plans, orders

## Database Schema
- **users** - Customer accounts (id, name, email, passwordHash, createdAt)
- **destinations** - Countries with images, flags, regions, corridor assignments
- **plans** - eSIM data plans (price, data amount, validity, features, wholesaleCost, planStatus, provider)
- **orders** - Purchases linked to plans with QR codes, ICCIDs, esimStatus, optional userId FK

## Authentication
- JWT tokens stored in httpOnly cookies (`globe_session`, 30-day expiry)
- `server/auth.ts` — hashPassword, verifyPassword, signToken, verifyToken, requireAuth middleware
- Post-purchase auto-link: orders with matching email are linked to user account on login/signup
- Routes: `/login`, `/signup`, `/forgot-password`, `/dashboard`

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
- `POST /api/providers/best-plan` - Find cheapest provider plan
- `POST /api/auth/signup` - Create account (name, email, password)
- `POST /api/auth/login` - Login (email, password) → httpOnly cookie
- `POST /api/auth/logout` - Clear session cookie
- `GET /api/auth/me` - Get current user from cookie
- `PATCH /api/auth/profile` - Update name or password (auth required)
- `GET /api/dashboard/orders` - Get user's orders (auth required)
- `POST /api/dashboard/topup/:orderId` - Mock top-up (auth required)

## Provider System
- `server/providers/types.ts` - EsimProvider interface
- `server/providers/esimgo.ts` - eSIMGo provider (LIVE, uses ESIMGO_API_KEY)
- `server/providers/esimAccess.ts` - eSIM Access provider (scaffold)
- `server/providers/providerManager.ts` - Routes purchases to correct provider
- `server/providers/index.ts` - Multi-provider router

## Customer Dashboard
- `/dashboard` - Main customer dashboard with 3 tabs:
  1. **My eSIMs** - Active eSIM cards with usage bars, QR modal, top-up modal
  2. **Order History** - Full purchase history with links to order details
  3. **Settings** - Profile name, password change
- Stats strip: Active eSIMs count, total orders, total spent
- Empty states for no eSIMs / no orders

## Key Features
- **Premium landing page** with 11 sections
- **Customer accounts** — post-purchase, low-friction (no forced signup before checkout)
- **eSIM dashboard** — usage tracking (mock), status badges, QR viewer, top-up
- **Top-up system** — 6 options (1GB/3GB/5GB/Unlimited/+7 days/+30 days)
- **Context-aware navbar**: shows "Log In" or "Dashboard" depending on auth state
- **Destination detail** with Data Usage Estimator
- **Checkout** with trust badges and upsell step
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
