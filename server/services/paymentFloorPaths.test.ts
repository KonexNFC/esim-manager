import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPayPalCapturedPayment,
  capturePayPalOrder,
  createPayPalOrder,
} from "./paypalService";
import { createPaddleTransaction } from "./paddleService";
import { PriceFloorError, getPinnedWholesaleUsd } from "./priceFloor";
import { assertLegacyStripeSessionCharge, evaluateStripeCompletion } from "./stripeService";

const wholesaleUsd = 7.8;
const unsafeAmounts = [0, 0.01, 9.5];

test("PayPal create rejects zero and below-floor orders before its API is called", async () => {
  const previousClientId = process.env.PAYPAL_CLIENT_ID;
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET;
  const previousFetch = global.fetch;
  let calls = 0;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  global.fetch = (async () => {
    calls++;
    throw new Error("PayPal API must not be called for an unsafe charge");
  }) as typeof fetch;

  try {
    for (const amountUsd of unsafeAmounts) {
      await assert.rejects(
        () => createPayPalOrder({
          amountUsd,
          wholesaleUsd,
          description: "eSIM",
          customId: "quote-test",
        }),
        PriceFloorError,
      );
    }
    assert.equal(calls, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = previousClientId;
    if (previousSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = previousSecret;
  }
});

test("PayPal capture's post-capture guard rejects an unsafe amount returned by PayPal", async () => {
  const previousClientId = process.env.PAYPAL_CLIENT_ID;
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET;
  const previousFetch = global.fetch;
  const urls: string[] = [];
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: "COMPLETED",
      payer: { email_address: "buyer@example.test", payer_id: "payer" },
      purchase_units: [{
        custom_id: "quote-test",
        payments: { captures: [{ id: "capture-test", amount: { value: "0.01" } }] },
      }],
    }), { status: 201 });
  }) as typeof fetch;

  try {
    const captured = await capturePayPalOrder("paypal-order");
    assert.throws(
      () => assertPayPalCapturedPayment(captured.amountUsd, wholesaleUsd, "paypal-order"),
      PriceFloorError,
    );
    assert.equal(urls.length, 2);
    assert.match(urls[1], /\/paypal-order\/capture$/);
  } finally {
    global.fetch = previousFetch;
    if (previousClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = previousClientId;
    if (previousSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = previousSecret;
  }
});

test("Paddle create rejects zero and below-floor transactions before its API is called", async () => {
  const previousKey = process.env.PADDLE_API_KEY;
  const previousFetch = global.fetch;
  let calls = 0;
  process.env.PADDLE_API_KEY = "test-key";
  global.fetch = (async () => {
    calls++;
    throw new Error("Paddle API must not be called for an unsafe charge");
  }) as typeof fetch;

  try {
    for (const amount of unsafeAmounts) {
      await assert.rejects(
        () => createPaddleTransaction({
          amount,
          wholesaleUsd,
          currency: "USD",
          description: "eSIM",
          customData: { quoteToken: "quote-test" },
        }),
        PriceFloorError,
      );
    }
    assert.equal(calls, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.PADDLE_API_KEY;
    else process.env.PADDLE_API_KEY = previousKey;
  }
});

test("legacy Stripe session creation rejects zero and below-floor charges", () => {
  for (const amount of unsafeAmounts) {
    assert.throws(
      () => assertLegacyStripeSessionCharge(amount, wholesaleUsd, "legacy-plan"),
      PriceFloorError,
    );
  }
});

const stripeSession = {
  metadata: { normalizedPlanId: "normalized-test" },
  amount_total: 999,
  currency: "usd",
};
const checkoutChain = [{ r: 1, k: "esimgo", c: "selected-sku", w: 7.8 }];
const noQuoteLookup = async (): Promise<number> => {
  throw new Error("An unsigned session must use the live normalized-plan lookup");
};

test("Stripe completion re-queries cost after session creation and rejects a supplier increase", async () => {
  let cost = 7.8;
  let calls = 0;
  const dependencies = {
    getPinnedWholesaleUsd: async (planId: string) => {
      assert.equal(planId, stripeSession.metadata.normalizedPlanId);
      calls++;
      return cost;
    },
    validateCheckoutQuoteOfferSnapshot: noQuoteLookup,
  };
  assert.equal((await evaluateStripeCompletion(stripeSession, checkoutChain, 7.8, dependencies)).ok, true);
  cost = 10;
  const verdict = await evaluateStripeCompletion(stripeSession, checkoutChain, 7.8, dependencies);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /below floor/);
  assert.equal(calls, 2);
});

