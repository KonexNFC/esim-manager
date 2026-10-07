// ─── Provider Sync Service ────────────────────────────────────────────────────
// Fetches live plans from all configured providers, normalises them, stores
// them in `provider_offers`, and auto-updates internal plan wholesale costs.
//
// Flow:
//   1. Load all unique country codes from the `destinations` table
//   2. eSIMGo  → getAllCataloguePlans() (single API call, all regions)
//   3. eSIM Access → getAllPackages(countryCodes) (batched per country)
//   4. For each provider plan: upsert normalizedPlan + providerOffer
//   5. For each internal plan: use routing policy to update its maintained
//      supplier cost/provider identity
//   6. Record everything in `provider_sync_runs`

import { eq, and, sql } from "drizzle-orm";
import { db } from "../storage";
import {
  plans,
  destinations,
  normalizedPlans,
  providerOffers,
  providerSyncRuns,
  providers,
  settings,
} from "@shared/schema";
import type { ProviderPlan } from "../providers/types";
import { esimgo } from "../providers/esimgo";
import { esimAccess } from "../providers/esimAccess";
import { zendit } from "../providers/zendit";
import { airalo } from "../providers/airalo";
import { quantizeDataMb, formatPlanName } from "./planNormalizer";
import { computeFloorUsd, roundUpTo99 } from "./priceFloor";
import { selectBestProviderForPlan } from "./routingEngine";
import { canonicalProviderKey } from "./providerHealth";

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
  // Quantize immediately so different providers always hit the same tier.
  // e.g. eSIMGo's 1000 MB (SI) → 1024 MB (canonical 1 GB)
  return quantizeDataMb(Math.round(plan.dataAmountGb * 1024));
}

