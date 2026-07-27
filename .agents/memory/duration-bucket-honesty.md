---
name: Duration bucket honesty rule
description: Storefront duration buckets must never overstate plan validity; real supplier SKUs are 1/3/5/7/10/15/30 days
---

# Duration bucket honesty

**Rule:** a duration bucket (the "X Days" group header on destination pages) must never claim more validity than the plans inside deliver. Bucket DOWN, never up: customers may get bonus days, never fewer.

**Why:** the original mapping filed 15-day supplier plans under DAY_30 ("30-day validity" shown for a 15-day product) and 10-day plans under DAY_14. Group headers and plan rows display the bucket label as the validity promise, so bucketing up is a false claim at the point of sale.

**How to apply:** validity→bucket mapping lives in the catalogue normalizer (`normalizeValidityToBucket`). Current honest ranges: 1→DAY_1, 2–3→DAY_3, 4–5→DAY_5, 6–13→DAY_7, 14–29→DAY_14, 30–31→DAY_30, >31 excluded. If new supplier validities appear, extend ranges downward-honest. The plan-finder trip matching (`daysToBucket` in routes) relies on buckets guaranteeing ≥ bucket-days validity — keep that invariant.

**Data fact (July 2026):** across all providers (eSIMGo, eSIM Access, Zendit, Airalo), SKU validities in the 8–31-day range are exclusively 10, 15, and 30 days. 15-day SKUs are the most common two-week product (232 regions). Only CYP, LB, ZW lack any 8–15-day SKU. Synthetics deliberately never fill DAY_14/DAY_30 (14×/30× DAY_1 cost is uneconomic).
