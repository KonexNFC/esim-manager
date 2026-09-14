---
name: Failed-order recovery & fulfillment failure causes
description: How to act on production orders from the workspace, and the recurring root causes of fulfillment_failed orders
---

## Acting on production data
- Prod DB is read-only from the agent (separate from dev). The only write path is the live app's API (production URL via deployment info, e.g. https://konexesim.com).
- `PATCH /api/orders/:id` is **unauthenticated** in `server/routes.ts` — it was used to sync refund statuses, but it is a security hole anyone can hit.
- Workspace PayPal/Stripe secrets are the **live** credentials; refunds can be issued directly via PayPal `/v2/payments/captures/{id}/refund` and Stripe `/v1/refunds` (both notify the customer automatically). Always check capture/PI status first — one order was already refunded at PayPal but the DB never recorded it.

## Root causes of fulfillment_failed (from prod provider_attempts, Apr–Jun 2026)
1. **Provider wallet balances at $0** — eSIMGo "Insufficient balance: 0.00 USD", eSIM Access error 200007 "balance is insufficient". No low-balance alerting/preflight exists; paid customer orders fail after money is taken.
2. **Stale provider plan codes** — eSIMGo "Bundle not available: P0YFEWXGN", eSIM Access "plan code doesn't exist", Airalo 422 out-of-stock. Catalog drift between synced offers and providers' live catalogs.
3. **Zendit async allocation timeout** — "placed but no profile allocated within 100 s" treated as terminal failure with no later reconciliation; the wholesale purchase may still complete, so money can be spent with no eSIM delivered and no retry.

**How to apply:** any fix to stop new fulfillment failures should target these three; re-fulfilling months-old orders is usually wrong (stale travel dates) — refund instead.

## Asynchronous supplier purchase rule
Reserve and persist the supplier transaction/idempotency ID before sending any purchase request whose response can be delayed or lost. Once that ID exists, every timeout, restart, and manual retry must reconcile the same transaction and must never issue a new purchase.

**Why:** persisting only after an allocation timeout still leaves a crash or lost-response window where startup recovery can charge the supplier twice.

**How to apply:** treat network errors and 5xx responses after submission as uncertain, not rejected; only a definitive client rejection may clear the reservation and continue to another supplier.
