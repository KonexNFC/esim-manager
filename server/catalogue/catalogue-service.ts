// ─── Catalogue Service ────────────────────────────────────────────────────────
// Main orchestration layer. Accepts raw supplier plans and returns a fully
// normalised, priced, scored, and labelled destination catalogue.
//
// Public pipeline:
//   1. filterPublicEligiblePlans   – remove hidden/bulk/disabled plans
//   2. normalizeAllPlans           – map to NormalizedOffer[]
//   3. generateSyntheticBundles    – fill missing 3/5/7-day gaps
//   4. priceOffers                 – compute GBP sell prices + margins
//   5. scoreAndSortOffers          – compute tourist-suitability scores
//   6. assignRecommendations       – tag RECOMMENDED / CHEAPER / PREMIUM
//   7. buildCatalogue              – assemble DestinationCatalogue response
//
// Internal pipeline skips step 1 so bulk/M2M plans are visible.

import { getNativeCoverage, generateSyntheticBundles } from "./synthetic-bundler";
import { filterPublicEligiblePlans, normalizeAllPlans } from "./normalizer";
import { priceOffers, validatePriceLadder } from "./pricing-engine";
import { scoreAndSortOffers } from "./scoring-engine";
import { assignRecommendations } from "./recommendation-engine";
import {
  DestinationCatalogue,
  DurationBucket,
  DurationSlot,
  LadderValidationResult,
  NormalizedOffer,
  RecommendationRole,
  SupplierPlan,
  Visibility,
} from "./supplier-plan.types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Standard travel duration order — always presented in this sequence */
const STANDARD_DURATIONS: DurationBucket[] = [
  DurationBucket.DAY_1,
  DurationBucket.DAY_3,
  DurationBucket.DAY_5,
  DurationBucket.DAY_7,
];

// ─── Pipeline helpers ─────────────────────────────────────────────────────────

/** Run the full normalisation + pricing + scoring + recommendation pipeline */
function runPipeline(
  rawPlans: SupplierPlan[],
  publicOnly: boolean
): NormalizedOffer[] {
  const eligible = publicOnly
    ? filterPublicEligiblePlans(rawPlans)
    : rawPlans; // internal view: include everything

  const normalized = normalizeAllPlans(eligible);
  const synthetics  = generateSyntheticBundles(normalized);
  const allOffers   = [...normalized, ...synthetics];
  const priced      = priceOffers(allOffers);
  const scored      = scoreAndSortOffers(priced);
  return assignRecommendations(scored);
}

/** Build the DurationSlot for one bucket from a pre-processed offer list */
function buildSlot(
  bucket: DurationBucket,
  offers: NormalizedOffer[]
): DurationSlot {
  const bucketOffers = offers.filter(
    (o) => o.bucket === bucket && o.visibility === Visibility.PUBLIC
  );

  return {
    bucket,
    recommended: bucketOffers.find((o) => o.recommendationRole === RecommendationRole.RECOMMENDED) ?? null,
    cheaper:     bucketOffers.find((o) => o.recommendationRole === RecommendationRole.CHEAPER)     ?? null,
    premium:     bucketOffers.find((o) => o.recommendationRole === RecommendationRole.PREMIUM)     ?? null,
    browseAll:   bucketOffers.filter((o) => o.recommendationRole === RecommendationRole.BROWSE_ALL),
  };
}

