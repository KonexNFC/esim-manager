// ─── Routing Engine ───────────────────────────────────────────────────────────
// selectBestProviderForPlan(normalizedPlanId, strategy?)
//
// Scoring (all 0–100):
//   cost_score          — lower wholesale price wins (inverted, normalized)
//   margin_score        — (retail−wholesale)/retail, clamped 0–100
//   health_score        — current health (healthy=100, degraded=30, unknown/down=0)
//   latency_score       — measured average issuance latency (never provider priority)
//   success_score       — confidence-adjusted actual issuance success rate
//   destination_score   — confidence-adjusted destination/failover reliability
//   blended_score       — reliability-first policy score (actual issuance dominates)
//
// Strategies:
//   legacy labels are accepted for compatibility, but all use the same
//   reliability ordering and only differ as final tie-breakers.
//
// Returns: { decisionId, selectedProviderKey, selectedProviderPlanCode,
//            fallbackChain (one concrete SKU), rankedCandidates (audit only),
//            strategy, scores, decisionReason }
// Persists result to routing_decisions table.

import { eq, desc } from "drizzle-orm";
import { db } from "../storage";
import { routingDecisions, settings } from "@shared/schema";
import {
  getNormalizedPlan,
  getOffersForNormalizedPlan,
  getProviderByKey,
} from "./providerRegistry";
import { calculateMargin } from "./marginEngine";
import { getDestinationStats, getProviderPerformance } from "./destinationStats";
import type { DestinationProviderStats, ProviderPerformance } from "./destinationStats";
import type { ProviderEligibility } from "./providerHealth";
import {
  evaluateReliabilityPolicy,
  orderByReliabilityPolicy,
  RELIABILITY_POLICY_VERSION,
  type ProviderPerformanceSnapshot,
} from "./routingPolicy";

// ─── Margin protection config ─────────────────────────────────────────────────
//
// MIN_MARGIN_PERCENT is the minimum acceptable gross margin (%) a provider
// offer must have before the routing engine will select it as a winner.
// Candidates below this threshold are demoted to a "last-resort" fallback pool.
//
// Stored as settings key "routingMinMarginPercent". Falls back to this default
// when the key is absent so the system works before any admin configuration.

const DEFAULT_MIN_MARGIN_PERCENT = 15;

async function getMinMarginPercent(): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "routingMinMarginPercent"));
    if (row?.value) {
      const parsed = parseFloat(row.value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
  } catch {
    // Non-critical — fall back to default
  }
  return DEFAULT_MIN_MARGIN_PERCENT;
}

async function getRoutingMode(): Promise<RoutingMode> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "routingMode"));
    if (row?.value && row.value in ROUTING_MODE_WEIGHTS) {
      return row.value as RoutingMode;
    }
  } catch {
    // Non-critical — fall back to default
  }
  return DEFAULT_ROUTING_MODE;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "cheapest_cost"
  | "highest_margin"
  | "best_health"
  | "blended_score";

// Routing modes are retained as an API/audit field. They cannot bypass the
// reliability policy; every mode uses the same hard gates and ordering.
//
//   profit_first     — boosts margin weight; best for maximising revenue per sale
//   balanced         — equal-ish weights; the default, good general-purpose choice
//   reliability_first — boosts health + success rate; best for minimising fulfilment failures

export type RoutingMode = "profit_first" | "balanced" | "reliability_first";

export interface BlendWeights {
  margin: number;
  success: number;
  destination: number;
  health: number;
  latency: number;
}

// Weights must sum to 1.0 for each mode.
export const ROUTING_MODE_WEIGHTS: Record<RoutingMode, BlendWeights> = {
  profit_first: {
    margin: 0.50, success: 0.20, destination: 0.10, health: 0.10, latency: 0.10,
  },
  balanced: {
    margin: 0.35, success: 0.25, destination: 0.15, health: 0.15, latency: 0.10,
  },
  reliability_first: {
    margin: 0.20, success: 0.35, destination: 0.20, health: 0.20, latency: 0.05,
  },
};

