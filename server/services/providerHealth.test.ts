import assert from "node:assert/strict";
import test from "node:test";
import type { Provider } from "@shared/schema";
import {
  deriveProviderHealthSnapshot,
  evaluateProviderEligibility,
  PROVIDER_HEALTH_MAX_AGE_MS,
  resolveCanonicalProviderRow,
} from "./providerHealth";
import type { ProviderWalletSnapshot } from "./providerBalance";

function providerWith(
  health: ReturnType<typeof deriveProviderHealthSnapshot>,
  wallet: ProviderWalletSnapshot,
  overrides: Partial<Provider> = {},
): Provider {
  return {
    id: "provider-test",
    key: "esimgo",
    name: "eSIMGo",
    enabled: true,
    priority: 1,
    healthStatus: health.status,
    lastHealthCheck: new Date(health.checkedAt),
    autoPaused: false,
    autoPauseReason: null,
    autoPausedAt: null,
    metadata: { wallet, health },
    createdAt: new Date(health.checkedAt),
    updatedAt: new Date(health.checkedAt),
    ...overrides,
  };
}

test("low wallets are degraded and excluded from routing", () => {
  const now = new Date("2026-08-20T08:00:00.000Z");
  const wallet: ProviderWalletSnapshot = {
    status: "low",
    amount: 0,
    currency: "USD",
    threshold: 25,
    checkedAt: now.toISOString(),
  };
  const health = deriveProviderHealthSnapshot("esimgo", wallet, now);
  const eligibility = evaluateProviderEligibility(providerWith(health, wallet), now);

  assert.equal(health.status, "degraded");
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.status, "degraded");
  assert.deepEqual(eligibility.codes, ["wallet_low"]);
});

test("down and unconfigured suppliers fail closed", () => {
  const now = new Date("2026-08-20T08:00:00.000Z");
  const wallet: ProviderWalletSnapshot = {
    status: "not_configured",
    amount: null,
    currency: null,
    threshold: null,
    checkedAt: now.toISOString(),
  };
  const health = deriveProviderHealthSnapshot("zendit", wallet, now);
  const eligibility = evaluateProviderEligibility(
    providerWith(health, wallet, { key: "zendit", name: "Zendit" }),
    now,
  );

  assert.equal(health.status, "down");
  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.codes, ["not_configured"]);
});

test("otherwise healthy suppliers are excluded when their check becomes stale", () => {
  const checkedAt = new Date("2026-08-20T08:00:00.000Z");
  const wallet: ProviderWalletSnapshot = {
    status: "ok",
    amount: 100,
    currency: "USD",
    threshold: 25,
    checkedAt: checkedAt.toISOString(),
  };
  const health = deriveProviderHealthSnapshot("esimgo", wallet, checkedAt);
  const now = new Date(checkedAt.getTime() + PROVIDER_HEALTH_MAX_AGE_MS + 1);
  const eligibility = evaluateProviderEligibility(providerWith(health, wallet), now);

  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.codes, ["health_stale"]);
});

test("a fresh successful probe automatically restores a recovered wallet", () => {
  const firstCheck = new Date("2026-08-20T08:00:00.000Z");
  const lowWallet: ProviderWalletSnapshot = {
    status: "low",
    amount: 0,
    currency: "USD",
    threshold: 25,
    checkedAt: firstCheck.toISOString(),
  };
  const degraded = deriveProviderHealthSnapshot("esimgo", lowWallet, firstCheck);

  const recoveredAt = new Date("2026-08-20T08:15:00.000Z");
  const fundedWallet: ProviderWalletSnapshot = {
    status: "ok",
    amount: 100,
    currency: "USD",
    threshold: 25,
    checkedAt: recoveredAt.toISOString(),
  };
  const recovered = deriveProviderHealthSnapshot("esimgo", fundedWallet, recoveredAt, degraded);
  const eligibility = evaluateProviderEligibility(providerWith(recovered, fundedWallet), recoveredAt);

  assert.equal(recovered.status, "healthy");
  assert.equal(eligibility.eligible, true);
  assert.deepEqual(eligibility.codes, []);
});

test("manual disable and auto-pause remain hard exclusions after healthy probes", () => {
  const now = new Date("2026-08-20T08:00:00.000Z");
  const wallet: ProviderWalletSnapshot = {
    status: "ok",
    amount: 100,
    currency: "USD",
    threshold: 25,
    checkedAt: now.toISOString(),
  };
  const health = deriveProviderHealthSnapshot("esimgo", wallet, now);
  const eligibility = evaluateProviderEligibility(
    providerWith(health, wallet, {
      enabled: false,
      autoPaused: true,
      autoPauseReason: "3 consecutive provisioning failures",
    }),
    now,
  );

  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.codes, ["disabled", "auto_paused"]);
});

test("canonical registry rows win and ambiguous legacy variants fail closed", () => {
  const withCanonical = resolveCanonicalProviderRow(
    [{ key: "esimAccess", enabled: false }, { key: "esimaccess", enabled: true }],
    "eSIM Access",
  );
  assert.equal(withCanonical.conflict, false);
  assert.equal(withCanonical.provider?.key, "esimaccess");

  const ambiguous = resolveCanonicalProviderRow(
    [{ key: "esimAccess" }, { key: "esim_access" }],
    "esimaccess",
  );
  assert.equal(ambiguous.conflict, true);
  assert.equal(ambiguous.provider, null);
});

test("fallback chains attempt each canonical supplier only once", async () => {
  const {
    dedupeFallbackChainByProvider,
    resolveCanonicalProviderCandidates,
  } = await import("./fulfillment");
  const chain = dedupeFallbackChainByProvider([
    { k: "esimAccess", c: "first" },
    { k: "esim_access", c: "second" },
    { k: "airalo", c: "third" },
  ]);

  assert.deepEqual(chain, [
    { k: "esimAccess", c: "first" },
    { k: "airalo", c: "third" },
  ]);

  const authoritative = resolveCanonicalProviderCandidates([
    { key: "esimgo", enabled: false },
    { key: "eSIMGo", enabled: true },
    { key: "airalo", enabled: true },
  ]);
  assert.deepEqual(authoritative.providers, [
    { key: "esimgo", enabled: false },
    { key: "airalo", enabled: true },
  ]);

  const ambiguous = resolveCanonicalProviderCandidates([
    { key: "eSIMGo" },
    { key: "esim_go" },
  ], "esimgo");
  assert.deepEqual(ambiguous.providers, []);
  assert.deepEqual(ambiguous.conflicts, ["esimgo"]);
});