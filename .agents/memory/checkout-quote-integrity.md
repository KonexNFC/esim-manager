---
name: Checkout quote integrity
description: The payment price and supplier SKU are bound together before hosted checkout.
---

Checkout must use a short-lived, signed server quote that identifies one concrete supplier offer, its USD amount, currency, wholesale evidence, and expiry. Do not treat all offers in a normalized plan as fulfillment fallbacks.

**Why:** Normalization groups comparable plans; it does not prove supplier SKUs are interchangeable. Re-resolving at payment time can charge or fulfill a different offer than the customer selected.

**How to apply:** Every storefront price, provider session/order creation, and payment-completion path must consume/recheck the same quote evidence and reject an expired, changed, or divergent payment. Safe fallbacks require a separately maintained immutable equivalence mapping.