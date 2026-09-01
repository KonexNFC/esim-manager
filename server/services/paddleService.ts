// ─── Paddle Billing v2 Service ────────────────────────────────────────────────

import { assertChargeMeetsFloor } from "./priceFloor";

const PADDLE_BASE =
  process.env.PADDLE_SANDBOX === "true"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";

const BASE_URL =
  process.env.APP_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "http://localhost:5000");

export async function createPaddleTransaction(params: {
  amount: number;
  currency: string;
  description: string;
  wholesaleUsd?: number;
  email?: string;
  customData: Record<string, string>;
}): Promise<{ checkoutUrl: string; transactionId: string }> {
  if (params.wholesaleUsd != null) {
    assertChargeMeetsFloor(
      params.amount,
      params.wholesaleUsd,
      `Paddle transaction ${params.customData.quoteToken ?? "creation"}`,
    );
  }
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY not configured");

  const res = await fetch(`${PADDLE_BASE}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          price: {
            description: params.description,
            amount: String(Math.round(params.amount * 100)),
            currency_code: params.currency.toUpperCase(),
            product: {
              name: params.description,
              tax_category: "standard",
            },
          },
          quantity: 1,
        },
      ],
      checkout: {
        url: `${BASE_URL}/checkout-success`,
      },
      custom_data: params.customData,
      ...(params.email ? { customer: { email: params.email } } : {}),
    }),
  });

  const data: any = await res.json();
  if (!res.ok || data.error)
    throw new Error(`Paddle create transaction failed: ${JSON.stringify(data?.error ?? data)}`);

  const checkoutUrl: string | undefined = data.data?.checkout?.url;
  if (!checkoutUrl) throw new Error("Paddle did not return a checkout URL");

  return { checkoutUrl, transactionId: data.data?.id ?? "" };
}

/** Request a full refund for a completed Paddle Billing transaction. Paddle
 * treats a repeated refund request for the same transaction idempotently. */
export async function refundPaddleTransaction(transactionId: string): Promise<{ pending: boolean }> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY not configured");
  if (!transactionId) throw new Error("Missing Paddle transaction ID for refund");

  const res = await fetch(`${PADDLE_BASE}/transactions/${encodeURIComponent(transactionId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const data: any = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Paddle refund failed: ${JSON.stringify(data?.error ?? data)}`);
  }
  const status = String(data.data?.status ?? "").toLowerCase();
  return { pending: status !== "completed" && status !== "succeeded" };
}

export function verifyPaddleWebhook(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return false;
  try {
    const crypto = require("crypto");
    const ts = signature.split(";")[0]?.replace("ts=", "");
    const h1 = signature.split(";")[1]?.replace("h1=", "");
    if (!ts || !h1) return false;
    const payload = `${ts}:${rawBody}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(h1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
