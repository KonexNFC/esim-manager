// ─── Stripe Service ───────────────────────────────────────────────────────────
// Handles creating Stripe checkout sessions for plan purchases and top-ups.
// Uses price_data (not pre-created prices) for one-time eSIM purchases.

import { getUncachableStripeClient } from '../stripeClient';
import { db } from '../storage';
import { users, orders, topups } from '@shared/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = process.env.APP_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000');

export async function getOrCreateStripeCustomer(
  email: string,
  userId?: string,
  name?: string,
): Promise<string> {
  const stripe = await getUncachableStripeClient();

  // If user is logged in, check for existing customer ID
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.stripeCustomerId) return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { userId: userId || '', source: 'globesim' },
  });

  // Persist stripe customer ID to user record
  if (userId) {
    await db.update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, userId));
  }

  return customer.id;
}

export interface PlanCheckoutParams {
  planId: string;
  planName: string;
  destination: string;
  region: string;
  dataAmount: string;
  validity: string;
  dataAmountGb: number;
  validityDays: number;
  price: number;
  currency: string;
  email: string;
  userId?: string;
  userName?: string;
  upsellDataGb?: number;
  upsellPrice?: number;
}

export async function createPlanCheckoutSession(params: PlanCheckoutParams): Promise<{ url: string; sessionId: string }> {
  const stripe = await getUncachableStripeClient();

  const customerId = await getOrCreateStripeCustomer(params.email, params.userId, params.userName);

  const lineItems: any[] = [
    {
      price_data: {
        currency: params.currency.toLowerCase(),
        unit_amount: Math.round(params.price * 100),
        product_data: {
          name: `${params.destination} eSIM — ${params.dataAmount} · ${params.validity}`,
          description: `GlobeSIM plan for ${params.destination}. Coverage: ${params.region}.`,
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

  // Add upsell top-up as second line item if selected
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
    },
    allow_promotion_codes: true,
  });

  return { url: session.url!, sessionId: session.id };
}

export interface TopupCheckoutParams {
  orderId: string;
  optionCode: string;
  optionName: string;
  price: number;
  currency: string;
  email: string;
  userId?: string;
}

export async function createTopupCheckoutSession(params: TopupCheckoutParams): Promise<{ url: string; sessionId: string; topupId: string }> {
  const stripe = await getUncachableStripeClient();

  const customerId = await getOrCreateStripeCustomer(params.email, params.userId);

  // Create pending topup record
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
            name: `GlobeSIM Top-Up — ${params.optionName}`,
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

  // Save session ID to topup
  await db.update(topups)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(topups.id, topup.id));

  return { url: session.url!, sessionId: session.id, topupId: topup.id };
}

export async function handleCheckoutCompleted(session: any): Promise<void> {
  const metadata = session.metadata || {};
  const purchaseType = metadata.purchaseType;

  if (purchaseType === 'initial_purchase') {
    await handleInitialPurchaseCompleted(session);
  } else if (purchaseType === 'topup') {
    await handleTopupCompleted(session);
  }
}

async function handleInitialPurchaseCompleted(session: any): Promise<void> {
  const { fulfillInitialPurchase } = await import('./fulfillment');
  const metadata = session.metadata || {};

  // Ensure idempotent: don't create duplicate orders
  const existing = await db.select().from(orders)
    .where(eq(orders.stripeCheckoutSessionId, session.id));

  if (existing.length > 0) {
    console.log(`[Stripe] Order already exists for session ${session.id}`);
    await fulfillInitialPurchase(existing[0].id);
    return;
  }

  const email = metadata.email || session.customer_details?.email || '';
  const userId = metadata.userId || undefined;

  // Link order to user if they exist
  let resolvedUserId = userId;
  if (!resolvedUserId && email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) resolvedUserId = user.id;
  }

  const totalPrice = (session.amount_total || 0) / 100;

  const [order] = await db.insert(orders).values({
    planId: metadata.planId,
    email,
    userId: resolvedUserId || null,
    status: 'paid',
    totalPrice,
    currency: (session.currency || 'usd').toUpperCase(),
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    stripeCustomerId: session.customer || null,
    purchaseType: 'initial_purchase',
    providerName: 'mock',
  }).returning();

  console.log(`[Stripe] Created order ${order.id} for session ${session.id}`);
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

  // Update topup payment intent
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
