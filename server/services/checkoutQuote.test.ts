import assert from "node:assert/strict";
import test from "node:test";
import {
  quoteCharge,
  quoteMatchesCapture,
  toPublicCheckoutQuote,
  verifyCheckoutQuote,
  type CheckoutQuote,
} from "./checkoutQuote";
import { refundPaddleTransaction } from "./paddleService";
import {
  assertChargeMeetsFloor,
  evaluateCapturedPayment,
  paddleCapturedUsd,
  PriceFloorError,
} from "./priceFloor";

const nigeriaUnlimited3DayQuote: CheckoutQuote = {
  version: 1,
  id: "nigeria-3-day",
  normalizedPlanId: "normalized-nigeria-unlimited-3d",
  selectedOfferId: "zendit-nigeria-unlimited-3d",
  amountMinor: 1499,
  currency: "USD",
  expiresAt: Date.now() + 60_000,
  fallbackChain: [{ r: 1, k: "zendit", c: "NG-UNL-3", w: 11.92 }],
};

test("Nigeria unlimited 3-day quote has one exact charge for Stripe, PayPal, and Paddle", () => {
  const stripe = quoteCharge(nigeriaUnlimited3DayQuote);
  const paypal = quoteCharge(nigeriaUnlimited3DayQuote);
  const paddle = quoteCharge(nigeriaUnlimited3DayQuote);

  assert.deepEqual(stripe, { amount: 14.99, amountMinor: 1499, currency: "USD" });
  assert.deepEqual(paypal, stripe);
  assert.deepEqual(paddle, stripe);
});

test("captured payment must match the signed quote's exact amount and currency", () => {
  assert.equal(quoteMatchesCapture(nigeriaUnlimited3DayQuote, 1499, "USD"), true);
  assert.equal(quoteMatchesCapture(nigeriaUnlimited3DayQuote, 2999, "USD"), false);
  assert.equal(quoteMatchesCapture(nigeriaUnlimited3DayQuote, 1499, "GBP"), false);
});

test("PayPal, Paddle, and normalized Stripe session creation reject signed quotes below the floor", () => {
  // Each of these checkout routes calls quoteCharge after validating the quote:
  // PayPal /create-order, Paddle /create, and Stripe /create-session.
  for (const amountMinor of [0, 1, 949]) {
    const unsafeQuote = { ...nigeriaUnlimited3DayQuote, amountMinor };
    for (const path of ["PayPal order", "Paddle transaction", "normalized Stripe session"]) {
      assert.throws(
        () => quoteCharge(unsafeQuote),
        PriceFloorError,
        `${path} creation accepted ${amountMinor}¢ for an $11.92 wholesale offer`,
      );
    }
  }
});

test("PayPal capture and Paddle webhook amounts reject zero and below-floor payments", () => {
  const wholesaleUsd = 7.8;
  for (const amount of [0, 0.01, 9.5]) {
    assert.throws(
      () => assertChargeMeetsFloor(amount, wholesaleUsd, "PayPal capture"),
      PriceFloorError,
      `PayPal capture accepted $${amount}`,
    );
  }

  // The Paddle webhook uses grand_total/total, then asserts that actual capture.
  for (const total of ["0", "1", "950"]) {
    const captured = paddleCapturedUsd({ grand_total: total, currency_code: "USD" });
    assert.throws(
      () => assertChargeMeetsFloor(captured ?? 0, wholesaleUsd, "Paddle transaction"),
      PriceFloorError,
      `Paddle webhook accepted a ${total}¢ capture`,
    );
  }
});

test("legacy and normalized Stripe webhook captures never pass a zero or below-floor payment", () => {
  for (const paidUsd of [0, 0.01, 9.5]) {
    const legacy = evaluateCapturedPayment({
      paidUsd,
      hasNormalizedPlan: false,
      chainMaxUsd: 7.8,
      metadataCostUsd: 7.8,
    });
    assert.equal(legacy.ok, false, `legacy Stripe webhook accepted $${paidUsd}`);

    const normalized = evaluateCapturedPayment({
      paidUsd,
      hasNormalizedPlan: true,
      liveMaxUsd: 7.8,
    });
    assert.equal(normalized.ok, false, `normalized Stripe webhook accepted $${paidUsd}`);
  }
});

test("a selected-offer quote can safely omit a more expensive normalized-plan mapping", () => {
  const quote = {
    ...nigeriaUnlimited3DayQuote,
    fallbackChain: [
      { r: 1, k: "selected", c: "selected-3d", w: 8 },
      { r: 2, k: "safe-fallback", c: "safe-3d", w: 9 },
    ],
  };
  assert.equal(quote.fallbackChain.some(item => item.c === "unrelated-expensive-3d"), false);
  assert.equal(quoteCharge(quote).amount, 14.99);
});

test("expired or tampered quotes are rejected before a payment provider is created", () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-only-checkout-quote-secret";
  try {
    const publicQuote = toPublicCheckoutQuote(nigeriaUnlimited3DayQuote);
    assert.deepEqual(verifyCheckoutQuote(publicQuote.token), nigeriaUnlimited3DayQuote);
    assert.throws(
      () => verifyCheckoutQuote(publicQuote.token, nigeriaUnlimited3DayQuote.expiresAt + 1),
      /expired/,
    );
    assert.throws(
      () => verifyCheckoutQuote(`${publicQuote.token}x`),
      /signature/,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("a rejected Paddle capture requests a provider refund and tracks a pending result", async () => {
  const priorKey = process.env.PADDLE_API_KEY;
  const priorFetch = global.fetch;
  process.env.PADDLE_API_KEY = "test-key";
  let requestedUrl = "";
  global.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: { status: "pending" } }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await refundPaddleTransaction("txn-expired-quote"), { pending: true });
    assert.match(requestedUrl, /transactions\/txn-expired-quote\/refund$/);
  } finally {
    global.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.PADDLE_API_KEY;
    else process.env.PADDLE_API_KEY = priorKey;
  }
});