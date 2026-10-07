// ─── Destination provider stats compatibility service ─────────────────────────
//
// The original destinationProviderStats table is retained for backwards
// compatibility with admin views and older callers.  Recent routing history is
// now derived from orders/provider_attempts by performanceHistory.ts.  We do
// not merge both sources: recordFulfillmentOutcome writes the legacy rolling
// row while getProviderPerformance reads the source events, so merging would
// count every fulfillment twice.

import { and, eq } from "drizzle-orm";
import { db } from "../storage";
import { destinationProviderStats } from "@shared/schema";
import type { DestinationProviderStats } from "@shared/schema";
import {
  buildProviderPerformance,
  getProviderPerformance,
  getRecentPerformanceHistory,
  invalidatePerformanceHistoryCache,
  normalizeDestination,
  normalizeProviderKey,
} from "./performanceHistory";
import type {
  FailureClass,
  PerformanceHistoryOptions,
  PerformanceHistorySeed,
  PerformanceObservation,
  ProviderPerformance,
} from "./performanceHistory";

export type {
  DestinationProviderStats,
  FailureClass,
  PerformanceHistoryOptions,
  PerformanceHistorySeed,
  PerformanceObservation,
  ProviderPerformance,
};
export { getProviderPerformance };

export interface OutcomeParams {
  providerKey: string;
  destination: string;
  /**
   * `success` is retained as an alias for old fulfillment callers.  New code
   * should use `issued_success` so an API-accepted response cannot be mistaken
   * for an issued eSIM.
   */
  outcome: "success" | "issued_success" | "api_accepted" | "failure" | "skipped";
  isPrimary: boolean;
  latencyMs?: number;
  marginPercent?: number;
  failureClass?: FailureClass;
}

function toCompatibilityRow(performance: ProviderPerformance): DestinationProviderStats {
  const fallbackTerminal = performance.fallbackSuccessCount + performance.fallbackFailureCount;
  return {
    id: `derived:${performance.providerKey}:${performance.destination}`,
    providerKey: performance.providerKey,
    destination: performance.destination,
    recentOrdersCount: Math.max(0, Math.round(performance.sampleSize)),
    fulfilmentSuccessRate: performance.effectiveSuccessRate,
    avgLatencyMs: performance.avgLatencyMs,
    avgMarginPercent: null,
    // Legacy callers call this `failoverRate`.  Expose fallback *failure*
    // rate, not fallback usage: a provider that succeeds after being used as
    // a fallback must not be penalised merely for its position in the chain.
    failoverRate: fallbackTerminal > 0
      ? performance.fallbackFailureCount / fallbackTerminal
      : 0,
    updatedAt: new Date(),
  };
}

async function getPersistedDestinationStats(
  providerKey: string,
  destination: string,
): Promise<DestinationProviderStats | null> {
  try {
    const [row] = await db
      .select()
      .from(destinationProviderStats)
      .where(and(
        eq(destinationProviderStats.providerKey, providerKey),
        eq(destinationProviderStats.destination, destination),
      ))
      .limit(1);
    return row ?? null;
  } catch (error: any) {
    console.warn("[destinationStats] persisted stats read failed:", error?.message ?? error);
    return null;
  }
}

/**
 * Return recent, confidence-weighted performance for a provider/destination.
 *
 * This compatibility function prefers the normalised orders/attempts source.
 * A persisted legacy row is used only when no source observation exists for
 * that pair (for example, during a temporary read failure or for old manually
 * recorded stats).
 */
export async function getDestinationStats(
  providerKey: string,
  destination: string,
  options: PerformanceHistoryOptions = {},
): Promise<DestinationProviderStats | null> {
  const key = normalizeProviderKey(providerKey);
  const code = normalizeDestination(destination);
  try {
    const performance = await getProviderPerformance(key, code, options);
    // Return the global-prior view even when this exact destination is cold;
    // callers that still use this compatibility API can then distinguish
    // "provider has history elsewhere" from "provider has no history".
    if (performance.observations.length > 0 || performance.globalSampleSize > 0) {
      return toCompatibilityRow(performance);
    }
  } catch (error: any) {
    console.warn("[destinationStats] derived stats read failed:", error?.message ?? error);
  }
  return getPersistedDestinationStats(key, code);
}

/**
 * Return one derived compatibility row per destination.  Source events are
 * normalised once here so a provider's attempts are not counted repeatedly.
 */
