import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderPerformance,
  type PerformanceObservation,
} from "./performanceHistory";
import {
  projectDestinationScores,
} from "./routingEngine";
import {
  evaluateReliabilityPolicy,
  orderByReliabilityPolicy,
} from "./routingPolicy";

const now = new Date("2026-08-21T12:00:00.000Z");

function globalObservations(
  providerKey: string,
  successes: number,
  failures: number,
): PerformanceObservation[] {
  return [
    ...Array.from({ length: successes }, (_, index) => ({
      orderId: `${providerKey}-success-${index}`,
      providerKey,
      destination: "FR",
      outcome: "issued_success" as const,
      isFallback: false,
      latencyMs: 800,
      failureClass: null,
      occurredAt: now,
      source: "provider_attempt" as const,
    })),
    ...Array.from({ length: failures }, (_, index) => ({
      orderId: `${providerKey}-failure-${index}`,
      providerKey,
      destination: "FR",
      outcome: "failure" as const,
      isFallback: false,
      latencyMs: 800,
      failureClass: "provider_rejected" as const,
      occurredAt: now,
      source: "provider_attempt" as const,
    })),
  ];
}

function eligibility() {
  return {
    eligible: true,
    status: "eligible" as const,
    reason: "active",
    codes: ["JP-1GB-7D"],
    checkedAt: now,
  };
}

test("global history ranks a strong supplier over a weak supplier on a new destination", () => {
  const strong = projectDestinationScores(
    buildProviderPerformance("strong", "JP", globalObservations("strong", 9, 1), { now }),
  );
  const weak = projectDestinationScores(
    buildProviderPerformance("weak", "JP", globalObservations("weak", 1, 9), { now }),
  );

  // No local JP observations, but neither provider is a cold start.
  assert.equal(strong.dataOrdersCount, 0);
  assert.equal(weak.dataOrdersCount, 0);
  assert.equal(strong.hasGlobalHistory, true);
  assert.equal(weak.hasGlobalHistory, true);
  assert.equal(strong.performance?.confidenceScore, 0);
  assert.equal(weak.performance?.confidenceScore, 0);
  assert.ok((strong.performance?.fulfilmentSuccessRate ?? 0) > 0.75);
  assert.ok((weak.performance?.fulfilmentSuccessRate ?? 1) < 0.75);

  const scored = [
    { key: "strong", projection: strong, price: 10 },
    { key: "weak", projection: weak, price: 10 },
  ].map(row => {
    const policy = evaluateReliabilityPolicy({
      providerKey: row.key,
      providerPlanCode: `${row.key}-JP-1GB-7D`,
      wholesalePriceUsd: row.price,
      retailPriceUsd: 20,
      marginScore: 50,
      healthStatus: "healthy",
      eligibility: eligibility(),
      performance: row.projection.performance,
    });
    return {
      key: row.key,
      policy,
      coldStart: !row.projection.hasGlobalHistory &&
        row.projection.dataOrdersCount === 0,
    };
  });

  const ranked = orderByReliabilityPolicy(
    scored,
    row => ({
      reliabilityScore: row.policy.scores.reliabilityScore,
      issuanceScore: row.policy.scores.issuanceScore,
      failoverScore: row.policy.scores.failoverScore,
      healthScore: row.policy.scores.healthScore,
      latencyScore: row.policy.scores.latencyScore,
      marginScore: row.policy.scores.marginScore,
      providerKey: row.key,
      coldStart: row.coldStart,
    }),
  );
  assert.deepEqual(ranked.map(row => row.key), ["strong", "weak"]);
});