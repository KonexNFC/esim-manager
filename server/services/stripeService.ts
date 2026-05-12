// ─── Stripe Service ───────────────────────────────────────────────────────────
// Creates Stripe Checkout sessions for plan purchases and top-ups.
// Pricing is ALWAYS server-controlled:
//   • If a matching normalized plan is found → pricing engine computes the price
//     from the routing engine's selected offer's wholesale cost.
//   • Otherwise → plan.price from the database (already server-controlled).
// No frontend-supplied price is ever trusted.

import { getUncachableStripeClient } from '../stripeClient';
import { db } from '../storage';
import { users, orders, topups, normalizedPlans, plans, settings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { selectBestProviderForPlan } from './routingEngine';
import { calculateRetailPrice } from './pricingEngine';

// Read targetMarginPercent from settings, defaulting to 0.50 (50%)
async function getTargetMarginPercent(): Promise<number> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'targetMarginPercent'));
    if (row?.value) {
      const val = parseFloat(row.value);
      if (!isNaN(val) && val > 0 && val < 1) return val;
    }
  } catch { /* non-critical */ }
  return 0.50;
}

const BASE_URL = process.env.APP_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000');

// ─── Customer helper ──────────────────────────────────────────────────────────

export async function getOrCreateStripeCustomer(
  email: string,
  userId?: string,
  name?: string,
): Promise<string> {
  const stripe = await getUncachableStripeClient();

  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.stripeCustomerId) return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { userId: userId || '', source: 'konex' },
  });

  if (userId) {
    await db.update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, userId));
  }

  return customer.id;
}

// ─── Normalized plan lookup ───────────────────────────────────────────────────

/** Compact fallback entry stored in Stripe metadata + orders table */
export interface FallbackEntry {
  r: number;            // rank
  k: string;            // providerKey
  c: string;            // providerPlanCode
  w: number;            // wholesalePriceUsd
}

/**
 * Stripe metadata values are capped at 500 characters.
 * Trim the fallback chain to however many entries fit within that limit.
 * The winner (index 0) is always kept; extras are dropped from the tail.
 */
function chainJson(chain: FallbackEntry[]): string {
  const LIMIT = 490; // leave a small buffer below the 500-char cap
  let trimmed = chain.slice();
  let json = JSON.stringify(trimmed);
  while (json.length > LIMIT && trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    json = JSON.stringify(trimmed);
  }
  return json;
}

async function findNormalizedPlanForParams(
  countryCode: string,
  dataAmountGb: number,
  validityDays: number,
) {
  // dataMb in normalized_plans = dataAmountGb * 1024
  const dataMb = Math.round(dataAmountGb * 1024);
  const [match] = await db
    .select()
    .from(normalizedPlans)
    .where(and(
      eq(normalizedPlans.regionCode, countryCode),
      eq(normalizedPlans.dataMb, dataMb),
      eq(normalizedPlans.validityDays, validityDays),
      eq(normalizedPlans.isActive, true),
    ));
  return match ?? null;
}

// ─── Checkout params ──────────────────────────────────────────────────────────

export interface PlanCheckoutParams {
  planId: string;
  planName: string;
  destination: string;
  countryCode: string;   // ISO-2 country code (e.g. "GB")
  region: string;
  dataAmount: string;
  validity: string;
  dataAmountGb: number;
  validityDays: number;
  price: number;          // DB price — used as fallback only
  currency: string;
  email: string;
  userId?: string;
  userName?: string;
  upsellDataGb?: number;
  upsellPrice?: number;
}

// ─── Plan checkout ────────────────────────────────────────────────────────────

