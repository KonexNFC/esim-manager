import assert from "node:assert/strict";
import test from "node:test";
import { quotedChinaPlans, chinaDataLabel, chinaValidity, chinaPlanHref, type ChinaPlan } from "../../client/src/hooks/use-china-plans";

const now = Date.parse("2026-11-22T12:00:00Z");
const plan: ChinaPlan = {
  id: "cn-offer", bucket: "DAY_7", dataGb: 100 / 1024, isUnlimited: false,
  validityDays: 10,
  quote: { amount: 12.34, currency: "USD", token: "test", expiresAt: "2026-11-22T12:15:00Z" },
};

test("China live prices deduplicate roles and exclude expired or invalid quotes", () => {
  const result = quotedChinaPlans({ durations: { DAY_7: {
    recommended: plan, cheaper: plan, browseAll: [
      { ...plan, id: "expired", quote: { ...plan.quote, expiresAt: "2026-11-22T11:00:00Z" } },
      { ...plan, id: "bad", quote: { ...plan.quote, amount: 0 } },
      { ...plan, id: "unsigned", quote: { ...plan.quote, token: "" } },
      { ...plan, id: "converted", quote: { ...plan.quote, currency: "GBP" as "USD" } },
    ],
  } } }, now);
  assert.deepEqual(result, [plan]);
  assert.deepEqual(quotedChinaPlans(undefined, now), []);
});

test("China labels use actual validity, never bucket guesses, and preserve the existing checkout link", () => {
  assert.equal(chinaValidity(plan), 10);
  assert.equal(chinaValidity({ ...plan, validityDays: undefined }), undefined);
  assert.equal(chinaDataLabel(plan), "100 MB");
  assert.equal(chinaDataLabel({ ...plan, isUnlimited: true }), "Unlimited data");
  assert.equal(chinaPlanHref(plan), "/destinations/CN?plan=cn-offer&bucket=DAY_7");
});
