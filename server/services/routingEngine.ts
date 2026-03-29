// ─── Routing Engine ───────────────────────────────────────────────────────────
// selectBestProviderForPlan(normalizedPlanId, strategy?)
//
// Scoring (all 0–100):
//   cost_score    — lower wholesale price wins (inverted, normalized)
//   margin_score  — higher (retail−wholesale)/retail wins
//   health_score  — healthy=100, unknown=70, degraded=30, down=0
//   latency_score — provider.priority proxy (priority 1 → 100, each step −20)
//   blended_score — 0.35·cost + 0.25·margin + 0.25·health + 0.15·latency
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
import { routingDecisions } from "@shared/schema";
import {
  getNormalizedPlan,
  getOffersForNormalizedPlan,
  getProviderByKey,
} from "./providerRegistry";

// ─── Public types ─────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "cheapest_cost"
  | "highest_margin"
  | "best_health"
  | "blended_score";

export interface ProviderScores {
  cost_score: number;
  margin_score: number;
  health_score: number;
  latency_score: number;
  blended_score: number;
}

export interface RankedProvider {
  rank: number;
  providerKey: string;
  providerPlanCode: string;
  wholesalePriceUsd: number;
  scores: ProviderScores;
  reason: string;
}

export interface RoutingResult {
  decisionId: string;
  normalizedPlanId: string;
  strategy: RoutingStrategy;
  selectedProviderKey: string;
  selectedProviderPlanCode: string;
  fallbackChain: RankedProvider[];
  scores: Record<string, ProviderScores>;
  decisionReason: string;
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
  scores: ProviderScores;
}

async function scoreCandidates(
  normalizedPlanId: string,
  retailPriceUsd: number,
): Promise<ScoredCandidate[]> {
  // Fetch all active offers enriched with provider metadata
  const enrichedOffers = await getOffersForNormalizedPlan(normalizedPlanId);

  if (enrichedOffers.length === 0) return [];

  // Gather provider health status for each offer
  const candidatesRaw: Array<{
    providerKey: string;
    providerPlanCode: string;
    wholesalePriceUsd: number;
    providerPriority: number;
    providerHealthStatus: string;
  }> = [];

  for (const offer of enrichedOffers) {
    const provider = await getProviderByKey(offer.providerKey);
    candidatesRaw.push({
      providerKey: offer.providerKey,
      providerPlanCode: offer.providerPlanCode,
      wholesalePriceUsd: offer.wholesalePriceUsd,
      providerPriority: offer.providerPriority,
      providerHealthStatus: provider?.healthStatus ?? "unknown",
    });
  }

  // Compute cost normalization bounds
  const prices = candidatesRaw.map(c => c.wholesalePriceUsd);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  return candidatesRaw.map(c => {
    // cost_score: lower price = higher score (inverted, normalized 0–100)
    const cost_score =
      priceRange === 0
        ? 100
        : Math.round(100 * (1 - (c.wholesalePriceUsd - minPrice) / priceRange));

    // margin_score: (retail - wholesale) / retail × 100, clamped 0–100
    const grossMarginRatio =
      retailPriceUsd > 0
        ? (retailPriceUsd - c.wholesalePriceUsd) / retailPriceUsd
        : 0;
    const margin_score = Math.max(0, Math.min(100, Math.round(grossMarginRatio * 100)));

    const health_score = healthScore(c.providerHealthStatus);
    const latency_s = latencyScore(c.providerPriority);

    // blended: 35% cost, 25% margin, 25% health, 15% latency
    const blended =
      0.35 * cost_score +
      0.25 * margin_score +
      0.25 * health_score +
      0.15 * latency_s;

    return {
      ...c,
      scores: {
        cost_score,
        margin_score,
        health_score,
        latency_score: latency_s,
        blended_score: Math.round(blended * 10) / 10,
      },
    };
  });
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
      // Best blended score first
      return copy.sort((a, b) => b.scores.blended_score - a.scores.blended_score);
  }
}

// ─── Human-readable reason builder ───────────────────────────────────────────

