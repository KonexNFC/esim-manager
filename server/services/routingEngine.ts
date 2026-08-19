// ─── Routing Engine ───────────────────────────────────────────────────────────
// selectBestProviderForPlan(normalizedPlanId, strategy?)
//
// Scoring (all 0–100):
//   cost_score          — lower wholesale price wins (inverted, normalized)
//   margin_score        — (retail−wholesale)/retail, clamped 0–100
//   health_score        — healthy=100, unknown=70, degraded=30, down=0
//   latency_score       — provider.priority proxy (priority 1→100, each step −20)
//   success_score       — rolling fulfilment success rate at this destination (default 75)
//   destination_score   — reliability factor: (1−failoverRate)×100, confidence-weighted (default 70)
//   blended_score       — 0.35·margin + 0.25·success + 0.15·destination + 0.15·health + 0.10·latency
//
// Strategies:
//   cheapest_cost  — sort by cost_score DESC
//   highest_margin — sort by margin_score DESC
//   best_health    — sort by health_score DESC (latency_score tiebreaker)
//   blended_score  — sort by blended_score DESC (default)
//
// Returns: { decisionId, selectedProviderKey, selectedProviderPlanCode,
//            fallbackChain, strategy, scores, decisionReason }
// Persists result to routing_decisions table.

import { eq } from "drizzle-orm";
import { db } from "../storage";
import { routingDecisions, settings } from "@shared/schema";
import {
  getNormalizedPlan,
  getOffersForNormalizedPlan,
  getProviderByKey,
} from "./providerRegistry";
import { calculateMargin } from "./marginEngine";
import { getDestinationStats } from "./destinationStats";
import type { ProviderEligibility } from "./providerHealth";

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

// ─── Health dampening multipliers ────────────────────────────────────────────
//
// Applied to blended_score AFTER it is computed, so poor-health providers are
// pushed down the ranking even when their margin is high.
//
// healthy  → 1.00 (no change)
// unknown  → 0.90 (−10% — slight caution for unverified status)
// degraded → 0.65 (−35% — significant deprioritisation)
// down     → 0.30 (−70% — last resort only)

const HEALTH_DAMPENING: Record<string, number> = {
  healthy: 1.00,
  unknown: 0.90,
  degraded: 0.65,
  down: 0.30,
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "cheapest_cost"
  | "highest_margin"
  | "best_health"
  | "blended_score";

// Routing modes govern the blended_score weights used when strategy="blended_score".
// The mode is set globally in admin settings (key: "routingMode"; default: "balanced").
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
  blended_score: number;
  eligibility: ProviderEligibility;
}

export interface RankedProvider {
  rank: number;
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  scores: ProviderScores;
  reason: string;
  isLastResort?: boolean;   // true when margin is below threshold — used only because no better option exists
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
  fallbackQuality: FallbackQuality;
  scores: Record<string, ProviderScores>;
  decisionReason: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
}

// ─── Health score map ─────────────────────────────────────────────────────────

const HEALTH_SCORES: Record<string, number> = {
  healthy: 100,
  unknown: 70,
  degraded: 30,
  down: 0,
};

function healthScore(status: string): number {
  return HEALTH_SCORES[status] ?? 70;
}

// ─── Latency score (priority proxy) ───────────────────────────────────────────
// Priority 1 → 100, Priority 2 → 80, Priority 3 → 60, Priority 4 → 40, …

function latencyScore(priority: number): number {
  return Math.max(0, 100 - (priority - 1) * 20);
}

// ─── Score all candidates for a plan ─────────────────────────────────────────

interface ScoredCandidate {
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  providerPriority: number;
  providerHealthStatus: string;
  eligibility: ProviderEligibility;
  dataOrdersCount: number;       // orders in destination_provider_stats for this provider+region
  belowMarginThreshold: boolean; // true when margin_score < minMarginPercent
  scores: ProviderScores;
}

// ─── Destination score helpers ────────────────────────────────────────────────
// When no historical data exists we default to neutral values rather than
// penalising a provider unfairly.
//
// success_score     default 75 — moderate confidence, gives new providers a fair chance
// destination_score default 70 — assumes provider is used as primary roughly 70% of the time

const DEFAULT_SUCCESS_SCORE = 75;
const DEFAULT_DESTINATION_SCORE = 70;

