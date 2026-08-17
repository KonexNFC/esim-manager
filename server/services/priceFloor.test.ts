// ─── Wholesale price floor regression tests ──────────────────────────────────
// Run with: npm test  (tsx --test)
// Guards against re-introducing below-cost sales:
//  • floors must use the WORST-CASE wholesale cost across the fallback chain
//    (fulfillment walks the chain by provider priority, not by price)
//  • discounted/promotion-reduced final amounts below the floor must be rejected
//  • zero / $0.01 charges must be rejected

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFloorUsd,
  roundUpTo99,
  assertChargeMeetsFloor,
  maxChainWholesaleUsd,
  resolveGuardWholesaleUsd,
  paddleCapturedUsd,
  evaluateCapturedPayment,
  PriceFloorError,
  MIN_MARGIN_PCT,
  MIN_MARGIN_ABS_USD,
} from "./priceFloor";

test("computeFloorUsd enforces both percentage and absolute margin", () => {
  // Low cost → absolute margin dominates
  assert.equal(computeFloorUsd(1), 1 + MIN_MARGIN_ABS_USD);
  // High cost → percentage margin dominates
  assert.equal(computeFloorUsd(100), 100 / (1 - MIN_MARGIN_PCT / 100));
  // Real production case: Nigeria 1GB Daily wholesale $11.92 → floor $14.90
  assert.ok(Math.abs(computeFloorUsd(11.92) - 14.9) < 0.001);
});

test("roundUpTo99 never rounds below the input", () => {
  assert.equal(roundUpTo99(3.9), 3.99);
  assert.equal(roundUpTo99(27.99), 27.99);
  assert.equal(roundUpTo99(28.0), 28.99); // the France Unlimited edge case
  assert.equal(roundUpTo99(11.92), 11.99);
  for (const v of [0.5, 1.99, 2.0, 7.3, 99.98, 100.0]) {
    assert.ok(roundUpTo99(v) >= v, `roundUpTo99(${v}) rounded down`);
  }
});

test("floor uses worst-case wholesale in a priority-ordered fallback chain", () => {
  // Cheap low-priority offer ($2) + expensive high-priority offer ($10):
  // fulfillment may buy the $10 offer first, so the floor must clear $10.
  const chain = [
    { r: 1, k: "expensive-priority", c: "A", w: 10 },
    { r: 2, k: "cheap-fallback", c: "B", w: 2 },
  ];
  const worstCase = maxChainWholesaleUsd(chain);
  assert.equal(worstCase, 10);

  // Pricing at the cheap offer's floor must fail against worst-case cost
  const cheapFloorPrice = roundUpTo99(computeFloorUsd(2)); // $3.99
  assert.throws(
    () => assertChargeMeetsFloor(cheapFloorPrice, worstCase!, "chain test"),
    PriceFloorError,
  );
  // Pricing at the worst-case floor passes
  const safePrice = roundUpTo99(computeFloorUsd(10)); // $12.99
  assert.doesNotThrow(() => assertChargeMeetsFloor(safePrice, worstCase!, "chain test"));
});

test("maxChainWholesaleUsd handles empty/malformed chains", () => {
  assert.equal(maxChainWholesaleUsd(null), null);
  assert.equal(maxChainWholesaleUsd([]), null);
  assert.equal(maxChainWholesaleUsd([{ w: undefined }, {}] as any), null);
  assert.equal(maxChainWholesaleUsd([{ w: 0 }, { w: 5 }]), 5);
});

test("promotion-discounted final amount below floor is rejected", () => {
  const wholesale = 7.8; // France 20GB production case
  const floor = computeFloorUsd(wholesale); // 9.75
  const listPrice = roundUpTo99(floor); // 9.99 — valid session price
  assert.doesNotThrow(() => assertChargeMeetsFloor(listPrice, wholesale, "promo test"));
  // 50%-off promo drops the PAID amount below the floor → must be rejected
  assert.throws(
    () => assertChargeMeetsFloor(listPrice * 0.5, wholesale, "promo test"),
    PriceFloorError,
  );
  // Even a paid amount above raw cost but below cost+margin is rejected
  assert.throws(
    () => assertChargeMeetsFloor(8.0, wholesale, "promo test"),
    PriceFloorError,
  );
});

test("zero and near-zero charges are always rejected", () => {
  assert.throws(() => assertChargeMeetsFloor(0, 1, "zero test"), PriceFloorError);
  assert.throws(() => assertChargeMeetsFloor(-5, 1, "neg test"), PriceFloorError);
  assert.throws(() => assertChargeMeetsFloor(0.01, 7.8, "penny test"), PriceFloorError);
});

