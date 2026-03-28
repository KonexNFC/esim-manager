// ─── Fulfillment Service ──────────────────────────────────────────────────────
// Handles post-payment eSIM provisioning via the active provider adapter.
// Called by the Stripe webhook handler after checkout.session.completed.
//
// State machine:
//   paid → fulfilling → fulfilled  (happy path)
//   paid → fulfilling → fulfillment_failed  (provider error, will retry once)

import { db } from '../storage';
import { orders, users, topups, plans, destinations, providerSyncLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getActiveProvider } from '../providers/adapters';
import {
  sendPurchaseConfirmation, sendEsimReadyEmail, sendTopupConfirmation,
} from './notifications';

const TRANSIENT_RETRY_DELAY_MS = 1500;

async function logSync(
  orderId: string,
  syncType: string,
  providerName: string,
  request: string,
  response: string,
  status: 'ok' | 'error',
) {
  try {
    await db.insert(providerSyncLogs).values({
      orderId,
      syncType,
      providerName,
      requestSummary: request,
      responseSummary: response,
      status,
    });
  } catch { /* non-fatal */ }
}

// ─── Initial Purchase Fulfillment ─────────────────────────────────────────────

export async function fulfillInitialPurchase(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Order ${orderId} not found`);

  // Idempotency: skip if already fulfilled
  if (order.status === 'fulfilled') {
    console.log(`[Fulfillment] Order ${orderId} already fulfilled — skipping`);
    return;
  }

  // Idempotency: skip if currently fulfilling (prevents concurrent webhook retries)
  if (order.status === 'fulfilling') {
    console.log(`[Fulfillment] Order ${orderId} already being fulfilled — skipping`);
    return;
  }

  // Mark as in-progress
  await db.update(orders)
    .set({ status: 'fulfilling' })
    .where(eq(orders.id, orderId));

  const user = order.userId
    ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
    : null;

  // Resolve plan + destination
  const [planRow] = await db
    .select({ plan: plans, dest: destinations })
    .from(plans)
    .leftJoin(destinations, eq(plans.destinationId, destinations.id))
    .where(eq(plans.id, order.planId));

  if (!planRow) {
    await markFulfillmentFailed(orderId, 'Plan not found');
    throw new Error(`Plan ${order.planId} not found`);
  }

  const provider = getActiveProvider();

  try {
    const result = await provider.purchaseEsim({
      planId: order.planId,
      countryCode: planRow.dest?.countryCode ?? 'US',
      dataAmountGb: planRow.plan.dataAmountGb,
      validityDays: planRow.plan.validityDays,
      providerRef: planRow.plan.provider !== 'manual' ? planRow.plan.provider ?? undefined : undefined,
      customerEmail: order.email,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + planRow.plan.validityDays);

    await db.update(orders).set({
      status: 'fulfilled',
      esimStatus: 'issued',
      qrCode: result.qrCodeUrl,
      iccid: result.iccid,
      providerName: provider.name,
      providerEsimId: result.providerEsimId,
      activationDate: new Date(),
      dataTotalMb: result.dataTotalMb,
      dataUsedMb: result.dataUsedMb,
      dataRemainingMb: result.dataRemainingMb,
      daysRemaining: planRow.plan.validityDays,
      expiresAt,
      lastSyncedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await logSync(orderId, 'initial_purchase', provider.name,
      `purchaseEsim planId=${order.planId}`,
      `iccid=${result.iccid} status=${result.activationStatus}`,
      'ok');

    // Fire-and-forget notifications
    sendPurchaseConfirmation({
      email: order.email, name: user?.name, orderId,
      planName: planRow.plan.name,
      destination: planRow.dest?.name ?? '',
      dataAmount: planRow.plan.dataAmount,
      validity: planRow.plan.validity,
      totalPrice: order.totalPrice,
      currency: order.currency,
    }).catch(console.error);

    sendEsimReadyEmail({
      email: order.email, name: user?.name, orderId,
      qrCodeUrl: result.qrCodeUrl,
      iccid: result.iccid,
      destination: planRow.dest?.name ?? '',
      manualCode: result.manualCode,
    }).catch(console.error);

    console.log(`[Fulfillment] Order ${orderId} fulfilled — ICCID: ${result.iccid}`);
  } catch (err: any) {
    // One automatic retry for transient provider errors
    const isTransient = isTransientError(err);
    if (isTransient) {
      console.warn(`[Fulfillment] Transient error for ${orderId}, retrying in ${TRANSIENT_RETRY_DELAY_MS}ms…`);
      await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
      try {
        // Reset to 'paid' so the next call picks it up cleanly
        await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId));
        await fulfillInitialPurchase(orderId);
        return;
      } catch (retryErr: any) {
        await markFulfillmentFailed(orderId, `Retry failed: ${retryErr.message}`);
        await logSync(orderId, 'initial_purchase', provider.name,
          `purchaseEsim retry orderId=${orderId}`, retryErr.message, 'error');
        throw retryErr;
      }
    }

    await markFulfillmentFailed(orderId, err.message);
    await logSync(orderId, 'initial_purchase', provider.name,
      `purchaseEsim orderId=${orderId}`, err.message, 'error');
    throw err;
  }
}

async function markFulfillmentFailed(orderId: string, reason: string) {
  console.error(`[Fulfillment] Failed for ${orderId}: ${reason}`);
  await db.update(orders)
    .set({ status: 'fulfillment_failed', esimStatus: 'issued' })
    .where(eq(orders.id, orderId));
}

function isTransientError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    (err?.status >= 500 && err?.status < 600)
  );
}

// ─── Top-up Fulfillment ───────────────────────────────────────────────────────

export async function fulfillTopupPurchase(topupId: string): Promise<void> {
  const [topup] = await db.select().from(topups).where(eq(topups.id, topupId));
  if (!topup) throw new Error(`Topup ${topupId} not found`);

  // Idempotency
  if (topup.status === 'completed') {
    console.log(`[Fulfillment] Topup ${topupId} already completed — skipping`);
    return;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, topup.orderId));
  if (!order) throw new Error(`Order ${topup.orderId} not found`);

  // Guard: order must have a provider eSIM ID to top-up
  if (!order.providerEsimId) {
    await db.update(topups).set({ status: 'failed' }).where(eq(topups.id, topupId));
    throw new Error(`Order ${topup.orderId} has no provider eSIM ID — cannot top up`);
  }

  const provider = getActiveProvider();

  try {
    const result = await provider.purchaseTopup(order.providerEsimId, topup.optionCode ?? '3gb');

    // Update topup record
    await db.update(topups).set({
      status: 'completed',
      providerTopupId: result.providerTopupId,
      dataAddedMb: result.dataAddedMb ?? null,
      validityAddedDays: result.validityAddedDays ?? null,
      fulfilledAt: new Date(),
    }).where(eq(topups.id, topupId));

    // Update order balance
    const updates: Partial<typeof orders.$inferInsert> = { lastSyncedAt: new Date() };

    if (result.dataAddedMb && result.dataAddedMb < 999990) {
      updates.dataRemainingMb = (order.dataRemainingMb ?? 0) + result.dataAddedMb;
      updates.dataTotalMb = (order.dataTotalMb ?? 0) + result.dataAddedMb;
    }

    if (result.validityAddedDays) {
      updates.daysRemaining = (order.daysRemaining ?? 0) + result.validityAddedDays;
      const newExpiry = order.expiresAt ? new Date(order.expiresAt) : new Date();
      newExpiry.setDate(newExpiry.getDate() + result.validityAddedDays);
      updates.expiresAt = newExpiry;
    }

    await db.update(orders).set(updates as any).where(eq(orders.id, order.id));

    await logSync(order.id, 'topup', provider.name,
      `purchaseTopup esimId=${order.providerEsimId} option=${topup.optionCode}`,
      `topupId=${result.providerTopupId} status=${result.status}`,
      'ok');

    // Resolve user for notification
    const user = order.userId
      ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
      : null;

    sendTopupConfirmation({
      email: order.email, name: user?.name, orderId: order.id,
      topupName: topup.name,
      price: topup.price,
      currency: topup.currency,
    }).catch(console.error);

    console.log(`[Fulfillment] Topup ${topupId} fulfilled via ${provider.name}`);
  } catch (err: any) {
    console.error(`[Fulfillment] Topup ${topupId} failed:`, err.message);
    await db.update(topups).set({ status: 'failed' }).where(eq(topups.id, topupId));
    await logSync(order.id, 'topup', provider.name,
      `purchaseTopup orderId=${order.id}`, err.message, 'error');
    throw err;
  }
}