const DEFAULT_ROUTING_MODE: RoutingMode = "balanced";

export interface ProviderScores {
  cost_score: number;
  margin_score: number;
  health_score: number;
  latency_score: number;
  success_score: number;       // rolling fulfilment success rate at this destination
  destination_score: number;   // reliability: (1 − failoverRate), confidence-weighted
  issuance_score: number;      // actual issuance success (dominant policy signal)
  failover_score: number;      // primary/fallback reliability
  history_confidence: number;  // 0–100, based on actual issuance history
  safe_floor_usd: number;
  safe_floor_passed: boolean;
  policy_version: string;
  blended_score: number;
  eligibility: ProviderEligibility;
}

export interface RankedProvider {
  equivalenceId?: string;
  offerId?: string;
  rank: number;
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  scores: ProviderScores;
  reason: string;
  isLastResort?: boolean;   // true when margin is below threshold — used only because no better option exists
  approvedForFulfillment?: boolean;
}

// ─── Fallback quality ─────────────────────────────────────────────────────────
// Measures how robust the fallback chain is: how many options exist and how
// healthy they are. Stored with the routing decision for observability.
//
// coverageScore formula:
//   providerCoverage (0–60): min(fallbackCount, 2) / 2 × 60
//   healthCoverage   (0–40): avgFallbackHealthScore / 100 × 40
//   Total: 0–100 (100 = 2+ healthy fallbacks)

export interface FallbackQuality {
  fallbackCount: number;          // how many fallbacks are in the chain (excludes winner)
  totalCandidates: number;        // all providers scored for this plan
  lastResortCount: number;        // fallbacks that are below-margin last-resort
  avgFallbackHealthScore: number; // avg health_score of rank-2+ providers (0 when no fallbacks)
  coverageScore: number;          // 0–100 composite
}

export type ConfidenceLabel = "high" | "medium" | "low";

export interface RoutingResult {
  decisionId: string;
  normalizedPlanId: string;
  strategy: RoutingStrategy;
  selectedProviderKey: string;
  selectedProviderPlanCode: string;
  fallbackChain: RankedProvider[];
  /** Ranked audit candidates; only explicitly approved entries may fail over. */
  rankedCandidates: RankedProvider[];
  fallbackQuality: FallbackQuality;
  scores: Record<string, ProviderScores>;
  decisionReason: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
}

// ─── Health score map ─────────────────────────────────────────────────────────

// ─── Score all candidates for a plan ─────────────────────────────────────────

interface ScoredCandidate {
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  providerHealthStatus: string;
  eligibility: ProviderEligibility;
  dataOrdersCount: number;       // local destination observations for this provider+region
  hasGlobalHistory: boolean;     // provider has terminal observations elsewhere
  performance: ProviderPerformanceSnapshot | null;
  belowMarginThreshold: boolean; // true when margin_score < minMarginPercent
  scores: ProviderScores;
}

export interface DestinationScoreProjection {
  performance: ProviderPerformanceSnapshot | null;
  dataOrdersCount: number;
  hasGlobalHistory: boolean;
}

/**
 * Project derived history into the policy's legacy-compatible snapshot.
 *
 * A zero local sample is not equivalent to no provider history: the history
 * service still supplies an effective rate shrunk toward the global prior.
 * Keep that value and expose global-history presence separately so cold-start
 * tie-breaking remains reserved for genuinely unseen providers.
 */
