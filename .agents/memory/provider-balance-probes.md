---
name: Provider wallet balance probes
description: Read-only API calls to check each eSIM provider's wallet balance and connectivity
---

All four provider credentials come from the running process env (set in `.replit` [env]/[userenv] sections — NOT in Replit secrets, so viewEnvVars won't show them; check `/proc/<pid>/environ`).

Safe read-only probes (no purchases):
- **eSIMGo**: `GET https://api.esim-go.com/v2.5/organisation` header `X-API-Key` → `organisations[0].balance` (USD).
- **eSIM Access**: `POST https://api.esimaccess.com/api/v1/open/balance/query` with signed RT-* headers (HMAC-SHA256 of ts+reqId+accessCode+body) → `obj.balance` in **1/10,000 USD units** (598500 = $59.85).
- **Zendit**: `GET https://api.zendit.io/v1/balance` Bearer → `{currency, currencyDivisor, availableBalance}` (GBP pence).
- **Airalo**: no balance API; verify auth via `POST https://partners-api.airalo.com/v2/token` (multipart client_credentials).

**Why:** the #1 cause of fulfillment failures is empty provider wallets; these probes let you check without spending money.
**How to apply:** run before diagnosing "low success rate" complaints or before any provider-related work.
