// ─── Wholesale Price Floor ────────────────────────────────────────────────────
// Single source of truth for the minimum amount we are allowed to charge a
// customer for a plan. A sale must NEVER go through below what suppliers
// charge us plus a minimum margin.
//
// Floor rule (USD):
//   floor = max( wholesale / (1 - MIN_MARGIN_PCT), wholesale + MIN_MARGIN_ABS_USD )
//
// These constants mirror the catalogue GBP pricing engine
// (server/catalogue/pricing-engine.ts: 20% margin, £1.50 absolute ≈ $1.90).

import { sql } from "drizzle-orm";
import { db } from "../storage";
import { getOffersForNormalizedPlan } from "./providerRegistry";

/** Minimum gross margin percentage: (sell - cost) / sell */
export const MIN_MARGIN_PCT = 20;

/** Minimum absolute gross margin in USD per sale (≈ £1.50 at 0.79 GBP/USD) */
export const MIN_MARGIN_ABS_USD = 1.9;

/** Exchange rate — must match server/catalogue/pricing-engine.ts GBP_RATE */
export const GBP_PER_USD = 0.79;

/** Providers with registered purchase adapters (must match db-supplier-plans.ts) */
const FULFILLABLE_PROVIDERS = ["esimgo", "esimaccess", "zendit", "airalo", "mock"];

export class PriceFloorError extends Error {
  public readonly code = "BELOW_PRICE_FLOOR";
  constructor(message: string) {
    super(message);
    this.name = "PriceFloorError";
  }
}

/** Minimum USD price we may charge for a given wholesale cost. */
export function computeFloorUsd(wholesaleUsd: number): number {
  const byPct = wholesaleUsd / (1 - MIN_MARGIN_PCT / 100);
  const byAbs = wholesaleUsd + MIN_MARGIN_ABS_USD;
  return Math.max(byPct, byAbs);
}

/** Round a USD amount UP to the nearest .99 ending (never below the input). */
export function roundUpTo99(usd: number): number {
  const cents = Math.round(usd * 100);
  const base = Math.floor(cents / 100);
  const candidate = base * 100 + 99;
  return (candidate >= cents ? candidate : candidate + 100) / 100;
}

/**
 * HIGHEST wholesale cost (USD) among currently fulfillable offers for a
 * normalized plan. The floor must be computed against the worst-case cost:
 * fulfillment walks a fallback chain ordered by provider priority (not price),
 * so ANY fulfillable offer may end up being the one we actually purchase.
 * Returns null when no fulfillable offer exists — in that case the plan must
 * NOT be sold at all.
 */
export async function getMaxWholesaleUsd(normalizedPlanId: string): Promise<number | null> {
  const offers = await getOffersForNormalizedPlan(normalizedPlanId);
  const costs = offers
    .filter(offer =>
      FULFILLABLE_PROVIDERS.includes(offer.providerKey.toLowerCase()) &&
      Number.isFinite(offer.wholesalePriceUsd) &&
      offer.wholesalePriceUsd > 0
    )
    .map(offer => offer.wholesalePriceUsd);
  return costs.length ? Math.max(...costs) : null;
}

/**
 * Server-authoritative sale price (USD) for a normalized plan:
 * the stored retail price when it already clears the floor, otherwise the
 * floor rounded up to a .99 ending.
 *
 * Throws PriceFloorError when the plan has no fulfillable supplier offer
 * (we cannot know our cost → we must not sell it).
 *
 * The floor uses the WORST-CASE (maximum) wholesale cost across fulfillable
 * offers, because fulfillment may fall back to any of them.
 */
export async function resolveSalePriceUsd(
  normalizedPlanId: string,
  storedRetailUsd: number,
): Promise<{ priceUsd: number; wholesaleUsd: number; floorUsd: number }> {
  const wholesaleUsd = await getMaxWholesaleUsd(normalizedPlanId);
  if (wholesaleUsd == null) {
    throw new PriceFloorError(
      `Plan ${normalizedPlanId} has no active supplier offer — cannot price or sell it.`,
    );
  }
  const floorUsd = computeFloorUsd(wholesaleUsd);
  const priceUsd = storedRetailUsd >= floorUsd
    ? storedRetailUsd
    : roundUpTo99(floorUsd);
  return { priceUsd, wholesaleUsd, floorUsd };
}

/**
 * Worst-case wholesale cost from a routing fallback chain (entries carry the
 * wholesale price under `w`). Fulfillment may use ANY entry in the chain, so
 * the floor must clear the most expensive one. Returns null for empty input.
 */
export function maxChainWholesaleUsd(chain: Array<{ w?: number }> | null | undefined): number | null {
  if (!Array.isArray(chain) || chain.length === 0) return null;
  const costs = chain.map(e => e?.w).filter((w): w is number => typeof w === "number" && w > 0);
  return costs.length ? Math.max(...costs) : null;
}

/**
 * Amount the customer ACTUALLY paid on a completed Paddle transaction, in USD.
 * Uses grand_total/total (after all discounts and adjustments) — NEVER the
 * subtotal, which ignores promotions and would let a discounted payment slip
 * below the floor. Amounts are in minor units (cents/pence). Non-USD
 * currencies are converted with the shared rate; unknown currencies return
 * null so the caller rejects rather than guessing.
 */
