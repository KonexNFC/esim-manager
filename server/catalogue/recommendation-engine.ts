// ─── Recommendation Engine ────────────────────────────────────────────────────
// Assigns recommendation roles to scored offers for each (country, bucket).
//
// Priority order for RECOMMENDED slot:
//   1. Unlimited in target band   (ideal: simple + competitive price)
//   2. Unlimited above target band (still unlimited, always preferred over fixed)
//   3. Best fixed-data native plan (no unlimited available at all)
//   4. Cheapest fixed-data synthetic plan
//   5. Synthetic unlimited
//
// CHEAPER slot: best fixed-data plan priced below RECOMMENDED (no duplicates).
// PREMIUM slot: best unlimited (or MAX-data) above RECOMMENDED price.
// BROWSE_ALL:   all remaining public offers in the bucket.

import {
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
 * Pick the RECOMMENDED offer for one bucket.
 * Unlimited plans are always preferred over fixed-data — they are simpler
 * to understand and the expected hero for most travellers.
 */
function pickRecommended(sorted: NormalizedOffer[]): NormalizedOffer | null {
  // 1. Unlimited in target band — ideal hero
  const unlimitedInBand = sorted.find(
    (o) => isUnlimited(o) && o.inTargetBand && !o.isSynthetic,
  );
  if (unlimitedInBand) return unlimitedInBand;

  // 2. Any native unlimited — preferred even if above target band
  const unlimitedNative = sorted.find(
    (o) => isUnlimited(o) && !o.isSynthetic,
  );
  if (unlimitedNative) return unlimitedNative;

  // 3. Best fixed-data native plan (highest score)
  const fixedNative = sorted.find((o) => !isUnlimited(o) && !o.isSynthetic);
  if (fixedNative) return fixedNative;

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
 * Pick the CHEAPER offer: best non-unlimited plan priced below RECOMMENDED.
 */
function pickCheaper(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
): NormalizedOffer | null {
  // Sort fixed-data plans by price ascending and pick cheapest below recommended
  const candidates = sorted
    .filter(
      (o) =>
        o.id !== recommended?.id &&
        !isUnlimited(o) &&
        (recommended === null || o.sellPriceGbp < recommended.sellPriceGbp),
    )
    .sort((a, b) => a.sellPriceGbp - b.sellPriceGbp);
  return candidates[0] ?? null;
}

/**
 * Pick the PREMIUM offer: a higher-tier option distinct from RECOMMENDED and
 * CHEAPER. Prefers unlimited at or above the recommended price (natural upsell).
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

  // Fall back to a MAX fixed-data plan
  return (
    sorted.find(
      (o) => !excludeIds.has(o.id) && o.offerType === OfferType.MAX,
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
