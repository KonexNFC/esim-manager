// ─── Scoring Engine ───────────────────────────────────────────────────────────
// Assigns a numeric score to each offer so the recommendation engine can pick
// the best option per (country, duration bucket) without hard-coded rules.
//
// Score components:
//   + Unlimited priority   (strongest signal — tourists value simplicity)
//   + Price-band fit       (are we competitive / in the sweet spot?)
//   + Margin health        (healthy margin = sustainable product)
//   + Tourist data min     (does the plan meet the expected travel data need?)
//   + Hotspot support      (bonus for versatile plans)
//   − Insufficient data    (penalty: plan won't cover a typical tourist's use)
//   − Overpriced penalty   (penalty: >20% above band max)

import {
  DurationBucket,
  NormalizedOffer,
  OfferType,
} from "./supplier-plan.types";
import { TARGET_BANDS } from "./pricing-engine";

// ─── Minimum public-usable data thresholds ───────────────────────────────────

/**
 * Minimum GB a plan must offer to be considered useful for a traveller
 * in each duration bucket. Plans below this threshold receive a penalty.
 */
export const MIN_TOURIST_DATA_GB: Record<DurationBucket, number> = {
  [DurationBucket.DAY_1]:  1,
  [DurationBucket.DAY_3]:  3,
  [DurationBucket.DAY_5]:  5,
  [DurationBucket.DAY_7]:  7,
  [DurationBucket.DAY_14]: 10,
  [DurationBucket.DAY_30]: 15,
};

// ─── Score weights ────────────────────────────────────────────────────────────

const SCORE = {
  UNLIMITED_PRIORITY:      50,  // strong preference for unlimited
  IN_TARGET_BAND:          20,  // priced competitively
  HEALTHY_MARGIN:          10,  // margin ≥ 40% — healthy and sustainable
  MEETS_MIN_DATA:          10,  // enough data for the trip duration
  HOTSPOT_SUPPORTED:        5,  // useful for tethering / laptop users
  PENALTY_INSUFFICIENT_DATA: -20,  // plan almost certainly useless for trip
  PENALTY_OVERPRICED:        -15,  // >20% above band max — hurts conversion
  PENALTY_THIN_MARGIN:       -10,  // margin < 25% — commercially unsustainable
} as const;

// ─── Core scoring function ────────────────────────────────────────────────────

/**
 * Calculate a composite tourist-suitability score for a single normalised offer.
 *
 * The score is purely ordinal — higher is better. It should not be displayed
 * to users or used as a percentage.
 */
export function scoreOffer(offer: NormalizedOffer): number {
  let score = 0;

  // ── Unlimited priority ────────────────────────────────────────────────────
  if (offer.offerType === OfferType.UNLIMITED) {
    score += SCORE.UNLIMITED_PRIORITY;
  }

  // ── Price-band fit ────────────────────────────────────────────────────────
  if (offer.inTargetBand) {
    score += SCORE.IN_TARGET_BAND;
  } else {
    // Penalty if more than 20% above the band maximum
    const bands = TARGET_BANDS[offer.bucket];
    const bandMax =
      offer.offerType === OfferType.UNLIMITED
        ? bands.unlimited.max
        : bands.fixed.max;
    if (offer.sellPriceGbp > bandMax * 1.2) {
      score += SCORE.PENALTY_OVERPRICED;
    }
  }

  // ── Margin health ─────────────────────────────────────────────────────────
  if (offer.marginPercent >= 40) {
    score += SCORE.HEALTHY_MARGIN;
  } else if (offer.marginPercent < 25) {
    score += SCORE.PENALTY_THIN_MARGIN;
  }

  // ── Tourist data minimum ──────────────────────────────────────────────────
  const minGb = MIN_TOURIST_DATA_GB[offer.bucket];
  const offerGb = offer.isUnlimited ? Infinity : (offer.dataGb ?? 0);

  if (offerGb >= minGb) {
    score += SCORE.MEETS_MIN_DATA;
  } else {
    // Insufficient data — plan is likely useless for a traveller
    score += SCORE.PENALTY_INSUFFICIENT_DATA;
  }

  // ── Hotspot bonus ─────────────────────────────────────────────────────────
  if (offer.hotspotSupported) {
    score += SCORE.HOTSPOT_SUPPORTED;
  }

  return score;
}

/**
 * Batch-score a list of offers, returning enriched copies sorted by score
 * descending (highest-scoring first).
 */
export function scoreAndSortOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  return offers
    .map((offer) => ({ ...offer, score: scoreOffer(offer) }))
    .sort((a, b) => b.score - a.score);
}
