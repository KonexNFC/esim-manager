// ─── Fulfillment Service ──────────────────────────────────────────────────────
// Handles post-payment eSIM provisioning via the active provider adapter.
// Called by the Stripe webhook handler after checkout.session.completed.

import { db } from '../storage';
import { orders, users, providerSyncLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getActiveProvider } from '../providers/adapters';
import { sendPurchaseConfirmation, sendEsimReadyEmail } from './notifications';

export async function fulfillInitialPurchase(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.status === 'fulfilled') {
    console.log(`[Fulfillment] Order ${orderId} already fulfilled — skipping`);
    return;
  }

  // Get user info for notification
  const user = order.userId
    ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
    : null;

  try {
    const provider = getActiveProvider();

    // Build purchase params — we need plan details
    // (we inline a DB query here to avoid circular storage imports)
    const { plans, destinations } = await import('@shared/schema');
    const [planRow] = await db
      .select({ plan: plans, dest: destinations })
      .from(plans)
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(plans.id, order.planId));

    if (!planRow) throw new Error(`Plan ${order.planId} not found`);

    const result = await provider.purchaseEsim({
      planId: order.planId,
      countryCode: planRow.dest?.countryCode || 'US',
      dataAmountGb: planRow.plan.dataAmountGb,
      validityDays: planRow.plan.validityDays,
      providerRef: planRow.plan.provider !== 'manual' ? planRow.plan.provider : undefined,
      customerEmail: order.email,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + planRow.plan.validityDays);

    // Update order with eSIM data
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

    // Log sync
    await db.insert(providerSyncLogs).values({
      orderId,
      syncType: 'initial_purchase',
      providerName: provider.name,
      requestSummary: `purchaseEsim planId=${order.planId}`,
      responseSummary: `iccid=${result.iccid} status=${result.activationStatus}`,
      status: 'ok',
    });

    // Send notifications
    await sendPurchaseConfirmation({
      email: order.email,
      name: user?.name,
      orderId,
      planName: planRow.plan.name,
      destination: planRow.dest?.name || '',
      dataAmount: planRow.plan.dataAmount,
      validity: planRow.plan.validity,
      totalPrice: order.totalPrice,
      currency: order.currency,
    });

    await sendEsimReadyEmail({
      email: order.email,
      name: user?.name,
      orderId,
      qrCodeUrl: result.qrCodeUrl,
      iccid: result.iccid,
      destination: planRow.dest?.name || '',
      manualCode: result.manualCode,
    });

    console.log(`[Fulfillment] Order ${orderId} fulfilled — ICCID: ${result.iccid}`);
  } catch (err: any) {
    console.error(`[Fulfillment] Failed for order ${orderId}:`, err.message);

    await db.insert(providerSyncLogs).values({
      orderId,
      syncType: 'initial_purchase',
      providerName: 'mock',
      requestSummary: `purchaseEsim orderId=${orderId}`,
      responseSummary: err.message,
      status: 'error',
    });

    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, orderId));
    throw err;
  }
}

export async function fulfillTopupPurchase(topupId: string): Promise<void> {
  const { topups } = await import('@shared/schema');
  const [topup] = await db.select().from(topups).where(eq(topups.id, topupId));
  if (!topup) throw new Error(`Topup ${topupId} not found`);

  const [order] = await db.select().from(orders).where(eq(orders.id, topup.orderId));
  if (!order || !order.providerEsimId) {
    throw new Error(`Order ${topup.orderId} not found or has no provider eSIM ID`);
  }

  try {
    const provider = getActiveProvider();
    const result = await provider.purchaseTopup(order.providerEsimId, topup.optionCode || '3gb');

    // Update topup record
    await db.update(topups).set({
      status: 'completed',
      providerTopupId: result.providerTopupId,
    }).where(eq(topups.id, topupId));

    // Update order data balance
    if (result.dataAddedMb) {
      const newRemaining = (order.dataRemainingMb || 0) + result.dataAddedMb;
      const newTotal = (order.dataTotalMb || 0) + result.dataAddedMb;
      await db.update(orders).set({
        dataRemainingMb: newRemaining,
        dataTotalMb: newTotal,
        lastSyncedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    if (result.validityAddedDays) {
      const newDays = (order.daysRemaining || 0) + result.validityAddedDays;
      const newExpiry = order.expiresAt ? new Date(order.expiresAt) : new Date();
      newExpiry.setDate(newExpiry.getDate() + result.validityAddedDays);
      await db.update(orders).set({
        daysRemaining: newDays,
        expiresAt: newExpiry,
        lastSyncedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    console.log(`[Fulfillment] Topup ${topupId} fulfilled via ${provider.name}`);
  } catch (err: any) {
    console.error(`[Fulfillment] Topup ${topupId} failed:`, err.message);
    await db.update(topups).set({ status: 'failed' }).where(eq(topups.id, topupId));
    throw err;
  }
}