/** Process a batch of ProviderPlan records for one provider using bulk DB operations. */
async function processProviderPlans(
  providerPlans: ProviderPlan[],
  providerKey: string,
): Promise<{ offersUpserted: number; priceChanges: number }> {
  const validPlans = providerPlans.filter(p => p.providerRef);
  if (validPlans.length === 0) return { offersUpserted: 0, priceChanges: 0 };

  // ── Step 1: Resolve all unique (regionCode, dataMb, validityDays) combos ──
  // Build a map of canonical key → plan spec
  type PlanSpec = { regionCode: string; dataMb: number; validityDays: number };
  const specMap = new Map<string, PlanSpec>();
  for (const plan of validPlans) {
    const regionCode = plan.countryCode.toUpperCase();
    const dataMb = planToMb(plan);
    const key = `${regionCode}|${dataMb}|${plan.validityDays}`;
    specMap.set(key, { regionCode, dataMb, validityDays: plan.validityDays });
  }
  const specs = [...specMap.values()];

  // ── Step 2: Bulk SELECT existing normalized plans ──
  // Fetch all existing rows in one query using a VALUES list
  const normalizedPlanCache = new Map<string, string>(); // key → id
  const CHUNK = 500;
  for (let i = 0; i < specs.length; i += CHUNK) {
    const chunk = specs.slice(i, i + CHUNK);
    const existing = await db
      .select({ id: normalizedPlans.id, regionCode: normalizedPlans.regionCode, dataMb: normalizedPlans.dataMb, validityDays: normalizedPlans.validityDays })
      .from(normalizedPlans)
      .where(
        sql`(${normalizedPlans.regionCode}, ${normalizedPlans.dataMb}, ${normalizedPlans.validityDays}) IN (${sql.join(
          chunk.map(s => sql`(${s.regionCode}, ${s.dataMb}, ${s.validityDays})`),
          sql`, `
        )})`
      );
    for (const row of existing) {
      normalizedPlanCache.set(`${row.regionCode}|${row.dataMb}|${row.validityDays}`, row.id);
    }
  }

  // ── Step 3: Bulk INSERT missing normalized plans ──
  // Compute the cheapest wholesale cost per spec from this provider's offer data
  // so new plans get a reasonable starting retail price (35% target margin).
  // Without this, new plans default to retailPriceUsd=0 which causes the routing
  // engine to compute margin=0 on every candidate, collapsing confidence scores to ~47.
  const DEFAULT_TARGET_MARGIN = 0.35; // 35% gross margin → retail = cost / 0.65
  const cheapestWholesalePerSpec = new Map<string, number>();
  for (const plan of validPlans) {
    const regionCode = plan.countryCode.toUpperCase();
    const dataMb = planToMb(plan);
    const key = `${regionCode}|${dataMb}|${plan.validityDays}`;
    const current = cheapestWholesalePerSpec.get(key);
    if (current === undefined || plan.wholesaleCost < current) {
      cheapestWholesalePerSpec.set(key, plan.wholesaleCost);
    }
  }

  const missing = specs.filter(s => !normalizedPlanCache.has(`${s.regionCode}|${s.dataMb}|${s.validityDays}`));
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      const inserted = await db
        .insert(normalizedPlans)
        .values(chunk.map(s => {
          const cheapestWholesale = cheapestWholesalePerSpec.get(`${s.regionCode}|${s.dataMb}|${s.validityDays}`) ?? 0;
          // Compute a baseline retail price so margin scoring is realistic from day one.
          // Admins can override this via the plan editor; this is a sensible starting point.
          const retailPriceUsd = cheapestWholesale > 0
            ? Math.round((cheapestWholesale / (1 - DEFAULT_TARGET_MARGIN)) * 100) / 100
            : 0;
          return {
            regionCode: s.regionCode,
            dataMb: s.dataMb,
            validityDays: s.validityDays,
            name: formatPlanName(s.regionCode, s.dataMb, s.validityDays),
            isUnlimited: s.dataMb >= 999999,
            planType: "data" as const,
            retailPriceUsd,
            isActive: true,
          };
        }))
        .onConflictDoNothing()
        .returning({ id: normalizedPlans.id, regionCode: normalizedPlans.regionCode, dataMb: normalizedPlans.dataMb, validityDays: normalizedPlans.validityDays });
      for (const row of inserted) {
        normalizedPlanCache.set(`${row.regionCode}|${row.dataMb}|${row.validityDays}`, row.id);
      }
    }
    // Re-fetch any that didn't return (conflict on identical concurrent insert)
    const stillMissing = specs.filter(s => !normalizedPlanCache.has(`${s.regionCode}|${s.dataMb}|${s.validityDays}`));
    if (stillMissing.length > 0) {
      for (let i = 0; i < stillMissing.length; i += CHUNK) {
        const chunk = stillMissing.slice(i, i + CHUNK);
        const refetched = await db
          .select({ id: normalizedPlans.id, regionCode: normalizedPlans.regionCode, dataMb: normalizedPlans.dataMb, validityDays: normalizedPlans.validityDays })
          .from(normalizedPlans)
          .where(
            sql`(${normalizedPlans.regionCode}, ${normalizedPlans.dataMb}, ${normalizedPlans.validityDays}) IN (${sql.join(
              chunk.map(s => sql`(${s.regionCode}, ${s.dataMb}, ${s.validityDays})`),
              sql`, `
            )})`
          );
        for (const row of refetched) {
          normalizedPlanCache.set(`${row.regionCode}|${row.dataMb}|${row.validityDays}`, row.id);
        }
      }
    }
  }

  // ── Step 4: Bulk upsert all provider_offers in one statement ──
  const offerValues = validPlans.map(plan => {
    const regionCode = plan.countryCode.toUpperCase();
    const dataMb = planToMb(plan);
    const normalizedPlanId = normalizedPlanCache.get(`${regionCode}|${dataMb}|${plan.validityDays}`);
    if (!normalizedPlanId) return null;
    return {
      normalizedPlanId,
      providerKey,
      providerPlanCode: plan.providerRef!,
      wholesalePriceUsd: plan.wholesaleCost,
      coverageType: (plan.coverageType ?? "country") as "country" | "regional" | "global",
      currency: "USD",
      isActive: true,
      lastSyncedAt: new Date(),
    };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  let offersUpserted = 0;
  let priceChanges = 0;

  for (let i = 0; i < offerValues.length; i += CHUNK) {
    const chunk = offerValues.slice(i, i + CHUNK);
    // Fetch existing prices for this chunk to detect changes
    const existing = await db
      .select({ providerPlanCode: providerOffers.providerPlanCode, wholesalePriceUsd: providerOffers.wholesalePriceUsd })
      .from(providerOffers)
      .where(
        and(
          eq(providerOffers.providerKey, providerKey),
          sql`${providerOffers.providerPlanCode} IN (${sql.join(chunk.map(c => sql`${c.providerPlanCode}`), sql`, `)})`
        )
      );
    const existingMap = new Map(existing.map(e => [e.providerPlanCode, e.wholesalePriceUsd]));
    priceChanges += chunk.filter(c => {
      const prev = existingMap.get(c.providerPlanCode);
      return prev != null && Math.abs(prev - c.wholesalePriceUsd) > 0.0001;
    }).length;

    await db
      .insert(providerOffers)
      .values(chunk)
      .onConflictDoUpdate({
        target: [providerOffers.normalizedPlanId, providerOffers.providerKey, providerOffers.providerPlanCode],
        set: {
          wholesalePriceUsd: sql`EXCLUDED.wholesale_price_usd`,
          coverageType: sql`EXCLUDED.coverage_type`,
          isActive: true,
          lastSyncedAt: sql`EXCLUDED.last_synced_at`,
          updatedAt: new Date(),
        },
      });
    offersUpserted += chunk.length;
  }

  return { offersUpserted, priceChanges };
}

/**
 * Keep stored normalized-plan retail prices non-zero and above every currently
 * eligible offer's safety floor. Quotes price a selected supplier offer, while
 * this stored value remains a safe maintained baseline for routing/admin views.
 * Existing higher admin prices are never lowered during sync.
 */
async function backfillNormalizedPlanRetailPrices(): Promise<{ plansUpdated: number }> {
  const rows = await db.execute<{ id: string; retail_price_usd: number; max_wholesale: number }>(sql`
    SELECT np.id, np.retail_price_usd, MAX(po.wholesale_price_usd) AS max_wholesale
    FROM normalized_plans np
    JOIN provider_offers po ON po.normalized_plan_id = np.id
    JOIN providers p ON p.key = po.provider_key
    WHERE np.is_active = true
      AND po.is_active = true
      AND po.wholesale_price_usd > 0
      AND p.enabled = true
      AND p.auto_paused = false
      AND po.provider_key IN ('esimgo', 'esimaccess', 'zendit', 'airalo', 'mock')
    GROUP BY np.id, np.retail_price_usd
  `);

  if (rows.rows.length === 0) return { plansUpdated: 0 };

  let plansUpdated = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.rows.length; i += CHUNK) {
    const chunk = rows.rows.slice(i, i + CHUNK);
    for (const row of chunk) {
      const worstCase = Number(row.max_wholesale);
      if (worstCase <= 0) continue;
      const retailPriceUsd = roundUpTo99(computeFloorUsd(worstCase));
      const storedRetail = Number(row.retail_price_usd) || 0;
      if (storedRetail >= retailPriceUsd) continue;
      await db
        .update(normalizedPlans)
        .set({ retailPriceUsd, updatedAt: new Date() })
        .where(and(
          eq(normalizedPlans.id, row.id),
          sql`(retail_price_usd IS NULL OR retail_price_usd < ${retailPriceUsd})`,
        ));
      plansUpdated++;
    }
  }

  return { plansUpdated };
}

