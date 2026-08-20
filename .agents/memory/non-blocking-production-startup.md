---
name: Non-blocking production startup
description: Keep the production HTTP listener independent from slow database and supplier initialization
---

**Rule:** Production startup must register routes and open the HTTP listener before starting database seeding, supplier wallet checks, catalogue syncs, or other external dependency work.

**Why:** An Autoscale instance repeatedly failed platform health checks while startup waited for sequential supplier probes. Each supplier request can wait several seconds, so the process was alive but unreachable and monitoring recorded an outage.

**How to apply:** Keep a dependency-free health endpoint available, run idempotent initialization in the background after listening, and preserve safety by making checkout and fulfillment fail closed whenever provider health is unknown, stale, or down.