test("supplier cost rise between session creation and payment is caught", () => {
  // Session created when worst-case cost was $5 → priced at floor(5) = $6.90 → $6.99
  const checkoutTimeChain = [{ r: 1, k: "p", c: "X", w: 5 }];
  const sessionPrice = roundUpTo99(computeFloorUsd(5)); // 6.99
  // By payment completion the live offer cost has risen to $8.
  const guardCost = resolveGuardWholesaleUsd({
    liveMaxUsd: 8,
    chainMaxUsd: maxChainWholesaleUsd(checkoutTimeChain),
    metadataCostUsd: 5,
  });
  assert.equal(guardCost, 8); // live cost dominates stale checkout-time evidence
  // The old session price no longer clears the live floor → must be rejected
  assert.ok(sessionPrice + 0.02 < computeFloorUsd(guardCost!));
  assert.throws(
    () => assertChargeMeetsFloor(sessionPrice, guardCost!, "stale session test"),
    PriceFloorError,
  );
});

test("resolveGuardWholesaleUsd uses the max of available evidence", () => {
  assert.equal(resolveGuardWholesaleUsd({ liveMaxUsd: 3, chainMaxUsd: 7, metadataCostUsd: 5 }), 7);
  assert.equal(resolveGuardWholesaleUsd({ liveMaxUsd: null, chainMaxUsd: null, metadataCostUsd: 5 }), 5);
  assert.equal(resolveGuardWholesaleUsd({ liveMaxUsd: null, chainMaxUsd: null, metadataCostUsd: 0 }), null);
  assert.equal(resolveGuardWholesaleUsd({}), null);
});

test("Paddle captured amount uses discounted total, never subtotal", () => {
  // Promotion: subtotal 999 (¢) but customer actually paid 499 after discount
  const totals = { subtotal: "999", total: "499", grand_total: "499", currency_code: "USD" };
  assert.equal(paddleCapturedUsd(totals as any), 4.99);
  // A $4.99 capture must fail the floor for a $7.80 wholesale plan
  assert.throws(
    () => assertChargeMeetsFloor(paddleCapturedUsd(totals as any)!, 7.8, "paddle promo"),
    PriceFloorError,
  );
  // GBP totals convert to USD before comparison
  assert.ok(Math.abs(paddleCapturedUsd({ total: "790", currency_code: "GBP" })! - 10) < 0.001);
  // Unknown currency → null (caller must reject)
  assert.equal(paddleCapturedUsd({ total: "999", currency_code: "EUR" }), null);
  // No totals → metadata fallback only when positive
  assert.equal(paddleCapturedUsd(null, 12.5), 12.5);
  assert.equal(paddleCapturedUsd(null, 0), null);
});

test("captured payment evaluation fails closed on missing/failed live offers", () => {
  // Removed/disabled offers after checkout: live lookup returns null → reject,
  // even though stale metadata says the price cleared the old floor.
  let v = evaluateCapturedPayment({
    paidUsd: 20, hasNormalizedPlan: true, liveMaxUsd: null,
    chainMaxUsd: 5, metadataCostUsd: 5,
  });
  assert.equal(v.ok, false);

  // Live lookup FAILURE (threw) → reject; stale metadata is never substituted.
  v = evaluateCapturedPayment({
    paidUsd: 20, hasNormalizedPlan: true, liveMaxUsd: null, liveLookupFailed: true,
    chainMaxUsd: 5, metadataCostUsd: 5,
  });
  assert.equal(v.ok, false);

  // Healthy live offer: paid clears live floor → ok, and live cost is used.
  v = evaluateCapturedPayment({
    paidUsd: 20, hasNormalizedPlan: true, liveMaxUsd: 10, chainMaxUsd: 5,
  });
  assert.ok(v.ok && v.costUsd === 10);

  // Live cost rose above what the session price covers → reject.
  v = evaluateCapturedPayment({ paidUsd: 6.99, hasNormalizedPlan: true, liveMaxUsd: 8 });
  assert.equal(v.ok, false);

  // Legacy sale (no normalized plan): metadata cost used; no evidence → reject.
  v = evaluateCapturedPayment({ paidUsd: 20, hasNormalizedPlan: false, metadataCostUsd: 5 });
  assert.ok(v.ok);
  v = evaluateCapturedPayment({ paidUsd: 20, hasNormalizedPlan: false });
  assert.equal(v.ok, false);

  // Non-positive / undeterminable paid amounts always reject.
  assert.equal(evaluateCapturedPayment({ paidUsd: 0, hasNormalizedPlan: false, metadataCostUsd: 5 }).ok, false);
  assert.equal(evaluateCapturedPayment({ paidUsd: null, hasNormalizedPlan: true, liveMaxUsd: 5 }).ok, false);
});

test("epsilon absorbs cent rounding but not real shortfalls", () => {
  const wholesale = 10;
  const floor = computeFloorUsd(wholesale); // 12.5
  assert.doesNotThrow(() => assertChargeMeetsFloor(floor - 0.01, wholesale, "eps test"));
  assert.throws(() => assertChargeMeetsFloor(floor - 0.1, wholesale, "eps test"), PriceFloorError);
});