export function projectDestinationScores(
  stats: ProviderPerformance | null,
  legacy: DestinationProviderStats | null = null,
): DestinationScoreProjection {
  if (stats && (stats.observations.length > 0 || stats.globalSampleSize > 0)) {
    return {
      performance: {
        recentOrdersCount: Math.max(0, Math.round(stats.sampleSize)),
        // getProviderPerformance already applies Bayesian/recency shrinkage.
        fulfilmentSuccessRate: stats.effectiveSuccessRate,
        avgLatencyMs: stats.avgLatencyMs,
        // Use fallback outcome quality, not fallback frequency. A successful
        // fallback is still an issuance success and must not be penalised.
        failoverRate: stats.fallbackSuccessRate == null
          ? 0.30
          : 1 - stats.fallbackSuccessRate,
        updatedAt: null,
        confidenceScore: stats.confidenceScore,
      },
      dataOrdersCount: Math.max(0, Math.round(stats.sampleSize)),
      hasGlobalHistory: stats.globalSampleSize > 0,
    };
  }

  // During rollout, older installations may only have the compatibility
  // destination_provider_stats row. If the derived history source is empty,
  // retain that legacy evidence rather than treating it as no history.
  if (!legacy) return { performance: null, dataOrdersCount: 0, hasGlobalHistory: false };
  return {
    performance: {
      recentOrdersCount: legacy.recentOrdersCount,
      fulfilmentSuccessRate: legacy.fulfilmentSuccessRate,
      avgLatencyMs: legacy.avgLatencyMs,
      // Legacy failoverRate is already the fallback failure rate in the
      // compatibility adapter; preserve its reliability meaning.
      failoverRate: legacy.failoverRate,
      updatedAt: legacy.updatedAt,
    },
    dataOrdersCount: legacy.recentOrdersCount,
    hasGlobalHistory: legacy.recentOrdersCount > 0,
  };
}

async function buildDestinationScores(
  providerKey: string,
  regionCode: string,
): Promise<DestinationScoreProjection> {
  const stats = await getProviderPerformance(providerKey, regionCode);
  // A provider may have no observations at this destination while still
  // having meaningful terminal history elsewhere. Keep the derived result in
  // that case: effectiveSuccessRate is already shrunk toward the provider's
  // global prior. Falling through to the legacy row would erase that prior
  // and make the policy look at a zero local sample as a cold start.
  if (stats && (stats.observations.length > 0 || stats.globalSampleSize > 0)) {
    return projectDestinationScores(stats);
  }
  const legacy = await getDestinationStats(providerKey, regionCode);
  return projectDestinationScores(stats, legacy);
}

