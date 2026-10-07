// ─── Reliability-first routing policy ─────────────────────────────────────────
//
// This module is deliberately free of database access.  It is the one place
// where routing order and the reliability weights are defined so that a
// legacy strategy (cheapest, margin, or health) cannot accidentally bypass
// the safety policy.

import type { ProviderEligibility } from "./providerHealth";
import { computeFloorUsd } from "./priceFloor";

export const RELIABILITY_POLICY_VERSION = "reliability-first-v1";

/** The historical prior used until a provider has actually issued orders. */
export const DEFAULT_SUCCESS_RATE = 0.75;
export const DEFAULT_FAILOVER_RATE = 0.30;

/** A measured latency is scored against this conservative ten-second bound. */
export const MAX_MEASURED_LATENCY_MS = 10_000;

/**
 * Actual issuance is intentionally the largest component.  Margin is only a
 * small tie-break signal; it can never compensate for a materially less
 * reliable provider.
 */
export const RELIABILITY_POLICY_WEIGHTS = {
  issuance: 0.45,
  failover: 0.15,
  health: 0.20,
  latency: 0.15,
  margin: 0.05,
} as const;

/** Conservative deterministic order for providers with no history at all. */
export const COLD_START_PROVIDER_ORDER = ["airalo", "esimaccess"] as const;

export interface ProviderPerformanceSnapshot {
  recentOrdersCount: number;
  fulfilmentSuccessRate: number;
  avgLatencyMs: number | null;
  failoverRate: number;
  updatedAt?: Date | string | null;
  /**
   * When present, fulfilmentSuccessRate is already Bayesian/recency shrunk by
   * the history service.  The policy must not apply a second prior.
   */
  confidenceScore?: number | null;
}

export interface ReliabilityPolicyCandidate {
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  retailPriceUsd: number;
  marginScore: number;
  healthStatus: string;
  eligibility: ProviderEligibility;
  performance: ProviderPerformanceSnapshot | null;
}

export interface ReliabilityPolicyScores {
  /** Confidence-adjusted observed success rate, 0–100. */
  issuanceScore: number;
  /** Confidence-adjusted primary/fallback reliability, 0–100. */
  failoverScore: number;
  healthScore: number;
  /** Score from measured avgLatencyMs; unknown latency is neutral. */
  latencyScore: number;
  marginScore: number;
  /** The score used for the policy ordering. */
  reliabilityScore: number;
  historyConfidence: number;
  safeFloorUsd: number;
  safeFloorPassed: boolean;
  policyVersion: string;
}

export interface ReliabilityPolicyEvaluation {
  eligible: boolean;
  reason?: string;
  scores: ReliabilityPolicyScores;
}

