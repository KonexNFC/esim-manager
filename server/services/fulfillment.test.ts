import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesStoredProviderOfferIdentity,
  resolveCanonicalNormalizedPlanId,
} from "./fulfillment";

test("legacy providerOffer references resolve to their canonical normalized plan", () => {
  const storedOffer = {
    normalizedPlanId: "normalized-plan-1",
    providerKey: "esimgo",
    providerPlanCode: "GB-1GB-7D",
    isActive: true,
  };

  assert.equal(
    resolveCanonicalNormalizedPlanId("provider-offer-1", storedOffer),
    "normalized-plan-1",
  );
  assert.equal(
    matchesStoredProviderOfferIdentity(storedOffer, {
      k: "esimgo",
      c: "GB-1GB-7D",
    }),
    true,
  );
});

test("standard normalized-plan references remain canonical", () => {
  assert.equal(
    resolveCanonicalNormalizedPlanId("normalized-plan-1", null),
    "normalized-plan-1",
  );
});

test("a pinned provider-offer reference rejects mismatched supplier SKU", () => {
  const storedOffer = {
    normalizedPlanId: "normalized-plan-1",
    providerKey: "esimgo",
    providerPlanCode: "GB-1GB-7D",
    isActive: true,
  };

  assert.equal(
    matchesStoredProviderOfferIdentity(storedOffer, {
      k: "esimgo",
      c: "GB-3GB-30D",
    }),
    false,
  );
  assert.equal(
    matchesStoredProviderOfferIdentity(storedOffer, {
      k: "esimaccess",
      c: "GB-1GB-7D",
    }),
    false,
  );
  assert.equal(
    matchesStoredProviderOfferIdentity(
      { ...storedOffer, isActive: false },
      { k: "esimgo", c: "GB-1GB-7D" },
    ),
    false,
  );
});