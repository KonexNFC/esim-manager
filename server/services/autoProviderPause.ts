// ─── Auto Provider Pause Service ─────────────────────────────────────────────
// Monitors provider performance and automatically pauses providers that
// consistently fail to deliver eSIMs. Auto-pause is a system-managed flag
// that is separate from the operator-controlled `enabled` field.
//
// Two independent criteria can trigger a pause:
//
//   A. LOW SUCCESS RATE
//      Weighted average fulfilment success rate across all destinations < 80%,
//      requiring at least MIN_SAMPLE_SIZE orders to avoid false positives.
//
//   B. CONSECUTIVE FAILURES
//      The last CONSECUTIVE_FAILURE_THRESHOLD actual provisioning attempts
//      (status = "error", skipped ignored) are all failures.
//
// Recovery is manual-only: an admin calls resumeAutoPausedProvider() to clear
// the flag after investigating and fixing the root cause.
//
// This service is non-throwing — it must never block fulfillment.

import { eq, desc } from "drizzle-orm";
import { db } from "../storage";
import { providers, providerAttempts } from "@shared/schema";
import { getStatsForProvider } from "./destinationStats";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SUCCESS_RATE_THRESHOLD = 0.80;   // pause if weighted success rate < 80%
const MIN_SAMPLE_SIZE = 5;             // min orders before rate-based pause kicks in
const CONSECUTIVE_FAILURE_THRESHOLD = 3; // last N actual failures → pause

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Compute the orders-weighted average success rate for a provider across all destinations. */
async function getProviderWeightedSuccessRate(
  providerKey: string,
): Promise<{ weightedRate: number; totalOrders: number } | null> {
  const allStats = await getStatsForProvider(providerKey);
  if (allStats.length === 0) return null;

  let totalOrders = 0;
  let weightedSum = 0;

  for (const stat of allStats) {
    totalOrders += stat.recentOrdersCount;
    weightedSum += stat.fulfilmentSuccessRate * stat.recentOrdersCount;
  }

  if (totalOrders === 0) return null;
  return { weightedRate: weightedSum / totalOrders, totalOrders };
}

/** Return the most recent N non-skipped provisioning attempts for a provider. */
async function getRecentActualAttempts(
  providerKey: string,
  limit: number,
): Promise<Array<{ status: string }>> {
  try {
    const rows = await db
      .select({ status: providerAttempts.status })
      .from(providerAttempts)
      .where(eq(providerAttempts.providerKey, providerKey))
      .orderBy(desc(providerAttempts.createdAt))
      .limit(limit * 3); // overfetch to filter skipped attempts

    return rows.filter(r => r.status !== "skipped").slice(0, limit);
  } catch {
    return [];
  }
}

/** Write auto_paused=true to the providers table. */
async function markProviderAutoPaused(
  providerKey: string,
  reason: string,
): Promise<void> {
  await db
    .update(providers)
    .set({
      autoPaused: true,
      autoPauseReason: reason,
      autoPausedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(providers.key, providerKey));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a provider's recent performance and auto-pause it if either
 * criterion is triggered. Already-paused providers are re-evaluated each time
 * in case the reason changes, but the flag stays set until manually cleared.
 *
 * Non-throwing — all errors are caught and logged.
 */
export async function evaluateProviderForAutoPause(providerKey: string): Promise<void> {
  try {
    const key = providerKey.toLowerCase();

    // ── Criterion A: weighted success rate ────────────────────────────────────
    const rateResult = await getProviderWeightedSuccessRate(key);
    if (rateResult && rateResult.totalOrders >= MIN_SAMPLE_SIZE) {
      if (rateResult.weightedRate < SUCCESS_RATE_THRESHOLD) {
        const ratePercent = Math.round(rateResult.weightedRate * 100);
        const reason =
          `Low success rate: ${ratePercent}% across ` +
          `${rateResult.totalOrders} orders (threshold: ${Math.round(SUCCESS_RATE_THRESHOLD * 100)}%)`;
        console.warn(`[autoProviderPause] Auto-pausing "${key}": ${reason}`);
        await markProviderAutoPaused(key, reason);
        return;
      }
    }

    // ── Criterion B: consecutive failures ─────────────────────────────────────
    const recent = await getRecentActualAttempts(key, CONSECUTIVE_FAILURE_THRESHOLD);
    if (recent.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      const allFailed = recent.every(r => r.status === "error");
      if (allFailed) {
        const reason =
          `${CONSECUTIVE_FAILURE_THRESHOLD} consecutive provisioning failures`;
        console.warn(`[autoProviderPause] Auto-pausing "${key}": ${reason}`);
        await markProviderAutoPaused(key, reason);
        return;
      }
    }
  } catch (err: any) {
    // Non-critical — never block the fulfillment flow
    console.warn(
      `[autoProviderPause] Error evaluating provider "${providerKey}":`,
      err.message,
    );
  }
}

/**
 * Manually clear the auto-pause flag for a provider.
 * This is the human override — the operator has reviewed the issue
 * and determined the provider is ready to receive traffic again.
 */
export async function resumeAutoPausedProvider(providerKey: string): Promise<void> {
  await db
    .update(providers)
    .set({
      autoPaused: false,
      autoPauseReason: null,
      autoPausedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(providers.key, providerKey));

  console.log(`[autoProviderPause] Provider "${providerKey}" manually resumed.`);
}
