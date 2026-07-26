---
name: Production DB auto-pause
description: Live site "down" / empty destination finder can mean the production Postgres endpoint is paused, not a code or billing problem
---

**Rule:** When konexesim.com is up but APIs 500 or the destination finder is empty, check the production database pane FIRST — the Neon-backed prod endpoint auto-pauses/disables after inactivity.

**Why:** July 2026 outage: deploy logs showed healthcheck 500s and the live destination finder was empty; hours were spent on code/deploy theories, but the root cause was the paused prod DB endpoint. The user clicked "Unpause database" in the Database pane and everything recovered immediately (no redeploy needed).

**How to apply:** Verify with a read-only query against `environment: "production"` (e.g. count rows in plans) or `curl https://konexesim.com/api/countries`. If the DB is paused, have the user unpause it in the Database pane — do not start rewriting code or redeploying.
