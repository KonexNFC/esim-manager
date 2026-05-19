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
import { orders, esims, users, topups, plans, destinations, normalizedPlans, providerSyncLogs, providerAttempts, providers } from '@shared/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
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

  // Deduplicate: only keep the first entry per provider key so a single-provider
  // chain (e.g. esimaccess × 6) becomes one attempt, not six.
  const seenKeys = new Set<string>();
  const deduped = fallbackChain.filter(e => {
    if (seenKeys.has(e.k)) return false;
    seenKeys.add(e.k);
    return true;
  });

  for (let i = 0; i < deduped.length; i++) {
    const entry = deduped[i];
    const isPrimary = i === 0;

    // ── Runtime pause check ────────────────────────────────────────────────
    // The chain is built at order-capture time, before any attempts run.
    // A provider may be auto-paused mid-chain after its first failure.
    // Re-check the DB before each attempt to skip newly-paused providers.
    try {
      const [pRow] = await db.select({ autoPaused: providers.autoPaused })
        .from(providers).where(eq(providers.key, entry.k)).limit(1);
      if (pRow?.autoPaused) {
        console.warn(`[Fulfillment] Provider "${entry.k}" is auto-paused — skipping attempt ${i + 1}`);
        await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'skipped', 'Provider is auto-paused');
        recordFulfillmentOutcome({ providerKey: entry.k, destination, outcome: 'skipped', isPrimary }).catch(() => {});
        continue;
      }
    } catch { /* non-fatal: proceed if DB check fails */ }

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

