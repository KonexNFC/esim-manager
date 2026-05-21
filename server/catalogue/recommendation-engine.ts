// ─── Recommendation Engine ────────────────────────────────────────────────────
// Assigns recommendation roles to scored offers for each (country, bucket).
//
// Priority order for RECOMMENDED slot:
//   1. Unlimited in target band         (ideal: simple + competitive price)
//   2. Unlimited ≤1.5× band ceiling     (acceptable: "slightly pricier")
//   3. Best fixed-data native plan      (no affordable unlimited available)
//   4. Best fixed-data synthetic plan   (native not available)
//   5. Synthetic unlimited              (last-resort, only if ≤1.5× band ceiling)
//
// If the cheapest unlimited is more than 1.5× the band ceiling it is too
// expensive to lead with — customers should see an affordable fixed plan as
// their hero recommendation and the pricey unlimited moves to PREMIUM.
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
import { getTargetBand } from "./pricing-engine";

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum multiple of the target-band ceiling at which an unlimited plan is
 * still considered "affordable enough" to be the hero RECOMMENDED offer.
 * Above this threshold the cheapest unlimited plan moves to PREMIUM and we
 * surface the best fixed-data plan as RECOMMENDED instead.
 */
const UNLIMITED_PRICE_CEILING_MULTIPLE = 1.5;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isUnlimited(offer: NormalizedOffer) {
  return offer.offerType === OfferType.UNLIMITED;
}

/**
 * True when an unlimited offer is "affordably priced" — within
 * UNLIMITED_PRICE_CEILING_MULTIPLE × the target band's upper boundary.
 */
function unlimitedIsAffordable(offer: NormalizedOffer): boolean {
  const band = getTargetBand(offer.bucket, OfferType.UNLIMITED);
  return offer.sellPriceGbp <= band.max * UNLIMITED_PRICE_CEILING_MULTIPLE;
}

/**
 * Pick the RECOMMENDED offer for one bucket from a sorted (highest-score first)
 * list of offers. Returns the best offer matching the priority order above.
 */
function pickRecommended(sorted: NormalizedOffer[]): NormalizedOffer | null {
  // 1. Unlimited in target band — ideal hero
  const unlimitedInBand = sorted.find(
    (o) => isUnlimited(o) && o.inTargetBand && !o.isSynthetic,
  );
  if (unlimitedInBand) return unlimitedInBand;

  // 2. Native unlimited above band but still within 1.5× ceiling
  //    If all native unlimited plans are pricier than this threshold, the
  //    product is too expensive for most customers → fall through to fixed.
  const unlimitedNative = sorted.find(
    (o) => isUnlimited(o) && !o.isSynthetic && unlimitedIsAffordable(o),
  );
  if (unlimitedNative) return unlimitedNative;

  // 3. Best fixed-data native plan (highest score)
  const fixedNative = sorted.find((o) => !isUnlimited(o) && !o.isSynthetic);
  if (fixedNative) return fixedNative;

  // 4. Cheapest fixed-data synthetic plan (sort by price, not score — avoids
  //    picking a high-score but absurdly-priced synthetic like 10 GB × 5 days)
  const fixedSynthetics = sorted
    .filter((o) => !isUnlimited(o) && o.isSynthetic)
    .sort((a, b) => a.sellPriceGbp - b.sellPriceGbp);
  const fixedSynthetic = fixedSynthetics[0] ?? null;
  if (fixedSynthetic) return fixedSynthetic;

  // 5. Synthetic unlimited — last resort, still price-gated
  const syntheticUnlimited = sorted.find(
    (o) => isUnlimited(o) && o.isSynthetic && unlimitedIsAffordable(o),
  );
  if (syntheticUnlimited) return syntheticUnlimited;

  // 6. Anything remaining
  return sorted[0] ?? null;
}

/**
 * Pick the CHEAPER offer: best non-unlimited plan priced below RECOMMENDED.
 */
function pickCheaper(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
): NormalizedOffer | null {
  return (
    sorted.find(
      (o) =>
        o.id !== recommended?.id &&
        !isUnlimited(o) &&
        (recommended === null || o.sellPriceGbp < recommended.sellPriceGbp),
    ) ?? null
  );
}

/**
 * Pick the PREMIUM offer: a higher-tier option distinct from RECOMMENDED and
 * CHEAPER. Prefers unlimited (ideal upsell from a fixed-data RECOMMENDED).
 */
function pickPremium(
  sorted: NormalizedOffer[],
  recommended: NormalizedOffer | null,
  cheaper: NormalizedOffer | null,
): NormalizedOffer | null {
  const excludeIds = new Set(
    [recommended?.id, cheaper?.id].filter(Boolean) as string[],
  );

  // Prefer unlimited at or above the recommended price (natural upsell)
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
  const publicOffers   = offers.filter((o) => o.visibility === Visibility.PUBLIC);
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
    const sorted = [...group].sort((a, b) => b.score - a.score);

    const recommended = pickRecommended(sorted);
    const cheaper     = pickCheaper(sorted, recommended);
    const premium     = pickPremium(sorted, recommended, cheaper);

    const assignedIds = new Set(
      [recommended?.id, cheaper?.id, premium?.id].filter(Boolean) as string[],
    );

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
