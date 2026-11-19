---
name: Production crash diagnostics
description: Keep server crash locations readable and do not infer crash causes from nearby caught errors.
---

Keep production server stack locations readable and emit bounded fatal-monitor diagnostics without changing Node's fatal exit behavior.

**Why:** Minified server source lines exceeded production log-entry limits and hid the actual fatal exception. Database timeouts and caught supplier failures near process exits were insufficient to identify the originating rejection.

**How to apply:** Preserve non-minified server bundles and compact stack locations. Never swallow all unhandled rejections to improve uptime. Do not blame cold starts, a caught supplier timeout, or the keepalive restart threshold without timeline evidence.

Contain expected dependency failures at each background job's outer boundary, including queue scans and stale-claim recovery, not only per-order processing. Keep retries and running-flag cleanup intact.

**Why:** Production diagnostics established that a rejected queue-maintenance query escaped a fire-and-forget timer and killed the HTTP process. An idle-pool error listener does not catch rejected queries.

**How to apply:** Exercise initial database read/write failures through scheduled callbacks in regression tests. Do not solve background failures by globally suppressing fatal errors or changing paid-order outcomes.
