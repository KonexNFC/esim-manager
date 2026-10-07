import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderEligibility } from "./providerHealth";
import {
  evaluateReliabilityPolicy,
  hasSafeFloor,
  orderByReliabilityPolicy,
  scoreMeasuredLatency,
  type ProviderPerformanceSnapshot,
} from "./routingPolicy";

const eligible: ProviderEligibility = {
  eligible: true,
  status: "eligible",
  healthStatus: "healthy",
  reason: "healthy",
  codes: [],
  checkedAt: "2026-08-20T08:00:00.000Z",
  ageMs: 0,
};

function candidate(
  providerKey: string,
  performance: ProviderPerformanceSnapshot | null,
  overrides: Partial<{
    marginScore: number;
    wholesalePriceUsd: number;
    retailPriceUsd: number;
    healthStatus: string;
    eligibility: ProviderEligibility;
  }> = {},
) {
  return {
    providerKey,
    providerPlanCode: `${providerKey}-concrete-sku`,
    wholesalePriceUsd: overrides.wholesalePriceUsd ?? 5,
    retailPriceUsd: overrides.retailPriceUsd ?? 12,
    marginScore: overrides.marginScore ?? 58,
    healthStatus: overrides.healthStatus ?? "healthy",
    eligibility: overrides.eligibility ?? eligible,
    performance,
  };
}

test("actual issuance dominates a cheaper provider", () => {
  const reliable = evaluateReliabilityPolicy(candidate("reliable", {
    recentOrdersCount: 40,
    fulfilmentSuccessRate: 0.98,
    avgLatencyMs: 900,
    failoverRate: 0.02,
  }, { wholesalePriceUsd: 8, retailPriceUsd: 12 }));
  const cheap = evaluateReliabilityPolicy(candidate("cheap", {
    recentOrdersCount: 40,
    fulfilmentSuccessRate: 0.60,
    avgLatencyMs: 900,
    failoverRate: 0.25,
  }, { wholesalePriceUsd: 3, retailPriceUsd: 12, marginScore: 75 }));

  assert.ok(reliable.scores.issuanceScore > cheap.scores.issuanceScore);
  assert.ok(reliable.scores.reliabilityScore > cheap.scores.reliabilityScore);
});

test("sparse history is shrunk toward the prior and confidence stays low", () => {
  const cold = evaluateReliabilityPolicy(candidate("cold", {
    recentOrdersCount: 1,
    fulfilmentSuccessRate: 0,
    avgLatencyMs: 1000,
    failoverRate: 1,
  }));
  const established = evaluateReliabilityPolicy(candidate("established", {
    recentOrdersCount: 40,
    fulfilmentSuccessRate: 0,
    avgLatencyMs: 1000,
    failoverRate: 1,
  }));

  assert.equal(cold.scores.historyConfidence, 5);
  assert.ok(cold.scores.issuanceScore > established.scores.issuanceScore);
});

test("history service Bayesian shrinkage is not applied a second time", () => {
  const alreadyShrunk = evaluateReliabilityPolicy(candidate("shrunk", {
    recentOrdersCount: 1,
    fulfilmentSuccessRate: 0.55,
    avgLatencyMs: 1000,
    failoverRate: 0.25,
    confidenceScore: 5,
  }));

  assert.equal(alreadyShrunk.scores.issuanceScore, 55);
  assert.equal(alreadyShrunk.scores.historyConfidence, 5);
});

test("successful fallbacks improve outcome quality rather than being treated as failover penalty", () => {
  const successfulFallback = evaluateReliabilityPolicy(candidate("fallback-success", {
    recentOrdersCount: 20,
    fulfilmentSuccessRate: 0.9,
    avgLatencyMs: 1000,
    failoverRate: 0,
    confidenceScore: 50,
  }));
  const failedFallback = evaluateReliabilityPolicy(candidate("fallback-failure", {
    recentOrdersCount: 20,
    fulfilmentSuccessRate: 0.9,
    avgLatencyMs: 1000,
    failoverRate: 1,
    confidenceScore: 50,
  }));

  assert.ok(successfulFallback.scores.failoverScore > failedFallback.scores.failoverScore);
  assert.ok(successfulFallback.scores.reliabilityScore > failedFallback.scores.reliabilityScore);
});

test("measured latency is used instead of a priority-like ordering", () => {
  assert.ok(scoreMeasuredLatency(500) > scoreMeasuredLatency(5000));
  assert.equal(scoreMeasuredLatency(null), 50);
});

test("health, eligibility, and the safe floor are hard gates", () => {
  const disabled = evaluateReliabilityPolicy(candidate("disabled", null, {
    eligibility: { ...eligible, eligible: false, reason: "Provider is disabled", codes: ["disabled"] },
  }));
  assert.equal(disabled.eligible, false);
  const staleHealth = evaluateReliabilityPolicy(candidate("stale-health", null, {
    healthStatus: "unknown",
  }));
  assert.equal(staleHealth.eligible, false);

  assert.equal(hasSafeFloor(12, 5), true);
  assert.equal(hasSafeFloor(10, 9), false);
  const unsafe = evaluateReliabilityPolicy(candidate("unsafe", null, {
    wholesalePriceUsd: 9,
    retailPriceUsd: 10,
  }));
  assert.equal(unsafe.eligible, false);
  assert.equal(unsafe.scores.safeFloorPassed, false);
});

test("legacy strategy labels only break ties after reliability ordering", () => {
  const rows = [
    { key: "high-margin", scores: { reliabilityScore: 82, issuanceScore: 90, failoverScore: 90, healthScore: 100, latencyScore: 90, marginScore: 90, costScore: 20 } },
    { key: "cheap", scores: { reliabilityScore: 81, issuanceScore: 89, failoverScore: 89, healthScore: 100, latencyScore: 90, marginScore: 30, costScore: 100 } },
  ];
  const ranked = orderByReliabilityPolicy(rows, row => row.scores, "cheapest_cost");
  assert.deepEqual(ranked.map(row => row.key), ["high-margin", "cheap"]);
});

test("cold-start Airalo then eSIM Access tie-break precedes margin without changing evidence", () => {
  const rows = [
    { key: "esimaccess", scores: { reliabilityScore: 75, issuanceScore: 75, failoverScore: 70, healthScore: 100, latencyScore: 50, marginScore: 90, costScore: 100 } },
    { key: "airalo", scores: { reliabilityScore: 75, issuanceScore: 75, failoverScore: 70, healthScore: 100, latencyScore: 50, marginScore: 20, costScore: 1 } },
  ];
  const ranked = orderByReliabilityPolicy(rows, row => ({
    ...row.scores,
    providerKey: row.key,
    coldStart: true,
  }), "highest_margin");
  assert.deepEqual(ranked.map(row => row.key), ["airalo", "esimaccess"]);
  assert.equal(ranked[0].scores.marginScore, 20);
});
