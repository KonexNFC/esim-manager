// ─── Synthetic Bundler ────────────────────────────────────────────────────────
// When a country lacks native 3-day, 5-day, or 7-day plans from a supplier,
// this module synthesises them by repeating DAY_1 plans.
//
// Rules:
//   DAY_3 = 3 × DAY_1 from the same supplier (same country, same data type)
//   DAY_5 = 5 × DAY_1
//   DAY_7 = 7 × DAY_1
//
// Synthetic bundles are marked isSynthetic=true and carry a supplierPlanIds
// trace back to their source plan(s).

import {
  DurationBucket,
  NormalizedOffer,
  OfferType,
  Visibility,
} from "./supplier-plan.types";

/** Multiplier applied to DAY_1 cost when building each synthetic bucket */
const BUNDLE_MULTIPLIER: Record<DurationBucket, number> = {
  [DurationBucket.DAY_1]: 1,
  [DurationBucket.DAY_3]: 3,
  [DurationBucket.DAY_5]: 5,
  [DurationBucket.DAY_7]: 7,
};

/** Which target buckets can be synthesised (DAY_1 cannot be synthetic) */
const SYNTHETIC_TARGETS: DurationBucket[] = [
  DurationBucket.DAY_3,
  DurationBucket.DAY_5,
  DurationBucket.DAY_7,
];

/**
 * Group offers by countryCode + supplier + offerType so we can check
 * per-supplier coverage and bundle from the right source.
 */
function groupByKey(
  offers: NormalizedOffer[]
): Map<string, Map<DurationBucket, NormalizedOffer[]>> {
  const result = new Map<string, Map<DurationBucket, NormalizedOffer[]>>();

  for (const offer of offers) {
    const key = `${offer.countryCode}::${offer.supplier}::${offer.offerType}`;
    if (!result.has(key)) result.set(key, new Map());
    const byBucket = result.get(key)!;
    if (!byBucket.has(offer.bucket)) byBucket.set(offer.bucket, []);
    byBucket.get(offer.bucket)!.push(offer);
  }

  return result;
}

/**
 * Pick the best (cheapest wholesale) DAY_1 offer for a given supplier+type.
 * Cheapest source = lowest synthetic bundle cost.
 */
function pickBestDay1(offers: NormalizedOffer[]): NormalizedOffer | null {
  const day1 = offers.filter((o) => o.bucket === DurationBucket.DAY_1);
  if (day1.length === 0) return null;
  return day1.sort((a, b) => a.wholesaleCostUsd - b.wholesaleCostUsd)[0];
}

/**
 * Build a synthetic bundle for a given target bucket from a DAY_1 source plan.
 */
function buildSyntheticBundle(
  source: NormalizedOffer,
  targetBucket: DurationBucket
): NormalizedOffer {
  const multiplier = BUNDLE_MULTIPLIER[targetBucket];
  const syntheticId = `synthetic::${source.id}::${targetBucket}`;

  return {
    ...source,
    id: syntheticId,
    bucket: targetBucket,
    isSynthetic: true,
    supplierPlanIds: [source.id],
    wholesaleCostUsd: source.wholesaleCostUsd * multiplier,
    // Pricing / scoring reset — will be computed by later pipeline stages
    sellPriceGbp: 0,
    marginGbp: 0,
    marginPercent: 0,
    inTargetBand: false,
    score: 0,
    recommendationRole: null,
    // Data stays the same type (unlimited stays unlimited; fixed data amount
    // stays the same since synthetic bundles represent separate SIMs, each
    // with the same data quota, bundled for convenience pricing)
  };
}

/**
 * Generate synthetic bundles for all countries and suppliers that are missing
 * native 3/5/7-day plans.
 *
 * Only PUBLIC-visibility offers are considered as sources so that internal
 * bulk plans don't accidentally back a travel product.
 *
 * Returns ONLY the newly generated synthetic offers (not the original list).
 * Merge the result with the original list in the caller.
 */
export function generateSyntheticBundles(
  offers: NormalizedOffer[]
): NormalizedOffer[] {
  const publicOffers = offers.filter((o) => o.visibility === Visibility.PUBLIC);
  const grouped = groupByKey(publicOffers);
  const synthetics: NormalizedOffer[] = [];

  for (const [, byBucket] of grouped) {
    const source = pickBestDay1([...byBucket.values()].flat());
    if (!source) continue; // no DAY_1 available for this supplier/type

    for (const target of SYNTHETIC_TARGETS) {
      // Only synthesise if this supplier+type has no native plan for this bucket
      const hasNative = byBucket.has(target) && byBucket.get(target)!.length > 0;
      if (!hasNative) {
        synthetics.push(buildSyntheticBundle(source, target));
      }
    }
  }

  return synthetics;
}

/**
 * Check whether a country's offer set has native coverage for all four
 * standard travel durations (ignoring synth offers).
 * Useful for debugging and the /api/debug/ladder endpoint.
 */
export function getNativeCoverage(
  countryCode: string,
  offers: NormalizedOffer[]
): Partial<Record<DurationBucket, boolean>> {
  const native = offers.filter(
    (o) =>
      o.countryCode === countryCode &&
      !o.isSynthetic &&
      o.visibility === Visibility.PUBLIC
  );
  return {
    [DurationBucket.DAY_1]: native.some((o) => o.bucket === DurationBucket.DAY_1),
    [DurationBucket.DAY_3]: native.some((o) => o.bucket === DurationBucket.DAY_3),
    [DurationBucket.DAY_5]: native.some((o) => o.bucket === DurationBucket.DAY_5),
    [DurationBucket.DAY_7]: native.some((o) => o.bucket === DurationBucket.DAY_7),
  };
}
