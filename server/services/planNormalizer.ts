// ─── Plan Normalizer ──────────────────────────────────────────────────────────
// Ensures provider offers map cleanly onto canonical normalized plans.
//
// Problem: Different providers express "1 GB" differently:
//   • eSIMGo uses SI units:     1 GB = 1000 MB → data_mb=1000
//   • Zendit/eSIM Access use binary: 1 GB = 1024 MiB → data_mb=1024
//
// This results in duplicate normalized plans for the same logical plan,
// preventing multi-provider routing from working.
//
// Solution:
//   1. Define standard canonical MB tiers (binary, powers-of-2 GB)
//   2. quantizeDataMb() maps any raw value to the nearest canonical tier
//   3. remapExistingOffers() fixes historical data in the DB
//   4. providerSync.ts calls quantizeDataMb() on every incoming plan

import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { db } from "../storage";
import { normalizedPlans, providerOffers, orders, routingDecisions } from "@shared/schema";
import { getCountryInfo } from "./countryData";

// ─── Tier definitions ─────────────────────────────────────────────────────────

interface DataTier {
  /** Lower bound (inclusive) in MB. */
  min: number;
  /** Upper bound (inclusive) in MB. */
  max: number;
  /** Canonical MB value this tier maps to. */
  canonicalMb: number;
}

/**
 * All standard data tiers, ordered from smallest to largest.
 * Any raw dataMb value that falls in [min, max] is snapped to canonicalMb.
 * Values outside all ranges are kept as-is (no quantization).
 */
export const DATA_TIERS: DataTier[] = [
  { min:    1, max:   149, canonicalMb:     100 }, // ~100 MB
  { min:  150, max:   249, canonicalMb:     200 }, // ~200 MB
  { min:  250, max:   449, canonicalMb:     300 }, // ~300 MB
  { min:  450, max:   799, canonicalMb:     500 }, // ~500 MB
  { min:  800, max:  1100, canonicalMb:    1024 }, // 1 GB  ← catches 1000 MB (SI)
  { min: 1101, max:  1700, canonicalMb:    1536 }, // 1.5 GB
  { min: 1701, max:  2200, canonicalMb:    2048 }, // 2 GB
  { min: 2201, max:  3600, canonicalMb:    3072 }, // 3 GB
  { min: 3601, max:  4600, canonicalMb:    4096 }, // 4 GB
  { min: 4601, max:  5700, canonicalMb:    5120 }, // 5 GB
  { min: 5701, max:  8500, canonicalMb:    7168 }, // 7 GB
  { min: 8501, max: 11500, canonicalMb:   10240 }, // 10 GB
  { min:11501, max: 17000, canonicalMb:   15360 }, // 15 GB
  { min:17001, max: 22500, canonicalMb:   20480 }, // 20 GB
  { min:22501, max: 27500, canonicalMb:   25600 }, // 25 GB
  { min:27501, max: 55000, canonicalMb:   51200 }, // 50 GB
  { min:55001, max:110000, canonicalMb:  102400 }, // 100 GB
  { min:110001, max: 999998, canonicalMb: 999999 }, // >100 GB → unlimited
  { min:999999, max: Infinity, canonicalMb: 999999 }, // already unlimited
];

/**
 * Snap a raw dataMb value to the nearest canonical tier.
 * Returns the raw value unchanged if it already matches a canonical tier
 * or no tier claims it.
 */
export function quantizeDataMb(rawMb: number): number {
  if (rawMb >= 999999) return 999999;
  for (const tier of DATA_TIERS) {
    if (rawMb >= tier.min && rawMb <= tier.max) return tier.canonicalMb;
  }
  return rawMb; // keep as-is if not covered
}

// ─── Plan name formatting ─────────────────────────────────────────────────────

/**
 * Generate a standardized, human-readable plan name.
 * Examples:
 *   "United Kingdom 1 GB / 7 Days"
 *   "France 30 Days Unlimited"
 *   "Japan 500 MB / 3 Days"
 */
