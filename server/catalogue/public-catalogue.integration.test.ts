import assert from "node:assert/strict";
import test from "node:test";
import { purchasableCatalogue } from "../../shared/purchasable-catalogue";
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

test("quoted plans preserve unknown hotspot and actual validity without changing prices or selection", async () => {
  for (const validityDays of [10, 15]) {
    for (const hotspotSupported of [null, false, true]) {
      const native: SupplierPlan = { ...supplierPlans[0], validityDays, hotspotSupported };
      const catalogue = buildPublicCatalogue("GB", [native]);
      const response = await attachPublicCatalogueQuotes(catalogue, {
        selectBestProviderForPlan: async () => ({ fallbackChain: [{ providerKey: "esimgo", providerPlanCode: "native" }] }),
        getOffersForNormalizedPlan: async () => [{ id: native.id, providerKey: "esimgo", providerPlanCode: "native" }],
        createCheckoutQuoteForOffer: async id => {
          assert.equal(id, native.id);
          return { amount: 12.34, currency: "USD", token: "test" };
        },
        toPublicCheckoutQuote: quote => quote,
      });
      const offers = Object.values(response.durations).flatMap(s => [s.recommended, s.cheaper, s.premium, ...s.browseAll]).filter(Boolean);
      assert.ok(offers.length);
      for (const offer of offers) {
        assert.equal(offer!.validityDays, validityDays);
        assert.equal(offer!.hotspotSupported, hotspotSupported);
        assert.equal(offer!.quote.amount, 12.34);
      }
    }
  }
});

test("synthetic-only 3/5/7 day gaps disappear after quotes and default to a purchasable day", async () => {
  const native = { ...supplierPlans[0], id: "native-day", normalizedPlanId: "one-day", validityDays: 1 };
  const catalogue = buildPublicCatalogue("GB", [native]);
  for (const day of ["DAY_3", "DAY_5", "DAY_7"]) {
    assert.ok(catalogue.availableDurations.includes(day as any));
  }
  const result = await attachPublicCatalogueQuotes(catalogue, {
    selectBestProviderForPlan: async () => ({ fallbackChain: [{ providerKey: "esimgo", providerPlanCode: "daily" }] }),
    getOffersForNormalizedPlan: async () => [{ id: native.id, providerKey: "esimgo", providerPlanCode: "daily" }],
    createCheckoutQuoteForOffer: async id => {
      assert.equal(id, native.id, "generated bundles must never be quoted");
      return { amount: 5, currency: "USD", token: "test" };
    },
    toPublicCheckoutQuote: quote => quote,
  });
  assert.deepEqual(result.availableDurations, ["DAY_1"]);
  assert.equal(result.defaultDuration, "DAY_1");
});

test("presentation repairs stale metadata, retains browse-only durations and prefers day three", () => {
  const empty = { recommended: null, cheaper: null, premium: null, browseAll: [] };
  const quoted = { quote: { amount: 5 }, isSynthetic: false };
  const input = { defaultDuration: "DAY_5", availableDurations: ["DAY_5"],
    durations: {
      DAY_30: { ...empty, recommended: quoted },
      DAY_3: { ...empty, browseAll: [quoted] },
      DAY_5: { ...empty, recommended: { isSynthetic: true, quote: { amount: 10 } } },
      DAY_7: { ...empty, browseAll: [{ isSynthetic: false }] },
    } };
  const result = purchasableCatalogue(input);
  assert.deepEqual(result.availableDurations, ["DAY_3", "DAY_30"]);
  assert.equal(result.defaultDuration, "DAY_3");
  assert.equal(input.defaultDuration, "DAY_5");
  assert.equal(purchasableCatalogue({ ...input, durations: { DAY_5: empty } }).defaultDuration, "");
});

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