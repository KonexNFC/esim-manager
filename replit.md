# GlobeSIM - eSIM Marketplace

## Overview
GlobeSIM is an eSIM marketplace where users can browse destinations, view data plans, purchase eSIMs, and receive QR codes for instant activation.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query

## Project Structure
- `client/src/pages/` - Page components (home, destinations, destination-detail, checkout, orders, order-detail)
- `client/src/components/` - Reusable components (navbar, theme-toggle)
- `client/src/lib/` - Utilities (queryClient, theme provider)
- `server/` - Express server, routes, storage layer, seed data
- `shared/schema.ts` - Drizzle schemas for destinations, plans, orders

## Database Schema
- **destinations** - Countries with images, flags, regions
- **plans** - eSIM data plans (price, data amount, validity, features)
- **orders** - Purchases linked to plans with QR codes and ICCIDs

## API Endpoints
- `GET /api/destinations` - List all (or `?popular=true`)
- `GET /api/destinations/:id` - Single destination
- `GET /api/plans?destinationId=X` - Plans for a destination
- `GET /api/plans/:id` - Single plan
- `GET /api/orders?email=X` - Orders by email
- `GET /api/orders/:id` - Single order
- `POST /api/orders` - Create order (body: planId, email, totalPrice, currency)

## Key Features
- Landing page with hero, popular destinations, value blocks, how-it-works
- Browse/search destinations by region
- View plan details and pricing per destination
- Checkout with email confirmation
- Order detail with QR code and installation guide (iOS/Android)
- Orders lookup by email
- Dark/light theme toggle

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
