---
name: Provider health gating
description: Safety rules for deciding whether any supplier may be charged or called for fulfillment.
---

Provider eligibility must be a hard, fail-closed gate on every purchase path, not a routing-score adjustment. The same canonical supplier identity and fresh health decision must apply before charge and immediately before each supplier call, including stored fallback chains, legacy orders, and top-ups.

**Why:** Historical provider-key aliases and independently evolved purchase paths can otherwise let a disabled alias override the canonical supplier or let an old checkout decision bypass a later wallet outage, service failure, or stale catalogue.

**How to apply:** Any new payment or fulfillment path must use the shared eligibility rules, treat lookup/check failures as ineligible, validate stored offer codes before purchase, and attempt each canonical supplier at most once. Only a fresh successful safe probe may restore health-based eligibility; manual disable and performance auto-pause remain hard exclusions.