// ─── Plan Matrix Backfill Script ─────────────────────────────────────────────
// Idempotent: safe to run multiple times.
//
// For every country that already has at least one real provider offer, this
// script ensures all 36 target plan combinations exist as normalized_plans
// entries.  Missing combos are created as inactive shells (is_active=false)
// so they are visible in the admin but do NOT appear on the public storefront
// until a real provider offer is linked and the row is activated.
//
// Duplicate check key: (region_code, data_mb, validity_days)
// Retail price: estimated from the per-MB-per-day wholesale rate of the
// cheapest existing offer for that country.

import { db } from "../storage";
import { normalizedPlans, providerOffers, destinations } from "@shared/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { calculateSellPrice } from "../catalogue/pricing-engine";
import { normalizeValidityToBucket, mapOfferType } from "../catalogue/normalizer";
import { DurationBucket, OfferType } from "../catalogue/supplier-plan.types";
import { GBP_RATE } from "../catalogue/pricing-engine";

// ─── Target matrix ───────────────────────────────────────────────────────────

/** Target data sizes in MB (999999 = unlimited sentinel) */
const TARGET_DATA_MB = [1024, 2048, 3072, 5120, 10240, 999999] as const;

/** Human-readable data labels keyed by MB value */
const DATA_LABEL: Record<number, string> = {
  1024:   "1 GB",
  2048:   "2 GB",
  3072:   "3 GB",
  5120:   "5 GB",
  10240:  "10 GB",
  999999: "Unlimited",
};

/** Target validity durations in days */
const TARGET_VALIDITY_DAYS = [1, 3, 5, 7, 14, 30] as const;

// ─── Price estimation ─────────────────────────────────────────────────────────

/**
 * Estimate wholesale USD cost for a target (dataMb, validityDays) combo given
 * a map of existing wholesale rates from the same country.
 *
 * Strategy: derive a "cost per MB per day" rate from the cheapest available
 * offer, then scale to the target size × duration.  For unlimited plans the
 * rate is derived from the cheapest unlimited offer (or from fixed plans with
 * an unlimited-uplift factor).
 */
function estimateWholesale(
  targetDataMb: number,
  targetDays: number,
  offers: Array<{ dataMb: number; validityDays: number; wholesale: number; isUnlimited: boolean }>,
): number | null {
  if (offers.length === 0) return null;

  const isUnlimited = targetDataMb === 999999;

  if (isUnlimited) {
    const unlimitedOffers = offers.filter(o => o.isUnlimited).sort((a, b) => a.wholesale - b.wholesale);
    if (unlimitedOffers.length > 0) {
      // Scale cheapest unlimited offer by day ratio
      const src = unlimitedOffers[0];
      return (src.wholesale / src.validityDays) * targetDays;
    }
    // No unlimited offers — estimate from fixed data, apply 40% uplift
    const fixed = offers.filter(o => !o.isUnlimited && o.dataMb > 0).sort((a, b) => a.wholesale - b.wholesale);
    if (fixed.length === 0) return null;
    const src = fixed[0];
    const ratePerDay = src.wholesale / src.validityDays;
    return ratePerDay * targetDays * 1.4;
  }

  // Fixed data plan: use per-MB-per-day rate
  const fixedOffers = offers
    .filter(o => !o.isUnlimited && o.dataMb > 0)
    .sort((a, b) => a.wholesale - b.wholesale);

  if (fixedOffers.length === 0) {
    // Derive from unlimited offers with a 30% discount
    const unl = offers.filter(o => o.isUnlimited).sort((a, b) => a.wholesale - b.wholesale);
    if (unl.length === 0) return null;
    const src = unl[0];
    const ratePerDay = (src.wholesale * 0.7) / src.validityDays;
    const mbRatio = targetDataMb / 10240; // relative to 10 GB reference
    return ratePerDay * targetDays * mbRatio;
  }

  // Compute median rate per MB per day from up to 5 cheapest offers
  const rates = fixedOffers.slice(0, 5).map(o => o.wholesale / o.dataMb / o.validityDays);
  const medianRate = rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)];
  return medianRate * targetDataMb * targetDays;
}

// ─── Main backfill function ───────────────────────────────────────────────────

export interface BackfillResult {
  countriesScanned:  number;
  countriesSkipped:  number; // no provider data
  plansCreated:      number;
  plansAlreadyExist: number;
  errors:            Array<{ country: string; combo: string; error: string }>;
}

