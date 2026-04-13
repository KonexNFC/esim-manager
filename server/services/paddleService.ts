// ─── Paddle Billing v2 Service ────────────────────────────────────────────────

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
  amountUsd: number;
  description: string;
  email?: string;
  customData: Record<string, string>;
}): Promise<{ checkoutUrl: string; transactionId: string }> {
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
            amount: String(Math.round(params.amountUsd * 100)),
            currency_code: "USD",
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