test("Stripe completion rejects missing and failed live evidence despite safe checkout metadata", async () => {
  for (const lookup of [
    async () => null,
    async (): Promise<number> => { throw new Error("catalogue unavailable"); },
  ]) {
    const verdict = await evaluateStripeCompletion(stripeSession, checkoutChain, 7.8, {
      getPinnedWholesaleUsd: lookup,
      validateCheckoutQuoteOfferSnapshot: noQuoteLookup,
    });
    assert.equal(verdict.ok, false);
  }
});

test("Stripe quote completion uses fresh selected-offer evidence without broadening the purchased SKU", async () => {
  const session = {
    ...stripeSession,
    metadata: {
      ...stripeSession.metadata,
      checkoutQuoteId: "quote-test",
      checkoutSelectedOfferId: "selected-offer",
      checkoutQuoteAmountMinor: "999",
      checkoutQuoteCurrency: "USD",
    },
  };
  let quoteCalls = 0;
  const dependencies = {
    getPinnedWholesaleUsd: async (): Promise<number> => {
      assert.fail("Must not price unrelated offers in a signed quote's group");
    },
    validateCheckoutQuoteOfferSnapshot: async (quote: any) => {
      quoteCalls++;
      assert.equal(quote.selectedOfferId, "selected-offer");
      assert.deepEqual(quote.fallbackChain, checkoutChain);
      return 7.8;
    },
  };
  assert.equal((await evaluateStripeCompletion(session, checkoutChain, 7.8, dependencies)).ok, true);
  assert.equal(quoteCalls, 1);
  assert.equal((await evaluateStripeCompletion({ ...session, amount_total: 998 }, checkoutChain, 7.8, dependencies)).ok, false);
  assert.equal((await evaluateStripeCompletion(session, checkoutChain, 7.8, {
    ...dependencies,
    validateCheckoutQuoteOfferSnapshot: async () => { throw new PriceFloorError("Supplier price changed"); },
  })).ok, false);
});

test("Stripe completion preserves legacy evidence and rejects unknown capture currencies", async () => {
  const dependencies = {
    getPinnedWholesaleUsd: async (): Promise<number> => { assert.fail("Legacy sale has no normalized plan"); },
    validateCheckoutQuoteOfferSnapshot: noQuoteLookup,
  };
  assert.equal((await evaluateStripeCompletion({ ...stripeSession, metadata: {} }, checkoutChain, 7.8, dependencies)).ok, true);
  assert.equal((await evaluateStripeCompletion({ ...stripeSession, metadata: {}, currency: "eur" }, checkoutChain, 7.8, dependencies)).ok, false);
});

test("Stripe completion verifies the purchased SKU when unrelated group offers remain", async () => {
  const pinned = { providerKey: "esimgo", providerPlanCode: "selected-sku", wholesalePriceUsd: 7.8 };
  const unrelated = [
    { providerKey: "esimgo", providerPlanCode: "other-cheap-sku", wholesalePriceUsd: 1 },
    { providerKey: "airalo", providerPlanCode: "selected-sku", wholesalePriceUsd: 50 },
  ];
  for (const cost of [7.8, 10, 0, -1, NaN, Infinity, null]) {
    let lookups = 0;
    const verdict = await evaluateStripeCompletion(stripeSession, checkoutChain, 7.8, {
      validateCheckoutQuoteOfferSnapshot: noQuoteLookup,
      getPinnedWholesaleUsd: (planId, chain) => getPinnedWholesaleUsd(planId, chain, async id => {
        assert.equal(id, stripeSession.metadata.normalizedPlanId);
        lookups++;
        return cost === null ? unrelated : [...unrelated, { ...pinned, wholesalePriceUsd: cost }];
      }),
    });
    assert.equal(verdict.ok, cost === 7.8, `pinned cost ${cost}`);
    assert.equal(lookups, 1);
  }
});