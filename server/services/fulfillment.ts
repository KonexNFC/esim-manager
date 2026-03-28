// ─── Fulfillment Service ──────────────────────────────────────────────────────
// Handles post-payment eSIM provisioning via the active provider adapter.
// Called by the Stripe webhook handler after checkout.session.completed.
//
// State machine:
//   paid → fulfilling → fulfilled  (happy path)
//   paid → fulfilling → fulfillment_failed  (provider error, will retry once)

import { db } from '../storage';
import { orders, esims, users, topups, plans, destinations, providerSyncLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getActiveProvider } from '../providers/adapters';
import {
  sendPurchaseConfirmation, sendEsimReadyEmail, sendTopupConfirmation,
  sendFulfillmentFailedEmail,
} from './notifications';

const TRANSIENT_RETRY_DELAY_MS = 1500;

async function logSync(
  orderId: string | null,
  esimId: string | null,
  syncType: string,
  providerName: string,
  request: string,
  response: string,
  status: 'ok' | 'error',
) {
  try {
    await db.insert(providerSyncLogs).values({
      orderId: orderId ?? undefined,
      esimId: esimId ?? undefined,
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

  if (order.status === 'fulfilled') {
    console.log(`[Fulfillment] Order ${orderId} already fulfilled — skipping`);
    return;
  }
  if (order.status === 'fulfilling') {
    console.log(`[Fulfillment] Order ${orderId} already being fulfilled — skipping`);
    return;
  }

  await db.update(orders).set({ status: 'fulfilling' }).where(eq(orders.id, orderId));

  const user = order.userId
    ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
    : null;

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
    const result = await provider.purchaseEsim(
      {
        planId: order.planId,
        countryCode: planRow.dest?.countryCode ?? 'US',
        dataAmountGb: planRow.plan.dataAmountGb,
        validityDays: planRow.plan.validityDays,
        providerRef: planRow.plan.provider !== 'manual' ? planRow.plan.provider ?? undefined : undefined,
        customerEmail: order.email,
      },
      { email: order.email, userId: order.userId ?? undefined, name: user?.name },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + planRow.plan.validityDays);

    // ── Update order record ──────────────────────────────────────────
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

    // ── Create eSIM entity ───────────────────────────────────────────
    const [esimRecord] = await db.insert(esims).values({
      userId: order.userId ?? undefined,
      orderId: order.id,
      planId: order.planId,
      providerName: provider.name,
      providerEsimId: result.providerEsimId,
      providerIccid: result.iccid,
      providerReference: result.activationUrl ?? undefined,
      qrCodeUrl: result.qrCodeUrl,
      manualCode: result.manualCode ?? undefined,
      destination: planRow.dest?.name ?? '',
      region: planRow.dest?.region ?? '',
      planName: planRow.plan.name,
      activationStatus: 'issued',
      dataTotalMb: result.dataTotalMb,
      dataUsedMb: result.dataUsedMb,
      dataRemainingMb: result.dataRemainingMb,
      validityDays: planRow.plan.validityDays,
      daysRemaining: planRow.plan.validityDays,
      expiresAt,
      lastSyncedAt: new Date(),
    }).returning();

    await logSync(orderId, esimRecord?.id ?? null, 'initial_purchase', provider.name,
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

    console.log(`[Fulfillment] Order ${orderId} fulfilled — ICCID: ${result.iccid}, eSIM: ${esimRecord?.id}`);
  } catch (err: any) {
    const isTransient = isTransientError(err);
    if (isTransient) {
      console.warn(`[Fulfillment] Transient error for ${orderId}, retrying in ${TRANSIENT_RETRY_DELAY_MS}ms…`);
      await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
      try {
        await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId));
        await fulfillInitialPurchase(orderId);
        return;
      } catch (retryErr: any) {
        await markFulfillmentFailed(orderId, `Retry failed: ${retryErr.message}`);
        await logSync(orderId, null, 'initial_purchase', provider.name,
          `purchaseEsim retry orderId=${orderId}`, retryErr.message, 'error');
        throw retryErr;
      }
    }

    await markFulfillmentFailed(orderId, err.message);
    await logSync(orderId, null, 'initial_purchase', provider.name,
      `purchaseEsim orderId=${orderId}`, err.message, 'error');
    throw err;
  }
}

async function markFulfillmentFailed(orderId: string, reason: string) {
  console.error(`[Fulfillment] Failed for ${orderId}: ${reason}`);
  await db.update(orders)
    .set({ status: 'fulfillment_failed', esimStatus: 'issued' })
    .where(eq(orders.id, orderId));

  // Notify customer their eSIM could not be provisioned
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (order) {
      const user = order.userId
        ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
        : null;
      sendFulfillmentFailedEmail({ email: order.email, name: user?.name, orderId, reason }).catch(console.error);
    }
  } catch { /* non-fatal */ }
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

  if (topup.status === 'completed') {
    console.log(`[Fulfillment] Topup ${topupId} already completed — skipping`);
    return;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, topup.orderId));
  if (!order) throw new Error(`Order ${topup.orderId} not found`);

  if (!order.providerEsimId) {
    await db.update(topups).set({ status: 'failed' }).where(eq(topups.id, topupId));
    throw new Error(`Order ${topup.orderId} has no provider eSIM ID — cannot top up`);
  }

  const provider = getActiveProvider();

  try {
    const result = await provider.purchaseTopup(order.providerEsimId, topup.optionCode ?? '3gb');

    await db.update(topups).set({
      status: 'completed',
      providerTopupId: result.providerTopupId,
      dataAddedMb: result.dataAddedMb ?? null,
      validityAddedDays: result.validityAddedDays ?? null,
      fulfilledAt: new Date(),
    }).where(eq(topups.id, topupId));

    // Update order balance
    const orderUpdates: Partial<typeof orders.$inferInsert> = { lastSyncedAt: new Date() };
    if (result.dataAddedMb && result.dataAddedMb < 999990) {
      orderUpdates.dataRemainingMb = (order.dataRemainingMb ?? 0) + result.dataAddedMb;
      orderUpdates.dataTotalMb = (order.dataTotalMb ?? 0) + result.dataAddedMb;
    }
    if (result.validityAddedDays) {
      orderUpdates.daysRemaining = (order.daysRemaining ?? 0) + result.validityAddedDays;
      const newExpiry = order.expiresAt ? new Date(order.expiresAt) : new Date();
      newExpiry.setDate(newExpiry.getDate() + result.validityAddedDays);
      orderUpdates.expiresAt = newExpiry;
    }
    await db.update(orders).set(orderUpdates as any).where(eq(orders.id, order.id));

    // Also update the esims record if one exists
    const [esimRecord] = await db.select().from(esims).where(eq(esims.orderId, order.id));
    if (esimRecord) {
      const esimUpdates: Partial<typeof esims.$inferInsert> = { lastSyncedAt: new Date() };
      if (result.dataAddedMb && result.dataAddedMb < 999990) {
        esimUpdates.dataRemainingMb = (esimRecord.dataRemainingMb ?? 0) + result.dataAddedMb;
        esimUpdates.dataTotalMb = (esimRecord.dataTotalMb ?? 0) + result.dataAddedMb;
      }
      if (result.validityAddedDays) {
        esimUpdates.daysRemaining = (esimRecord.daysRemaining ?? 0) + result.validityAddedDays;
        const newExpiry = esimRecord.expiresAt ? new Date(esimRecord.expiresAt) : new Date();
        newExpiry.setDate(newExpiry.getDate() + result.validityAddedDays);
        esimUpdates.expiresAt = newExpiry;
      }
      await db.update(esims).set(esimUpdates as any).where(eq(esims.id, esimRecord.id));

      // Link topup to esim record
      await db.update(topups).set({ esimId: esimRecord.id }).where(eq(topups.id, topupId));
    }

    await logSync(order.id, esimRecord?.id ?? null, 'topup', provider.name,
      `purchaseTopup esimId=${order.providerEsimId} option=${topup.optionCode}`,
      `topupId=${result.providerTopupId} status=${result.status}`,
      'ok');

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
    await logSync(order.id, null, 'topup', provider.name,
      `purchaseTopup orderId=${order.id}`, err.message, 'error');
    throw err;
  }
}
