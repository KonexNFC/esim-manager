// ─── PayPal REST API Service ───────────────────────────────────────────────────

const PAYPAL_BASE =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

const BASE_URL =
  process.env.APP_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "http://localhost:5000");

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not configured");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token as string;
}

export interface PayPalBillingAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
}

export async function createPayPalOrder(params: {
  amountUsd: number;
  description: string;
  customId?: string;
  payerName?: string;
  payerEmail?: string;
  billingAddress?: PayPalBillingAddress;
}): Promise<{ orderId: string }> {
  const token = await getAccessToken();

  const payer: Record<string, any> = {};
  if (params.payerName) {
    const parts = params.payerName.trim().split(' ');
    payer.name = { given_name: parts[0], surname: parts.slice(1).join(' ') || parts[0] };
  }
  if (params.payerEmail) payer.email_address = params.payerEmail;
  if (params.billingAddress) {
    const a = params.billingAddress;
    payer.address = {
      address_line_1: a.addressLine1,
      ...(a.addressLine2 ? { address_line_2: a.addressLine2 } : {}),
      admin_area_2: a.city,
      admin_area_1: a.state,
      postal_code: a.zip,
      country_code: a.countryCode,
    };
  }

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": params.customId ?? `konex-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      ...(Object.keys(payer).length > 0 ? { payer } : {}),
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: params.amountUsd.toFixed(2),
          },
          description: params.description,
          custom_id: params.customId ?? "",
        },
      ],
      application_context: {
        return_url: `${BASE_URL}/checkout-success`,
        cancel_url: `${BASE_URL}/checkout-cancel`,
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`PayPal create order failed: ${JSON.stringify(data)}`);
  return { orderId: data.id };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  status: string;
  amountUsd: number;
  payerEmail: string;
  payerId: string;
  captureId: string;
  customId: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`PayPal capture failed: ${JSON.stringify(data)}`);
  if (data.status !== "COMPLETED") throw new Error(`PayPal order status: ${data.status}`);

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: data.status,
    amountUsd: parseFloat(capture?.amount?.value ?? "0"),
    payerEmail: data.payer?.email_address ?? "",
    payerId: data.payer?.payer_id ?? "",
    captureId: capture?.id ?? "",
    customId: data.purchase_units?.[0]?.custom_id ?? "",
  };
}
