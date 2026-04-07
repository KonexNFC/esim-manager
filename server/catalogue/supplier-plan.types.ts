// ─── Supplier Plan Types ──────────────────────────────────────────────────────
// Defines raw supplier input shapes plus all enums used throughout the
// catalogue normalisation pipeline.

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Clean travel-friendly duration buckets exposed to the public storefront */
export enum DurationBucket {
  DAY_1 = "DAY_1",
  DAY_3 = "DAY_3",
  DAY_5 = "DAY_5",
  DAY_7 = "DAY_7",
}

/**
 * Product category. TRAVEL is the only category visible on the public
 * storefront; everything else is internal/admin only.
 */
export enum Category {
  TRAVEL           = "TRAVEL",
  M2M_BULK         = "M2M_BULK",
  M2D_BULK         = "M2D_BULK",
  ENTERPRISE_POOL  = "ENTERPRISE_POOL",
  WHOLESALE        = "WHOLESALE",
  TESTING          = "TESTING",
  LEGACY           = "LEGACY",
}

/** Data offer type based on the amount included */
export enum OfferType {
  UNLIMITED = "UNLIMITED",   // unlimited data
  ESSENTIAL = "ESSENTIAL",   // < 3 GB  – value / budget option
  PLUS      = "PLUS",        // 3–10 GB – mid-tier
  MAX       = "MAX",         // > 10 GB – power-user
}

/** Controls which API surface a plan is visible on */
export enum Visibility {
  PUBLIC   = "PUBLIC",   // returned by public catalogue API
  INTERNAL = "INTERNAL", // admin / internal API only
}

/** Role assigned to an offer within its duration slot */
export enum RecommendationRole {
  RECOMMENDED = "RECOMMENDED", // primary card shown to travellers
  CHEAPER     = "CHEAPER",     // "prefer a cheaper option?" alternative
  PREMIUM     = "PREMIUM",     // more data / higher tier option
  BROWSE_ALL  = "BROWSE_ALL",  // everything else under "browse all"
}

/** Lifecycle status of a supplier plan */
export enum PlanStatus {
  ACTIVE       = "active",
  DISABLED     = "disabled",
  OUT_OF_STOCK = "out_of_stock",
  UNSUPPORTED  = "unsupported",
  HIDDEN       = "hidden",
}

// ─── Raw Supplier Plan ────────────────────────────────────────────────────────

/**
 * Raw plan object as received from any upstream supplier (breeze, esimgo,
 * esimaccess). Inconsistent validity windows and data sizes are expected here;
 * the normaliser resolves them.
 */
export interface SupplierPlan {
  id: string;
  supplier: "breeze" | "esimgo" | "esimaccess";
  countryCode: string;          // ISO-3166-1 alpha-2
  validityDays: number;         // raw days from supplier
  dataMb: number | null;        // null → unlimited
  isUnlimited: boolean;
  hotspotSupported: boolean;
  wholesaleCostUsd: number;
  category: Category;
  status: PlanStatus;
}

// ─── Normalised Offer ─────────────────────────────────────────────────────────

/**
 * Fully enriched offer that has passed through the entire pipeline:
 * normaliser → (synthetic bundler) → pricing engine → scoring engine →
 * recommendation engine.
 */
export interface NormalizedOffer {
  id: string;
  countryCode: string;
  supplier: string;
  bucket: DurationBucket;
  category: Category;
  offerType: OfferType;
  visibility: Visibility;
  dataGb: number | null;        // null → unlimited
  isUnlimited: boolean;
  hotspotSupported: boolean;

  /** True when built from multiple DAY_1 plans rather than a native supply */
  isSynthetic: boolean;
  /** IDs of the source SupplierPlan(s) that generated this offer */
  supplierPlanIds: string[];

  wholesaleCostUsd: number;

  // ── Pricing ──────────────────────────────────────────────────────────────
  sellPriceGbp: number;
  marginGbp: number;
  marginPercent: number;
  /** True when sell price sits inside the target price band for this bucket */
  inTargetBand: boolean;

  // ── Scoring ──────────────────────────────────────────────────────────────
  score: number;

  // ── Recommendation ───────────────────────────────────────────────────────
  recommendationRole: RecommendationRole | null;
}

// ─── Price Band ───────────────────────────────────────────────────────────────

/** Minimum / maximum acceptable GBP sell price for a given segment */
export interface PriceBand {
  min: number;
  max: number;
}

/** Bands for both unlimited and fixed-data offers within one duration bucket */
export interface BucketBands {
  unlimited: PriceBand;
  fixed: PriceBand;
}

// ─── Catalogue Response ───────────────────────────────────────────────────────

/** Top-level response returned by /api/plans/public/:countryCode */
export interface DestinationCatalogue {
  countryCode: string;
  /** Pre-selected duration shown to the user on page load */
  defaultDuration: DurationBucket;
  /** Durations that have at least one offer available */
  availableDurations: DurationBucket[];
  /** Keyed by DurationBucket; null when no offers exist for that duration */
  durations: Partial<Record<DurationBucket, DurationSlot>>;
}

/** All offers available for a single duration bucket in one country */
export interface DurationSlot {
  bucket: DurationBucket;
  recommended: NormalizedOffer | null;
  cheaper: NormalizedOffer | null;
  premium: NormalizedOffer | null;
  browseAll: NormalizedOffer[];
}

// ─── Ladder Validation ────────────────────────────────────────────────────────

export interface LadderValidationResult {
  isValid: boolean;
  violations: string[];
  ladder: Partial<Record<DurationBucket, number>>;
}
