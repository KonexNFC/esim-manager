---
name: Refund state lifecycle
description: Correct status handling for payments captured below the wholesale floor.
---

Captured payments that fail the wholesale-floor guard must move through a refund state, never back into fulfillment. Mark the order `refunded` only when the provider confirms completion; provider-accepted asynchronous refunds use `refund_pending`.

**Why:** Stripe and PayPal can accept a full-refund request before it is complete. Treating acceptance as completion falsely tells the customer their money is back and allows retry logic to take the wrong path.

**How to apply:** Any captured-payment rejection must use the shared refund flow, prevent fulfillment for both refund states, and communicate whether the refund is completed or still being processed. Durable reconciliation of pending refunds is a separate required recovery capability.