async function buildDestinationScores(
  providerKey: string,
  regionCode: string,
): Promise<{ success_score: number; destination_score: number; dataOrdersCount: number }> {
  const stats = await getDestinationStats(providerKey, regionCode);

  if (!stats || stats.recentOrdersCount === 0) {
    return { success_score: DEFAULT_SUCCESS_SCORE, destination_score: DEFAULT_DESTINATION_SCORE, dataOrdersCount: 0 };
  }

  // success_score: rolling fulfilment success rate scaled 0–100
  const success_score = Math.round(stats.fulfilmentSuccessRate * 100);

  // destination_score: how reliable this provider is as the PRIMARY choice here.
  // A failover_rate of 0 means it always succeeds as primary → score 100.
  // A failover_rate of 1 means it always ends up as a fallback → score 0.
  // Blend toward DEFAULT_DESTINATION_SCORE until we have 10+ orders of confidence.
  const confidence = Math.min(stats.recentOrdersCount / 10, 1.0);
  const rawDestScore = (1 - stats.failoverRate) * 100;
  const destination_score = Math.round(
    confidence * rawDestScore + (1 - confidence) * DEFAULT_DESTINATION_SCORE,
  );

  return { success_score, destination_score, dataOrdersCount: stats.recentOrdersCount };
}