/** Maintain legacy plan metadata from the common routing policy, never price order. */
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
    const rawGb = plan.dataAmountGb ?? 0;
    const dataMb = rawGb >= 999 ? 999999 : Math.round(rawGb * 1024);
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

    let routing: Awaited<ReturnType<typeof selectBestProviderForPlan>>;
    try {
      routing = await selectBestProviderForPlan(normPlan.id, "blended_score");
    } catch (err: any) {
      // A catalogue sync can legitimately encounter a normalized product with
      // no currently eligible supplier. Keep syncing every other plan and
      // leave this legacy plan untouched rather than aborting the whole run.
      console.warn(
        `[providerSync] Skipping legacy plan ${plan.id}: routing unavailable for ${normPlan.id}: ${err?.message ?? err}`,
      );
      continue;
    }
    const winner = routing.fallbackChain[0];
    if (!winner) {
      console.warn(
        `[providerSync] Skipping legacy plan ${plan.id}: routing returned no eligible supplier for ${normPlan.id}`,
      );
      continue;
    }

    const costDiff = Math.abs((plan.wholesaleCost ?? 0) - winner.wholesalePriceUsd);
    const providerDiff = canonicalProviderKey(plan.provider) !== canonicalProviderKey(winner.providerKey);
    const skuDiff = plan.externalPlanCode !== winner.providerPlanCode;

    if (costDiff > 0.0001 || providerDiff || skuDiff) {
      await db
        .update(plans)
        .set({
          wholesaleCost: winner.wholesalePriceUsd,
          provider: winner.providerKey,
          externalPlanCode: winner.providerPlanCode,
        })
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
  const result = await withProviderSyncLock(
    triggeredBy,
    () => syncAllProvidersInternal(triggeredBy),
  );
  if (result === null) {
    return { status: "skipped", totalOffersUpserted: 0, plansUpdated: 0, durationMs: 0, errors: [] } as any;
  }
  return result;
}

