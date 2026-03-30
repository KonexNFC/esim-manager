// ─── Destination Provider Stats Service ──────────────────────────────────────
// Maintains rolling performance memory per (provider, destination) pair.
// Updated after every fulfillment attempt — success, failure, or fallback.
//
// Recency: uses exponential moving average (EMA) so recent outcomes carry
// more weight than old ones. Alpha = 1/min(count, 20), meaning after ~20
// events each new data point has ~5% weight — the system adapts but stays
// stable.
//
// All functions are non-throwing: stats tracking must never break fulfillment.

import { eq, and } from "drizzle-orm";
import { db } from "../storage";
import { destinationProviderStats } from "@shared/schema";
import type { DestinationProviderStats } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { DestinationProviderStats };

export interface OutcomeParams {
  providerKey: string;
  destination: string;        // ISO country code (any case — normalised internally)
  outcome: "success" | "failure" | "skipped";
  isPrimary: boolean;         // true if rank-1 in the fallback chain
  latencyMs?: number;
  marginPercent?: number;
}

// ─── EMA helper ──────────────────────────────────────────────────────────────
// Alpha decays from 1.0 (first event) down to 0.05 (after 20+ events).
// This gives the most recent observation the highest influence early on,
// then stabilises once there is enough history.

function ema(current: number, newVal: number, count: number): number {
  const alpha = 1 / Math.min(count, 20);
  return current * (1 - alpha) + newVal * alpha;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return performance stats for a specific (provider, destination) pair.
 * Returns null if no data exists yet — callers must handle this gracefully.
 */
export async function getDestinationStats(
  providerKey: string,
  destination: string,
): Promise<DestinationProviderStats | null> {
  try {
    const [row] = await db
      .select()
      .from(destinationProviderStats)
      .where(
        and(
          eq(destinationProviderStats.providerKey, providerKey.toLowerCase()),
          eq(destinationProviderStats.destination, destination.toUpperCase()),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err: any) {
    console.warn("[destinationStats] getDestinationStats error:", err.message);
    return null;
  }
}

/**
 * Return all stats rows for a given provider across every destination.
 */
export async function getStatsForProvider(
  providerKey: string,
): Promise<DestinationProviderStats[]> {
  try {
    return await db
      .select()
      .from(destinationProviderStats)
      .where(eq(destinationProviderStats.providerKey, providerKey.toLowerCase()));
  } catch (err: any) {
    console.warn("[destinationStats] getStatsForProvider error:", err.message);
    return [];
  }
}

/**
 * Return every stats row — useful for admin dashboards.
 */
export async function getAllDestinationStats(): Promise<DestinationProviderStats[]> {
  try {
    return await db
      .select()
      .from(destinationProviderStats);
  } catch (err: any) {
    console.warn("[destinationStats] getAllDestinationStats error:", err.message);
    return [];
  }
}

/**
 * Record the outcome of a single fulfillment attempt and update the rolling
 * stats for the (provider, destination) pair.
 *
 * Skipped providers are ignored — they were never actually attempted.
 *
 * This function is intentionally non-throwing: a stats write failure must
 * never affect the fulfillment flow.
 */
export async function recordFulfillmentOutcome(params: OutcomeParams): Promise<void> {
  if (params.outcome === "skipped") return;

  const providerKey = params.providerKey.toLowerCase();
  const destination = params.destination.toUpperCase();
  const successVal = params.outcome === "success" ? 1.0 : 0.0;
  const failoverVal = params.isPrimary ? 0.0 : 1.0;

  try {
    const existing = await getDestinationStats(providerKey, destination);

    if (!existing) {
      // First record — insert cold start row
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
      return;
    }

    // Update rolling averages with EMA
    const count = existing.recentOrdersCount + 1;

    const newSuccessRate = ema(existing.fulfilmentSuccessRate, successVal, count);

    const newLatency =
      params.latencyMs != null
        ? existing.avgLatencyMs != null
          ? Math.round(ema(existing.avgLatencyMs, params.latencyMs, count))
          : params.latencyMs
        : existing.avgLatencyMs;

    const newMargin =
      params.marginPercent != null
        ? existing.avgMarginPercent != null
          ? ema(existing.avgMarginPercent, params.marginPercent, count)
          : params.marginPercent
        : existing.avgMarginPercent;

    const newFailoverRate = ema(existing.failoverRate, failoverVal, count);

    await db
      .update(destinationProviderStats)
      .set({
        recentOrdersCount: count,
        fulfilmentSuccessRate: newSuccessRate,
        avgLatencyMs: newLatency,
        avgMarginPercent: newMargin,
        failoverRate: newFailoverRate,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(destinationProviderStats.providerKey, providerKey),
          eq(destinationProviderStats.destination, destination),
        ),
      );
  } catch (err: any) {
    // Non-fatal: log and continue — stats must never break fulfillment
    console.warn(
      `[destinationStats] Failed to record outcome for ${providerKey}/${destination}:`,
      err.message,
    );
  }
}
