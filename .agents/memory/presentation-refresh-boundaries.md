---
name: Presentation refresh boundaries
description: User-requested display currency and visual scope, separate from charging.
---

The user requested: “Currency: display GBP by default with the switcher”.
Keep customer-selected currencies and distinguish converted display estimates from actual charge currencies.

**Why:** The refresh is presentation-only. The user explicitly excluded payment, checkout charging, provisioning, routing, pricing-engine and admin logic from Stage 1.

**How to apply:** Do not treat a display-currency change as permission to change checkout amounts, providers or quotes. Show the actual charge clearly where it differs and report that mismatch. Preserve source-currency semantics for native GBP marketing amounts versus USD quotes.