export function formatPlanName(
  regionCode: string,
  dataMb: number,
  validityDays: number,
): string {
  const meta = getCountryInfo(regionCode);
  const countryLabel = meta?.name ?? regionCode;

  let dataLabel: string;
  if (dataMb >= 999999) {
    dataLabel = "Unlimited";
  } else if (dataMb >= 1024 && dataMb % 1024 === 0) {
    const gb = dataMb / 1024;
    dataLabel = gb === Math.floor(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`;
  } else if (dataMb >= 1000) {
    const gb = dataMb / 1024;
    dataLabel = `${Math.round(gb * 10) / 10} GB`;
  } else {
    dataLabel = `${dataMb} MB`;
  }

  const dayLabel = `${validityDays} ${validityDays === 1 ? "Day" : "Days"}`;

  if (dataMb >= 999999) {
    return `${countryLabel} ${dayLabel} Unlimited`;
  }
  return `${countryLabel} ${dataLabel} / ${dayLabel}`;
}

// ─── Remap stats ──────────────────────────────────────────────────────────────

export interface RemapStats {
  orphanPlansFound: number;     // normalized plans with 0 active offers
  siPlansFound: number;         // non-canonical dataMb plans that need quantization
  mergesNeeded: number;         // SI plan has a canonical counterpart → merge
  renames: number;              // SI plan has no counterpart → rename in-place
  offersAffected: number;       // total provider_offers to be re-linked
  plansToDelete: number;        // normalized_plans that will be removed
}

/** Dry-run: count what remapExistingOffers would change. */
export async function getRemapStats(): Promise<RemapStats> {
  const allPlans = await db.select().from(normalizedPlans);

  // Build a lookup: (regionCode, dataMb, validityDays) → planId
  const canonicalKey = (r: string, d: number, v: number) => `${r}__${d}__${v}`;
  const canonicalMap = new Map<string, string>();
  for (const p of allPlans) {
    const q = quantizeDataMb(p.dataMb);
    if (q === p.dataMb) {
      canonicalMap.set(canonicalKey(p.regionCode, p.dataMb, p.validityDays), p.id);
    }
  }

  let orphanPlansFound = 0;
  let siPlansFound = 0;
  let mergesNeeded = 0;
  let renames = 0;
  let offersAffected = 0;
  let plansToDelete = 0;

  const offerCounts = await db.execute<{ normalized_plan_id: string; cnt: string }>(sql`
    SELECT normalized_plan_id, COUNT(*)::int AS cnt
    FROM provider_offers WHERE is_active = true
    GROUP BY normalized_plan_id
  `);
  const offerCountMap = new Map(offerCounts.rows.map(r => [r.normalized_plan_id, Number(r.cnt)]));

  for (const p of allPlans) {
    const cnt = offerCountMap.get(p.id) ?? 0;
    if (cnt === 0) {
      orphanPlansFound++;
      plansToDelete++;
      continue;
    }
    const q = quantizeDataMb(p.dataMb);
    if (q !== p.dataMb) {
      siPlansFound++;
      offersAffected += cnt;
      const targetId = canonicalMap.get(canonicalKey(p.regionCode, q, p.validityDays));
      if (targetId) {
        mergesNeeded++;
        plansToDelete++;
      } else {
        renames++;
      }
    }
  }

  return { orphanPlansFound, siPlansFound, mergesNeeded, renames, offersAffected, plansToDelete };
}

// ─── Remap implementation ─────────────────────────────────────────────────────

export interface RemapResult {
  orphansDeleted: number;
  offersRelinked: number;
  plansMergedAndDeleted: number;
  plansRenamedInPlace: number;
  namesUpdated: number;
  errors: string[];
  durationMs: number;
}

/**
 * Fix all existing normalized plans so that:
 *   1. Orphan plans (0 offers) are removed.
 *   2. SI-unit plans (e.g. data_mb=1000) are merged into canonical plans
 *      (data_mb=1024) for the same (regionCode, validityDays).
 *      All provider_offers, orders, and routing_decisions FK refs are updated.
 *   3. If no canonical counterpart exists, the plan is renamed in-place.
 *   4. All normalized plan names are updated to the standard format.
 */
export async function remapExistingOffers(): Promise<RemapResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  let orphansDeleted = 0;
  let offersRelinked = 0;
  let plansMergedAndDeleted = 0;
  let plansRenamedInPlace = 0;
  let namesUpdated = 0;

  // ── Step 0: Normalise provider keys (esimAccess → esimaccess) ─────────────
  // Historical data may have been inserted with the wrong key casing.
  // The canonical key used by the routing engine and sync code is lowercase.
  const KEY_RENAMES: Array<[string, string]> = [
    ["esimAccess", "esimaccess"],
  ];
  for (const [oldKey, newKey] of KEY_RENAMES) {
    await db.execute(sql`
      UPDATE provider_offers SET provider_key = ${newKey}
      WHERE provider_key = ${oldKey}
    `);
    await db.execute(sql`
      UPDATE providers SET key = ${newKey}
      WHERE key = ${oldKey}
    `);
    await db.execute(sql`
      UPDATE provider_attempts SET provider_key = ${newKey}
      WHERE provider_key = ${oldKey}
    `);
    await db.execute(sql`
      UPDATE routing_decisions SET selected_provider_key = ${newKey}
      WHERE selected_provider_key = ${oldKey}
    `);
    await db.execute(sql`
      UPDATE destination_provider_stats SET provider_key = ${newKey}
      WHERE provider_key = ${oldKey}
    `);
  }

  // ── Step 1: Gather all plans + offer counts ──────────────────────────────
  const allPlans = await db.select().from(normalizedPlans);

  const offerCountsRaw = await db.execute<{ normalized_plan_id: string; cnt: string }>(sql`
    SELECT normalized_plan_id, COUNT(*)::int AS cnt
    FROM provider_offers WHERE is_active = true
    GROUP BY normalized_plan_id
  `);
  const offerCountMap = new Map(offerCountsRaw.rows.map(r => [r.normalized_plan_id, Number(r.cnt)]));

  // Build canonical lookup: (regionCode, canonicalMb, validityDays) → id
  // Only populated with plans that ARE already canonical (dataMb == quantized).
  const canonicalMap = new Map<string, string>();
  const canonicalKey = (r: string, d: number, v: number) => `${r}__${d}__${v}`;

  for (const p of allPlans) {
    if (quantizeDataMb(p.dataMb) === p.dataMb && (offerCountMap.get(p.id) ?? 0) > 0) {
      // prefer the plan with more offers when there are ties
      const existing = canonicalMap.get(canonicalKey(p.regionCode, p.dataMb, p.validityDays));
      if (!existing) {
        canonicalMap.set(canonicalKey(p.regionCode, p.dataMb, p.validityDays), p.id);
      }
    }
  }

  // ── Step 2: Delete orphan plans (0 active offers) ─────────────────────────
  const orphanIds = allPlans
    .filter(p => (offerCountMap.get(p.id) ?? 0) === 0)
    .map(p => p.id);

  if (orphanIds.length > 0) {
    // Safe to delete — no active offers reference them
    // (Inactive offers might, but we'll cascade-handle below)
    try {
      // First nullify any routing_decision references
      await db.execute(sql`
        UPDATE routing_decisions SET normalized_plan_id = NULL
        WHERE normalized_plan_id = ANY(${orphanIds}::varchar[])
      `);
      // Nullify any order references
      await db.execute(sql`
        UPDATE orders SET normalized_plan_id = NULL
        WHERE normalized_plan_id = ANY(${orphanIds}::varchar[])
      `);
      // Delete any inactive offers pointing to these plans
      await db.execute(sql`
        DELETE FROM provider_offers
        WHERE normalized_plan_id = ANY(${orphanIds}::varchar[])
      `);
      // Now delete the orphan plans
      await db.execute(sql`
        DELETE FROM normalized_plans
        WHERE id = ANY(${orphanIds}::varchar[])
      `);
      orphansDeleted = orphanIds.length;
    } catch (err: any) {
      errors.push(`Orphan deletion error: ${err.message}`);
    }
  }

  // Re-fetch allPlans after deletions
  const remainingPlans = await db.select().from(normalizedPlans);

  // ── Step 3: Merge SI-unit plans into canonical plans ───────────────────────
  for (const plan of remainingPlans) {
    const canonicalMb = quantizeDataMb(plan.dataMb);
    if (canonicalMb === plan.dataMb) continue; // already canonical — skip

    const targetId = canonicalMap.get(canonicalKey(plan.regionCode, canonicalMb, plan.validityDays));

    try {
      if (targetId) {
        // ── Merge: move all offers to canonical plan ─────────────────────
        // Get offers on the SI plan
        const siOffers = await db
          .select()
          .from(providerOffers)
          .where(eq(providerOffers.normalizedPlanId, plan.id));

        for (const offer of siOffers) {
          // Check if canonical plan already has this providerKey+planCode
          const [dup] = await db
            .select({ id: providerOffers.id })
            .from(providerOffers)
            .where(
              and(
                eq(providerOffers.normalizedPlanId, targetId),
                eq(providerOffers.providerKey, offer.providerKey),
                eq(providerOffers.providerPlanCode, offer.providerPlanCode),
              ),
            )
            .limit(1);

          if (dup) {
            // Duplicate: just delete the SI offer (canonical already has it)
            await db.delete(providerOffers).where(eq(providerOffers.id, offer.id));
          } else {
            // Reassign to canonical plan
            await db
              .update(providerOffers)
              .set({ normalizedPlanId: targetId, updatedAt: new Date() })
              .where(eq(providerOffers.id, offer.id));
            offersRelinked++;
          }
        }

        // Update FK references in orders
        await db.execute(sql`
          UPDATE orders SET normalized_plan_id = ${targetId}
          WHERE normalized_plan_id = ${plan.id}
        `);

        // Update FK references in routing_decisions
        await db.execute(sql`
          UPDATE routing_decisions SET normalized_plan_id = ${targetId}
          WHERE normalized_plan_id = ${plan.id}
        `);

        // Delete the now-empty SI plan
        await db.delete(normalizedPlans).where(eq(normalizedPlans.id, plan.id));
        plansMergedAndDeleted++;
      } else {
        // ── Rename in-place: update dataMb + name + is_unlimited ─────────
        const newName = formatPlanName(plan.regionCode, canonicalMb, plan.validityDays);
        await db
          .update(normalizedPlans)
          .set({
            dataMb: canonicalMb,
            isUnlimited: canonicalMb >= 999999,
            name: newName,
            updatedAt: new Date(),
          })
          .where(eq(normalizedPlans.id, plan.id));

        // Register the renamed plan as canonical for future iterations
        canonicalMap.set(canonicalKey(plan.regionCode, canonicalMb, plan.validityDays), plan.id);

        plansRenamedInPlace++;
      }
    } catch (err: any) {
      errors.push(`Remap error for plan ${plan.id} (${plan.regionCode} ${plan.dataMb}MB/${plan.validityDays}d): ${err.message}`);
    }
  }

  // ── Step 4: Standardize ALL remaining plan names ──────────────────────────
  const finalPlans = await db.select().from(normalizedPlans);
  for (const plan of finalPlans) {
    const newName = formatPlanName(plan.regionCode, plan.dataMb, plan.validityDays);
    if (plan.name !== newName) {
      try {
        await db
          .update(normalizedPlans)
          .set({ name: newName, updatedAt: new Date() })
          .where(eq(normalizedPlans.id, plan.id));
        namesUpdated++;
      } catch (err: any) {
        errors.push(`Name update error for ${plan.id}: ${err.message}`);
      }
    }
  }

  // ── Step 5: Fix is_unlimited flag for any plans where flag is wrong ───────
  await db.execute(sql`
    UPDATE normalized_plans
    SET is_unlimited = true, updated_at = NOW()
    WHERE data_mb >= 999999 AND is_unlimited = false
  `);
  await db.execute(sql`
    UPDATE normalized_plans
    SET is_unlimited = false, updated_at = NOW()
    WHERE data_mb < 999999 AND is_unlimited = true
  `);

  return {
    orphansDeleted,
    offersRelinked,
    plansMergedAndDeleted,
    plansRenamedInPlace,
    namesUpdated,
    errors,
    durationMs: Date.now() - t0,
  };
}
