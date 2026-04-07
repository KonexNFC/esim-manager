// ─── Catalogue Pricing Engine ─────────────────────────────────────────────────
// Converts internal wholesale USD costs into tourist-facing GBP sell prices.
//
// Pipeline per offer:
//   1. Convert wholesale USD → GBP
//   2. Look up target price band for (bucket, offerType)
//   3. Enforce minimum margin floors (absolute £1.50 and percentage 25%)
//   4. Round to psychological .99 ending
//   5. Flag whether final price sits inside the target band
//
// Cross-offer validation:
//   validatePriceLadder() – ensures 3-day ≥ 1-day ≥ 5-day ≥ 3-day ≥ 7-day

import {
  BucketBands,
  DurationBucket,
  LadderValidationResult,
  NormalizedOffer,
  OfferType,
  PriceBand,
} from "./supplier-plan.types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exchange rate used throughout the catalogue layer. Must match the frontend. */
export const GBP_RATE = 0.79;

/** Minimum absolute gross margin in GBP per sale */
const MIN_MARGIN_GBP = 1.5;

/** Minimum gross margin percentage: (sell - cost) / sell × 100 */
const MIN_MARGIN_PCT = 25;

/**
 * Target price bands for the public storefront.
 * Unlimited should sit 15–45% above its fixed-data equivalent.
 * Adjust these constants to shift the entire pricing structure.
 */
export const TARGET_BANDS: Record<DurationBucket, BucketBands> = {
  [DurationBucket.DAY_1]: {
    unlimited: { min: 4.99, max: 5.99 },
    fixed:     { min: 2.99, max: 4.99 },
  },
  [DurationBucket.DAY_3]: {
    unlimited: { min: 8.99,  max: 11.99 },
    fixed:     { min: 5.99,  max: 8.99  },
  },
  [DurationBucket.DAY_5]: {
    unlimited: { min: 11.99, max: 15.99 },
    fixed:     { min: 8.99,  max: 12.99 },
  },
  [DurationBucket.DAY_7]: {
    unlimited: { min: 14.99, max: 19.99 },
    fixed:     { min: 10.99, max: 15.99 },
  },
};

// ─── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Return the appropriate price band for a given (bucket, offerType) pair.
 * UNLIMITED maps to the unlimited band; all fixed offer types share the fixed band.
 */
export function getTargetBand(bucket: DurationBucket, offerType: OfferType): PriceBand {
  const bands = TARGET_BANDS[bucket];
  return offerType === OfferType.UNLIMITED ? bands.unlimited : bands.fixed;
}

/**
 * Round a raw GBP price up to the nearest .99 psychological price point.
 *
 * Examples:
 *   4.30 → 4.99
 *   4.99 → 4.99
 *   5.00 → 5.99
 *   11.50 → 11.99
 *
 * Uses integer-pence arithmetic to avoid IEEE-754 float precision traps
 * (e.g. Math.round(4.99 × 100) = 499, not 500).
 */
export function roundPsychological(gbp: number): number {
  const pence = Math.round(gbp * 100); // e.g. 499 for £4.99
  const base = Math.floor(pence / 100);
  const rem  = pence % 100;
  // Round up to this integer's .99 if there is any fractional part,
  // otherwise the value is already an integer pound — bump to .99 anyway.
  if (rem <= 99) return base + 0.99;
  return base + 1 + 0.99;
}

/**
 * Calculate the sell price for a single offer.
 *
 * Logic:
 *   1. wholesaleGbp = wholesaleCostUsd × GBP_RATE
 *   2. band = getTargetBand(bucket, offerType)
 *   3. effectiveMin = max(band.min, 25%-margin floor, £1.50 absolute floor)
 *   4. sellPriceGbp = roundPsychological(effectiveMin)
 *   5. inTargetBand = sellPriceGbp ∈ [band.min, band.max]
 */
export function calculateSellPrice(
  wholesaleCostUsd: number,
  bucket: DurationBucket,
  offerType: OfferType
): {
  sellPriceGbp: number;
  marginGbp: number;
  marginPercent: number;
  inTargetBand: boolean;
} {
  const costGbp = wholesaleCostUsd * GBP_RATE;
  const band = getTargetBand(bucket, offerType);

  // Floor driven by percentage margin: sell = cost / (1 - margin%)
  const minByMarginPct = costGbp / (1 - MIN_MARGIN_PCT / 100);

  // Floor driven by absolute margin requirement
  const minByMarginAbs = costGbp + MIN_MARGIN_GBP;

  // Effective minimum is the highest of: target band floor, pct margin, abs margin
  const effectiveMin = Math.max(band.min, minByMarginPct, minByMarginAbs);

  const sellPriceGbp = roundPsychological(effectiveMin);
  const marginGbp = sellPriceGbp - costGbp;
  const marginPercent = (marginGbp / sellPriceGbp) * 100;
  const inTargetBand = sellPriceGbp >= band.min && sellPriceGbp <= band.max;

  return { sellPriceGbp, marginGbp, marginPercent, inTargetBand };
}

/**
 * Apply calculateSellPrice to a list of offers, returning enriched copies.
 * Mutates and returns the same array references for pipeline convenience.
 */
export function priceOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  return offers.map((offer) => {
    const { sellPriceGbp, marginGbp, marginPercent, inTargetBand } =
      calculateSellPrice(offer.wholesaleCostUsd, offer.bucket, offer.offerType);
    return { ...offer, sellPriceGbp, marginGbp, marginPercent, inTargetBand };
  });
}

/**
 * Validate that sell prices form a non-decreasing ladder across duration buckets
 * for a given offerType.
 *
 * A valid ladder satisfies:
 *   DAY_3 price ≥ DAY_1 price
 *   DAY_5 price ≥ DAY_3 price
 *   DAY_7 price ≥ DAY_5 price
 *
 * Only buckets that have at least one offer are compared.
 * Accepts a map of bucket → representative price (e.g. best unlimited in each bucket).
 */
export function validatePriceLadder(
  priceByBucket: Partial<Record<DurationBucket, number>>
): LadderValidationResult {
  const order: DurationBucket[] = [
    DurationBucket.DAY_1,
    DurationBucket.DAY_3,
    DurationBucket.DAY_5,
    DurationBucket.DAY_7,
  ];

  const violations: string[] = [];
  let prevBucket: DurationBucket | null = null;

  for (const bucket of order) {
    const price = priceByBucket[bucket];
    if (price === undefined) continue;

    if (prevBucket !== null) {
      const prevPrice = priceByBucket[prevBucket]!;
      if (price < prevPrice) {
        violations.push(
          `${bucket} (£${price.toFixed(2)}) < ${prevBucket} (£${prevPrice.toFixed(2)}) — ladder broken`
        );
      }
    }

    prevBucket = bucket;
  }

  return {
    isValid: violations.length === 0,
    violations,
    ladder: { ...priceByBucket },
  };
}