/** Determine the default duration (DAY_3 when available, else first available) */
function pickDefaultDuration(
  available: DurationBucket[]
): DurationBucket {
  return available.includes(DurationBucket.DAY_3)
    ? DurationBucket.DAY_3
    : available[0] ?? DurationBucket.DAY_1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the public destination catalogue for a single country.
 * Only TRAVEL-category, active plans are included.
 * M2M, M2D, and other bulk categories are excluded.
 */
export function buildPublicCatalogue(
  countryCode: string,
  rawPlans: SupplierPlan[]
): DestinationCatalogue {
  const countryPlans = rawPlans.filter((p) => p.countryCode === countryCode);
  const processed    = runPipeline(countryPlans, true);

  const availableDurations = STANDARD_DURATIONS.filter((bucket) =>
    processed.some((o) => o.bucket === bucket && o.visibility === Visibility.PUBLIC)
  );

  const durations: Partial<Record<DurationBucket, DurationSlot>> = {};
  for (const bucket of availableDurations) {
    durations[bucket] = buildSlot(bucket, processed);
  }

  return {
    countryCode,
    defaultDuration: pickDefaultDuration(availableDurations),
    availableDurations,
    durations,
  };
}

/**
 * Build the internal catalogue for a single country.
 * Includes all categories (TRAVEL, M2M_BULK, M2D_BULK, etc.).
 * M2M / M2D plans are marked Visibility.INTERNAL and have no recommendation roles.
 */
export function buildInternalCatalogue(
  countryCode: string,
  rawPlans: SupplierPlan[]
): {
  countryCode: string;
  publicCatalogue: DestinationCatalogue;
  internalOffers: NormalizedOffer[];
  allOffers: NormalizedOffer[];
  nativeCoverage: Partial<Record<DurationBucket, boolean>>;
} {
  const countryPlans = rawPlans.filter((p) => p.countryCode === countryCode);
  const processed    = runPipeline(countryPlans, false);

  const publicProcessed = processed.filter((o) => o.visibility === Visibility.PUBLIC);
  const internalOffers  = processed.filter((o) => o.visibility !== Visibility.PUBLIC);

  const availableDurations = STANDARD_DURATIONS.filter((bucket) =>
    publicProcessed.some((o) => o.bucket === bucket)
  );

  const durations: Partial<Record<DurationBucket, DurationSlot>> = {};
  for (const bucket of availableDurations) {
    durations[bucket] = buildSlot(bucket, publicProcessed);
  }

  const publicCatalogue: DestinationCatalogue = {
    countryCode,
    defaultDuration: pickDefaultDuration(availableDurations),
    availableDurations,
    durations,
  };

  return {
    countryCode,
    publicCatalogue,
    internalOffers,
    allOffers: processed,
    nativeCoverage: getNativeCoverage(countryCode, processed),
  };
}

/**
 * Build the price-ladder debug report for a country.
 * Shows the representative unlimited and fixed sell prices per bucket and
 * flags any ladder violations.
 */
export function buildLadderReport(
  countryCode: string,
  rawPlans: SupplierPlan[]
): {
  countryCode: string;
  unlimited: LadderValidationResult;
  fixed: LadderValidationResult;
  nativeCoverage: Partial<Record<DurationBucket, boolean>>;
  syntheticBuckets: DurationBucket[];
  offers: Pick<
    NormalizedOffer,
    | "id"
    | "bucket"
    | "offerType"
    | "sellPriceGbp"
    | "marginGbp"
    | "marginPercent"
    | "inTargetBand"
    | "isSynthetic"
    | "score"
    | "recommendationRole"
  >[];
} {
  const countryPlans = rawPlans.filter((p) => p.countryCode === countryCode);
  const processed    = runPipeline(countryPlans, false);
  const publicOffers = processed.filter((o) => o.visibility === Visibility.PUBLIC);

  // Build representative price per bucket (best unlimited / best fixed)
  const unlimitedPrices: Partial<Record<DurationBucket, number>> = {};
  const fixedPrices:     Partial<Record<DurationBucket, number>> = {};

  for (const bucket of STANDARD_DURATIONS) {
    const inBucket = publicOffers.filter((o) => o.bucket === bucket);
    const unlimitedOffers = inBucket
      .filter((o) => o.offerType === "UNLIMITED" as any)
      .sort((a, b) => b.score - a.score);
    const fixedOffers = inBucket
      .filter((o) => o.offerType !== "UNLIMITED" as any)
      .sort((a, b) => b.score - a.score);

    if (unlimitedOffers.length) unlimitedPrices[bucket] = unlimitedOffers[0].sellPriceGbp;
    if (fixedOffers.length)     fixedPrices[bucket]     = fixedOffers[0].sellPriceGbp;
  }

  const syntheticBuckets = publicOffers
    .filter((o) => o.isSynthetic)
    .map((o) => o.bucket)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    countryCode,
    unlimited: validatePriceLadder(unlimitedPrices),
    fixed:     validatePriceLadder(fixedPrices),
    nativeCoverage: getNativeCoverage(countryCode, processed),
    syntheticBuckets,
    offers: publicOffers.map(
      ({ id, bucket, offerType, sellPriceGbp, marginGbp, marginPercent, inTargetBand, isSynthetic, score, recommendationRole }) => ({
        id, bucket, offerType, sellPriceGbp, marginGbp, marginPercent, inTargetBand, isSynthetic, score, recommendationRole,
      })
    ),
  };
}
