// ─── Normaliser ───────────────────────────────────────────────────────────────
// Converts raw supplier plans into normalised NormalizedOffer objects.
//
// Three public functions:
//   normalizeValidityToBucket  – maps raw validity days → DurationBucket
//   mapOfferType               – classifies data amount → OfferType
//   filterPublicEligiblePlans  – removes hidden / bulk / disabled plans
//   normalizePlan              – full conversion of one SupplierPlan
//   normalizeAllPlans          – batch conversion

import {
  Category,
  DurationBucket,
  NormalizedOffer,
  OfferType,
  PlanStatus,
  SupplierPlan,
  Visibility,
} from "./supplier-plan.types";

// ─── Hidden category and status sets ─────────────────────────────────────────

/** Categories that must never appear in the public catalogue */
const HIDDEN_CATEGORIES = new Set<Category>([
  Category.M2M_BULK,
  Category.M2D_BULK,
  Category.ENTERPRISE_POOL,
  Category.WHOLESALE,
  Category.TESTING,
  Category.LEGACY,
]);

/** Statuses that make a plan ineligible for any public exposure */
const INELIGIBLE_STATUSES = new Set<PlanStatus>([
  PlanStatus.DISABLED,
  PlanStatus.OUT_OF_STOCK,
  PlanStatus.UNSUPPORTED,
  PlanStatus.HIDDEN,
]);

// ─── Core normalisers ─────────────────────────────────────────────────────────

/**
 * Map raw supplier validity days to a clean travel duration bucket.
 *
 * Business rules:
 *   1 day        → DAY_1
 *   2–3 days     → DAY_3
 *   4–5 days     → DAY_5
 *   6–7 days     → DAY_7
 *   anything else → null (excluded from travel catalogue)
 */
export function normalizeValidityToBucket(
  validityDays: number
): DurationBucket | null {
  if (validityDays === 1) return DurationBucket.DAY_1;
  if (validityDays >= 2 && validityDays <= 3) return DurationBucket.DAY_3;
  if (validityDays >= 4 && validityDays <= 5) return DurationBucket.DAY_5;
  if (validityDays >= 6 && validityDays <= 7) return DurationBucket.DAY_7;
  return null;
}

/**
 * Classify an offer by its data amount.
 *
 * Business rules:
 *   unlimited     → UNLIMITED
 *   < 3 GB        → ESSENTIAL  (budget / short-visit option)
 *   3–10 GB       → PLUS       (standard traveller option)
 *   > 10 GB       → MAX        (power-user / remote-worker option)
 */
export function mapOfferType(
  plan: Pick<SupplierPlan, "isUnlimited" | "dataMb">
): OfferType {
  if (plan.isUnlimited) return OfferType.UNLIMITED;
  const gb = (plan.dataMb ?? 0) / 1024;
  if (gb < 3) return OfferType.ESSENTIAL;
  if (gb <= 10) return OfferType.PLUS;
  return OfferType.MAX;
}

/**
 * Remove plans that are not eligible for the public travel catalogue.
 * Excludes: hidden/bulk categories, non-active statuses, and validity windows
 * that don't map to a supported travel bucket.
 */
export function filterPublicEligiblePlans(plans: SupplierPlan[]): SupplierPlan[] {
  return plans.filter((plan) => {
    // Must be in a travel-friendly category
    if (HIDDEN_CATEGORIES.has(plan.category)) return false;
    // Must be in an active, purchasable state
    if (INELIGIBLE_STATUSES.has(plan.status)) return false;
    // Must map to a supported travel duration bucket
    if (normalizeValidityToBucket(plan.validityDays) === null) return false;
    return true;
  });
}

/**
 * Convert a single SupplierPlan into a NormalizedOffer.
 * Returns null when the plan doesn't map to a supported duration bucket.
 * Pricing, scoring, and recommendation fields are set to zero/null —
 * they are populated later in the pipeline.
 */
export function normalizePlan(plan: SupplierPlan): NormalizedOffer | null {
  const bucket = normalizeValidityToBucket(plan.validityDays);
  if (bucket === null) return null;

  const offerType = mapOfferType(plan);

  // Plans in hidden categories get INTERNAL visibility even if status=active
  const visibility = HIDDEN_CATEGORIES.has(plan.category)
    ? Visibility.INTERNAL
    : Visibility.PUBLIC;

  const dataGb = plan.isUnlimited ? null : (plan.dataMb ?? 0) / 1024;

  return {
    id: plan.id,
    countryCode: plan.countryCode,
    supplier: plan.supplier,
    bucket,
    category: plan.category,
    offerType,
    visibility,
    dataGb,
    isUnlimited: plan.isUnlimited,
    hotspotSupported: plan.hotspotSupported,
    isSynthetic: false,
    supplierPlanIds: [plan.id],
    wholesaleCostUsd: plan.wholesaleCostUsd,
    // Filled by pricing engine:
    sellPriceGbp: 0,
    marginGbp: 0,
    marginPercent: 0,
    inTargetBand: false,
    // Filled by scoring engine:
    score: 0,
    // Filled by recommendation engine:
    recommendationRole: null,
  };
}

/**
 * Batch-convert all SupplierPlans, silently dropping those that don't map to
 * a travel bucket. Does NOT apply the public eligibility filter — call
 * filterPublicEligiblePlans first when building the public catalogue.
 */
export function normalizeAllPlans(plans: SupplierPlan[]): NormalizedOffer[] {
  const out: NormalizedOffer[] = [];
  for (const plan of plans) {
    const offer = normalizePlan(plan);
    if (offer) out.push(offer);
  }
  return out;
}
