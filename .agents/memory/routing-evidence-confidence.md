---
name: Routing evidence confidence
description: Non-obvious statistical and fulfillment constraints for supplier ranking.
---

Shrink the global supplier prior as well as destination evidence, and exclude the destination's own evidence from its prior. Apply confidence adjustment only once.

**Why:** A raw global prior turns one successful order into a 100% destination estimate despite a low confidence label. Reusing destination evidence in that prior double-counts the same issuance.

**How to apply:** Test one success, one failure, and a new destination explicitly. Count actual issued outcomes, not purchase acceptance or pending reconciliation. Successful fallback usage is a success, not a failover penalty.

Keep ranked alternative suppliers separate from purchase-approved fallback SKUs.

**Why:** Historical normalization groups similar products but does not establish identical service. Ranking is not permission to change a paid supplier SKU.

**How to apply:** Until immutable equivalence evidence exists, quote and fulfillment chains remain pinned to one concrete offer; other ranked candidates are diagnostic only.