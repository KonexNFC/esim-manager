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
 * Business rule: a bucket must NEVER overstate validity. Each plan is filed
 * under the LARGEST bucket whose day count is ≤ the plan's real validity, so
 * customers may get bonus days but never fewer than the group header claims.
 *
 *   1–2 days     → DAY_1
 *   3–4 days     → DAY_3
 *   5–6 days     → DAY_5
 *   7–13 days    → DAY_7  (10-day supplier SKUs grouped down)
 *   14–29 days   → DAY_14 (two-week plans; 15-day supplier SKUs deliver a bonus day)
 *   30–31 days   → DAY_30 (monthly / long-stay plans)
 *   > 31 days    → null   (annual / bulk plans — excluded)
 *
 * Note: real supplier SKUs are almost exclusively 1 / 3 / 5 / 7 / 10 / 15 / 30
 * days. The previous mapping filed 15-day plans under DAY_30, which claimed
 * "30-day validity" for a 15-day product.
 */
export function normalizeValidityToBucket(
  validityDays: number
): DurationBucket | null {
  if (validityDays > 31) return null; // annual / bulk plans — excluded
  if (validityDays >= 30) return DurationBucket.DAY_30;
  if (validityDays >= 14) return DurationBucket.DAY_14;
  if (validityDays >= 7)  return DurationBucket.DAY_7;
  if (validityDays >= 5)  return DurationBucket.DAY_5;
  if (validityDays >= 3)  return DurationBucket.DAY_3;
  if (validityDays >= 1)  return DurationBucket.DAY_1;
  return null; // zero / negative — malformed supplier data
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
    normalizedPlanId: plan.normalizedPlanId,
    countryCode: plan.countryCode,
    supplier: plan.supplier,
    bucket,
    validityDays: plan.validityDays,
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
