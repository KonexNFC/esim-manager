---
name: Recommendation engine rules
description: Hard constraints for the RECOMMENDED/CHEAPER/PREMIUM catalogue slot logic in server/catalogue/recommendation-engine.ts
---

# Recommendation engine slot rules

## Rule 1 — RECOMMENDED: 3× ratio guard
**Rule:** If the cheapest qualifying native unlimited plan costs more than 3× the cheapest qualifying fixed-data plan (that meets MIN_TOURIST_DATA_GB for the bucket), skip the unlimited and return the fixed plan as RECOMMENDED instead.
**Why:** US / expensive-market unlimited plans can be £8.99 for 1-day vs £2.49 for 1 GB fixed — recommending unlimited would label a plan that costs 3.6× more as "Best Value", which misleads users.
**How to apply:** `pickRecommended()` in step 2b; `MIN_TOURIST_DATA_GB` per bucket enforces the qualifying fixed-plan threshold.

## Rule 2 — CHEAPER: minimum data threshold
**Rule:** Budget plans below `MIN_TOURIST_DATA_GB[bucket]` are excluded: 1/3/5/7/10/15 GB for DAY_1/3/5/7/14/30.
**Why:** A 0.49 GB plan promoted as "Budget Pick" for a 5-day trip is useless; showing it misleads users into purchasing an insufficient plan.
**How to apply:** `pickCheaper()` filters `(o.dataGb ?? 0) >= (MIN_TOURIST_DATA_GB[o.bucket] ?? 0)`.

## Rule 3 — PREMIUM: no duplicate-unlimited, 2.5× price cap
**Rule:** (a) Do NOT return another unlimited plan as PREMIUM when RECOMMENDED is already unlimited — no upgrade value, just a more expensive provider. (b) Any PREMIUM plan must cost ≤ 2.5× the RECOMMENDED price.
**Why:** 5/7-day US showed two "Unlimited Data Plan" cards from different providers at different prices (£41.99 vs £50.49), which confused users. 14-day showed £83.49 Premium vs £22.99 Best Value (3.6× — absurd).
**How to apply:** `pickPremium()` gates the unlimited-upsell step on `!recIsUnlimited`, and enforces `o.sellPriceGbp <= recommended.sellPriceGbp * MAX_PREMIUM_TO_REC_RATIO (2.5)`.

## Note on dev vs production DB
Dev DB has cheaper wholesale plans (in-band). Prod DB has higher wholesale costs from providers — this is why prices look right in dev but wrong in prod screenshots. The rules above are designed to produce sane output regardless of the absolute price level.