async function syncAllProvidersInternal(
  triggeredBy: "auto" | "manual",
): Promise<SyncSummary> {
  const startedAt = Date.now();
  const [logRow] = await db
    .insert(providerSyncRuns)
    .values({ triggeredBy, status: "running", startedAt: new Date(startedAt) })
    .returning({ id: providerSyncRuns.id });
  const logId = logRow.id;

  // ── Ensure canonical provider rows exist ─────────────────────────────────
  // This seeds the providers table on first run so plans can always be filtered
  // by provider status. Uses ON CONFLICT DO NOTHING to preserve any existing
  // enabled/priority settings that an admin may have configured.
  // Priority order (1 = highest routing score, each step down = −20 pts in blended score):
  //   1. Airalo     — widest coverage (212 destinations), cheapest wholesale, 23 exclusive destinations
  //   2. eSIM Access — enterprise carrier depth (30+ tier-1 MNOs), reliable API, 181 destinations
  //   3. eSIMGo     — fast safety-net, best unit price ($5.25 avg), 58 destinations in catalogue
  //   4. Zendit     — last-resort fallback; 12 exclusive destinations but 3× more expensive
  const CANONICAL_PROVIDERS = [
    { key: "airalo",     name: "Airalo",       priority: 1 },
    { key: "esimaccess", name: "eSIM Access",  priority: 2 },
    { key: "esimgo",     name: "eSIMGo",       priority: 3 },
    { key: "zendit",     name: "Zendit",       priority: 4 },
  ];
  for (const p of CANONICAL_PROVIDERS) {
    await db.execute(sql`
      INSERT INTO providers (key, name, enabled, priority, health_status, auto_paused, created_at, updated_at)
      VALUES (${p.key}, ${p.name}, true, ${p.priority}, 'unknown', false, NOW(), NOW())
      ON CONFLICT (key) DO NOTHING
    `);
  }

  const results: ProviderSyncResult[] = [];
  let totalOffersUpserted = 0;
  let totalPriceChanges = 0;
  const failedProviders: string[] = [];

  // ── Build comprehensive country list ──────────────────────────────────────
  // Use the union of:
  //   a) all countries in the destinations table (legacy)
  //   b) all region_codes in normalized_plans with active offers
  //      (covers countries synced by Zendit / eSIMGo that aren't in destinations)
  // This ensures eSIM Access is queried for all countries we carry plans for.
  const destRows = await db
    .select({ countryCode: destinations.countryCode })
    .from(destinations);
  const normCodeRows = await db.execute<{ region_code: string }>(sql`
    SELECT DISTINCT np.region_code
    FROM normalized_plans np
    JOIN provider_offers po ON po.normalized_plan_id = np.id
    WHERE po.is_active = true
      AND length(np.region_code) BETWEEN 2 AND 3
  `);
  const allCodes = new Set<string>([
    ...destRows.map(r => r.countryCode.toUpperCase()),
    ...normCodeRows.rows.map(r => r.region_code.toUpperCase()),
  ]);
  const countryCodes = [...allCodes].sort();

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

  // ── Airalo (per-country batch, same country list) ─────────────────────────
  if (airalo.isConfigured()) {
    try {
      console.log(`[providerSync] Fetching Airalo plans for ${countryCodes.length} countries...`);
      const fetched = await airalo.getAllPackages(countryCodes);
      console.log(`[providerSync] Airalo: ${fetched.length} plans`);
      const { offersUpserted, priceChanges } = await processProviderPlans(fetched, "airalo");
      totalOffersUpserted += offersUpserted;
      totalPriceChanges += priceChanges;
      results.push({ providerKey: "airalo", success: true, plansFound: fetched.length, offersUpserted });
    } catch (err: any) {
      console.error("[providerSync] Airalo sync failed:", err.message);
      failedProviders.push("airalo");
      results.push({ providerKey: "airalo", success: false, plansFound: 0, offersUpserted: 0, error: err.message });
    }
  } else {
    console.log("[providerSync] Airalo: not configured (AIRALO_CLIENT_ID/SECRET missing) — skipped");
    results.push({ providerKey: "airalo", success: false, plansFound: 0, offersUpserted: 0, error: "Not configured" });
  }

  // ── Backfill retail prices for normalized plans that have retailPriceUsd=0 ──
  // This fixes plans created before the providerSync fix landed, so the routing
  // engine immediately sees realistic margin scores without waiting for re-sync.
  const { plansUpdated: retroPriced } = await backfillNormalizedPlanRetailPrices();
  if (retroPriced > 0) {
    console.log(`[providerSync] Backfilled retail prices for ${retroPriced} normalized plan(s) that had retailPriceUsd=0`);
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

/**
 * Ensure the unique indexes needed for bulk upserts exist in the database.
 * Uses CREATE UNIQUE INDEX IF NOT EXISTS so it's safe to run on every startup
 * in both dev and production.
 */
async function ensureSyncIndexes(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS normalized_plans_region_data_validity_uniq
        ON normalized_plans (region_code, data_mb, validity_days)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS provider_offers_plan_provider_code_uniq
        ON provider_offers (normalized_plan_id, provider_key, provider_plan_code)
    `);
    console.log("[providerSync] Sync indexes verified");
  } catch (err: any) {
    console.error("[providerSync] Failed to ensure sync indexes:", err.message);
  }
}

let _schedulerStarted = false;
let _syncRunning     = false;

/**
 * Serialize sync runs and always release the process-local guard, including
 * database/provider failures. Kept as a small exported seam for regression
 * tests; the real sync uses this same lock.
 */
export async function withProviderSyncLock<T>(
  triggeredBy: "auto" | "manual",
  task: () => Promise<T>,
): Promise<T | null> {
  if (_syncRunning && triggeredBy === "auto") {
    console.warn("[providerSync] Previous sync still running — skipping this scheduled run to avoid overlap");
    return null;
  }
  _syncRunning = true;
  try {
    return await task();
  } finally {
    _syncRunning = false;
  }
}

/**
 * Mark any sync runs that were left in "running" state (e.g. from a server
 * crash or restart) as "failed" so they don't linger in the dashboard.
 */
async function cleanupOrphanedSyncRuns(): Promise<void> {
  try {
    const result = await db
      .update(providerSyncRuns)
      .set({ status: "failed", errorMessage: "Interrupted by server restart", completedAt: new Date() })
      .where(eq(providerSyncRuns.status, "running"))
      .returning({ id: providerSyncRuns.id });
    if (result.length > 0) {
      console.log(`[providerSync] Cleaned up ${result.length} orphaned sync run(s) left in "running" state`);
    }
  } catch (err: any) {
    console.warn("[providerSync] Orphan cleanup failed (non-fatal):", err.message);
  }
}

/**
 * Start the background sync scheduler.
 * Initial sync after 60s, then every 30 minutes.
 * Airalo requires syncing at least every 60 minutes; each sync takes ~15 minutes,
 * so a 30-minute interval guarantees completions are always within ~45 minutes of each other.
 */
export function startProviderSyncScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  const INTERVAL_MS   = 30 * 60 * 1000; // 30 minutes
  const INITIAL_DELAY = 60 * 1000;       // 60 seconds after startup

  // Clean up any orphaned "running" records from a previous server instance
  cleanupOrphanedSyncRuns().catch(() => {});

  // Ensure indexes exist before first sync (idempotent, safe in prod too)
  ensureSyncIndexes().catch(err =>
    console.error("[providerSync] Index setup failed:", err.message),
  );

  setTimeout(async () => {
    console.log("[providerSync] Running initial scheduled sync...");
    await syncAllProviders("auto").catch(err =>
      console.error("[providerSync] Initial sync failed:", err.message, err.stack),
    );
    setInterval(async () => {
      console.log("[providerSync] Running scheduled sync (every 30 min)...");
      await syncAllProviders("auto").catch(err =>
        console.error("[providerSync] Scheduled sync failed:", err.message),
      );
    }, INTERVAL_MS);
  }, INITIAL_DELAY);

  console.log("[providerSync] Scheduler registered (first run in 60s, then every 30min)");
}