function buildReason(
  strategy: RoutingStrategy,
  winner: ScoredCandidate,
  allCandidates: ScoredCandidate[],
): string {
  const { scores, providerKey, wholesalePriceUsd } = winner;

  switch (strategy) {
    case "cheapest_cost":
      return (
        `Selected "${providerKey}" via cheapest_cost strategy ` +
        `(wholesale $${wholesalePriceUsd.toFixed(4)}, cost_score=${scores.cost_score}).`
      );

    case "highest_margin":
      return (
        `Selected "${providerKey}" via highest_margin strategy ` +
        `(margin_score=${scores.margin_score}, wholesale $${wholesalePriceUsd.toFixed(4)}).`
      );

    case "best_health":
      return (
        `Selected "${providerKey}" via best_health strategy ` +
        `(health_score=${scores.health_score}, latency_score=${scores.latency_score}).`
      );

    case "blended_score":
    default: {
      const [first, second] = allCandidates;
      const gap =
        second
          ? ` (+${(first.scores.blended_score - second.scores.blended_score).toFixed(1)} over next)`
          : "";
      return (
        `Selected "${providerKey}" via blended_score strategy ` +
        `(blended=${scores.blended_score}${gap}; ` +
        `cost=${scores.cost_score}, margin=${scores.margin_score}, ` +
        `health=${scores.health_score}, latency=${scores.latency_score}).`
      );
    }
  }
}

function buildCandidateReason(
  strategy: RoutingStrategy,
  candidate: ScoredCandidate,
  rank: number,
): string {
  if (rank === 1) return "primary selection";

  switch (strategy) {
    case "cheapest_cost":
      return `fallback rank ${rank} — cost_score=${candidate.scores.cost_score}`;
    case "highest_margin":
      return `fallback rank ${rank} — margin_score=${candidate.scores.margin_score}`;
    case "best_health":
      return `fallback rank ${rank} — health_score=${candidate.scores.health_score}`;
    default:
      return `fallback rank ${rank} — blended_score=${candidate.scores.blended_score}`;
  }
}

// ─── Main engine function ─────────────────────────────────────────────────────

export async function selectBestProviderForPlan(
  normalizedPlanId: string,
  strategy: RoutingStrategy = "blended_score",
): Promise<RoutingResult> {
  // 1. Load the normalized plan (need retail price for margin scoring)
  const plan = await getNormalizedPlan(normalizedPlanId);
  if (!plan) {
    throw new Error(`[routingEngine] Normalized plan not found: ${normalizedPlanId}`);
  }

  // 2. Score all enabled, active candidates
  const candidates = await scoreCandidates(normalizedPlanId, plan.retailPriceUsd);
  if (candidates.length === 0) {
    throw new Error(
      `[routingEngine] No enabled active offers found for plan "${plan.name}" (${normalizedPlanId})`,
    );
  }

  // 3. Sort by chosen strategy
  const ranked = applySortStrategy(candidates, strategy);

  // 4. Build the fallback chain (all candidates in ranked order)
  const fallbackChain: RankedProvider[] = ranked.map((c, i) => ({
    rank: i + 1,
    providerKey: c.providerKey,
    providerPlanCode: c.providerPlanCode,
    wholesalePriceUsd: c.wholesalePriceUsd,
    scores: c.scores,
    reason: buildCandidateReason(strategy, c, i + 1),
  }));

  // 5. Winner is rank-1
  const winner = ranked[0];
  const decisionReason = buildReason(strategy, winner, ranked);

  // 6. Build scores map (keyed by providerKey for easy lookup)
  const scoresMap: Record<string, ProviderScores> = {};
  for (const c of candidates) {
    scoresMap[c.providerKey] = c.scores;
  }

  // 7. Persist to routing_decisions
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
    })
    .returning();

  console.log(
    `[routingEngine] Plan "${plan.name}" → ${winner.providerKey}/${winner.providerPlanCode}` +
      ` via ${strategy} | ${decisionReason}`,
  );

  return {
    decisionId: saved.id,
    normalizedPlanId,
    strategy,
    selectedProviderKey: winner.providerKey,
    selectedProviderPlanCode: winner.providerPlanCode,
    fallbackChain,
    scores: scoresMap,
    decisionReason,
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