export async function getStatsForProvider(
  providerKey: string,
  options: PerformanceHistoryOptions = {},
): Promise<DestinationProviderStats[]> {
  const key = normalizeProviderKey(providerKey);
  try {
    const observations = await getRecentPerformanceHistory(options);
    const destinations = [...new Set(
      observations
        .filter(observation => observation.providerKey === key)
        .map(observation => observation.destination),
    )];
    if (destinations.length > 0) {
      return destinations.map(destination => toCompatibilityRow(
        buildProviderPerformance(key, destination, observations, options),
      ));
    }
  } catch (error: any) {
    console.warn("[destinationStats] derived provider stats read failed:", error?.message ?? error);
  }

  try {
    return await db
      .select()
      .from(destinationProviderStats)
      .where(eq(destinationProviderStats.providerKey, key));
  } catch (error: any) {
    console.warn("[destinationStats] persisted provider stats read failed:", error?.message ?? error);
    return [];
  }
}

/**
 * Return all destination rows, preferring the same normalised recent source
 * used by getProviderPerformance.
 */
export async function getAllDestinationStats(
  options: PerformanceHistoryOptions = {},
): Promise<DestinationProviderStats[]> {
  try {
    const observations = await getRecentPerformanceHistory(options);
    const pairs = new Map<string, string>();
    for (const observation of observations) {
      pairs.set(`${observation.providerKey}\u0000${observation.destination}`, observation.providerKey);
    }
    if (pairs.size > 0) {
      return [...pairs.keys()].map(pair => {
        const [providerKey, destination] = pair.split("\u0000");
        return toCompatibilityRow(buildProviderPerformance(
          providerKey,
          destination,
          observations,
          options,
        ));
      });
    }
  } catch (error: any) {
    console.warn("[destinationStats] derived all-stats read failed:", error?.message ?? error);
  }

  try {
    return await db.select().from(destinationProviderStats);
  } catch (error: any) {
    console.warn("[destinationStats] persisted all-stats read failed:", error?.message ?? error);
    return [];
  }
}

/**
 * Retain the write API used by fulfillment while making the derived source
 * authoritative for routing.  API-accepted and skipped calls are intentionally
 * not written as successful issuances.
 */
export async function recordFulfillmentOutcome(params: OutcomeParams): Promise<void> {
  if (params.outcome === "skipped" || params.outcome === "api_accepted") return;

  const providerKey = normalizeProviderKey(params.providerKey);
  const destination = normalizeDestination(params.destination);
  if (!providerKey || !destination) return;
  const successVal = params.outcome === "success" || params.outcome === "issued_success" ? 1 : 0;
  // Keep the legacy column useful without treating fallback position as a
  // penalty: only a failed fallback contributes to this failure-rate field.
  const failoverVal = !params.isPrimary && params.outcome === "failure" ? 1 : 0;

  try {
    const [existing] = await db
      .select()
      .from(destinationProviderStats)
      .where(and(
        eq(destinationProviderStats.providerKey, providerKey),
        eq(destinationProviderStats.destination, destination),
      ))
      .limit(1);

    if (!existing) {
      await db.insert(destinationProviderStats).values({
        providerKey,
        destination,
        recentOrdersCount: 1,
        fulfilmentSuccessRate: successVal,
        avgLatencyMs: params.latencyMs ?? null,
        avgMarginPercent: params.marginPercent ?? null,
        failoverRate: failoverVal,
        updatedAt: new Date(),
      });
      invalidatePerformanceHistoryCache();
      return;
    }

    const count = existing.recentOrdersCount + 1;
    const alpha = 1 / Math.min(count, 20);
    const ema = (current: number, next: number) => current * (1 - alpha) + next * alpha;
    const newLatency = params.latencyMs == null
      ? existing.avgLatencyMs
      : existing.avgLatencyMs == null
        ? Math.round(params.latencyMs)
        : Math.round(ema(existing.avgLatencyMs, params.latencyMs));
    const newMargin = params.marginPercent == null
      ? existing.avgMarginPercent
      : existing.avgMarginPercent == null
        ? params.marginPercent
        : ema(existing.avgMarginPercent, params.marginPercent);

    await db
      .update(destinationProviderStats)
      .set({
        recentOrdersCount: count,
        fulfilmentSuccessRate: ema(existing.fulfilmentSuccessRate, successVal),
        avgLatencyMs: newLatency,
        avgMarginPercent: newMargin,
        failoverRate: ema(existing.failoverRate, failoverVal),
        updatedAt: new Date(),
      })
      .where(and(
        eq(destinationProviderStats.providerKey, providerKey),
        eq(destinationProviderStats.destination, destination),
      ));
    invalidatePerformanceHistoryCache();
  } catch (error: any) {
    // Stats are advisory and must never block the provider retry loop.
    console.warn(
      `[destinationStats] Failed to record outcome for ${providerKey}/${destination}:`,
      error?.message ?? error,
    );
  }
}
