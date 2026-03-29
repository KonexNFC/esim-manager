// ─── Pricing Engine ───────────────────────────────────────────────────────────
// calculateRetailPrice(wholesaleCostUsd, options)
//
// Computation pipeline (in order):
//   1. Apply markup %     → retail = wholesale × (1 + markup/100)
//   2. Apply min margin % → if margin < minimum, raise retail to hit the floor
//   3. Apply floor price  → retail = max(retail, floorPrice)
//   4. Apply charm pricing→ round up to nearest .49 / .99 cent ending
//
// Margin formula used throughout: (retail - cost) / retail × 100
// (delegates to marginEngine — the single source of truth)

import {
  calculateMargin,
  calculateMarkupPercent,
  costToRetailViaMarkup,
  costToRetailViaMargin,
} from "./marginEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingOptions {
  /** Desired markup percentage over wholesale. E.g. 40 → retail = cost × 1.40 */
  markupPercent?: number;
  /**
   * Minimum acceptable gross margin percentage.
   * If the markup alone doesn't achieve this, the retail price is raised.
   * E.g. 35 means at least 35% gross margin.
   */
  minimumMarginPercent?: number;
  /**
   * Hard floor: retail price will never be set below this amount (USD).
   * Useful for avoiding race-to-the-bottom on very cheap bundles.
   */
  floorPriceUsd?: number;
  /**
   * Whether to apply charm pricing (round up to nearest .49 or .99 cent ending).
   * Default: true
   */
  charmPricing?: boolean;
}

export interface PricingResult {
  wholesaleCostUsd: number;
  retailPriceUsd: number;
  /** Final gross margin % using the shared formula */
  marginPercent: number;
  /** Effective markup % on the final retail price */
  markupPercent: number;
  /** Which optional adjustments were applied */
  applied: {
    minimumMarginEnforced: boolean;
    floorPriceEnforced: boolean;
    charmRounded: boolean;
  };
  /** Intermediate prices at each pipeline stage */
  breakdown: {
    afterMarkup: number;
    afterMinMargin: number;
    afterFloor: number;
    afterCharm: number;
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: Required<PricingOptions> = {
  markupPercent: 40,         // 40% over wholesale by default
  minimumMarginPercent: 30,  // Never go below 30% gross margin
  floorPriceUsd: 0.99,       // Absolute minimum retail price
  charmPricing: true,
};

// ─── Charm pricing ────────────────────────────────────────────────────────────
// Round UP to the nearest ".49" or ".99" cent ending (never reduces margin).
//
// Examples:
//   $1.36 → $1.49   (1.49 ≥ 1.36 ✓)
//   $1.50 → $1.99   (1.49 < 1.50, so next point: 1.99 ✓)
//   $1.70 → $1.99   (1.99 ≥ 1.70 ✓)
//   $5.20 → $5.49   ✓
//   $12.00 → $12.49 ✓
//   $12.50 → $12.99 ✓
//   $12.99 → $12.99 ✓  (already a charm price)
//   $12.991 → $13.49 ✓

export function applyCharmPricing(price: number): number {
  const base = Math.floor(price);
  if (base + 0.49 >= price) return base + 0.49;
  if (base + 0.99 >= price) return base + 0.99;
  // price > base.99 (e.g. $12.991 due to floating point) — move to next integer
  return (base + 1) + 0.49;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function calculateRetailPrice(
  wholesaleCostUsd: number,
  options: PricingOptions = {},
): PricingResult {
  if (wholesaleCostUsd < 0) {
    throw new RangeError(
      `[pricingEngine] wholesaleCostUsd must be ≥ 0, got ${wholesaleCostUsd}`,
    );
  }

  const opts: Required<PricingOptions> = { ...DEFAULTS, ...options };

  // ── Stage 1: Apply markup ────────────────────────────────────────────────
  const afterMarkup = costToRetailViaMarkup(wholesaleCostUsd, opts.markupPercent);

  // ── Stage 2: Enforce minimum margin ─────────────────────────────────────
  // If markup alone falls short of the margin floor, raise the price just
  // enough to reach the minimum margin.
  const minRetailForMargin = opts.minimumMarginPercent > 0
    ? costToRetailViaMargin(wholesaleCostUsd, opts.minimumMarginPercent)
    : 0;

  const afterMinMargin = Math.max(afterMarkup, minRetailForMargin);
  const minimumMarginEnforced = afterMinMargin > afterMarkup;

  // ── Stage 3: Apply floor price ───────────────────────────────────────────
  const afterFloor = Math.max(afterMinMargin, opts.floorPriceUsd);
  const floorPriceEnforced = afterFloor > afterMinMargin;

  // ── Stage 4: Charm pricing ───────────────────────────────────────────────
  let afterCharm = afterFloor;
  let charmRounded = false;

  if (opts.charmPricing) {
    afterCharm = applyCharmPricing(afterFloor);
    charmRounded = afterCharm !== afterFloor;
  }

  const finalRetail = afterCharm;

  return {
    wholesaleCostUsd,
    retailPriceUsd: finalRetail,
    marginPercent: calculateMargin(finalRetail, wholesaleCostUsd),
    markupPercent: calculateMarkupPercent(finalRetail, wholesaleCostUsd),
    applied: {
      minimumMarginEnforced,
      floorPriceEnforced,
      charmRounded,
    },
    breakdown: {
      afterMarkup,
      afterMinMargin,
      afterFloor,
      afterCharm,
    },
  };
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/** Price a list of wholesale costs in one call. */
export function calculateRetailPriceBatch(
  wholesaleCosts: number[],
  options: PricingOptions = {},
): PricingResult[] {
  return wholesaleCosts.map(cost => calculateRetailPrice(cost, options));
}

// ─── Quick margin check (delegates to marginEngine) ──────────────────────────
// Re-exported here so callers only need one import.
export { calculateMargin } from "./marginEngine";
