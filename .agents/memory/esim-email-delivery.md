---
name: eSIM email delivery guarantees
description: Transactional outbox scope and the email-provider acceptance ambiguity.
---

Automatic eSIM-ready email delivery is at-least-once, not strictly exactly-once. Persist the notification with fulfillment, and only record success after provider acceptance. Preserve signed QR URLs in the queued payload.

**Why:** SendGrid does not offer an idempotent send API. A crash after remote acceptance but before the database commit can cause a duplicate on retry; recording success before sending instead risks losing the customer's email. Prefer eventual delivery over silently losing it.

**How to apply:** Keep automatic delivery deduplicated by order and serialize worker delivery using database locks. Do not claim absolute duplicate prevention across an ambiguous remote acceptance. The separate purchase receipt and explicit support resend are outside the automatic QR outbox's scope.
