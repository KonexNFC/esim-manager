// ─── Authoritative checkout quotes ────────────────────────────────────────────
// A quote binds a checkout to one concrete supplier offer. It is signed so
// payment endpoints can use the exact price and safe fallback chain selected
// before the customer enters a hosted payment page.

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../storage";
import { normalizedPlans, providerOffers } from "@shared/schema";
import { getOffersForNormalizedPlan } from "./providerRegistry";
import { computeFloorUsd, PriceFloorError, roundUpTo99 } from "./priceFloor";
import { calculateSellPrice, GBP_RATE } from "../catalogue/pricing-engine";
import { mapOfferType, normalizeValidityToBucket } from "../catalogue/normalizer";

// Stripe Checkout requires sessions to remain open for at least 30 minutes.
// Keep the signed quote just above that minimum, then expire the hosted session
// at the same instant so Stripe cannot capture an expired quote.
const QUOTE_TTL_MS = 35 * 60 * 1000;
const QUOTE_VERSION = 1;

export type QuoteFallback = {
  r: number;
  k: string;
  c: string;
  w: number;
};

export type CheckoutQuote = {
  version: number;
  id: string;
  normalizedPlanId: string;
  selectedOfferId: string;
  amountMinor: number;
  currency: "USD";
  expiresAt: number;
  fallbackChain: QuoteFallback[];
};

export type PublicCheckoutQuote = {
  token: string;
  amount: number;
  currency: "USD";
  expiresAt: string;
};

function quoteSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured before checkout quotes can be issued");
  return secret;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string): string {
  return crypto.createHmac("sha256", quoteSecret()).update(encodedPayload).digest("base64url");
}

function signQuote(quote: CheckoutQuote): string {
  const payload = encode(JSON.stringify(quote));
  return `${payload}.${sign(payload)}`;
}

export function toPublicCheckoutQuote(quote: CheckoutQuote): PublicCheckoutQuote {
  return {
    token: signQuote(quote),
    amount: quote.amountMinor / 100,
    currency: quote.currency,
    expiresAt: new Date(quote.expiresAt).toISOString(),
  };
}

export function verifyCheckoutQuote(token: unknown, now = Date.now()): CheckoutQuote {
  if (typeof token !== "string") throw new PriceFloorError("Missing checkout quote");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new PriceFloorError("Invalid checkout quote");
  const expected = sign(payload);
  if (signature.length !== expected.length) throw new PriceFloorError("Invalid checkout quote signature");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new PriceFloorError("Invalid checkout quote signature");
  }

  let quote: CheckoutQuote;
  try {
    quote = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new PriceFloorError("Invalid checkout quote payload");
  }

  if (
    quote.version !== QUOTE_VERSION ||
    !quote.id ||
    !quote.normalizedPlanId ||
    !quote.selectedOfferId ||
    quote.currency !== "USD" ||
    !Number.isInteger(quote.amountMinor) ||
    quote.amountMinor <= 0 ||
    !Array.isArray(quote.fallbackChain) ||
    quote.fallbackChain.length === 0
  ) {
    throw new PriceFloorError("Invalid checkout quote payload");
  }
  if (quote.expiresAt <= now) throw new PriceFloorError("This price quote has expired. Please refresh and try again.");
  return quote;
}

/**
 * Issue a quote for the exact provider offer the customer selected. Fallbacks
 * are permitted only when they map to the same normalized plan AND their
 * current wholesale cost is safe at the locked customer price.
 */