async function scoreCandidates(
  normalizedPlanId: string,
  retailPriceUsd: number,
  regionCode: string,
  minMarginPercent: number,
): Promise<{
  candidates: ScoredCandidate[];
  auditableCandidates: ScoredCandidate[];
  eligibilityByProvider: Record<string, ProviderEligibility>;
  exclusionReasons: Record<string, string>;
}> {
  const enrichedOffers = await getOffersForNormalizedPlan(normalizedPlanId, { includeIneligible: true });
  const eligibilityByProvider: Record<string, ProviderEligibility> = {};
  const exclusionReasons: Record<string, string> = {};
  for (const offer of enrichedOffers) {
    const previous = eligibilityByProvider[offer.providerKey];
    if (!previous || (!previous.eligible && offer.eligibility.eligible)) {
      eligibilityByProvider[offer.providerKey] = offer.eligibility;
    }
  }
  const eligibleOfferMap = new Map<string, typeof enrichedOffers[number]>();
  for (const offer of enrichedOffers.filter(offer => offer.eligibility.eligible)) {
    const previous = eligibleOfferMap.get(offer.providerKey);
    if (!previous || offer.wholesalePriceUsd < previous.wholesalePriceUsd) {
      eligibleOfferMap.set(offer.providerKey, offer);
    }
  }
  const eligibleOffers = [...eligibleOfferMap.values()];
  if (eligibleOffers.length === 0) {
    return { candidates: [], auditableCandidates: [], eligibilityByProvider, exclusionReasons };
  }

  // Gather provider metadata for each offer
  const candidatesRaw: Array<{
    providerKey: string;
    providerPlanCode: string;
    wholesalePriceUsd: number;
    providerHealthStatus: string;
    eligibility: ProviderEligibility;
  }> = [];

  for (const offer of eligibleOffers) {
    const provider = await getProviderByKey(offer.providerKey);
    candidatesRaw.push({
      providerKey: offer.providerKey,
      providerPlanCode: offer.providerPlanCode,
      wholesalePriceUsd: offer.wholesalePriceUsd,
      providerHealthStatus: provider?.healthStatus ?? "unknown",
      eligibility: offer.eligibility,
    });
  }

  // Cost normalisation bounds (kept for cheapest_cost strategy and reporting)
  const prices = candidatesRaw.map(c => c.wholesalePriceUsd);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // Score each candidate (destination stats fetched in parallel for speed)
  const destScoresPerProvider = await Promise.all(
    candidatesRaw.map(c => buildDestinationScores(c.providerKey, regionCode)),
  );

  const scoredCandidates: ScoredCandidate[] = candidatesRaw.map((c, i) => {
    // cost_score: inverted normalised 0–100 (lower cost = higher score)
    const cost_score =
      priceRange === 0
        ? 100
        : Math.round(100 * (1 - (c.wholesalePriceUsd - minPrice) / priceRange));

    // margin_score: gross margin % clamped 0–100
    const rawMargin = calculateMargin(retailPriceUsd, c.wholesalePriceUsd);
    const margin_score = Math.max(0, Math.min(100, Math.round(rawMargin)));

    const { performance, dataOrdersCount, hasGlobalHistory } = destScoresPerProvider[i];
    const policy = evaluateReliabilityPolicy({
      providerKey: c.providerKey,
      providerPlanCode: c.providerPlanCode,
      wholesalePriceUsd: c.wholesalePriceUsd,
      retailPriceUsd,
      marginScore: margin_score,
      healthStatus: c.providerHealthStatus,
      eligibility: c.eligibility,
      performance,
    });
    const policyScores = policy.scores;
    if (!policy.eligible) {
      exclusionReasons[c.providerKey] = policy.reason ?? "Excluded by reliability policy";
    }

    return {
      ...c,
      dataOrdersCount,
      hasGlobalHistory,
      performance,
      belowMarginThreshold: margin_score < minMarginPercent,
      scores: {
        cost_score,
        margin_score,
        health_score: policyScores.healthScore,
        latency_score: policyScores.latencyScore,
        success_score: policyScores.issuanceScore,
        destination_score: policyScores.failoverScore,
        issuance_score: policyScores.issuanceScore,
        failover_score: policyScores.failoverScore,
        history_confidence: policyScores.historyConfidence,
        safe_floor_usd: policyScores.safeFloorUsd,
        safe_floor_passed: policyScores.safeFloorPassed,
        policy_version: policyScores.policyVersion,
        blended_score: policyScores.reliabilityScore,
        eligibility: c.eligibility,
      },
    };
  });
  const candidates = scoredCandidates.filter(candidate => {
    const allowed = candidate.scores.safe_floor_passed && candidate.eligibility.eligible;
    if (!allowed && !exclusionReasons[candidate.providerKey]) {
      exclusionReasons[candidate.providerKey] = "Excluded by reliability policy";
    }
    return allowed;
  });
  return { candidates, auditableCandidates: scoredCandidates, eligibilityByProvider, exclusionReasons };
}

// ─── Strategy sorters ─────────────────────────────────────────────────────────

function applySortStrategy(
  candidates: ScoredCandidate[],
  strategy: RoutingStrategy,
): ScoredCandidate[] {
  // Every legacy strategy is now only a deterministic final tie-breaker.
  // It cannot select a cheaper/more profitable but less reliable provider.
  return orderByReliabilityPolicy(
    candidates,
    candidate => ({
      reliabilityScore: candidate.scores.blended_score,
      issuanceScore: candidate.scores.issuance_score,
      failoverScore: candidate.scores.failover_score,
      healthScore: candidate.scores.health_score,
      latencyScore: candidate.scores.latency_score,
      marginScore: candidate.scores.margin_score,
      costScore: candidate.scores.cost_score,
      providerKey: candidate.providerKey,
      coldStart: candidate.performance == null ||
        (!candidate.hasGlobalHistory && candidate.dataOrdersCount === 0),
    }),
    strategy,
  );
}

