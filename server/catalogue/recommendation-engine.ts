// ─── Recommendation Engine ────────────────────────────────────────────────────
// Assigns recommendation roles to scored offers for each (country, bucket).
//
// Priority order for RECOMMENDED slot:
//   1. Unlimited in target band   (ideal: simple + competitive price)
//   2. Unlimited above target band (still unlimited, slightly pricier)
//   3. Best fixed-data travel plan (no native unlimited available)
//   4. Synthetic unlimited bundle  (last-resort: built from DAY_1 plans)
//   5. Synthetic fixed-data bundle
//
// CHEAPER slot: best fixed-data plan priced below RECOMMENDED (no duplicates).
// PREMIUM slot: better unlimited or more data than RECOMMENDED (no duplicates).
// BROWSE_ALL:   all remaining public offers in the bucket.

import {
  DurationBucket,
  NormalizedOffer,
  OfferType,
  RecommendationRole,
  Visibility,
} from "./supplier-plan.types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isUnlimited(offer: NormalizedOffer) {
  return offer.offerType === OfferType.UNLIMITED;
}

/**
 * Pick the RECOMMENDED offer for one bucket from a sorted (highest-score first)
 * list of offers. Returns the best offer matching the priority order above.
 */
function pickRecommended(sorted: NormalizedOffer[]): NormalizedOffer | null {
  // 1. Unlimited in target band
  const unlimitedInBand = sorted.find((o) => isUnlimited(o) && o.inTargetBand && !o.isSynthetic);
  if (unlimitedInBand) return unlimitedInBand;

  // 2. Unlimited above target band (still native)
  const unlimitedNative = sorted.find((o) => isUnlimited(o) && !o.isSynthetic);
  if (unlimitedNative) return unlimitedNative;

  // 3. Best fixed-data (native, highest score)
  const fixedNative = sorted.find((o) => !isUnlimited(o) && !o.isSynthetic);
  if (fixedNative) return fixedNative;

  // 4. Synthetic unlimited
  const syntheticUnlimited = sorted.find((o) => isUnlimited(o) && o.isSynthetic);
  if (syntheticUnlimited) return syntheticUnlimited;

  // 5. Synthetic fixed-data fallback
  return sorted.find((o) => !isUnlimited(o) && o.isSynthetic) ?? null;
}

/**
 * Pick the CHEAPER offer: best fixed-data plan that is cheaper than the
 * recommended price and isn't the same offer.
 */
function pickCheaper(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null
): NormalizedOffer | null {
  return (
    sorted.find(
      (o) =>
        o.id !== recommended?.id &&
        !isUnlimited(o) &&
        (recommended === null || o.sellPriceGbp < recommended.sellPriceGbp)
    ) ?? null
  );
}

/**
 * Pick the PREMIUM offer: a higher-data or higher-tier offer different from
 * RECOMMENDED and CHEAPER. Prefers unlimited with more headroom.
 */
function pickPremium(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
  cheaper: NormalizedOffer | null
): NormalizedOffer | null {
  const excludeIds = new Set([recommended?.id, cheaper?.id].filter(Boolean) as string[]);

  // Prefer unlimited above the recommended price (premium tier)
  const premium = sorted.find(
    (o) =>
      !excludeIds.has(o.id) &&
      isUnlimited(o) &&
      (recommended === null || o.sellPriceGbp >= recommended.sellPriceGbp)
  );
  if (premium && premium.id !== recommended?.id) return premium;

  // Fall back to a fixed MAX-data plan
  return (
    sorted.find(
      (o) =>
        !excludeIds.has(o.id) &&
        o.offerType === OfferType.MAX
    ) ?? null
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Assign recommendation roles to all public offers across all countries and
 * duration buckets.
 *
 * Input: pre-scored offers (any country mix is fine — grouped internally).
 * Output: same offers with recommendationRole populated.
 */
export function assignRecommendations(
  offers: NormalizedOffer[]
): NormalizedOffer[] {
  // Only assign roles to public offers
  const publicOffers = offers.filter((o) => o.visibility === Visibility.PUBLIC);
  const internalOffers = offers.filter((o) => o.visibility !== Visibility.PUBLIC);

  // Group by countryCode + bucket
  const groups = new Map<string, NormalizedOffer[]>();
  for (const offer of publicOffers) {
    const key = `${offer.countryCode}::${offer.bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(offer);
  }

  const result: NormalizedOffer[] = [];

  for (const [, group] of groups) {
    // Sort by score descending (should already be sorted, but be explicit)
    const sorted = [...group].sort((a, b) => b.score - a.score);

    const recommended = pickRecommended(sorted);
    const cheaper     = pickCheaper(sorted, recommended);
    const premium     = pickPremium(sorted, recommended, cheaper);

    const assignedIds = new Set(
      [recommended?.id, cheaper?.id, premium?.id].filter(Boolean) as string[]
    );

    for (const offer of sorted) {
      let role: RecommendationRole;
      if (offer.id === recommended?.id)   role = RecommendationRole.RECOMMENDED;
      else if (offer.id === cheaper?.id)  role = RecommendationRole.CHEAPER;
      else if (offer.id === premium?.id)  role = RecommendationRole.PREMIUM;
      else                                role = RecommendationRole.BROWSE_ALL;

      result.push({ ...offer, recommendationRole: role });
    }
  }

  // Internal offers pass through without roles
  return [...result, ...internalOffers.map((o) => ({ ...o, recommendationRole: null }))];
}
