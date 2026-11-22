---
name: Wholesale price floor
description: Durable pricing invariants for any checkout or payment path in this project
---

Invariants for every payment path, current and future:
1. A sale must never complete below wholesale cost plus the minimum margin; there is a single shared floor service — never re-derive floor math locally.
2. Floors must use the WORST-CASE wholesale cost the sale could incur: fulfillment picks providers by priority, not price, so the cheapest offer's cost is not a safe floor.
3. Stored retail prices and client-sent amounts are never authoritative — recompute from live supplier offers.
4. Post-payment, validate the amount ACTUALLY captured (after promotions/discounts — e.g. Paddle's total, never its subtotal) against a freshly re-queried live floor; checkout-time metadata can be stale and is audit evidence only.
5. If no fulfillable supplier offer exists (or the captured amount/currency can't be determined), reject and don't fulfill — never fall through on unknown cost.

For SKU-pinned purchases, including unsigned older Stripe sessions, fresh cost evidence must cover the persisted supplier/SKU identities, not the entire normalized group. Unrelated available offers cannot replace missing or invalid evidence for the purchased SKU.

**Why:** A group-wide maximum can both approve a missing/invalid pinned SKU using another offer's cost and reject a valid purchase because an unrelated offer is expensive.

**How to apply:** Match live eligible offers to the stored fulfillment identities before evaluating the captured-payment floor; never substitute group pricing for pinned evidence.

**Why:** Production sold plans below cost (including near-zero captures) by trusting stale stored retail prices; successive code reviews found further leaks via priority-ordered fallback, promotions on undiscounted subtotals, and stale checkout-time cost metadata.
