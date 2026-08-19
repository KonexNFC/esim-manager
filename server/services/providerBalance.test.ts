import assert from "node:assert/strict";
import test from "node:test";

test("provider wallet thresholds use sensible currency defaults", async () => {
  const { getProviderBalanceThreshold } = await import("./providerBalance");
  assert.equal(getProviderBalanceThreshold("USD"), 25);
  assert.equal(getProviderBalanceThreshold("GBP"), 20);
  assert.equal(getProviderBalanceThreshold("EUR"), 25);
});

test("a continuously low wallet is alerted only once per day", async () => {
  const { isProviderWalletAlertDue } = await import("./providerBalance");
  const initial = new Date("2026-08-20T08:00:00.000Z");
  const snapshot = {
    status: "low",
    amount: 0,
    currency: "USD",
    threshold: 25,
    checkedAt: initial.toISOString(),
    lastAlertAt: initial.toISOString(),
  };

  assert.equal(isProviderWalletAlertDue(snapshot, new Date("2026-08-21T07:59:59.000Z")), false);
  assert.equal(isProviderWalletAlertDue(snapshot, new Date("2026-08-21T08:00:00.000Z")), true);
});