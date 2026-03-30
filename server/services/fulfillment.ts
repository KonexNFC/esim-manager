// ─── Fulfillment Service ──────────────────────────────────────────────────────
// Handles post-payment eSIM provisioning.
// Called by the Stripe webhook handler after checkout.session.completed.
//
// State machine:
//   paid → fulfilling → fulfilled              (happy path)
//   paid → fulfilling → fulfillment_failed     (all providers exhausted)
//
// Provider selection:
//   • Orders with routing data (normalizedPlanId + fallbackProvidersJson)
//     → iterate fallback chain, log each attempt to provider_attempts
//   • Legacy orders without routing data
//     → getActiveProvider() (transparent failover adapter, unchanged)

import { db } from '../storage';
import { orders, esims, users, topups, plans, destinations, providerSyncLogs, providerAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getActiveProvider, getProviderAdapterByKey } from '../providers/adapters';
import type { ProviderAdapter, ProviderPurchaseParams, CustomerContext, EsimProvisionResult } from '../providers/adapters';
import {
  sendPurchaseConfirmation, sendEsimReadyEmail, sendTopupConfirmation,
  sendFulfillmentFailedEmail,
} from './notifications';
import { recordFulfillmentOutcome } from './destinationStats';
import { evaluateProviderForAutoPause } from './autoProviderPause';
import type { FallbackEntry } from './stripeService';

const TRANSIENT_RETRY_DELAY_MS = 1500;

// ─── Generic sync logger ──────────────────────────────────────────────────────

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

// ─── Provider attempt logger ──────────────────────────────────────────────────

async function logProviderAttempt(
  orderId: string,
  providerKey: string,
  planCode: string | null,
  attemptNumber: number,
  status: 'ok' | 'error' | 'skipped',
  errorMessage?: string,
  durationMs?: number,
) {
  try {
    await db.insert(providerAttempts).values({
      orderId,
      providerKey,
      providerPlanCode: planCode ?? undefined,
      attemptNumber,
      status,
      errorMessage,
      durationMs,
    });
  } catch { /* non-fatal */ }
}

// ─── Fallback chain executor ──────────────────────────────────────────────────
// Tries each provider in the fallback chain in order.
// Logs every attempt. Returns on the first success.