async function scoreCandidates(
  normalizedPlanId: string,
  retailPriceUsd: number,
  regionCode: string,
  minMarginPercent: number,
  weights: BlendWeights,
): Promise<{
  candidates: ScoredCandidate[];
  eligibilityByProvider: Record<string, ProviderEligibility>;
}> {
  const enrichedOffers = await getOffersForNormalizedPlan(normalizedPlanId, { includeIneligible: true });
  const eligibilityByProvider: Record<string, ProviderEligibility> = {};
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
  if (eligibleOffers.length === 0) return { candidates: [], eligibilityByProvider };

  // Gather provider metadata for each offer
  const candidatesRaw: Array<{
    providerKey: string;
    providerPlanCode: string;
    wholesalePriceUsd: number;
    providerPriority: number;
    providerHealthStatus: string;
    eligibility: ProviderEligibility;
  }> = [];

  for (const offer of eligibleOffers) {
    const provider = await getProviderByKey(offer.providerKey);
    candidatesRaw.push({
      providerKey: offer.providerKey,
      providerPlanCode: offer.providerPlanCode,
      wholesalePriceUsd: offer.wholesalePriceUsd,
      providerPriority: offer.providerPriority,
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

  const candidates: ScoredCandidate[] = candidatesRaw.map((c, i) => {
    // cost_score: inverted normalised 0–100 (lower cost = higher score)
    const cost_score =
      priceRange === 0
        ? 100
        : Math.round(100 * (1 - (c.wholesalePriceUsd - minPrice) / priceRange));

    // margin_score: gross margin % clamped 0–100
    const rawMargin = calculateMargin(retailPriceUsd, c.wholesalePriceUsd);
    const margin_score = Math.max(0, Math.min(100, Math.round(rawMargin)));

    const health_score = healthScore(c.providerHealthStatus);
    const latency_s = latencyScore(c.providerPriority);
    const { success_score, destination_score, dataOrdersCount } = destScoresPerProvider[i];

    // blended: weights determined by the active routing mode (profit_first / balanced / reliability_first)
    const rawBlended =
      weights.margin      * margin_score +
      weights.success     * success_score +
      weights.destination * destination_score +
      weights.health      * health_score +
      weights.latency     * latency_s;

    // Health dampening: multiply blended by a factor so degraded/down providers
    // are pushed down the ranking even when their margin is excellent.
    // healthy=1.0 · unknown=0.90 · degraded=0.65 · down=0.30
    const dampen = HEALTH_DAMPENING[c.providerHealthStatus] ?? 0.90;
    const blended = rawBlended * dampen;

    return {
      ...c,
      dataOrdersCount,
      belowMarginThreshold: margin_score < minMarginPercent,
      scores: {
        cost_score,
        margin_score,
        health_score,
        latency_score: latency_s,
        success_score,
        destination_score,
        blended_score: Math.round(blended * 10) / 10,
        eligibility: c.eligibility,
      },
    };
  });
  return { candidates, eligibilityByProvider };
}

// ─── Strategy sorters ─────────────────────────────────────────────────────────

function applySortStrategy(
  candidates: ScoredCandidate[],
  strategy: RoutingStrategy,
): ScoredCandidate[] {
  const copy = [...candidates];

  switch (strategy) {
    case "cheapest_cost":
      // Lowest wholesale price first (highest cost_score first)
      return copy.sort((a, b) => b.scores.cost_score - a.scores.cost_score);

    case "highest_margin":
      // Highest margin first
      return copy.sort((a, b) => b.scores.margin_score - a.scores.margin_score);

    case "best_health":
      // Best health first; use latency_score as tiebreaker
      return copy.sort((a, b) => {
        const hDiff = b.scores.health_score - a.scores.health_score;
        if (hDiff !== 0) return hDiff;
        return b.scores.latency_score - a.scores.latency_score;
      });

    case "blended_score":
    default:
      // Best blended score first.
      // Tiebreaker: when two candidates' margin_score is within 5 points,
      // prefer the one with the higher success_score. This ensures that
      // comparable-margin providers are differentiated by actual reliability.
      return copy.sort((a, b) => {
        const marginDiff = Math.abs(a.scores.margin_score - b.scores.margin_score);
        if (marginDiff <= 5) {
          const successDiff = b.scores.success_score - a.scores.success_score;
          if (successDiff !== 0) return successDiff;
        }
        return b.scores.blended_score - a.scores.blended_score;
      });
  }
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
  const { scores, providerHealthStatus, dataOrdersCount } = winner;

  // 1. Health factor — direct provider health signal
  //    healthy=100, unknown=50, degraded=20, down=0
  const healthFactor = healthScore(providerHealthStatus);

  // 2. Data availability factor — confidence in destination stats
  //    0 orders → 30 (no history at all)
  //    1–4 orders → 40–60 (minimal history)
  //    5–19 orders → 65–85 (moderate)
  //    20+ orders → 95 (well-established)
  const dataFactor = dataOrdersCount === 0
    ? 30
    : Math.min(95, 30 + Math.round(dataOrdersCount * 3.25));

  // 3. Success factor — rolling success rate at this destination
  //    Uses the pre-computed success_score (0–100).
  //    When dataOrdersCount=0 the score is the default 75, but we already
  //    penalise that through the data factor so we keep it as-is here.
  const successFactor = scores.success_score;

  // 4. Margin factor — how comfortable is the margin?
  //    margin_score IS the gross margin %, clamped 0–100.
  //    Map to a confidence factor: >= 60% feels very safe, <= 10% feels risky.
  //    Linear scale: marginScore / 60, capped at 100.
  const marginFactor = Math.min(100, Math.round((scores.margin_score / 60) * 100));

  const raw =
    0.30 * healthFactor +
    0.25 * dataFactor +
    0.25 * successFactor +
    0.20 * marginFactor;

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

  // For strategy-specific selection, boost the lead factor to the front
  if (strategy === "cheapest_cost")  candidates.sort((a, b) => (b.score === scores.cost_score ? 1 : 0) - (a.score === scores.cost_score ? 1 : 0));
  else if (strategy === "highest_margin") candidates.sort((a, b) => (b.score === scores.margin_score ? 1 : -1));
  else if (strategy === "best_health")    candidates.sort((a, b) => (b.score === scores.health_score ? 1 : -1));
  else candidates.sort((a, b) => b.score - a.score); // blended — highest raw score first

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

  switch (strategy) {
    case "cheapest_cost": {
      const gapStr = runner
        ? ` (saving $${(runner.wholesalePriceUsd - wholesalePriceUsd).toFixed(2)} vs ${runner.providerKey})`
        : "";
      const strengths = topStrengths(scores, regionCode, strategy);
      return `Selected ${providerKey} due to lowest wholesale cost ($${wholesalePriceUsd.toFixed(2)})${gapStr}, ${strengths.join(", ")}`;
    }

    case "highest_margin": {
      const gapStr = runner
        ? ` (+${(scores.margin_score - runner.scores.margin_score).toFixed(1)} pts over ${runner.providerKey})`
        : "";
      const strengths = topStrengths(scores, regionCode, strategy).slice(1); // skip margin — already in headline
      return `Selected ${providerKey} due to highest margin (${scores.margin_score}%)${gapStr}, ${strengths.join(", ")}`;
    }

    case "best_health": {
      const gapStr = runner
        ? ` (+${(scores.health_score - runner.scores.health_score).toFixed(0)} pts over ${runner.providerKey})`
        : "";
      const strengths = topStrengths(scores, regionCode, strategy).slice(1);
      return `Selected ${providerKey} due to best health score (${scores.health_score}/100)${gapStr}, ${strengths.join(", ")}`;
    }

    case "blended_score":
    default: {
      const gapStr = runner
        ? ` (+${(scores.blended_score - runner.scores.blended_score).toFixed(1)} blended score over ${runner.providerKey})`
        : "";
      const strengths = topStrengths(scores, regionCode, strategy);
      return `Selected ${providerKey}${gapStr} due to ${strengths.join(", ")}`;
    }
  }
}

function buildCandidateReason(
  strategy: RoutingStrategy,
  candidate: ScoredCandidate,
  rank: number,
): string {
  const { scores } = candidate;
  if (rank === 1) {
    return (
      `primary selection — blended=${scores.blended_score} ` +
      `(margin=${scores.margin_score}, success=${scores.success_score}, ` +
      `dest=${scores.destination_score}, health=${scores.health_score}, latency=${scores.latency_score})`
    );
  }

  switch (strategy) {
    case "cheapest_cost":
      return `fallback rank ${rank} — cost_score=${scores.cost_score}, success=${scores.success_score}`;
    case "highest_margin":
      return `fallback rank ${rank} — margin_score=${scores.margin_score}, success=${scores.success_score}`;
    case "best_health":
      return `fallback rank ${rank} — health_score=${scores.health_score}, success=${scores.success_score}`;
    default:
      return (
        `fallback rank ${rank} — blended=${scores.blended_score} ` +
        `(margin=${scores.margin_score}, success=${scores.success_score}, ` +
        `dest=${scores.destination_score}, health=${scores.health_score})`
      );
  }
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
  const weights = ROUTING_MODE_WEIGHTS[routingMode];

  // 3. Score all enabled, active candidates (destination stats + health dampening applied)
  const { candidates, eligibilityByProvider } = await scoreCandidates(
    normalizedPlanId,
    plan.retailPriceUsd,
    plan.regionCode,
    minMarginPercent,
    weights,
  );
  if (candidates.length === 0) {
    const exclusions = Object.entries(eligibilityByProvider)
      .filter(([, eligibility]) => !eligibility.eligible)
      .map(([providerKey, eligibility]) => `${providerKey}: ${eligibility.reason}`)
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

  // 6. Build the fallback chain — all above-threshold candidates in ranked order,
  //    then extend with below-threshold last-resort options until ≥2 fallbacks exist.
  //    This guarantees the fulfillment engine always has strong backup choices while
  //    keeping the primary selection (winner) completely unchanged.
  const MINIMUM_FALLBACKS = 2;
  const fallbackChain: RankedProvider[] = ranked.map((c, i) => ({
    rank: i + 1,
    providerKey: c.providerKey,
    providerPlanCode: c.providerPlanCode,
    wholesalePriceUsd: c.wholesalePriceUsd,
    scores: c.scores,
    reason: buildCandidateReason(strategy, c, i + 1),
    isLastResort: false,
  }));

  // Extend with last-resort fallbacks (below-threshold) if needed
  if (fallbackChain.length - 1 < MINIMUM_FALLBACKS && belowThreshold.length > 0) {
    // Sort below-threshold by blended_score descending — best of the bad options first
    const sortedLastResort = [...belowThreshold].sort(
      (a, b) => b.scores.blended_score - a.scores.blended_score,
    );
    for (const c of sortedLastResort) {
      if (fallbackChain.length - 1 >= MINIMUM_FALLBACKS) break;
      const rank = fallbackChain.length + 1;
      fallbackChain.push({
        rank,
        providerKey: c.providerKey,
        providerPlanCode: c.providerPlanCode,
        wholesalePriceUsd: c.wholesalePriceUsd,
        scores: c.scores,
        reason:
          `last-resort fallback rank ${rank} — below margin threshold (${c.scores.margin_score}% < ${minMarginPercent}%) ` +
          `blended=${c.scores.blended_score} (success=${c.scores.success_score}, health=${c.scores.health_score})`,
        isLastResort: true,
      });
    }
    if (fallbackChain.length > 1) {
      console.warn(
        `[routingEngine] Plan "${plan.name}": added ${fallbackChain.length - ranked.length} last-resort ` +
        `fallback(s) from below-margin pool to reach ${fallbackChain.length - 1} total fallbacks.`,
      );
    }
  }

  // 7. Winner is rank-1 (unchanged from before — fallback chain extension never affects this)
  const winner = ranked[0];
  const excludedEntries = Object.entries(eligibilityByProvider)
    .filter(([, eligibility]) => !eligibility.eligible);
  const exclusionSummary = excludedEntries.length
    ? ` Excluded ${excludedEntries.map(([key, eligibility]) => `${key} (${eligibility.reason})`).join(", ")}.`
    : "";
  const decisionReason = buildReason(strategy, winner, ranked, plan.regionCode) + exclusionSummary;

  // 8. Build scores map (all candidates incl. below-threshold, for full audit trail)
  const scoresMap: Record<string, ProviderScores> = {};
  for (const c of candidates) {
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
      retailPriceUsdSnapshot: plan.retailPriceUsd,
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
    fallbackQuality,
    scores: scoresMap,
    decisionReason,
    confidenceScore: confScore,
    confidenceLabel: confLabel,
  };
}

// ─── History / analytics helpers ─────────────────────────────────────────────

/** Return the N most recent routing decisions (default 50). */
export async function getRecentRoutingDecisions(limit = 50) {
  return db
    .select()
    .from(routingDecisions)
    .orderBy(routingDecisions.createdAt)
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
