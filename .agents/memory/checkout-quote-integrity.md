---
name: Checkout quote integrity
description: The payment price and supplier SKU are bound together before hosted checkout.
---

Checkout must use a short-lived, signed server quote that identifies one concrete supplier offer, its USD amount, currency, wholesale evidence, and expiry. Do not treat all offers in a normalized plan as fulfillment fallbacks.

**Why:** Normalization groups comparable plans; it does not prove supplier SKUs are interchangeable. Re-resolving at payment time can charge or fulfill a different offer than the customer selected.

**How to apply:** Every storefront price, provider session/order creation, and payment-completion path must consume/recheck the same quote evidence and reject an expired, changed, or divergent payment. Safe fallbacks require a separately maintained immutable equivalence mapping.

Supplier equivalence must fail closed when a source omits material service terms;
do not fill activation, coverage or fair-use gaps from marketing names. An operator
must review authoritative terms before approving exact SKUs. Do not fabricate
initial approvals just to enable failover.

**Why:** Supplier catalogues do not necessarily disclose every contractual term.
Two apparently identical allowances can still deliver different service.

**How to apply:** Import complete supplier evidence, preserve old approval
versions for paid orders, and never make a paid chain adopt a newer version.

Equivalent service alone is insufficient for safe failover: only a definitive
no-purchase rejection permits another supplier attempt. Accepted orders, lost
responses and post-purchase errors require reconciliation, not another purchase.

**Why:** Allocation can time out after a supplier has already billed the wallet.
An ordinary error previously looked like permission to buy a second eSIM.

**How to apply:** Treat unclassified adapter purchase exceptions as ambiguous;
preserve the order reference and block retries until the existing purchase is resolved.