# Supplier fallback approvals

Normalized plans are comparison groups, **not** evidence of identical service.
No supplier pairs are pre-approved by this change. Existing catalogue importers
that cannot establish every term continue to produce singleton checkout quotes.

## Authoritative service evidence

The supplier importer must supply `ProviderPlan.serviceTerms` from documented
supplier terms, never infer missing activation or fair-use rules from a plan name.
The schema is in `shared/serviceEquivalence.ts`. It requires:

- The complete covered ISO country set.
- Total/daily/unlimited allowance and exact MB allowance.
- Exact validity in hours.
- Explicit throttling threshold, speed and reset period (or explicit no throttling).
- Activation trigger and activation window, top-up and tethering support.

Every sync replaces this evidence, including clearing it if the source no longer
provides it. A missing field, SKU change or changed term makes an old approval
unusable; normalization and rounding are never used to establish equivalence.

## Approve a version

An authorized operator reviews the supplier documents and builds an
`EquivalenceApproval` JSON object (see the shared type). Record a stable group
name, monotonically increasing version, reviewer, and evidence reference.
Each member identifies an exact provider-offer ID, canonical supplier key and
SKU, plus the `termsHash` exported by `supplierEquivalence.ts`.
All members must match the group's canonical terms and current active offers.

Run `npx tsx scripts/approve-equivalence.ts path/to/approval.json` in the intended
environment using the established database access controls. This inserts only;
it does not edit offers or infer terms. The unique group/version prevents
replacement, and the content-addressed approval ID makes any later mutation
fail verification. Never edit or delete old versions needed by paid orders.
Publish a new version for any change; old quotes do not adopt it.

## Quote and fulfillment rules

Quotes retain the selected offer first, include only healthy approved alternatives
whose individual cost floors fit the displayed amount, and sign each exact offer
ID and approval digest. Stripe may truncate the tail to fit its metadata limit;
it never adds members. The worst cost of the retained chain still sets the floor.

Payment validation preserves the existing supplier-price-change checks.
Fulfillment validates the stored approval and current terms for each attempted
member, then applies the existing active-offer/provider-health checks. It never
looks up the latest group to expand a paid chain. Orders predating approval
evidence remain pinned to their first SKU. A missing approval fails closed.

Automatic failover also requires a typed definitive rejection proving that no
purchase was accepted. Generic errors, lost responses and accepted-but-unallocated
orders stop in `fulfillment_pending`; they cannot trigger another supplier call.
Only Zendit's existing reconciler runs automatically. Other pending purchases
require manual supplier reconciliation, and the admin re-fulfill action blocks
them rather than placing another order. Adapters must not label uncertain
outcomes as `PurchaseRejectedError`.