// ─── Confidence scoring ───────────────────────────────────────────────────────
//
// Confidence reflects how much we trust this routing decision.
// It is independent of which provider wins — it measures the QUALITY of the
// information the engine had when it made its choice.
//
// Four equally-weighted factors (see weights below):
//
//   health_factor      (30%) — Is the provider currently reported healthy?
//   data_factor        (25%) — How many orders of destination history do we have?
//   success_factor     (25%) — What is the provider's success rate at this destination?
//   margin_factor      (20%) — Is the margin strong enough to absorb surprises?
//
// Labels:  80+ → "high"   |   50–79 → "medium"   |   <50 → "low"

function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function calculateConfidence(winner: ScoredCandidate): { score: number; label: ConfidenceLabel } {
  const { scores } = winner;
  // Actual issuance and history quality dominate confidence.  A high margin
  // cannot make a cold-start or poorly issuing provider look "high" confidence.
  const marginFactor = Math.min(100, Math.round((scores.margin_score / 60) * 100));
  const raw =
    0.45 * scores.issuance_score +
    0.25 * scores.history_confidence +
    0.20 * scores.health_score +
    0.10 * marginFactor;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, label: confidenceLabel(score) };
}

// ─── Narrative reason builder ────────────────────────────────────────────────
//
// Produces a human-readable sentence explaining why this provider was selected,
// e.g. "Selected esimgo due to highest margin (75%), strong DE performance, and healthy status"
//
// The technical score numbers are still preserved in the DB via `scores` JSONB;
// this narrative is stored as `decisionReason` for operator transparency.

function healthLabel(healthScore: number): string {
  if (healthScore >= 90) return "healthy status";
  if (healthScore >= 60) return "degraded health";
  return "poor health";
}

/** Pick the top-3 human strengths for the winner, sorted by score value descending. */
function topStrengths(
  scores: ProviderScores,
  regionCode: string | null | undefined,
  strategy: RoutingStrategy,
): string[] {
  const candidates: Array<{ score: number; text: string }> = [
    { score: scores.margin_score,      text: `strong margin (${scores.margin_score}%)` },
    { score: scores.success_score,     text: `${scores.success_score}% fulfilment success rate` },
    { score: scores.health_score,      text: healthLabel(scores.health_score) },
    { score: scores.destination_score, text: regionCode
        ? `strong ${regionCode} performance (${scores.destination_score}/100)`
        : `strong destination performance (${scores.destination_score}/100)` },
  ];

  // Keep the explanation deterministic and aligned with policy ordering.
  candidates.sort((a, b) => b.score - a.score);

  const top = candidates.slice(0, 3).map(c => c.text);
  if (top.length < 2) return top;
  const last = top.pop()!;
  return [...top, `and ${last}`];
}

function buildReason(
  strategy: RoutingStrategy,
  winner: ScoredCandidate,
  allCandidates: ScoredCandidate[],
  regionCode?: string | null,
): string {
  const { scores, providerKey, wholesalePriceUsd } = winner;
  const runner = allCandidates[1];
  const gapStr = runner
    ? ` (+${(scores.blended_score - runner.scores.blended_score).toFixed(1)} ` +
      `reliability score over ${runner.providerKey})`
    : "";
  const strengths = topStrengths(scores, regionCode, strategy);
  return (
    `Selected ${providerKey}/${winner.providerPlanCode} using ${RELIABILITY_POLICY_VERSION} ` +
    `(requested strategy=${strategy})${gapStr}; ` +
    `actual issuance=${scores.issuance_score}/100, history confidence=${scores.history_confidence}/100, ` +
    `failover=${scores.failover_score}/100, health=${scores.health_score}/100, ` +
    `measured latency=${scores.latency_score}/100, margin=${scores.margin_score}% ` +
    `on concrete wholesale $${wholesalePriceUsd.toFixed(2)}, ` +
    `${strengths.join(", ")}.`
  );
}