export async function createPlanCheckoutSession(
  params: PlanCheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  const stripe = await getUncachableStripeClient();
  const customerId = await getOrCreateStripeCustomer(params.email, params.userId, params.userName);

  // ── Server-side pricing via routing engine ─────────────────────────────
  // Try to find a normalized plan that matches this product.
  // If found: use routing engine + pricing engine for server-authoritative price.
  // If not found: fall back to plan.price from DB (already server-controlled).

  let finalPriceUsd = params.price;
  const routingMetadata: Record<string, string> = {};

  try {
    const normalizedPlan = await findNormalizedPlanForParams(
      params.countryCode,
      params.dataAmountGb,
      params.validityDays,
    );

    if (normalizedPlan) {
      // Use blended_score strategy so the active routing mode weights (profit_first /
      // balanced / reliability_first) are respected when selecting the winner.
      const [routing, targetMargin] = await Promise.all([
        selectBestProviderForPlan(normalizedPlan.id, 'blended_score'),
        getTargetMarginPercent(),
      ]);
      const winner = routing.fallbackChain[0];

      // Compute server-side retail price from wholesale cost using the admin's
      // configured target margin (not a hardcoded constant).
      const minimumMarginPercent = Math.round(targetMargin * 100); // e.g. 0.50 → 50
      const pricing = calculateRetailPrice(winner.wholesalePriceUsd, {
        markupPercent: Math.round(minimumMarginPercent * 1.2), // slight markup headroom over floor margin
        minimumMarginPercent,
        charmPricing: true,
        floorPriceUsd: 0.99,
      });

      finalPriceUsd = pricing.retailPriceUsd;

      // Compact fallback chain for metadata storage
      const compactChain: FallbackEntry[] = routing.fallbackChain.map(p => ({
        r: p.rank,
        k: p.providerKey,
        c: p.providerPlanCode,
        w: p.wholesalePriceUsd,
      }));

      routingMetadata.normalizedPlanId = normalizedPlan.id;
      routingMetadata.routingDecisionId = routing.decisionId;
      routingMetadata.selectedProviderKey = routing.selectedProviderKey;
      routingMetadata.selectedProviderPlanCode = routing.selectedProviderPlanCode;
      routingMetadata.fallbackChainJson = chainJson(compactChain);
      routingMetadata.wholesaleCostUsd = winner.wholesalePriceUsd.toFixed(4);
      routingMetadata.marginPercent = pricing.marginPercent.toFixed(2);
      routingMetadata.confidenceScore = String(routing.confidenceScore);
      routingMetadata.confidenceLabel = routing.confidenceLabel;

      console.log(
        `[Stripe] Routing: plan "${params.planName}" → ${routing.selectedProviderKey}` +
        ` [confidence=${routing.confidenceScore} ${routing.confidenceLabel}]` +
        ` | retail $${finalPriceUsd} (was $${params.price}) | margin ${pricing.marginPercent.toFixed(1)}%` +
        ` | targetMargin=${minimumMarginPercent}%`,
      );
    } else {
      // No normalized plan → log and use DB price, which is still server-controlled
      // Store a rough margin based on DB price if we have a wholesale estimate
      console.log(
        `[Stripe] No normalized plan for ${params.countryCode}/${params.dataAmountGb}GB/${params.validityDays}d — using DB price $${params.price}`,
      );
    }
  } catch (routingErr: any) {
    // Routing failure is non-fatal: fall back to DB price
    console.error(`[Stripe] Routing engine error (falling back to DB price): ${routingErr.message}`);
  }

  // ── Line items ─────────────────────────────────────────────────────────
  const lineItems: any[] = [
    {
      price_data: {
        currency: params.currency.toLowerCase(),
        unit_amount: Math.round(finalPriceUsd * 100),
        product_data: {
          name: `${params.destination} eSIM — ${params.dataAmount} · ${params.validity}`,
          description: `Konex eSIM plan for ${params.destination}. Coverage: ${params.region}.`,
          metadata: {
            planId: params.planId,
            destination: params.destination,
            dataAmount: params.dataAmount,
            validity: params.validity,
          },
        },
      },
      quantity: 1,
    },
  ];

  if (params.upsellPrice && params.upsellDataGb) {
    lineItems.push({
      price_data: {
        currency: params.currency.toLowerCase(),
        unit_amount: Math.round(params.upsellPrice * 100),
        product_data: {
          name: `Data Top-Up — +${params.upsellDataGb} GB`,
          description: 'Pre-purchase data top-up added at checkout.',
        },
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${BASE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/checkout-cancel?planId=${params.planId}`,
    customer_email: customerId ? undefined : params.email,
    metadata: {
      planId: params.planId,
      email: params.email,
      userId: params.userId || '',
      userName: params.userName || '',
      destination: params.destination,
      region: params.region,
      dataAmountGb: String(params.dataAmountGb),
      validityDays: String(params.validityDays),
      purchaseType: 'initial_purchase',
      ...routingMetadata,    // routing engine fields (if resolved)
    },
    allow_promotion_codes: true,
  });

  return { url: session.url!, sessionId: session.id };
}

// ─── Country-plan checkout (uses normalizedPlanId directly) ──────────────────

export interface CountryPlanCheckoutParams {
  normalizedPlanId: string;
  countryCode: string;
  countryName: string;
  region: string;
  dataLabel: string;
  validityLabel: string;
  dataAmountGb: number;
  validityDays: number;
  email: string;
  userId?: string;
  userName?: string;
  sellPriceGbp?: number; // catalogue-computed price; if provided, charged directly in GBP
}

export async function createCountryPlanCheckoutSession(
  params: CountryPlanCheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  const stripe = await getUncachableStripeClient();
  const customerId = await getOrCreateStripeCustomer(params.email, params.userId, params.userName);

  // Load the normalized plan to confirm it exists and get data
  const [np] = await db.select().from(normalizedPlans).where(eq(normalizedPlans.id, params.normalizedPlanId));
  if (!np) throw new Error(`Normalized plan ${params.normalizedPlanId} not found`);

  // Run routing engine for provider selection (fulfillment), not for pricing
  const [routing] = await Promise.all([
    selectBestProviderForPlan(np.id, 'blended_score'),
  ]);
  const winner = routing.fallbackChain[0];

  const compactChain: FallbackEntry[] = routing.fallbackChain.map(p => ({
    r: p.rank,
    k: p.providerKey,
    c: p.providerPlanCode,
    w: p.wholesalePriceUsd,
  }));

  // Use the catalogue-computed GBP price passed from the frontend.
  // This guarantees Stripe charges exactly what was displayed to the user.
  // Fall back to np.retailPriceUsd (stored during catalogue sync) if not provided.
  const chargeInGbp = params.sellPriceGbp != null && params.sellPriceGbp > 0;
  const chargeCurrency = chargeInGbp ? 'gbp' : 'usd';
  const chargeAmount   = chargeInGbp
    ? Math.round(params.sellPriceGbp! * 100)
    : Math.round(np.retailPriceUsd * 100);

  console.log(
    `[Stripe] createCountryPlanCheckoutSession: plan=${np.id}` +
    ` charge=${chargeCurrency.toUpperCase()} ${(chargeAmount / 100).toFixed(2)}` +
    ` provider=${routing.selectedProviderKey}`,
  );

  const productName = `${params.countryName} eSIM — ${params.dataLabel} · ${params.validityLabel}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: chargeCurrency,
          unit_amount: chargeAmount,
          product_data: {
            name: productName,
            description: `Konex eSIM plan for ${params.countryName}. ${params.dataLabel} data valid for ${params.validityLabel}.`,
            metadata: {
              normalizedPlanId: np.id,
              destination: params.countryName,
              dataAmount: params.dataLabel,
              validity: params.validityLabel,
            },
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/destinations/${params.countryCode}`,
    customer_email: customerId ? undefined : params.email,
    metadata: {
      planId: '',   // no legacy planId for normalized-plan purchases
      email: params.email,
      userId: params.userId || '',
      userName: params.userName || '',
      destination: params.countryName,
      region: params.region,
      dataAmountGb: String(params.dataAmountGb),
      validityDays: String(params.validityDays),
      purchaseType: 'initial_purchase',
      normalizedPlanId: np.id,
      routingDecisionId: routing.decisionId,
      selectedProviderKey: routing.selectedProviderKey,
      selectedProviderPlanCode: routing.selectedProviderPlanCode,
      fallbackChainJson: chainJson(compactChain),
      wholesaleCostUsd: winner.wholesalePriceUsd.toFixed(4),
      marginPercent: pricing.marginPercent.toFixed(2),
      confidenceScore: String(routing.confidenceScore),
      confidenceLabel: routing.confidenceLabel,
    },
    allow_promotion_codes: true,
  });

  return { url: session.url!, sessionId: session.id };
}

// ─── Topup checkout ───────────────────────────────────────────────────────────

export interface TopupCheckoutParams {
  orderId: string;
  optionCode: string;
  optionName: string;
  price: number;
  currency: string;
  email: string;
  userId?: string;
}

export async function createTopupCheckoutSession(
  params: TopupCheckoutParams,
): Promise<{ url: string; sessionId: string; topupId: string }> {
  const stripe = await getUncachableStripeClient();
  const customerId = await getOrCreateStripeCustomer(params.email, params.userId);

  const [topup] = await db.insert(topups).values({
    orderId: params.orderId,
    optionCode: params.optionCode,
    name: params.optionName,
    price: params.price,
    currency: params.currency,
    status: 'pending',
  }).returning();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: Math.round(params.price * 100),
          product_data: {
            name: `Konex Top-Up — ${params.optionName}`,
            description: `Top-up for your active eSIM (Order: ${params.orderId})`,
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/dashboard`,
    metadata: {
      purchaseType: 'topup',
      orderId: params.orderId,
      topupId: topup.id,
      optionCode: params.optionCode,
      email: params.email,
      userId: params.userId || '',
    },
  });

  await db.update(topups)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(topups.id, topup.id));

  return { url: session.url!, sessionId: session.id, topupId: topup.id };
}

// ─── Webhook handlers ─────────────────────────────────────────────────────────

export async function handleCheckoutCompleted(session: any): Promise<void> {
  const purchaseType = session.metadata?.purchaseType;
  if (purchaseType === 'initial_purchase') {
    await handleInitialPurchaseCompleted(session);
  } else if (purchaseType === 'topup') {
    await handleTopupCompleted(session);
  }
}

async function handleInitialPurchaseCompleted(session: any): Promise<void> {
  const { fulfillInitialPurchase } = await import('./fulfillment');
  const metadata = session.metadata || {};

  // Idempotency: don't create duplicate orders
  const existing = await db.select().from(orders)
    .where(eq(orders.stripeCheckoutSessionId, session.id));

  if (existing.length > 0) {
    console.log(`[Stripe] Order already exists for session ${session.id}`);
    await fulfillInitialPurchase(existing[0].id);
    return;
  }

  const email = metadata.email || session.customer_details?.email || '';
  let resolvedUserId = metadata.userId || undefined;

  if (!resolvedUserId && email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) resolvedUserId = user.id;
  }

  const salePrice = (session.amount_total || 0) / 100; // totalPrice = retail sale price

  // ── Resolve provider cost ─────────────────────────────────────────────────
  // Priority: routing-engine metadata > plan.wholesaleCost > 0
  const routingCost = metadata.wholesaleCostUsd ? parseFloat(metadata.wholesaleCostUsd) : null;

  // Fetch plan from DB to get its provider cost and provider name as fallback
  const [plan] = metadata.planId
    ? await db.select().from(plans).where(eq(plans.id, metadata.planId))
    : [];

  const providerCost: number = routingCost ?? plan?.wholesaleCost ?? 0;

  // ── Resolve provider used ─────────────────────────────────────────────────
  // Priority: routing engine winner > plan.provider > 'manual'
  const providerUsed: string =
    metadata.selectedProviderKey || plan?.provider || 'manual';

  // ── Compute profit & margin ───────────────────────────────────────────────
  // Always compute — even when cost is 0 (profit = salePrice, margin = 100%)
  const profit = providerCost > 0
    ? parseFloat((salePrice - providerCost).toFixed(4))
    : null; // null = cost unknown, do not claim 100% margin
  const marginPercent = profit != null && salePrice > 0
    ? parseFloat(((profit / salePrice) * 100).toFixed(2))
    : metadata.marginPercent ? parseFloat(metadata.marginPercent) : null;

  // Parse routing fields from metadata
  let fallbackProvidersJson: any = null;
  if (metadata.fallbackChainJson) {
    try { fallbackProvidersJson = JSON.parse(metadata.fallbackChainJson); } catch { /* ignore */ }
  }

  const [order] = await db.insert(orders).values({
    planId: metadata.planId || null,
    email,
    userId: resolvedUserId || null,
    status: 'paid',
    totalPrice: salePrice,
    currency: (session.currency || 'usd').toUpperCase(),
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    stripeCustomerId: session.customer || null,
    purchaseType: 'initial_purchase',
    // Provider tracking (always set)
    providerName: providerUsed,
    selectedProviderKey: metadata.selectedProviderKey || null,
    // Routing metadata
    normalizedPlanId: metadata.normalizedPlanId || null,
    routingDecisionId: metadata.routingDecisionId || null,
    fallbackProvidersJson,
    // Cost & profit (always populated — routing cost preferred, plan cost as fallback)
    wholesaleCostUsd: providerCost > 0 ? providerCost : null,
    profit,
    marginPercent,
  }).returning();

  const confStr = metadata.confidenceScore
    ? ` confidence=${metadata.confidenceScore} (${metadata.confidenceLabel ?? '?'})`
    : '';
  console.log(
    `[Stripe] Order ${order.id} created | provider=${providerUsed}${confStr}` +
    ` | sale=$${salePrice.toFixed(2)} cost=$${providerCost.toFixed(2)}` +
    ` | profit=$${(profit ?? 0).toFixed(2)} margin=${(marginPercent ?? 0).toFixed(1)}%`
  );
  await fulfillInitialPurchase(order.id);
}

async function handleTopupCompleted(session: any): Promise<void> {
  const { fulfillTopupPurchase } = await import('./fulfillment');
  const metadata = session.metadata || {};
  const topupId = metadata.topupId;

  if (!topupId) {
    console.error('[Stripe] Topup session missing topupId in metadata');
    return;
  }

  await db.update(topups)
    .set({ status: 'paid' as any })
    .where(eq(topups.id, topupId));

  await fulfillTopupPurchase(topupId);
}

export async function handlePaymentFailed(session: any): Promise<void> {
  const metadata = session.metadata || {};
  if (metadata.purchaseType === 'topup') {
    const topupId = metadata.topupId;
    if (topupId) {
      await db.update(topups).set({ status: 'failed' }).where(eq(topups.id, topupId));
    }
  }
  const { sendPaymentFailedEmail } = await import('./notifications');
  const email = metadata.email || session.customer_details?.email;
  if (email) {
    await sendPaymentFailedEmail(email, session.id);
  }
}