export async function fulfillInitialPurchase(
  orderId: string,
  opts?: { forceProviderKey?: string; forcePlanCode?: string },
): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.status === 'fulfilled') {
    console.log(`[Fulfillment] Order ${orderId} already fulfilled — skipping`);
    return;
  }

  // ── Atomic status transition ──────────────────────────────────────────────
  // Use a single UPDATE ... WHERE status IN ('paid','fulfillment_failed') so only
  // one concurrent caller can ever transition to 'fulfilling'.  If the UPDATE
  // affects 0 rows the order is already in 'fulfilling' or 'fulfilled' — abort.
  const [locked] = await db
    .update(orders)
    .set({ status: 'fulfilling' })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['paid', 'fulfillment_failed'])))
    .returning({ id: orders.id });

  if (!locked) {
    console.log(`[Fulfillment] Order ${orderId} is already being processed (status=${order.status}) — skipping to prevent double-fulfillment`);
    return;
  }

  const user = order.userId
    ? (await db.select().from(users).where(eq(users.id, order.userId)))[0]
    : null;

  // ── Resolve plan data ──────────────────────────────────────────────────────
  // Legacy orders reference the plans table via planId.
  // Country-plan orders (routing engine) use normalizedPlanId with no legacy planId.
  type PlanData = {
    countryCode: string;
    dataAmountGb: number;
    validityDays: number;
    providerRef?: string;
    name: string;
    destination: string;
    region: string;
    dataAmount: string;
    validity: string;
  };
  let planData: PlanData | null = null;

  if (order.planId) {
    const [planRow] = await db
      .select({ plan: plans, dest: destinations })
      .from(plans)
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(plans.id, order.planId));
    if (planRow) {
      planData = {
        countryCode: planRow.dest?.countryCode ?? 'US',
        dataAmountGb: planRow.plan.dataAmountGb,
        validityDays: planRow.plan.validityDays,
        providerRef: planRow.plan.externalPlanCode ?? undefined,
        name: planRow.plan.name,
        destination: planRow.dest?.name ?? '',
        region: planRow.dest?.region ?? '',
        dataAmount: planRow.plan.dataAmount,
        validity: planRow.plan.validity,
      };
    }
  }

  // Dynamic fallback chain built when normalizedPlanId is a provider_offers.id
  let dynamicFallbackChain: FallbackEntry[] | null = null;

  if (!planData && order.normalizedPlanId) {
    // New checkout flow: normalizedPlanId = provider_offers.id
    const offerRows = await db.execute<{
      id: string; provider_key: string; provider_plan_code: string;
      region_code: string; validity_days: number; data_mb: number | null;
      is_unlimited: boolean; name: string; normalized_plan_id: string;
    }>(sql`
      SELECT po.id, po.provider_key, po.provider_plan_code,
             np.region_code, np.validity_days, np.data_mb, np.is_unlimited, np.name,
             po.normalized_plan_id
      FROM provider_offers po
      JOIN normalized_plans np ON np.id = po.normalized_plan_id
      WHERE po.id = ${order.normalizedPlanId}
      LIMIT 1
    `);
    const offer = offerRows.rows[0];

    if (offer) {
      const dataAmountGb = offer.is_unlimited ? 0 : (offer.data_mb ?? 0) / 1024;
      const dataAmountLabel = offer.is_unlimited
        ? 'Unlimited'
        : dataAmountGb >= 1 ? `${Math.round(dataAmountGb * 10) / 10} GB` : `${offer.data_mb ?? 0} MB`;
      const validityLabel = `${offer.validity_days} Day${offer.validity_days !== 1 ? 's' : ''}`;
      planData = {
        countryCode: offer.region_code,
        dataAmountGb,
        validityDays: offer.validity_days,
        providerRef: offer.provider_plan_code,
        name: offer.name,
        destination: offer.region_code,
        region: '',
        dataAmount: dataAmountLabel,
        validity: validityLabel,
      };

      // Admin forced provider override — bypass the dynamic chain entirely.
      if (opts?.forceProviderKey) {
        dynamicFallbackChain = [{ k: opts.forceProviderKey, c: opts.forcePlanCode ?? '' }];
        console.log(`[Fulfillment] Admin force-provider "${opts.forceProviderKey}" planCode="${opts.forcePlanCode ?? 'auto'}" for order ${orderId}`);
      }

      // Build dynamic fallback chain from all active providers for this plan.
      // IMPORTANT: Only include providers that have a registered purchase adapter.
      // Providers synced into the catalogue (e.g. Zendit) but without an adapter
      // implementation must be excluded — otherwise the entire chain silently skips
      // and the customer is left with no eSIM after a successful payment.
      if (!opts?.forceProviderKey && !order.selectedProviderKey) {
        const allOffersRows = await db.execute<{ provider_key: string; provider_plan_code: string }>(sql`
          SELECT po2.provider_key, po2.provider_plan_code
          FROM provider_offers po2
          JOIN providers p ON p.key = po2.provider_key
          WHERE po2.normalized_plan_id = ${offer.normalized_plan_id}
            AND po2.is_active = true
            AND p.enabled = true
            AND p.auto_paused = false
          ORDER BY p.priority ASC, po2.wholesale_price_usd ASC
        `);

        if (allOffersRows.rows.length > 0) {
          // Filter to only providers that have a working adapter
          const adapterReady = allOffersRows.rows.filter(r => {
            const adapter = getProviderAdapterByKey(r.provider_key);
            if (!adapter) {
              console.warn(`[Fulfillment] Excluding "${r.provider_key}" from dynamic chain — no adapter registered`);
              return false;
            }
            return true;
          });

          if (adapterReady.length > 0) {
            dynamicFallbackChain = adapterReady.map(r => ({
              k: r.provider_key,
              c: r.provider_plan_code,
            }));

            // Safety-net: if eSIMGo is configured and not already in the chain,
            // append a spec-based eSIMGo entry as last resort.  This ensures that
            // even when the entire chain is from a single provider (e.g. esimaccess)
            // there is still a funded alternative rather than a total failure.
            const alreadyHasEsimGo = dynamicFallbackChain.some(e => e.k.toLowerCase().replace(/[_\-\s]/g, '') === 'esimgo');
            const esimGoAdapter = getProviderAdapterByKey('esimgo');
            if (!alreadyHasEsimGo && esimGoAdapter) {
              dynamicFallbackChain.push({ k: 'esimgo', c: '' }); // empty code → spec-based lookup
              console.log(`[Fulfillment] Appended eSIMGo safety-net to chain for ${orderId}`);
            }

            console.log(`[Fulfillment] Dynamic chain for ${orderId}: ${dynamicFallbackChain.map(e => e.k).join(' → ')}`);
          } else {
            // All offers belong to providers without adapters — log and fall through
            // to the legacy getActiveProvider() path below so we still attempt fulfillment.
            // Clear providerRef so the active provider does a spec-based plan search
            // (the stored code belongs to the non-adapter provider and is meaningless to eSIMGo).
            console.warn(`[Fulfillment] No adapter-ready providers in dynamic chain for ${orderId} — falling through to active provider (spec-based lookup)`);
            planData.providerRef = undefined;
            dynamicFallbackChain = null;
          }
        }
      }
    } else {
      // Legacy fallback: look in normalized_plans directly (old checkout path)
      const [np] = await db.select().from(normalizedPlans).where(eq(normalizedPlans.id, order.normalizedPlanId));
      if (np) {
        const dataAmountGb = np.dataMb / 1024;
        const dataAmountLabel = np.isUnlimited ? 'Unlimited' : dataAmountGb >= 1 ? `${dataAmountGb} GB` : `${np.dataMb} MB`;
        const validityLabel = `${np.validityDays} Day${np.validityDays !== 1 ? 's' : ''}`;
        planData = {
          countryCode: np.regionCode,
          dataAmountGb,
          validityDays: np.validityDays,
          providerRef: undefined,
          name: np.name,
          destination: np.regionCode,
          region: '',
          dataAmount: dataAmountLabel,
          validity: validityLabel,
        };
      }
    }
  }

  if (!planData) {
    await markFulfillmentFailed(orderId, 'Plan not found');
    throw new Error(`No plan data found for order ${orderId} (planId=${order.planId}, normalizedPlanId=${order.normalizedPlanId})`);
  }

  // Base params shared across all provider attempts
  const baseParams: ProviderPurchaseParams = {
    planId: order.planId ?? undefined,
    countryCode: planData.countryCode,
    dataAmountGb: planData.dataAmountGb,
    validityDays: planData.validityDays,
    providerRef: planData.providerRef,
    customerEmail: order.email,
  };

  const ctx: CustomerContext = {
    email: order.email,
    userId: order.userId ?? undefined,
    name: user?.name,
  };

  // Admin force-provider: apply for legacy planId orders or when the
  // normalizedPlanId branch didn't set a dynamic chain.
  if (opts?.forceProviderKey && (dynamicFallbackChain === null || dynamicFallbackChain.length === 0)) {
    dynamicFallbackChain = [{ k: opts.forceProviderKey, c: opts.forcePlanCode ?? '' }];
    console.log(`[Fulfillment] Admin force-provider "${opts.forceProviderKey}" planCode="${opts.forcePlanCode ?? 'auto'}" (fallback) for order ${orderId}`);
  }

  try {
    let result: EsimProvisionResult;
    let resolvedProviderName: string;
    let resolvedProviderKey: string;

    // ── Routing-aware path ──────────────────────────────────────────────────
    // Use if: (a) order has a pre-computed routing chain from the routing engine, OR
    //         (b) we dynamically built a chain from the provider_offers lookup above.
    const hasFallbackChain =
      (order.selectedProviderKey &&
        Array.isArray(order.fallbackProvidersJson) &&
        (order.fallbackProvidersJson as any[]).length > 0) ||
      (dynamicFallbackChain !== null && dynamicFallbackChain.length > 0);

    const countryCode = planData.countryCode;

    if (hasFallbackChain) {
      const chain = dynamicFallbackChain ??
        (order.fallbackProvidersJson as unknown as FallbackEntry[]);
      console.log(
        `[Fulfillment] Using ${dynamicFallbackChain ? 'dynamic' : 'routing'} fallback chain for order ${orderId}: ` +
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
      // For routing-engine orders (normalizedPlanId set), the providerRef stored in baseParams
      // belongs to whichever provider was selected at checkout (e.g. eSIM Access plan code).
      // Passing that code to a different provider (e.g. Airalo) causes a hard 422/400 error.
      // Clear it here so each provider in the failover chain does a spec-based lookup instead.
      const legacyParams: typeof baseParams = order.normalizedPlanId
        ? { ...baseParams, providerRef: undefined }
        : baseParams;
      const startMs = Date.now();
      try {
        result = await provider.purchaseEsim(legacyParams, ctx);
        const durationMs = Date.now() - startMs;
        await logProviderAttempt(orderId, provider.name, legacyParams.providerRef ?? null, 1, 'ok', undefined, durationMs);
        recordFulfillmentOutcome({
          providerKey: provider.name, destination: countryCode,
          outcome: 'success', isPrimary: true, latencyMs: durationMs,
          marginPercent: order.marginPercent ?? undefined,
        }).catch(() => {});
      } catch (err: any) {
        const durationMs = Date.now() - startMs;
        await logProviderAttempt(orderId, provider.name, legacyParams.providerRef ?? null, 1, 'error', err.message, durationMs);
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
    expiresAt.setDate(expiresAt.getDate() + planData.validityDays);

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
      daysRemaining: planData.validityDays,
      expiresAt,
      lastSyncedAt: new Date(),
      ...(result.apn ? { apn: result.apn } : {}),
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
      destination: planData.destination,
      region: planData.region,
      planName: planData.name,
      activationStatus: 'issued',
      dataTotalMb: result.dataTotalMb,
      dataUsedMb: result.dataUsedMb,
      dataRemainingMb: result.dataRemainingMb,
      validityDays: planData.validityDays,
      daysRemaining: planData.validityDays,
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
      planName: planData.name,
      destination: planData.destination,
      dataAmount: planData.dataAmount,
      validity: planData.validity,
      totalPrice: order.totalPrice,
      currency: order.currency,
    }).catch(console.error);

    sendEsimReadyEmail({
      email: order.email, name: user?.name, orderId,
      qrCodeUrl: result.qrCodeUrl,
      iccid: result.iccid,
      destination: planData.destination,
      manualCode: result.manualCode,
      planName: planData.name,
      dataAmount: planData.dataAmount,
      validity: planData.validity,
      totalPrice: order.totalPrice,
      currency: order.currency,
      paymentMethod: order.paypalOrderId ? 'PayPal' : 'Card',
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
    .set({ status: 'fulfillment_failed', esimStatus: 'not_issued' })
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