const HEALTH_SCORES: Record<string, number> = {
  healthy: 100,
  unknown: 0,
  degraded: 30,
  down: 0,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Confidence in history increases with actual issuance events.  This avoids
 * allowing one lucky/failing order to dominate a cold-start decision while
 * still adapting quickly to a provider with meaningful history.
 */
export function historyConfidence(performance: ProviderPerformanceSnapshot | null): number {
  if (!performance) return 0;
  if (
    performance.confidenceScore != null &&
    Number.isFinite(performance.confidenceScore)
  ) {
    return clamp(performance.confidenceScore / 100, 0, 1);
  }
  if (performance.recentOrdersCount <= 0) return 0;
  return clamp(performance.recentOrdersCount / 20, 0, 1);
}

export function scoreHealth(status: string): number {
  return HEALTH_SCORES[status] ?? 0;
}

export function scoreMeasuredLatency(avgLatencyMs: number | null | undefined): number {
  if (avgLatencyMs == null || !Number.isFinite(avgLatencyMs) || avgLatencyMs < 0) return 50;
  return Math.round(clamp(100 - (avgLatencyMs / MAX_MEASURED_LATENCY_MS) * 100));
}

/**
 * Keep the safety floor in the policy as well as at checkout.  Routing must
 * never choose an offer which checkout would later reject.
 */
export function safeFloorUsd(wholesalePriceUsd: number): number {
  return computeFloorUsd(wholesalePriceUsd);
}

export function hasSafeFloor(retailPriceUsd: number, wholesalePriceUsd: number): boolean {
  if (!Number.isFinite(retailPriceUsd) || retailPriceUsd <= 0) return false;
  return retailPriceUsd + 0.02 >= safeFloorUsd(wholesalePriceUsd);
}

export function evaluateReliabilityPolicy(
  candidate: ReliabilityPolicyCandidate,
): ReliabilityPolicyEvaluation {
  const performance = candidate.performance;
  const confidence = historyConfidence(performance);
  const observedSuccess = clamp(finiteOr(performance?.fulfilmentSuccessRate, DEFAULT_SUCCESS_RATE), 0, 1) * 100;
  const observedFailover = clamp(finiteOr(performance?.failoverRate, DEFAULT_FAILOVER_RATE), 0, 1);

  // Shrink sparse history toward the conservative prior.  The resulting
  // issuance score is the dominant signal in reliabilityScore.
  const alreadyShrunk = performance?.confidenceScore != null &&
    Number.isFinite(performance.confidenceScore);
  const issuanceScore = alreadyShrunk
    ? Math.round(observedSuccess)
    : Math.round(
      confidence * observedSuccess + (1 - confidence) * DEFAULT_SUCCESS_RATE * 100,
    );
  const failoverScore = Math.round(
    confidence * (1 - observedFailover) * 100 +
      (1 - confidence) * (1 - DEFAULT_FAILOVER_RATE) * 100,
  );
  const healthScore = scoreHealth(candidate.healthStatus);
  const latencyScore = scoreMeasuredLatency(performance?.avgLatencyMs);
  const marginScore = clamp(candidate.marginScore);
  const reliabilityScore = Math.round((
    RELIABILITY_POLICY_WEIGHTS.issuance * issuanceScore +
    RELIABILITY_POLICY_WEIGHTS.failover * failoverScore +
    RELIABILITY_POLICY_WEIGHTS.health * healthScore +
    RELIABILITY_POLICY_WEIGHTS.latency * latencyScore +
    RELIABILITY_POLICY_WEIGHTS.margin * marginScore
  ) * 10) / 10;
  const floor = safeFloorUsd(candidate.wholesalePriceUsd);
  const floorPassed = hasSafeFloor(candidate.retailPriceUsd, candidate.wholesalePriceUsd);

  let reason: string | undefined;
  if (!candidate.eligibility.eligible) {
    reason = candidate.eligibility.reason;
  } else if (candidate.healthStatus !== "healthy") {
    // Registry eligibility normally catches this as well.  Keep the policy
    // defensive so a stale/mismatched service result cannot be made eligible
    // by a legacy caller that constructs eligibility incorrectly.
    reason = `Provider health status is not healthy (${candidate.healthStatus})`;
  } else if (!floorPassed) {
    reason =
      `Retail price $${candidate.retailPriceUsd.toFixed(2)} is below the safe ` +
      `floor $${floor.toFixed(2)} for the concrete offer`;
  }

  return {
    eligible: candidate.eligibility.eligible && candidate.healthStatus === "healthy" && floorPassed,
    ...(reason ? { reason } : {}),
    scores: {
      issuanceScore,
      failoverScore,
      healthScore,
      latencyScore,
      marginScore,
      reliabilityScore,
      historyConfidence: Math.round(confidence * 100),
      safeFloorUsd: Math.round(floor * 100) / 100,
      safeFloorPassed: floorPassed,
      policyVersion: RELIABILITY_POLICY_VERSION,
    },
  };
}

export type ReliabilityStrategy =
  | "cheapest_cost"
  | "highest_margin"
  | "best_health"
  | "blended_score"
  | string;

export interface ComparableReliabilityScores {
  reliabilityScore: number;
  issuanceScore: number;
  failoverScore: number;
  healthScore: number;
  latencyScore: number;
  marginScore: number;
  costScore?: number;
  providerKey?: string;
  coldStart?: boolean;
}

/**
 * Order candidates by one common reliability comparator.  Legacy strategy
 * labels are accepted for API compatibility, but are only final tie-breakers
 * after all reliability dimensions have tied.
 */
export function orderByReliabilityPolicy<T>(
  candidates: T[],
  getScores: (candidate: T) => ComparableReliabilityScores,
  strategy: ReliabilityStrategy = "blended_score",
): T[] {
  return [...candidates].sort((left, right) => {
    const a = getScores(left);
    const b = getScores(right);
    const dimensions: Array<keyof ComparableReliabilityScores> = [
      "reliabilityScore",
      "issuanceScore",
      "failoverScore",
      "healthScore",
      "latencyScore",
    ];
    for (const dimension of dimensions) {
      const difference = Number(b[dimension] ?? 0) - Number(a[dimension] ?? 0);
      if (difference !== 0) return difference;
    }

    // With no evidence for either provider, use the documented conservative
    // Airalo → eSIM Access order before considering margin. This is only a
    // deterministic tie-break; it does not alter scores or confidence.
    if (a.coldStart && b.coldStart) {
      const aColdStartRank = COLD_START_PROVIDER_ORDER.indexOf(
        (a.providerKey ?? "").toLowerCase() as typeof COLD_START_PROVIDER_ORDER[number],
      );
      const bColdStartRank = COLD_START_PROVIDER_ORDER.indexOf(
        (b.providerKey ?? "").toLowerCase() as typeof COLD_START_PROVIDER_ORDER[number],
      );
      const aRank = aColdStartRank === -1 ? Number.MAX_SAFE_INTEGER : aColdStartRank;
      const bRank = bColdStartRank === -1 ? Number.MAX_SAFE_INTEGER : bColdStartRank;
      if (aRank !== bRank) return aRank - bRank;
    }

    // A strategy may explain a tie, never override a reliability difference.
    if (strategy === "cheapest_cost") {
      return (b.costScore ?? 0) - (a.costScore ?? 0);
    }
    if (strategy === "highest_margin") {
      return b.marginScore - a.marginScore;
    }
    if (strategy === "best_health") {
      return b.healthScore - a.healthScore;
    }
    return b.marginScore - a.marginScore;
  });
}
