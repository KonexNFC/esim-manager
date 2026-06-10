// ─── Recommendation Engine ────────────────────────────────────────────────────
// Assigns recommendation roles to scored offers for each (country, bucket).
//
// Priority order for RECOMMENDED slot:
//   1. Unlimited in target band   (ideal: simple + competitive price)
//   2. Any native unlimited       — unless it is >3× more expensive than the
//      cheapest qualifying fixed-data plan (sufficient data for the trip).
//      When unlimited is wildly overpriced, fixed-data is shown instead.
//   3. Best qualifying fixed-data native plan (meets MIN_TOURIST_DATA_GB)
//   4. Any fixed-data native (last resort when nothing meets the data min)
//   5. Cheapest fixed-data synthetic plan
//   6. Synthetic unlimited
//
// CHEAPER slot: cheapest fixed-data plan priced below RECOMMENDED that also
//   meets the minimum data threshold for the bucket (no useless micro-plans).
// PREMIUM slot: best unlimited (or MAX-data) above RECOMMENDED price.
//   MAX fallback must cost MORE than the CHEAPER slot to avoid equal-price pairs.
// BROWSE_ALL:   all remaining public offers in the bucket.

import {
  NormalizedOffer,
  OfferType,
  RecommendationRole,
  Visibility,
} from "./supplier-plan.types";
import { MIN_TOURIST_DATA_GB } from "./scoring-engine";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * If the cheapest native unlimited plan costs MORE than this multiple of the
 * cheapest qualifying fixed-data plan, prefer fixed-data for the RECOMMENDED
 * slot. This prevents a £58 "Best Value" badge on an unlimited plan when a
 * £9 fixed-data plan is available.
 */
const MAX_UNLIMITED_TO_FIXED_RATIO = 3;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isUnlimited(offer: NormalizedOffer) {
  return offer.offerType === OfferType.UNLIMITED;
}

/** Cheapest non-unlimited, non-synthetic plan that meets the minimum data
 *  threshold for its bucket. Returns null when none exists. */
function bestQualifyingFixed(sorted: NormalizedOffer[]): NormalizedOffer | null {
  return (
    sorted
      .filter(
        (o) =>
          !isUnlimited(o) &&
          !o.isSynthetic &&
          (o.dataGb ?? 0) >= (MIN_TOURIST_DATA_GB[o.bucket] ?? 0),
      )
      .sort((a, b) => a.sellPriceGbp - b.sellPriceGbp)[0] ?? null
  );
}

/**
 * Pick the RECOMMENDED offer for one bucket.
 * Unlimited plans are strongly preferred — but not when they cost more than
 * MAX_UNLIMITED_TO_FIXED_RATIO × the best qualifying fixed-data alternative.
 */
function pickRecommended(sorted: NormalizedOffer[]): NormalizedOffer | null {
  // 1. Unlimited in target band — ideal hero
  const unlimitedInBand = sorted.find(
    (o) => isUnlimited(o) && o.inTargetBand && !o.isSynthetic,
  );
  if (unlimitedInBand) return unlimitedInBand;

  // 2. Any native unlimited — but only if not wildly more expensive than fixed-data
  const unlimitedNative = sorted.find(
    (o) => isUnlimited(o) && !o.isSynthetic,
  );
  if (unlimitedNative) {
    const bqf = bestQualifyingFixed(sorted);
    const ratio = bqf
      ? unlimitedNative.sellPriceGbp / bqf.sellPriceGbp
      : 1;
    if (ratio <= MAX_UNLIMITED_TO_FIXED_RATIO) return unlimitedNative;
    // Unlimited is >3× the fixed price — fall through to fixed-data
  }

  // 3. Best qualifying fixed-data native plan (meets min data threshold)
  const qualifyingFixed = bestQualifyingFixed(sorted);
  if (qualifyingFixed) return qualifyingFixed;

  // 3b. Any fixed-data native (even below threshold — last resort)
  const anyFixedNative = sorted.find((o) => !isUnlimited(o) && !o.isSynthetic);
  if (anyFixedNative) return anyFixedNative;

  // 4. Cheapest fixed-data synthetic (sort by price to avoid huge synthetic plans)
  const cheapestFixedSynthetic = sorted
    .filter((o) => !isUnlimited(o) && o.isSynthetic)
    .sort((a, b) => a.sellPriceGbp - b.sellPriceGbp)[0] ?? null;
  if (cheapestFixedSynthetic) return cheapestFixedSynthetic;

  // 5. Any synthetic unlimited
  const syntheticUnlimited = sorted.find(
    (o) => isUnlimited(o) && o.isSynthetic,
  );
  if (syntheticUnlimited) return syntheticUnlimited;

  return sorted[0] ?? null;
}