export async function createCheckoutQuoteForOffer(providerOfferId: string): Promise<CheckoutQuote> {
  const [selectedRow] = await db
    .select({
      offerId: providerOffers.id,
      normalizedPlanId: providerOffers.normalizedPlanId,
      wholesalePriceUsd: providerOffers.wholesalePriceUsd,
      normalizedActive: normalizedPlans.isActive,
      validityDays: normalizedPlans.validityDays,
      dataMb: normalizedPlans.dataMb,
      isUnlimited: normalizedPlans.isUnlimited,
    })
    .from(providerOffers)
    .innerJoin(normalizedPlans, eq(providerOffers.normalizedPlanId, normalizedPlans.id))
    .where(eq(providerOffers.id, providerOfferId))
    .limit(1);

  if (!selectedRow || !selectedRow.normalizedActive) {
    throw new PriceFloorError("This selected offer is no longer available.");
  }

  const eligible = await getOffersForNormalizedPlan(selectedRow.normalizedPlanId);
  const selected = eligible.find(offer => offer.id === providerOfferId);
  if (!selected) {
    throw new PriceFloorError("This selected offer is no longer available.");
  }

  const bucket = normalizeValidityToBucket(selectedRow.validityDays);
  if (!bucket) throw new PriceFloorError("This selected offer has an unsupported validity period.");
  const offerType = mapOfferType({
    isUnlimited: selectedRow.isUnlimited,
    dataMb: selectedRow.dataMb,
  });

  // Retain the catalogue's established target bands, but publish one USD amount
  // because PayPal and Paddle are USD-only in this integration.
  const catalogueGbp = calculateSellPrice(selected.wholesalePriceUsd, bucket, offerType).sellPriceGbp;
  const catalogueUsd = Math.round((catalogueGbp / GBP_RATE) * 100) / 100;
  const selectedFloor = computeFloorUsd(selected.wholesalePriceUsd);
  const amountUsd = Math.max(catalogueUsd, roundUpTo99(selectedFloor));
  const amountMinor = Math.round(amountUsd * 100);

  // Provider offers are not interchangeable merely because normalization groups
  // them together. Preserve the selected supplier SKU exactly; adding a
  // fallback is only safe once an explicit immutable-equivalence mapping exists.
  const safeFallbacks = [selected];
  if (computeFloorUsd(selected.wholesalePriceUsd) > amountUsd + 0.02) {
    throw new PriceFloorError("This selected offer cannot be safely priced.");
  }

  return {
    version: QUOTE_VERSION,
    id: crypto.randomBytes(12).toString("base64url"),
    normalizedPlanId: selectedRow.normalizedPlanId,
    selectedOfferId: selected.id,
    amountMinor,
    currency: "USD",
    expiresAt: Date.now() + QUOTE_TTL_MS,
    fallbackChain: safeFallbacks.map((offer, index) => ({
      r: index + 1,
      k: offer.providerKey,
      c: offer.providerPlanCode,
      w: offer.wholesalePriceUsd,
    })),
  };
}

/** Legacy plan pages have no supplier-offer identity in the URL, so choose one
 * current eligible offer once and preserve that identity in the returned quote. */
export async function createCheckoutQuoteForNormalizedPlan(normalizedPlanId: string): Promise<CheckoutQuote> {
  const eligible = await getOffersForNormalizedPlan(normalizedPlanId);
  const selected = [...eligible].sort((a, b) =>
    a.wholesalePriceUsd - b.wholesalePriceUsd || a.providerPriority - b.providerPriority,
  )[0];
  if (!selected) throw new PriceFloorError("This plan has no currently fulfillable offer.");
  return createCheckoutQuoteForOffer(selected.id);
}

/**
 * Re-check a quote immediately before a payment provider creates a payment.
 * Costs and offer mappings are part of the signed quote, so any supplier sync
 * change fails closed instead of silently charging a different amount.
 */
export async function validateCheckoutQuoteForPayment(token: unknown): Promise<CheckoutQuote> {
  const quote = verifyCheckoutQuote(token);
  await validateCheckoutQuoteOfferSnapshot(quote);
  return quote;
}

/** Validates the supplier identity and cost snapshot embedded in a quote. This
 * is also used by Stripe webhooks, where Stripe metadata is authoritative but
 * has a 500-character value limit that can be too small for a full token. */
export async function validateCheckoutQuoteOfferSnapshot(
  quote: Pick<CheckoutQuote, "normalizedPlanId" | "selectedOfferId" | "fallbackChain">,
): Promise<void> {
  const eligible = await getOffersForNormalizedPlan(quote.normalizedPlanId);
  const byId = new Map(eligible.map(offer => [offer.id, offer]));
  const selected = byId.get(quote.selectedOfferId);
  if (!selected) throw new PriceFloorError("The selected offer is no longer available. Please refresh the price.");

  for (const item of quote.fallbackChain) {
    const current = [...byId.values()].find(offer =>
      offer.providerKey === item.k &&
      offer.providerPlanCode === item.c &&
      Math.abs(offer.wholesalePriceUsd - item.w) < 0.0001,
    );
    if (!current) {
      throw new PriceFloorError("The supplier price changed. Please refresh the price.");
    }
  }
}

export function quoteCharge(quote: CheckoutQuote): { amount: number; amountMinor: number; currency: "USD" } {
  return { amount: quote.amountMinor / 100, amountMinor: quote.amountMinor, currency: quote.currency };
}

export function quoteMatchesCapture(
  quote: Pick<CheckoutQuote, "amountMinor" | "currency">,
  capturedAmountMinor: number,
  capturedCurrency: string,
): boolean {
  return Number.isInteger(capturedAmountMinor) &&
    capturedAmountMinor === quote.amountMinor &&
    capturedCurrency.toUpperCase() === quote.currency;
}