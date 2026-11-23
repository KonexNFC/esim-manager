import assert from "node:assert/strict";
import test from "node:test";
import { approvalId, approvedMembers, assertBoundEquivalent, canonicalApproval, termsHash } from "./supplierEquivalence";
import { canonicalServiceTerms, type ServiceTerms, type EquivalenceApproval } from "../../shared/serviceEquivalence";
import { fulfillWithFallbackChain } from "./fulfillment";
import { PurchasePendingError, PurchaseRejectedError } from "../providers/adapters/purchaseOutcome";
import { EsimAccessAdapter } from "../providers/adapters/esimAccess";
import { quoteCharge, toPublicCheckoutQuote, verifyCheckoutQuote, type CheckoutQuote } from "./checkoutQuote";

const terms: ServiceTerms = {
  coverage: ["GB", "FR"],
  allowance: { kind: "total", megabytes: 1024 },
  validityHours: 168,
  throttling: { thresholdMb: null, speedKbps: null, reset: "none" },
  activation: { startsOn: "first_connection", activationWindowHours: 720, topup: false, tethering: true },
};
const offers = ["esimgo", "airalo"].map((providerKey, i) => ({
  id: `offer-${i}`, providerKey, providerPlanCode: `sku-${i}`, serviceTerms: terms,
}));
const approval: EquivalenceApproval = {
  group: "GB-FR-1GB-7D", version: 1, approvedBy: "test-reviewer", evidence: "supplier documents",
  terms, members: offers.map(o => ({
    offerId: o.id, providerKey: o.providerKey, providerPlanCode: o.providerPlanCode, termsHash: termsHash(terms),
  })),
};
const version = { id: approvalId(approval), approval };
const chain = offers.map((o, i) => ({
  r: i + 1, k: o.providerKey, c: o.providerPlanCode, w: 5 + i, o: o.id, e: version.id,
}));

test("eSIM Access accepted order retains its reference when allocation times out", async (t) => {
  const adapter = new EsimAccessAdapter("test-code", "test-secret");
  let purchases = 0;
  t.mock.method(adapter as any, "req", async (path: string) => {
    if (path === "/esim/order") { purchases++; return { obj: { orderNo: "accepted-order" } }; }
    return { obj: { esimList: [] } };
  });
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => setImmediate(callback) as any);
  await assert.rejects(adapter.purchaseEsim({
    providerRef: "exact-sku", countryCode: "GB", dataAmountGb: 1,
    validityDays: 7, customerEmail: "test@example.invalid",
  }), (error: unknown) => {
    assert.ok(error instanceof PurchasePendingError);
    assert.equal(error.providerOrderId, "accepted-order");
    return true;
  });
  assert.equal(purchases, 1);
});

test("exact approved SKUs share a stable version independent of country ordering", () => {
  assert.equal(termsHash({ ...terms, coverage: ["FR", "GB", "FR"] }), termsHash(terms));
  assert.equal(approvedMembers(version, offers[0], offers).length, 2);
  assert.doesNotThrow(() => assertBoundEquivalent(chain[0], chain[1], offers[1], version));
  assert.notEqual(approvalId({ ...approval, version: 2 }), version.id);
});

test("unknown and non-equivalent terms cannot form an approval", () => {
  assert.throws(() => canonicalServiceTerms({ ...terms, activation: undefined }));
  assert.throws(() => canonicalApproval({
    ...approval, members: [approval.members[0], { ...approval.members[1], termsHash: "different" }],
  }));
  assert.deepEqual(approvedMembers(version, { ...offers[0], serviceTerms: null }, offers), []);
});

test("every material term change and recycled SKU identity fails closed", () => {
  const changes = [
    { ...terms, coverage: ["GB"] },
    { ...terms, allowance: { kind: "daily", megabytes: 1024 } },
    { ...terms, validityHours: 72 },
    { ...terms, throttling: { thresholdMb: 500, speedKbps: 128, reset: "daily" } },
    { ...terms, activation: { ...terms.activation, startsOn: "purchase" } },
  ];
  for (const serviceTerms of changes) {
    const changed = { ...offers[1], serviceTerms };
    assert.throws(() => assertBoundEquivalent(chain[0], chain[1], changed, version));
    assert.equal(approvedMembers(version, offers[0], [offers[0], changed]).length, 1);
  }
  for (const changed of [
    { ...offers[1], id: "replacement-id" },
    { ...offers[1], providerPlanCode: "replacement-sku" },
    { ...offers[1], serviceTerms: null },
  ]) assert.throws(() => assertBoundEquivalent(chain[0], chain[1], changed, version));
});