async function fulfillWithFallbackChain(
  orderId: string,
  fallbackChain: FallbackEntry[],
  baseParams: ProviderPurchaseParams,
  ctx: CustomerContext,
  destination: string,
  marginPercent?: number | null,
): Promise<{ result: EsimProvisionResult; providerName: string; providerKey: string }> {
  let lastError: Error | null = null;

  for (let i = 0; i < fallbackChain.length; i++) {
    const entry = fallbackChain[i];
    const isPrimary = i === 0;
    const provider = getProviderAdapterByKey(entry.k);

    if (!provider) {
      console.warn(`[Fulfillment] Provider key "${entry.k}" unavailable — skipping`);
      await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'skipped', 'Provider adapter not available');
      recordFulfillmentOutcome({
        providerKey: entry.k, destination, outcome: 'skipped', isPrimary,
      }).catch(() => {});
      continue;
    }

    const startMs = Date.now();
    try {
      console.log(`[Fulfillment] Attempt ${i + 1}/${fallbackChain.length}: ${entry.k} / ${entry.c}`);
      const result = await provider.purchaseEsim(
        { ...baseParams, providerRef: entry.c },
        ctx,
      );
      const durationMs = Date.now() - startMs;
      await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'ok', undefined, durationMs);
      recordFulfillmentOutcome({
        providerKey: entry.k, destination, outcome: 'success', isPrimary,
        latencyMs: durationMs, marginPercent: marginPercent ?? undefined,
      }).catch(() => {});
      console.log(`[Fulfillment] ✓ ${entry.k} succeeded in ${durationMs}ms`);
      return { result, providerName: provider.name, providerKey: entry.k };
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'error', err.message, durationMs);
      recordFulfillmentOutcome({
        providerKey: entry.k, destination, outcome: 'failure', isPrimary,
        latencyMs: durationMs,
      }).catch(() => {});
      // After recording a failure, evaluate whether this provider should be auto-paused.
      // Fire-and-forget: must never block the fulfillment retry loop.
      evaluateProviderForAutoPause(entry.k).catch(() => {});
      console.warn(`[Fulfillment] ✗ ${entry.k} failed in ${durationMs}ms: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError ?? new Error('All providers in fallback chain failed');
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

  // Base params shared across all provider attempts
  const baseParams: ProviderPurchaseParams = {
    planId: order.planId,
    countryCode: planRow.dest?.countryCode ?? 'US',
    dataAmountGb: planRow.plan.dataAmountGb,
    validityDays: planRow.plan.validityDays,
    providerRef: planRow.plan.externalPlanCode ?? undefined,
    customerEmail: order.email,
  };

  const ctx: CustomerContext = {
    email: order.email,
    userId: order.userId ?? undefined,
    name: user?.name,
  };

  try {
    let result: EsimProvisionResult;
    let resolvedProviderName: string;
    let resolvedProviderKey: string;

    // ── Routing-aware path ──────────────────────────────────────────────────
    // Use if the order was created through the routing engine (has fallback chain).
    const hasFallbackChain =
      order.selectedProviderKey &&
      Array.isArray(order.fallbackProvidersJson) &&
      (order.fallbackProvidersJson as any[]).length > 0;

    const countryCode = planRow.dest?.countryCode ?? 'UNKNOWN';

    if (hasFallbackChain) {
      const chain = order.fallbackProvidersJson as unknown as FallbackEntry[];
      console.log(
        `[Fulfillment] Using routing fallback chain for order ${orderId}: ` +
        chain.map(e => e.k).join(' → '),
      );
      const fulfilled = await fulfillWithFallbackChain(
        orderId, chain, baseParams, ctx, countryCode, order.marginPercent,
      );
      result = fulfilled.result;
      resolvedProviderName = fulfilled.providerName;
      resolvedProviderKey = fulfilled.providerKey;
    } else {
      // ── Legacy path ─────────────────────────────────────────────────────
      // No routing data — use the active provider (failover adapter handles transparently).
      console.log(`[Fulfillment] No routing chain for order ${orderId} — using active provider`);
      const provider = getActiveProvider();
      const startMs = Date.now();
      try {
        result = await provider.purchaseEsim(baseParams, ctx);
        const durationMs = Date.now() - startMs;
        await logProviderAttempt(orderId, provider.name, baseParams.providerRef ?? null, 1, 'ok', undefined, durationMs);
        recordFulfillmentOutcome({
          providerKey: provider.name, destination: countryCode,
          outcome: 'success', isPrimary: true, latencyMs: durationMs,
          marginPercent: order.marginPercent ?? undefined,
        }).catch(() => {});
      } catch (err: any) {
        const durationMs = Date.now() - startMs;
        await logProviderAttempt(orderId, provider.name, baseParams.providerRef ?? null, 1, 'error', err.message, durationMs);
        recordFulfillmentOutcome({
          providerKey: provider.name, destination: countryCode,
          outcome: 'failure', isPrimary: true, latencyMs: durationMs,
        }).catch(() => {});
        evaluateProviderForAutoPause(provider.name).catch(() => {});
        throw err;
      }
      resolvedProviderName = provider.name;
      resolvedProviderKey = provider.name;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + planRow.plan.validityDays);

    // ── Update order record ────────────────────────────────────────────────
    await db.update(orders).set({
      status: 'fulfilled',
      esimStatus: 'issued',
      qrCode: result.qrCodeUrl,
      iccid: result.iccid,
      providerName: resolvedProviderName,
      providerEsimId: result.providerEsimId,
      activationDate: new Date(),
      dataTotalMb: result.dataTotalMb,
      dataUsedMb: result.dataUsedMb,
      dataRemainingMb: result.dataRemainingMb,
      daysRemaining: planRow.plan.validityDays,
      expiresAt,
      lastSyncedAt: new Date(),
    }).where(eq(orders.id, orderId));

    // ── Create eSIM entity ─────────────────────────────────────────────────
    const [esimRecord] = await db.insert(esims).values({
      userId: order.userId ?? undefined,
      orderId: order.id,
      planId: order.planId,
      providerName: resolvedProviderName,
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

    await logSync(orderId, esimRecord?.id ?? null, 'initial_purchase', resolvedProviderName,
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

    console.log(`[Fulfillment] ✓ Order ${orderId} fulfilled via ${resolvedProviderKey} — ICCID: ${result.iccid}`);
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
        await logSync(orderId, null, 'initial_purchase_retry', 'unknown',
          `retryFulfill orderId=${orderId}`, retryErr.message, 'error');
        throw retryErr;
      }
    }

    await markFulfillmentFailed(orderId, err.message);
    await logSync(orderId, null, 'initial_purchase', 'unknown',
      `purchaseEsim orderId=${orderId}`, err.message, 'error');
    throw err;
  }
}

// ─── Failure handler ──────────────────────────────────────────────────────────

async function markFulfillmentFailed(orderId: string, reason: string) {
  console.error(`[Fulfillment] Failed for ${orderId}: ${reason}`);
  await db.update(orders)
    .set({ status: 'fulfillment_failed', esimStatus: 'issued' })
    .where(eq(orders.id, orderId));

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

  // Top-ups always use the active provider (the one that provisioned the eSIM)
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