function buildCandidateReason(
  strategy: RoutingStrategy,
  candidate: ScoredCandidate,
  rank: number,
): string {
  const { scores } = candidate;
  if (rank === 1) {
    return (
      `primary selection — policy=${scores.blended_score} ` +
      `(issuance=${scores.issuance_score}, history=${scores.history_confidence}, ` +
      `failover=${scores.failover_score}, health=${scores.health_score}, ` +
      `latency=${scores.latency_score}, margin=${scores.margin_score}, ` +
      `floor=${scores.safe_floor_passed ? "pass" : "fail"})`
    );
  }
  return (
    `fallback rank ${rank} — policy=${scores.blended_score} ` +
    `(issuance=${scores.issuance_score}, history=${scores.history_confidence}, ` +
    `failover=${scores.failover_score}, health=${scores.health_score}, ` +
    `latency=${scores.latency_score}, margin=${scores.margin_score})`
  );
}

// ─── Fallback quality computation ────────────────────────────────────────────

function buildFallbackQuality(
  fallbackChain: RankedProvider[],
  totalCandidates: number,
): FallbackQuality {
  const fallbacks = fallbackChain.slice(1); // everything after the winner
  const fallbackCount = fallbacks.length;
  const lastResortCount = fallbacks.filter(f => f.isLastResort).length;

  const avgFallbackHealthScore =
    fallbackCount === 0
      ? 0
      : Math.round(
          fallbacks.reduce((sum, f) => sum + f.scores.health_score, 0) / fallbackCount,
        );

  // coverageScore: 0–60 from count coverage + 0–40 from health quality
  const providerCoverage = Math.round((Math.min(fallbackCount, 2) / 2) * 60);
  const healthCoverage = Math.round((avgFallbackHealthScore / 100) * 40);
  const coverageScore = providerCoverage + healthCoverage;

  return { fallbackCount, totalCandidates, lastResortCount, avgFallbackHealthScore, coverageScore };
}

// ─── Main engine function ─────────────────────────────────────────────────────

