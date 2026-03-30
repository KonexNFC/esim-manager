// ─── Provider Sync Service ────────────────────────────────────────────────────
// Fetches live plans from all configured providers, normalises them, stores
// them in `provider_offers`, and auto-updates internal plan wholesale costs.
//
// Flow:
//   1. Load all unique country codes from the `destinations` table
//   2. eSIMGo  → getAllCataloguePlans() (single API call, all regions)
//   3. eSIM Access → getAllPackages(countryCodes) (batched per country)
//   4. For each provider plan: upsert normalizedPlan + providerOffer
//   5. For each internal plan: find cheapest matching offer, update cost+provider
//   6. Record everything in `provider_sync_runs`

import { eq, and } from "drizzle-orm";
import { db } from "../storage";
import {
  plans,
  destinations,
  normalizedPlans,
  providerOffers,
  providerSyncRuns,
  settings,
} from "@shared/schema";
import type { ProviderPlan } from "../providers/types";
import { esimgo } from "../providers/esimgo";
import { esimAccess } from "../providers/esimAccess";
import { zendit } from "../providers/zendit";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderSyncResult {
  providerKey: string;
  success: boolean;
  plansFound: number;
  offersUpserted: number;
  error?: string;
}

export interface SyncSummary {
  logId: string;
  triggeredBy: "auto" | "manual";
  durationMs: number;
  results: ProviderSyncResult[];
  totalOffersUpserted: number;
  internalPlansUpdated: number;
  priceChanges: number;
  failedProviders: string[];
  status: "success" | "partial" | "failed";
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function planToMb(plan: ProviderPlan): number {
  if (plan.dataAmountGb >= 999) return 999999; // unlimited
  return Math.round(plan.dataAmountGb * 1024);
}

/** Find a normalizedPlan row matching regionCode + dataMb + validityDays, or create one. */
async function findOrCreateNormalizedPlan(
  regionCode: string,
  dataMb: number,
  validityDays: number,
  planName: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: normalizedPlans.id })
    .from(normalizedPlans)
    .where(
      and(
        eq(normalizedPlans.regionCode, regionCode),
        eq(normalizedPlans.dataMb, dataMb),
        eq(normalizedPlans.validityDays, validityDays),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const isUnlimited = dataMb >= 999999;
  const [created] = await db
    .insert(normalizedPlans)
    .values({
      regionCode,
      dataMb,
      validityDays,
      name: planName,
      isUnlimited,
      planType: "data",
      retailPriceUsd: 0,
      isActive: true,
    })
    .returning({ id: normalizedPlans.id });

  return created.id;
}

/** Upsert a single providerOffer and return whether the price changed. */
async function upsertOffer(
  normalizedPlanId: string,
  providerKey: string,
  providerPlanCode: string,
  wholesalePriceUsd: number,
  coverageType: "country" | "regional" | "global" = "country",
): Promise<boolean> {
  const [existing] = await db
    .select({ id: providerOffers.id, wholesalePriceUsd: providerOffers.wholesalePriceUsd })
    .from(providerOffers)
    .where(
      and(
        eq(providerOffers.normalizedPlanId, normalizedPlanId),
        eq(providerOffers.providerKey, providerKey),
        eq(providerOffers.providerPlanCode, providerPlanCode),
      ),
    )
    .limit(1);

  const priceChanged =
    existing != null && Math.abs(existing.wholesalePriceUsd - wholesalePriceUsd) > 0.0001;

  if (existing) {
    await db
      .update(providerOffers)
      .set({ wholesalePriceUsd, coverageType, isActive: true, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerOffers.id, existing.id));
  } else {
    await db.insert(providerOffers).values({
      normalizedPlanId,
      providerKey,
      providerPlanCode,
      wholesalePriceUsd,
      coverageType,
      currency: "USD",
      isActive: true,
      lastSyncedAt: new Date(),
    });
  }

  return priceChanged;
}

/** Process a batch of ProviderPlan records for one provider. */
async function processProviderPlans(
  providerPlans: ProviderPlan[],
  providerKey: string,
): Promise<{ offersUpserted: number; priceChanges: number }> {
  let offersUpserted = 0;
  let priceChanges = 0;

  for (const plan of providerPlans) {
    if (!plan.providerRef) continue;

    const regionCode = plan.countryCode.toUpperCase();
    const dataMb = planToMb(plan);
    const normalizedPlanId = await findOrCreateNormalizedPlan(
      regionCode,
      dataMb,
      plan.validityDays,
      plan.name,
    );

    const changed = await upsertOffer(
      normalizedPlanId,
      providerKey,
      plan.providerRef,
      plan.wholesaleCost,
      plan.coverageType ?? "country",
    );

    offersUpserted++;
    if (changed) priceChanges++;
  }

  return { offersUpserted, priceChanges };
}

/** For each internal plan, find the cheapest matching providerOffer and update plan cost+provider. */
async function autoUpdateInternalPlanCosts(): Promise<{ plansUpdated: number; priceChanges: number }> {
  const rows = await db
    .select({ plan: plans, dest: destinations })
    .from(plans)
    .leftJoin(destinations, eq(plans.destinationId, destinations.id))
    .where(eq(plans.isActive, true));

  let plansUpdated = 0;
  let priceChanges = 0;

  for (const { plan, dest } of rows) {
    const regionCode = (dest?.countryCode ?? "GLOBAL").toUpperCase();
    const dataMb = Math.round((plan.dataAmountGb ?? 0) * 1024);
    const validityDays = plan.validityDays;

    const [normPlan] = await db
      .select({ id: normalizedPlans.id })
      .from(normalizedPlans)
      .where(
        and(
          eq(normalizedPlans.regionCode, regionCode),
          eq(normalizedPlans.dataMb, dataMb),
          eq(normalizedPlans.validityDays, validityDays),
          eq(normalizedPlans.isActive, true),
        ),
      )
      .limit(1);

    if (!normPlan) continue;

    const offers = await db
      .select({ providerKey: providerOffers.providerKey, wholesalePriceUsd: providerOffers.wholesalePriceUsd })
      .from(providerOffers)
      .where(
        and(
          eq(providerOffers.normalizedPlanId, normPlan.id),
          eq(providerOffers.isActive, true),
        ),
      );

    if (offers.length === 0) continue;

    const cheapest = offers.reduce((a, b) => (a.wholesalePriceUsd < b.wholesalePriceUsd ? a : b));

    const costDiff = Math.abs((plan.wholesaleCost ?? 0) - cheapest.wholesalePriceUsd);
    const providerDiff = plan.provider !== cheapest.providerKey;

    if (costDiff > 0.0001 || providerDiff) {
      await db
        .update(plans)
        .set({ wholesaleCost: cheapest.wholesalePriceUsd, provider: cheapest.providerKey })
        .where(eq(plans.id, plan.id));
      plansUpdated++;
      if (costDiff > 0.0001) priceChanges++;
    }
  }

  return { plansUpdated, priceChanges };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full provider sync: fetch → normalize → store → auto-update internal plan costs.
 */
export async function syncAllProviders(
  triggeredBy: "auto" | "manual" = "auto",
): Promise<SyncSummary> {
  const startedAt = Date.now();

  const [logRow] = await db
    .insert(providerSyncRuns)
    .values({ triggeredBy, status: "running", startedAt: new Date(startedAt) })
    .returning({ id: providerSyncRuns.id });
  const logId = logRow.id;

  const results: ProviderSyncResult[] = [];
  let totalOffersUpserted = 0;
  let totalPriceChanges = 0;
  const failedProviders: string[] = [];

  // Collect country codes for batch providers (eSIM Access)
  const destRows = await db
    .select({ countryCode: destinations.countryCode })
    .from(destinations);
  const countryCodes = [...new Set(destRows.map(r => r.countryCode.toUpperCase()))];

  // ── eSIMGo (single full-catalogue call) ───────────────────────────────────
  if (esimgo.isConfigured()) {
    try {
      console.log("[providerSync] Fetching eSIMGo full catalogue...");
      const fetched = await esimgo.getAllCataloguePlans();
      console.log(`[providerSync] eSIMGo: ${fetched.length} plan-country entries`);
      const { offersUpserted, priceChanges } = await processProviderPlans(fetched, "esimgo");
      totalOffersUpserted += offersUpserted;
      totalPriceChanges += priceChanges;
      results.push({ providerKey: "esimgo", success: true, plansFound: fetched.length, offersUpserted });
    } catch (err: any) {
      console.error("[providerSync] eSIMGo sync failed:", err.message);
      failedProviders.push("esimgo");
      results.push({ providerKey: "esimgo", success: false, plansFound: 0, offersUpserted: 0, error: err.message });
    }
  } else {
    results.push({ providerKey: "esimgo", success: false, plansFound: 0, offersUpserted: 0, error: "Not configured" });
    failedProviders.push("esimgo");
  }

  // ── eSIM Access (per-country batch) ───────────────────────────────────────
  if (esimAccess.isConfigured()) {
    try {
      console.log(`[providerSync] Fetching eSIM Access plans for ${countryCodes.length} countries...`);
      const fetched = await esimAccess.getAllPackages(countryCodes);
      console.log(`[providerSync] eSIM Access: ${fetched.length} packages`);
      const { offersUpserted, priceChanges } = await processProviderPlans(fetched, "esimaccess");
      totalOffersUpserted += offersUpserted;
      totalPriceChanges += priceChanges;
      results.push({ providerKey: "esimaccess", success: true, plansFound: fetched.length, offersUpserted });
    } catch (err: any) {
      console.error("[providerSync] eSIM Access sync failed:", err.message);
      failedProviders.push("esimaccess");
      results.push({ providerKey: "esimaccess", success: false, plansFound: 0, offersUpserted: 0, error: err.message });
    }
  } else {
    results.push({ providerKey: "esimaccess", success: false, plansFound: 0, offersUpserted: 0, error: "Not configured" });
    failedProviders.push("esimaccess");
  }

  // ── Zendit (per-country batch, same country list as eSIM Access) ───────────
  if (zendit.isConfigured()) {
    try {
      console.log(`[providerSync] Fetching Zendit plans for ${countryCodes.length} countries...`);
      const fetched = await zendit.getAllCataloguePlans(countryCodes);
      console.log(`[providerSync] Zendit: ${fetched.length} plans`);
      const { offersUpserted, priceChanges } = await processProviderPlans(fetched, "zendit");
      totalOffersUpserted += offersUpserted;
      totalPriceChanges += priceChanges;
      results.push({ providerKey: "zendit", success: true, plansFound: fetched.length, offersUpserted });
    } catch (err: any) {
      console.error("[providerSync] Zendit sync failed:", err.message);
      failedProviders.push("zendit");
      results.push({ providerKey: "zendit", success: false, plansFound: 0, offersUpserted: 0, error: err.message });
    }
  } else {
    // Not configured yet — log at debug level, don't count as a failure
    console.log("[providerSync] Zendit: not configured (ZENDIT_API_KEY missing) — skipped");
    results.push({ providerKey: "zendit", success: false, plansFound: 0, offersUpserted: 0, error: "Not configured" });
  }

  // ── Auto-update internal plan costs ───────────────────────────────────────
  const { plansUpdated, priceChanges: internalChanges } = await autoUpdateInternalPlanCosts();
  totalPriceChanges += internalChanges;
  console.log(`[providerSync] Auto-updated ${plansUpdated} internal plans (${internalChanges} price changes)`);

  // ── Finalise ──────────────────────────────────────────────────────────────
  const providersSucceeded = results.filter(r => r.success).length;
  const status: "success" | "partial" | "failed" =
    failedProviders.length === 0 ? "success"
    : providersSucceeded > 0 ? "partial"
    : "failed";
  const durationMs = Date.now() - startedAt;

  await db
    .update(providerSyncRuns)
    .set({
      completedAt: new Date(),
      status,
      providersAttempted: results.length,
      providersSucceeded,
      failedProviders: failedProviders.length > 0 ? failedProviders : null,
      offersUpserted: totalOffersUpserted,
      plansUpdated,
      priceChanges: totalPriceChanges,
    })
    .where(eq(providerSyncRuns.id, logId));

  await db
    .insert(settings)
    .values({ key: "lastProviderSync", value: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: new Date().toISOString(), updatedAt: new Date() } });

  console.log(`[providerSync] Done in ${durationMs}ms — status=${status}, offers=${totalOffersUpserted}, plans=${plansUpdated}`);

  return { logId, triggeredBy, durationMs, results, totalOffersUpserted, internalPlansUpdated: plansUpdated, priceChanges: totalPriceChanges, failedProviders, status };
}

/** Return the most recent sync run logs (newest first). */
export async function getRecentSyncRuns(limit = 10) {
  return db
    .select()
    .from(providerSyncRuns)
    .orderBy(providerSyncRuns.startedAt)
    .limit(limit);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _schedulerStarted = false;

/**
 * Start the background sync scheduler.
 * Initial sync after 60s, then every 6 hours.
 */
export function startProviderSyncScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const INITIAL_DELAY = 60 * 1000;

  setTimeout(async () => {
    console.log("[providerSync] Running initial scheduled sync...");
    await syncAllProviders("auto").catch(err =>
      console.error("[providerSync] Initial sync failed:", err.message, err.stack),
    );
    setInterval(async () => {
      console.log("[providerSync] Running 6-hour scheduled sync...");
      await syncAllProviders("auto").catch(err =>
        console.error("[providerSync] Scheduled sync failed:", err.message),
      );
    }, SIX_HOURS);
  }, INITIAL_DELAY);

  console.log("[providerSync] Scheduler registered (first run in 60s, then every 6h)");
}