test("mutating a version or substituting a newer approval invalidates paid evidence", () => {
  assert.throws(() => assertBoundEquivalent(chain[0], chain[1], offers[1], {
    ...version, approval: { ...approval, evidence: "mutated" },
  }));
  const next = { ...approval, version: 2 };
  assert.throws(() => assertBoundEquivalent(chain[0], chain[1], offers[1], {
    id: approvalId(next), approval: next,
  }));
  assert.throws(() => assertBoundEquivalent(chain[0], { ...chain[1], e: undefined }, offers[1], version));
});

test("signed quote preserves approved IDs and worst-case floor", () => {
  const quote: CheckoutQuote = {
    version: 1, id: "equivalence-test", normalizedPlanId: "np", selectedOfferId: offers[0].id,
    currency: "USD", amountMinor: 999, expiresAt: Date.now() + 60_000, fallbackChain: chain,
  };
  // Existing test environment supplies SESSION_SECRET; never alter live credentials.
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "local-equivalence-test-only";
  const token = toPublicCheckoutQuote(quote).token;
  assert.deepEqual(verifyCheckoutQuote(token).fallbackChain, chain);
  assert.throws(() => verifyCheckoutQuote(token.slice(0, -2) + "xx"));
  assert.equal(quoteCharge(quote).amountMinor, 999);
  assert.throws(() => quoteCharge({ ...quote, fallbackChain: [chain[0], { ...chain[1], w: 20 }] }));
});

async function execute(options: { changed?: boolean; unhealthy?: boolean; added?: boolean; ambiguous?: boolean; allocatedTimeout?: boolean } = {}) {
  const calls: string[] = [];
  const attempts: string[] = [];
  const runtimeChain = options.added
    ? [...chain, { ...chain[1], k: "unapproved", c: "new" }]
    : chain;
  const result = fulfillWithFallbackChain(
    "test-order", { normalizedPlanId: "np", fallbackProvidersJson: chain } as any,
    runtimeChain, { countryCode: "GB", dataAmountGb: 1, validityDays: 7, customerEmail: "test@example.invalid" },
    {} as any, "GB", null, {
      assertOffer: async (_order, entry, primary) => {
        const live = offers.find(o => o.id === entry.o)!;
        assertBoundEquivalent(primary, entry, options.changed && entry.r === 2
          ? { ...live, serviceTerms: { ...terms, validityHours: 24 } } : live, version);
      },
      eligibility: async (key) => ({
        eligible: !(options.unhealthy && key === "airalo"), reason: "test eligibility",
      }) as any,
      adapter: (key) => ({
        name: key,
        purchaseEsim: async (params: any) => {
          calls.push(`${key}/${params.providerRef}`);
          if (options.ambiguous) throw new TypeError("network response lost");
          if (options.allocatedTimeout) throw new PurchasePendingError(key, "order accepted but allocation timed out", "confirmed-order");
          if (key === "esimgo" || options.added) throw new PurchaseRejectedError("definitively rejected before purchase");
          return { iccid: "test-iccid", qrCodeUrl: "test-qr" };
        },
      }) as any,
      log: async (_id, key, _code, _rank, status) => { attempts.push(`${key}:${status}`); },
      record: async () => {},
      pause: async () => {},
      beforePurchase: async () => {},
      afterRejection: async () => {},
    },
  );
  return { result, calls, attempts };
}

for (const options of [{ ambiguous: true }, { allocatedTimeout: true }]) {
  test(`uncertain purchase never buys a fallback ${JSON.stringify(options)}`, async () => {
    const run = await execute(options);
    await assert.rejects(run.result, PurchasePendingError);
    assert.deepEqual(run.calls, ["esimgo/sku-0"]);
    assert.deepEqual(run.attempts, ["esimgo:pending"]);
  });
}

test("approved fallback issues after primary rejection", async () => {
  const run = await execute();
  assert.equal((await run.result).providerKey, "airalo");
  assert.deepEqual(run.calls, ["esimgo/sku-0", "airalo/sku-1"]);
  assert.deepEqual(run.attempts, ["esimgo:error", "airalo:ok"]);
});

for (const options of [{ changed: true }, { unhealthy: true }, { added: true }]) {
  test(`fulfillment rejects unsafe fallback ${JSON.stringify(options)}`, async () => {
    const run = await execute(options);
    await assert.rejects(run.result);
    assert.equal(run.calls.some(c => c.startsWith("unapproved")), false);
    if (!options.added) assert.deepEqual(run.calls, ["esimgo/sku-0"]);
  });
}
