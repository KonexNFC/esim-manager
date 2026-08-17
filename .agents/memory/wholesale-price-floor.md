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

**Why:** Production sold plans below cost (including near-zero captures) by trusting stale stored retail prices; successive code reviews found further leaks via priority-ordered fallback, promotions on undiscounted subtotals, and stale checkout-time cost metadata.