/**
 * Pick the CHEAPER offer: cheapest non-unlimited plan priced below RECOMMENDED
 * that also meets the minimum data threshold for the bucket.
 * Plans with tiny data (e.g. 100 MB for a 7-day trip) are excluded.
 */
function pickCheaper(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
): NormalizedOffer | null {
  const candidates = sorted
    .filter(
      (o) =>
        o.id !== recommended?.id &&
        !isUnlimited(o) &&
        (o.dataGb ?? 0) >= (MIN_TOURIST_DATA_GB[o.bucket] ?? 0) &&
        (recommended === null || o.sellPriceGbp < recommended.sellPriceGbp),
    )
    .sort((a, b) => a.sellPriceGbp - b.sellPriceGbp);
  return candidates[0] ?? null;
}

/**
 * Pick the PREMIUM offer: a higher-tier option distinct from RECOMMENDED and
 * CHEAPER. Prefers unlimited at or above the recommended price (natural upsell).
 * MAX fixed-data fallback is only used when it costs MORE than the CHEAPER slot
 * (prevents showing two plans at the same price with different labels).
 */
function pickPremium(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
  cheaper: NormalizedOffer | null,
): NormalizedOffer | null {
  const excludeIds = new Set(
    [recommended?.id, cheaper?.id].filter(Boolean) as string[],
  );

  // Prefer unlimited at or above recommended price
  const premium = sorted.find(
    (o) =>
      !excludeIds.has(o.id) &&
      isUnlimited(o) &&
      (recommended === null || o.sellPriceGbp >= recommended.sellPriceGbp),
  );
  if (premium) return premium;

  // Fall back to a MAX fixed-data plan — only if it costs more than CHEAPER
  // (prevents the confusing scenario where Premium and Budget show the same price)
  return (
    sorted.find(
      (o) =>
        !excludeIds.has(o.id) &&
        o.offerType === OfferType.MAX &&
        (cheaper === null || o.sellPriceGbp > cheaper.sellPriceGbp),
    ) ?? null
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function assignRecommendations(
  offers: NormalizedOffer[]
): NormalizedOffer[] {
  const publicOffers   = offers.filter((o) => o.visibility === Visibility.PUBLIC);
  const internalOffers = offers.filter((o) => o.visibility !== Visibility.PUBLIC);

  const groups = new Map<string, NormalizedOffer[]>();
  for (const offer of publicOffers) {
    const key = `${offer.countryCode}::${offer.bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(offer);
  }

  const result: NormalizedOffer[] = [];

  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => b.score - a.score);

    const recommended = pickRecommended(sorted);
    const cheaper     = pickCheaper(sorted, recommended);
    const premium     = pickPremium(sorted, recommended, cheaper);

    for (const offer of sorted) {
      let role: RecommendationRole;
      if (offer.id === recommended?.id)  role = RecommendationRole.RECOMMENDED;
      else if (offer.id === cheaper?.id) role = RecommendationRole.CHEAPER;
      else if (offer.id === premium?.id) role = RecommendationRole.PREMIUM;
      else                               role = RecommendationRole.BROWSE_ALL;

      result.push({ ...offer, recommendationRole: role });
    }
  }

  return [
    ...result,
    ...internalOffers.map((o) => ({ ...o, recommendationRole: null })),
  ];
}