export function paddleCapturedUsd(
  totals: { grand_total?: string | number; total?: string | number; currency_code?: string } | null | undefined,
  fallbackUsd?: number | null,
): number | null {
  const raw = totals?.grand_total ?? totals?.total;
  if (raw == null || raw === "") {
    return typeof fallbackUsd === "number" && fallbackUsd > 0 ? fallbackUsd : null;
  }
  const minor = typeof raw === "string" ? parseFloat(raw) : raw;
  if (isNaN(minor)) return null;
  const amount = minor / 100;
  const ccy = (totals?.currency_code ?? "USD").toUpperCase();
  if (ccy === "USD") return amount;
  if (ccy === "GBP") return amount / GBP_PER_USD;
  return null; // unknown currency — caller must reject
}

/**
 * Cost to validate a captured payment against, combining evidence sources.
 * The LIVE re-queried worst-case offer cost is authoritative when available;
 * checkout-time chain/metadata costs only serve as fallbacks (they can be
 * stale — supplier prices may rise between session creation and payment).
 * Uses the maximum of whatever is known: the guard must clear every candidate.
 * Returns null when no cost evidence exists at all.
 */
export function resolveGuardWholesaleUsd(input: {
  liveMaxUsd?: number | null;
  chainMaxUsd?: number | null;
  metadataCostUsd?: number | null;
}): number | null {
  const candidates = [input.liveMaxUsd, input.chainMaxUsd, input.metadataCostUsd]
    .filter((v): v is number => typeof v === "number" && v > 0);
  return candidates.length ? Math.max(...candidates) : null;
}

/**
 * Fail-closed decision for a captured payment at completion/webhook time.
 *
 * Rules:
 *  • Paid amount must be positive and determinable.
 *  • When the sale is for a normalized plan, a SUCCESSFUL live offer lookup is
 *    required and its worst-case cost is the only pricing evidence used —
 *    a null lookup (offers disabled/removed) or a failed lookup rejects; stale
 *    checkout-time metadata is never substituted.
 *  • Without a normalized plan (legacy sales), fall back to chain/metadata
 *    cost; if no cost evidence exists at all, reject.
 *  • The paid amount must clear the full cost-plus-margin floor.
 */
export function evaluateCapturedPayment(input: {
  paidUsd: number | null | undefined;
  hasNormalizedPlan: boolean;
  liveMaxUsd?: number | null;      // result of getMaxWholesaleUsd (null = no offer)
  liveLookupFailed?: boolean;      // true when the live lookup threw
  chainMaxUsd?: number | null;     // checkout-time fallback-chain worst case
  metadataCostUsd?: number | null; // checkout-time winner cost
  epsilonUsd?: number;
}): { ok: true; floorUsd: number; costUsd: number } | { ok: false; reason: string } {
  const paid = input.paidUsd;
  if (paid == null || !(paid > 0)) {
    return { ok: false, reason: `paid amount ${paid} is not positive/determinable` };
  }

  let costUsd: number | null;
  if (input.hasNormalizedPlan) {
    if (input.liveLookupFailed) {
      return { ok: false, reason: "live wholesale lookup failed — cannot verify cost" };
    }
    if (input.liveMaxUsd == null || !(input.liveMaxUsd > 0)) {
      return { ok: false, reason: "no fulfillable supplier offer exists for this plan" };
    }
    costUsd = input.liveMaxUsd;
  } else {
    costUsd = resolveGuardWholesaleUsd({
      chainMaxUsd: input.chainMaxUsd,
      metadataCostUsd: input.metadataCostUsd,
    });
    if (costUsd == null) {
      return { ok: false, reason: "no cost evidence available for legacy sale" };
    }
  }

  const floorUsd = computeFloorUsd(costUsd);
  const eps = input.epsilonUsd ?? 0.02;
  if (paid + eps < floorUsd) {
    return {
      ok: false,
      reason: `paid $${paid.toFixed(2)} is below floor $${floorUsd.toFixed(2)} (worst-case wholesale $${costUsd.toFixed(2)})`,
    };
  }
  return { ok: true, floorUsd, costUsd };
}

/**
 * Assert a final charge amount (USD) meets the wholesale floor.
 * Throws PriceFloorError when the charge is zero/negative or below floor.
 * `epsilonUsd` absorbs cent-rounding differences from payment providers.
 */
export function assertChargeMeetsFloor(
  chargeUsd: number,
  wholesaleUsd: number,
  context: string,
  epsilonUsd = 0.02,
): void {
  if (!(chargeUsd > 0)) {
    throw new PriceFloorError(`${context}: charge amount $${chargeUsd} is not positive.`);
  }
  const floorUsd = computeFloorUsd(wholesaleUsd);
  if (chargeUsd + epsilonUsd < floorUsd) {
    throw new PriceFloorError(
      `${context}: charge $${chargeUsd.toFixed(2)} is below the wholesale floor ` +
      `$${floorUsd.toFixed(2)} (wholesale $${wholesaleUsd.toFixed(2)} + min margin).`,
    );
  }
}