export async function selectBestProviderForPlan(
  normalizedPlanId: string,
  strategy: RoutingStrategy = "blended_score",
): Promise<RoutingResult> {
  // 1. Load the normalized plan (need retail price + regionCode for scoring)
  const plan = await getNormalizedPlan(normalizedPlanId);
  if (!plan) {
    throw new Error(`[routingEngine] Normalized plan not found: ${normalizedPlanId}`);
  }

  // 2. Load routing config from settings (both run in parallel — no dependency between them)
  const [minMarginPercent, routingMode] = await Promise.all([
    getMinMarginPercent(),
    getRoutingMode(),
  ]);

  // 2b. Guard: if the normalized plan has no retail price set, compute a fallback so
  //     margin scoring produces meaningful values instead of collapsing to 0%.
  //     retailPriceUsd=0 causes calculateMargin() to return 0, which drives
  //     margin_score=0, marginFactor=0, and confidence down to ~47 (low).
  //     Root cause: providerSync sets retailPriceUsd=0 on insert for new plans.
  //     This guard provides a safety net for plans that slipped through before the fix.
  let retailPriceUsd = plan.retailPriceUsd;
  if (retailPriceUsd <= 0) {
    const offers = await getOffersForNormalizedPlan(normalizedPlanId);
    if (offers.length > 0) {
      const cheapestWholesale = Math.min(...offers.map(o => o.wholesalePriceUsd));
      const DEFAULT_MARGIN = 0.35; // 35% gross margin target
      retailPriceUsd = Math.round((cheapestWholesale / (1 - DEFAULT_MARGIN)) * 100) / 100;
      console.warn(
        `[routingEngine] Plan "${plan.name}" (${normalizedPlanId}) has retailPriceUsd=0 — ` +
        `using computed fallback $${retailPriceUsd} (${DEFAULT_MARGIN * 100}% margin target). ` +
        `Run a provider sync or set a retail price to fix this permanently.`,
      );
    }
  }

  // 3. Score all enabled, fresh, active candidates.  The policy hard-excludes
  // stale/ineligible providers and any concrete offer below the safe floor.
  const { candidates, auditableCandidates, eligibilityByProvider, exclusionReasons } = await scoreCandidates(
    normalizedPlanId,
    retailPriceUsd,
    plan.regionCode,
    minMarginPercent,
  );
  if (candidates.length === 0) {
    const exclusions = Object.entries(eligibilityByProvider)
      .filter(([, eligibility]) => !eligibility.eligible)
      .map(([providerKey, eligibility]) => `${providerKey}: ${eligibility.reason}`)
      .concat(Object.entries(exclusionReasons).map(([providerKey, reason]) => `${providerKey}: ${reason}`))
      .join("; ");
    throw new Error(
      `[routingEngine] No eligible active offers found for plan "${plan.name}" (${normalizedPlanId})` +
      (exclusions ? ` — ${exclusions}` : ""),
    );
  }

  // 4. Margin gate — split into candidates that meet the threshold and those that don't.
  //    Prefer above-threshold candidates. Only use below-threshold as a last resort
  //    (no alternative), logging a warning so the operator knows.
  const aboveThreshold = candidates.filter(c => !c.belowMarginThreshold);
  const belowThreshold = candidates.filter(c => c.belowMarginThreshold);

  let candidatesForRanking: ScoredCandidate[];
  if (aboveThreshold.length > 0) {
    candidatesForRanking = aboveThreshold;
    if (belowThreshold.length > 0) {
      console.warn(
        `[routingEngine] Margin gate: excluded ${belowThreshold.length} below-threshold offer(s) ` +
        `(min=${minMarginPercent}%) for plan "${plan.name}": ` +
        belowThreshold.map(c => `${c.providerKey}(${c.scores.margin_score}%)`).join(", "),
      );
    }
  } else {
    // All candidates are below threshold — fall back to full pool to avoid blocking sales
    candidatesForRanking = candidates;
    console.warn(
      `[routingEngine] Margin gate: ALL offers for plan "${plan.name}" are below threshold ` +
      `(min=${minMarginPercent}%). Selecting best available to avoid blocking sale.`,
    );
  }

  // 5. Sort by chosen strategy
  const ranked = applySortStrategy(candidatesForRanking, strategy);

  // 6. Build a ranked audit list while pinning the actual fulfillment chain to
  // one concrete supplier SKU. Normalized-plan membership alone is not proof
  // that a different supplier SKU is an approved fallback.
  const rankedCandidates: RankedProvider[] = ranked.map((c, i) => ({
    rank: i + 1,
    providerKey: c.providerKey,
    providerPlanCode: c.providerPlanCode,
    wholesalePriceUsd: c.wholesalePriceUsd,
    scores: c.scores,
    reason: buildCandidateReason(strategy, c, i + 1),
    isLastResort: c.belowMarginThreshold,
    approvedForFulfillment: i === 0,
  }));
  const { findApprovedEquivalents } = await import("./supplierEquivalence");
  const liveOffers = await getOffersForNormalizedPlan(normalizedPlanId);
  const selectedOffer = liveOffers.find(o =>
    o.providerKey === rankedCandidates[0].providerKey &&
    o.providerPlanCode === rankedCandidates[0].providerPlanCode,
  );
  if (!selectedOffer) throw new Error("Selected routing offer is no longer eligible");
  const approved = await findApprovedEquivalents(selectedOffer, liveOffers);
  const fallbackChain = rankedCandidates.filter((candidate, index) => {
    const member = approved.offers.find(o =>
      o.providerKey === candidate.providerKey && o.providerPlanCode === candidate.providerPlanCode,
    );
    candidate.approvedForFulfillment = index === 0 || Boolean(member && approved.equivalenceId);
    if (candidate.approvedForFulfillment && approved.equivalenceId && member) {
      candidate.equivalenceId = approved.equivalenceId;
      candidate.offerId = member.id;
    }
    return candidate.approvedForFulfillment;
  });

  // 7. Winner is rank-1 (unchanged from before — fallback chain extension never affects this)
  const winner = ranked[0];
  const excludedEntries = Object.entries(eligibilityByProvider)
    .filter(([, eligibility]) => !eligibility.eligible);
  const exclusionSummary = excludedEntries.length
    ? ` Excluded ${excludedEntries.map(([key, eligibility]) => `${key} (${eligibility.reason})`).join(", ")}.`
    : "";
  const policyExclusions = Object.entries(exclusionReasons)
    .map(([key, reason]) => `${key} (${reason})`)
    .join(", ");
  const rankedAudit = rankedCandidates
    .map(candidate =>
      `${candidate.rank}:${candidate.providerKey}/${candidate.providerPlanCode}` +
      ` policy=${candidate.scores.blended_score}`,
    )
    .join(", ");
  const decisionReason = buildReason(strategy, winner, ranked, plan.regionCode) +
    (exclusionSummary ? exclusionSummary : "") +
    (policyExclusions ? ` Policy exclusions: ${policyExclusions}.` : "") +
    ` Ranked audit (only explicit equivalents approved): ${rankedAudit}.`;

  // 8. Build scores map (all candidates incl. below-threshold, for full audit trail)
  const scoresMap: Record<string, ProviderScores> = {};
  for (const c of auditableCandidates) {
    scoresMap[c.providerKey] = c.scores;
  }
  for (const [providerKey, eligibility] of excludedEntries) {
    scoresMap[providerKey] = {
      cost_score: 0,
      margin_score: 0,
      health_score: 0,
      latency_score: 0,
      success_score: 0,
      destination_score: 0,
      issuance_score: 0,
      failover_score: 0,
      history_confidence: 0,
      safe_floor_usd: 0,
      safe_floor_passed: false,
      policy_version: RELIABILITY_POLICY_VERSION,
      blended_score: 0,
      eligibility,
    };
  }

  // 9. Compute confidence for this decision
  const { score: confScore, label: confLabel } = calculateConfidence(winner);

  // 10. Compute fallback quality (how robust the backup chain is)
  const fallbackQuality = buildFallbackQuality(fallbackChain, candidates.length);

  // 11. Persist to routing_decisions
  const [saved] = await db
    .insert(routingDecisions)
    .values({
      normalizedPlanId,
      strategy,
      selectedProviderKey: winner.providerKey,
      selectedProviderPlanCode: winner.providerPlanCode,
      fallbackChain: fallbackChain as unknown as Record<string, unknown>[],
      scores: scoresMap as unknown as Record<string, unknown>,
      decisionReason,
      retailPriceUsdSnapshot: retailPriceUsd,
      confidenceScore: confScore,
      confidenceLabel: confLabel,
    })
    .returning();

  console.log(
    `[routingEngine] Plan "${plan.name}" → ${winner.providerKey}/${winner.providerPlanCode}` +
      ` via ${strategy} [mode=${routingMode}] | confidence=${confScore} (${confLabel})` +
      ` | fallbacks=${fallbackQuality.fallbackCount} (coverage=${fallbackQuality.coverageScore}, avgHealth=${fallbackQuality.avgFallbackHealthScore})` +
      (fallbackQuality.lastResortCount > 0 ? ` [${fallbackQuality.lastResortCount} last-resort]` : "") +
      ` | ${decisionReason}`,
  );

  return {
    decisionId: saved.id,
    normalizedPlanId,
    strategy,
    selectedProviderKey: winner.providerKey,
    selectedProviderPlanCode: winner.providerPlanCode,
    fallbackChain,
    rankedCandidates,
    fallbackQuality,
    scores: scoresMap,
    decisionReason,
    confidenceScore: confScore,
    confidenceLabel: confLabel,
  };
}

// ─── History / analytics helpers ─────────────────────────────────────────────

/** Return the N most recent routing decisions (default 50), newest first. */
export async function getRecentRoutingDecisions(limit = 50) {
  return db
    .select()
    .from(routingDecisions)
    .orderBy(desc(routingDecisions.createdAt))
    .limit(limit);
}

/** Return all routing decisions for a specific normalized plan. */
export async function getRoutingDecisionsForPlan(normalizedPlanId: string) {
  return db
    .select()
    .from(routingDecisions)
    .where(eq(routingDecisions.normalizedPlanId, normalizedPlanId))
    .orderBy(routingDecisions.createdAt);
}
