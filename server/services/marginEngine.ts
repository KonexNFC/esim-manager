// ─── Margin Engine ────────────────────────────────────────────────────────────
// Single authoritative gross margin formula for the entire system.
//
// Gross margin (retail-basis):
//   margin% = (retail - cost) / retail × 100
//
// This is the ONLY file that implements this formula.
// All other modules import from here — never inline it.

// ─── Core formula ─────────────────────────────────────────────────────────────

/**
 * Calculate gross margin percentage.
 * Returns 0 if retailPrice is 0 or negative (guards against division by zero).
 *
 *   margin% = (retailPrice - costPrice) / retailPrice × 100
 *
 * @param retailPrice  What the customer pays (USD)
 * @param costPrice    Wholesale / provider cost (USD)
 * @returns Margin as a percentage (e.g. 75.3), NOT a fraction
 */
export function calculateMargin(retailPrice: number, costPrice: number): number {
  if (retailPrice <= 0) return 0;
  return ((retailPrice - costPrice) / retailPrice) * 100;
}

/**
 * Rounded gross margin, suitable for display.
 * @param decimals Number of decimal places (default 1)
 */
export function calculateMarginRounded(
  retailPrice: number,
  costPrice: number,
  decimals = 1,
): number {
  const factor = Math.pow(10, decimals);
  return Math.round(calculateMargin(retailPrice, costPrice) * factor) / factor;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Check whether a retail/cost pair meets a minimum margin requirement.
 *
 * @param retailPrice         What the customer pays
 * @param costPrice           Wholesale / provider cost
 * @param minimumMarginPct    Required minimum margin (e.g. 35 means 35%)
 */
export function isMarginSufficient(
  retailPrice: number,
  costPrice: number,
  minimumMarginPct: number,
): boolean {
  return calculateMargin(retailPrice, costPrice) >= minimumMarginPct;
}

// ─── Inverse helpers ──────────────────────────────────────────────────────────

/**
 * Given a wholesale cost and a target margin %, compute the minimum retail price
 * that achieves exactly that margin.
 *
 *   retail = cost / (1 - margin% / 100)
 *
 * @throws if targetMarginPct >= 100 (would require infinite retail price)
 */
export function costToRetailViaMargin(cost: number, targetMarginPct: number): number {
  if (targetMarginPct >= 100) {
    throw new RangeError(
      `[marginEngine] targetMarginPct must be < 100, got ${targetMarginPct}`,
    );
  }
  return cost / (1 - targetMarginPct / 100);
}

/**
 * Given a wholesale cost and a markup %, compute the retail price.
 *
 *   retail = cost × (1 + markup% / 100)
 */
export function costToRetailViaMarkup(cost: number, markupPct: number): number {
  return cost * (1 + markupPct / 100);
}

/**
 * Convert a retail price + cost into an effective markup %.
 *
 *   markup% = (retail - cost) / cost × 100
 */
export function calculateMarkupPercent(retailPrice: number, costPrice: number): number {
  if (costPrice <= 0) return 0;
  return ((retailPrice - costPrice) / costPrice) * 100;
}
