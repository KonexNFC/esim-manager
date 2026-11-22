import test from "node:test";
import assert from "node:assert/strict";
import { catalogueCounts, lowestCataloguePrice } from "./homepage-summary";
import type { PublicCatalogueResponse } from "./public-catalogue";

test("homepage counts unique active catalogue products and destinations, not offers", () => {
  assert.deepEqual(catalogueCounts([
    { id: "gb1", regionCode: "GB", validityDays: 7 },
    { id: "gb1", regionCode: "GB", validityDays: 7 },
    { id: "gb2", regionCode: "GB", validityDays: 30 },
    { id: "ng1", regionCode: "NG", validityDays: 1 },
    { id: "invalid", regionCode: "not-a-destination", validityDays: 7 },
    { id: "unsupported", regionCode: "US", validityDays: 0 },
  ]), { destinationCount: 2, activePlanCount: 3 });
  assert.deepEqual(catalogueCounts([]), { destinationCount: 0, activePlanCount: 0 });
});

function catalogue(prices: Array<{ amount: unknown; currency: string; synthetic?: boolean }>) {
  return { durations: { DAY_7: {
    recommended: null, cheaper: null, premium: null,
    browseAll: prices.map(p => ({ isSynthetic: p.synthetic ?? false, quote: p })),
  } } } as unknown as PublicCatalogueResponse;
}

test("starting prices use lowest positive final USD quote, including browse-all", () => {
  assert.equal(lowestCataloguePrice(catalogue([
    { amount: 20, currency: "USD" },
    { amount: 4.99, currency: "USD" },
    { amount: 12, currency: "USD" },
  ])), 4.99);
});

test("missing, synthetic, malformed and other-currency prices are never advertised", () => {
  assert.equal(lowestCataloguePrice(catalogue([
    { amount: 0, currency: "USD" },
    { amount: -1, currency: "USD" },
    { amount: NaN, currency: "USD" },
    { amount: Infinity, currency: "USD" },
    { amount: "1.00", currency: "USD" },
    { amount: 2, currency: "GBP" },
    { amount: 1, currency: "USD", synthetic: true },
  ])), undefined);
  assert.equal(lowestCataloguePrice(catalogue([])), undefined);
});
