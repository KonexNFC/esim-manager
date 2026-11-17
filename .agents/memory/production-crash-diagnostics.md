---
name: Production crash diagnostics
description: Keep server crash locations readable and do not infer crash causes from nearby caught errors.
---

Keep production server stack locations readable and emit bounded fatal-monitor diagnostics without changing Node's fatal exit behavior.

**Why:** Minified server source lines exceeded production log-entry limits and hid the actual fatal exception. Database timeouts and caught supplier failures near process exits were insufficient to identify the originating rejection.

**How to apply:** Preserve non-minified server bundles and compact stack locations. Never swallow all unhandled rejections to improve uptime. Do not blame cold starts, a caught supplier timeout, or the keepalive restart threshold without timeline evidence.
