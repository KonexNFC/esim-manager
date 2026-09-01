import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPayPalCapturedPayment,
  capturePayPalOrder,
  createPayPalOrder,
} from "./paypalService";
import { createPaddleTransaction } from "./paddleService";
import { PriceFloorError } from "./priceFloor";
import { assertLegacyStripeSessionCharge } from "./stripeService";

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