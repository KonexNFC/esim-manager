---
name: Presentation refresh boundaries
description: User-requested display currency and visual scope, separate from charging.
---

The user requested: “Currency: display GBP by default with the switcher”.
Keep customer-selected currencies and distinguish converted display estimates from actual charge currencies.

**Why:** The refresh is presentation-only. The user explicitly excluded payment, checkout charging, provisioning, routing, pricing-engine and admin logic from Stage 1.

**How to apply:** Do not treat a display-currency change as permission to change checkout amounts, providers or quotes. Show the actual charge clearly where it differs and report that mismatch. Preserve source-currency semantics for native GBP marketing amounts versus USD quotes.

Stage 2: the user confirmed Stage 1 “is done and looks right” and requested a public-homepage-only rebuild. Keep the established styling and GBP default; destination/plan pages and all previously excluded business logic stay untouched.

**Why:** The user wants only figures and reviews the site can substantiate, qualitative comparisons, and the events carousel retained mid-page immediately after popular destinations.

**How to apply:** Derive homepage counts and starting prices from the catalogue; omit unmatched bundle prices and unapproved reviews rather than inventing them. Do not imply verified carrier partnerships.