export async function backfillPlanMatrix(): Promise<BackfillResult> {
  const result: BackfillResult = {
    countriesScanned:  0,
    countriesSkipped:  0,
    plansCreated:      0,
    plansAlreadyExist: 0,
    errors:            [],
  };

  // ── 1. Get all countries that have at least one active provider offer ────
  const coveredRows = await db.execute<{ region_code: string }>(sql`
    SELECT DISTINCT np.region_code
    FROM   normalized_plans np
    JOIN   provider_offers  po ON po.normalized_plan_id = np.id
    WHERE  po.is_active = true
      AND  np.is_active = true
      AND  po.wholesale_price_usd > 0
    ORDER  BY np.region_code
  `);

  const countryCodes = coveredRows.rows.map(r => r.region_code);
  result.countriesScanned = countryCodes.length;

  // ── 2. Get destination IDs for each country code ─────────────────────────
  const destRows = await db.select({
    id:          destinations.id,
    countryCode: destinations.countryCode,
  }).from(destinations);

  const destByCode = new Map<string, string>();
  for (const d of destRows) {
    destByCode.set(d.countryCode.toUpperCase(), d.id);
  }

  // ── 3. Process each country ──────────────────────────────────────────────
  for (const countryCode of countryCodes) {
    // Fetch existing wholesale offers for this country
    const offerRows = await db.execute<{
      data_mb: number;
      validity_days: number;
      wholesale: number;
      is_unlimited: boolean;
    }>(sql`
      SELECT
        np.data_mb,
        np.validity_days,
        MIN(po.wholesale_price_usd)::float AS wholesale,
        np.is_unlimited
      FROM   normalized_plans np
      JOIN   provider_offers  po ON po.normalized_plan_id = np.id
      WHERE  np.region_code = ${countryCode}
        AND  po.is_active   = true
        AND  np.is_active   = true
        AND  po.wholesale_price_usd > 0
      GROUP BY np.data_mb, np.validity_days, np.is_unlimited
    `);

    if (offerRows.rows.length === 0) {
      result.countriesSkipped++;
      continue;
    }

    const existingOffers = offerRows.rows.map(r => ({
      dataMb:      Number(r.data_mb),
      validityDays: Number(r.validity_days),
      wholesale:   Number(r.wholesale),
      isUnlimited: Boolean(r.is_unlimited),
    }));

    // Fetch already-existing normalized_plan combos for this country
    const existingRows = await db.execute<{ data_mb: number; validity_days: number }>(sql`
      SELECT data_mb, validity_days
      FROM   normalized_plans
      WHERE  region_code = ${countryCode}
    `);

    const existingSet = new Set(
      existingRows.rows.map(r => `${r.data_mb}|${r.validity_days}`)
    );

    const destId = destByCode.get(countryCode.toUpperCase()) ?? null;

    // ── 4. Generate missing combos ─────────────────────────────────────────
    for (const dataMb of TARGET_DATA_MB) {
      for (const validityDays of TARGET_VALIDITY_DAYS) {
        const key = `${dataMb}|${validityDays}`;

        if (existingSet.has(key)) {
          result.plansAlreadyExist++;
          continue;
        }

        const isUnlimited = dataMb === 999999;

        try {
          // Estimate wholesale cost
          const wholesaleUsd = estimateWholesale(dataMb, validityDays, existingOffers);
          if (wholesaleUsd === null || wholesaleUsd <= 0) {
            result.errors.push({
              country: countryCode,
              combo: key,
              error: "Could not estimate wholesale price",
            });
            continue;
          }

          // Compute retail price via the pricing engine
          const bucket = normalizeValidityToBucket(validityDays) ?? DurationBucket.DAY_30;
          const mockPlan = { isUnlimited, dataMb: isUnlimited ? null : dataMb };
          const offerType: OfferType = isUnlimited
            ? OfferType.UNLIMITED
            : mapOfferType({ isUnlimited: false, dataMb });
          const { sellPriceGbp } = calculateSellPrice(wholesaleUsd, bucket, offerType);
          const retailPriceUsd = sellPriceGbp / GBP_RATE;

          // Build human-readable name
          const dataLabel    = DATA_LABEL[dataMb] ?? `${Math.round(dataMb / 1024)} GB`;
          const planName     = `${countryCode} ${dataLabel} / ${validityDays} Day${validityDays !== 1 ? "s" : ""}`;
          const planType     = isUnlimited ? "unlimited" : "data";

          // Insert the normalized_plan shell
          await db.insert(normalizedPlans).values({
            destinationId:  destId,
            regionCode:     countryCode,
            name:           planName,
            dataMb:         isUnlimited ? 999999 : dataMb,
            validityDays,
            isUnlimited,
            planType,
            retailPriceUsd,
            isActive:       false, // stays inactive until a real provider offer is linked
          });

          result.plansCreated++;
          existingSet.add(key); // prevent double-insert if script is re-run in memory
        } catch (err: any) {
          result.errors.push({
            country: countryCode,
            combo:   key,
            error:   err?.message ?? String(err),
          });
        }
      }
    }
  }

  return result;
}
