import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicCatalogue } from "./catalogue-service";
import { attachPublicCatalogueQuotes } from "./public-catalogue";
import {
  Category,
  PlanStatus,
  type SupplierPlan,
} from "./supplier-plan.types";

const supplierPlans: SupplierPlan[] = [
  {
    id: "offer-esimgo",
    normalizedPlanId: "gb-seven-day-family",
    supplier: "esimgo",
    countryCode: "GB",
    validityDays: 7,
    dataMb: 7 * 1024,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 3,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "offer-esimaccess",
    normalizedPlanId: "gb-seven-day-family",
    supplier: "esimaccess",
    countryCode: "GB",
    validityDays: 7,
    dataMb: 7 * 1024,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 5,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
];

test("public catalogue routes one normalized product before issuing its singleton quote", async () => {
  const catalogue = buildPublicCatalogue("GB", supplierPlans);
  const staticSlot = catalogue.durations.DAY_7;
  const staticRoutedSku = [
    staticSlot?.recommended,
    staticSlot?.cheaper,
    staticSlot?.premium,
    ...(staticSlot?.browseAll ?? []),
  ].find(offer => offer?.id === "offer-esimaccess");
  assert.ok(staticRoutedSku);
  const events: string[] = [];

  const response = await attachPublicCatalogueQuotes(catalogue, {
    selectBestProviderForPlan: async normalizedPlanId => {
      events.push(`route:${normalizedPlanId}`);
      return {
        fallbackChain: [{
          providerKey: "esimaccess",
          providerPlanCode: "gb-seven-day-esimaccess",
        }],
      };
    },
    getOffersForNormalizedPlan: async normalizedPlanId => {
      assert.equal(normalizedPlanId, "gb-seven-day-family");
      return [{
        id: "offer-esimaccess",
        providerKey: "esimaccess",
        providerPlanCode: "gb-seven-day-esimaccess",
      }];
    },
    createCheckoutQuoteForOffer: async providerOfferId => {
      events.push(`quote:${providerOfferId}`);
      return { id: "quote-esimaccess" };
    },
    toPublicCheckoutQuote: quote => ({
      token: (quote as { id: string }).id,
      amount: 9.99,
      currency: "USD",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
  });

  const slot = response.durations.DAY_7;
  assert.ok(slot?.recommended);
  assert.equal(slot.recommended.id, "offer-esimaccess");
  assert.equal(slot.recommended.supplier, "esimaccess");
  assert.equal(slot.recommended.wholesaleCostUsd, 5);
  assert.equal(slot.recommended.sellPriceGbp, staticRoutedSku.sellPriceGbp);
  assert.equal(slot.recommended.dataGb, staticRoutedSku.dataGb);
  assert.equal(slot.recommended.quote.amount, 9.99);
  assert.equal(slot.browseAll.some(offer => offer.id === "offer-esimaccess"), false);
  assert.deepEqual(events, [
    "route:gb-seven-day-family",
    "quote:offer-esimaccess",
  ]);
});

test("public catalogue fails closed when routing selects a SKU absent from the catalogue", async () => {
  const catalogue = buildPublicCatalogue("GB", supplierPlans);
  let quoteIssued = false;

  const response = await attachPublicCatalogueQuotes(catalogue, {
    selectBestProviderForPlan: async () => ({
      fallbackChain: [{
        providerKey: "airalo",
        providerPlanCode: "not-loaded-in-public-catalogue",
      }],
    }),
    getOffersForNormalizedPlan: async () => [{
      id: "offer-not-in-catalogue",
      providerKey: "airalo",
      providerPlanCode: "not-loaded-in-public-catalogue",
    }],
    createCheckoutQuoteForOffer: async () => {
      quoteIssued = true;
      return {};
    },
    toPublicCheckoutQuote: quote => quote as Record<string, unknown>,
  });

  assert.equal(response.durations.DAY_7?.recommended, null);
  assert.equal(response.durations.DAY_7?.browseAll.length, 0);
  assert.equal(quoteIssued, false);
});