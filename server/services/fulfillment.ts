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
import { randomUUID } from 'node:crypto';
import { orders, esims, users, topups, plans, destinations, normalizedPlans, providerSyncLogs, providerAttempts, providers } from '@shared/schema';
import { eq, sql, and, inArray, lt, isNull } from 'drizzle-orm';
import { getActiveProvider, getProviderAdapterByKey } from '../providers/adapters';
import type { ProviderAdapter, ProviderPurchaseParams, CustomerContext, EsimProvisionResult } from '../providers/adapters';
import { ZenditPurchasePendingError } from '../providers/adapters/zendit';
import {
  sendPurchaseConfirmation, sendEsimReadyEmail, sendTopupConfirmation,
  sendFulfillmentFailedEmail,
} from './notifications';
import { recordFulfillmentOutcome } from './destinationStats';
import { evaluateProviderForAutoPause } from './autoProviderPause';
import type { FallbackEntry } from './stripeService';
import {
  getAllProviders,
  getOffersForNormalizedPlan,
  getProviderOfferEligibility,
} from './providerRegistry';
import {
  canonicalProviderKey,
  evaluateProviderEligibility,
  getProviderEligibilityByKey,
  resolveCanonicalProviderRow,
} from './providerHealth';

const TRANSIENT_RETRY_DELAY_MS = 1500;

type PlanData = {
  countryCode: string;
  dataAmountGb: number;
  validityDays: number;
  providerRef?: string;
  providerKey?: string;
  name: string;
  destination: string;
  region: string;
  dataAmount: string;
  validity: string;
};

export function dedupeFallbackChainByProvider<T extends { k: string }>(chain: T[]): T[] {
  const seenKeys = new Set<string>();
  return chain.filter(entry => {
    const canonicalKey = canonicalProviderKey(entry.k);
    if (seenKeys.has(canonicalKey)) return false;
    seenKeys.add(canonicalKey);
    return true;
  });
}

export function resolveCanonicalProviderCandidates<T extends { key: string }>(
  rows: T[],
  preferredProviderKey?: string,
): { providers: T[]; conflicts: string[] } {
  const canonicalKeys = preferredProviderKey
    ? [canonicalProviderKey(preferredProviderKey)]
    : [...new Set(rows.map(row => canonicalProviderKey(row.key)))];
  const resolvedProviders: T[] = [];
  const conflicts: string[] = [];

  for (const key of canonicalKeys) {
    const resolved = resolveCanonicalProviderRow(rows, key);
    if (resolved.conflict) {
      conflicts.push(key);
    } else if (resolved.provider) {
      resolvedProviders.push(resolved.provider);
    }
  }

  return { providers: resolvedProviders, conflicts };
}

async function resolveEligibleProviderAdapter(
  preferredProviderKey?: string,
): Promise<{ provider: ProviderAdapter; providerKey: string }> {
  const rows = await getAllProviders();
  const preferred = preferredProviderKey ? canonicalProviderKey(preferredProviderKey) : null;
  const resolved = resolveCanonicalProviderCandidates(rows, preferredProviderKey);
  const candidates = resolved.providers;
  const exclusionReasons = resolved.conflicts.map(
    key => `${key}: conflicting legacy provider registry rows must be reconciled`,
  );
  for (const row of candidates) {
    const eligibility = evaluateProviderEligibility(row);
    if (!eligibility.eligible) {
      exclusionReasons.push(`${row.key}: ${eligibility.reason}`);
      continue;
    }
    const adapter = getProviderAdapterByKey(row.key);
    if (!adapter) {
      exclusionReasons.push(`${row.key}: adapter or credentials unavailable`);
      continue;
    }
    return { provider: adapter, providerKey: canonicalProviderKey(row.key) };
  }

  throw new Error(
    preferred
      ? `Provider "${preferredProviderKey}" is not eligible: ${exclusionReasons.join("; ") || "not registered"}`
      : `No provider is currently eligible for fulfillment: ${exclusionReasons.join("; ") || "none registered"}`,
  );
}

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
  status: 'ok' | 'error' | 'skipped' | 'pending',
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

async function reserveZenditTransaction(orderId: string): Promise<string> {
  const transactionId = `konex-${randomUUID()}`;
  const [reserved] = await db.update(orders).set({
    providerName: 'zendit',
    providerEsimId: transactionId,
    updatedAt: new Date(),
  }).where(and(
    eq(orders.id, orderId),
    eq(orders.status, 'fulfilling'),
    isNull(orders.providerEsimId),
  )).returning({ providerEsimId: orders.providerEsimId });

  if (reserved?.providerEsimId) return reserved.providerEsimId;

  const [existing] = await db.select({
    providerName: orders.providerName,
    providerEsimId: orders.providerEsimId,
  }).from(orders).where(eq(orders.id, orderId));
  if (existing?.providerName === 'zendit' && existing.providerEsimId) {
    return existing.providerEsimId;
  }
  throw new Error(`Could not reserve a Zendit transaction ID for order ${orderId}`);
}

async function clearRejectedZenditTransaction(orderId: string, transactionId: string): Promise<void> {
  await db.update(orders).set({
    providerEsimId: null,
    updatedAt: new Date(),
  }).where(and(
    eq(orders.id, orderId),
    eq(orders.status, 'fulfilling'),
    eq(orders.providerName, 'zendit'),
    eq(orders.providerEsimId, transactionId),
  ));
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
  const deduped = dedupeFallbackChainByProvider(fallbackChain);

  for (let i = 0; i < deduped.length; i++) {
    const entry = deduped[i];
    const isPrimary = i === 0;

    // ── Runtime health gate ────────────────────────────────────────────────
    // The chain is built at order-capture time, before any attempts run.
    // Re-check all fail-closed eligibility signals before every purchase call.
    const eligibility = await getProviderOfferEligibility(entry.k, entry.c);
    if (!eligibility.eligible) {
      console.warn(`[Fulfillment] Provider "${entry.k}" excluded — ${eligibility.reason}`);
      await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'skipped', eligibility.reason);
      recordFulfillmentOutcome({ providerKey: entry.k, destination, outcome: 'skipped', isPrimary }).catch(() => {});
      continue;
    }

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
    let purchaseParams: ProviderPurchaseParams = { ...baseParams, providerRef: entry.c };
    if (canonicalProviderKey(entry.k) === 'zendit') {
      purchaseParams = {
        ...purchaseParams,
        providerTransactionId: await reserveZenditTransaction(orderId),
      };
    }
    try {
      console.log(`[Fulfillment] Attempt ${i + 1}/${fallbackChain.length}: ${entry.k} / ${entry.c}`);
      const result = await provider.purchaseEsim(
        purchaseParams,
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
      if (err instanceof ZenditPurchasePendingError) {
        await logProviderAttempt(
          orderId, entry.k, entry.c, i + 1, 'pending', err.message, durationMs,
        );
        console.warn(`[Fulfillment] ${entry.k} purchase is pending reconciliation: ${err.providerEsimId}`);
        throw err;
      }
      if (purchaseParams.providerTransactionId) {
        await clearRejectedZenditTransaction(orderId, purchaseParams.providerTransactionId);
      }
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

/**
 * Resolve the customer-facing plan details needed when a previously purchased
 * provider order is reconciled after the original fulfillment request ended.
 * This deliberately does not consult live offers: the order must be completed
 * against the plan that was paid for, not a potentially changed catalogue.
 */
async function resolvePlanDataForOrder(order: typeof orders.$inferSelect): Promise<PlanData | null> {
  if (order.planId) {
    const [planRow] = await db
      .select({ plan: plans, dest: destinations })
      .from(plans)
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(plans.id, order.planId));
    if (planRow) {
      return {
        countryCode: planRow.dest?.countryCode ?? 'US',
        dataAmountGb: planRow.plan.dataAmountGb,
        validityDays: planRow.plan.validityDays,
        providerRef: planRow.plan.externalPlanCode ?? undefined,
        providerKey: planRow.plan.provider,
        name: planRow.plan.name,
        destination: planRow.dest?.name ?? '',
        region: planRow.dest?.region ?? '',
        dataAmount: planRow.plan.dataAmount,
        validity: planRow.plan.validity,
      };
    }
  }

  if (!order.normalizedPlanId) return null;

  const offerRows = await db.execute<{
    provider_plan_code: string;
    region_code: string;
    validity_days: number;
    data_mb: number | null;
    is_unlimited: boolean;
    name: string;
  }>(sql`
    SELECT po.provider_plan_code, np.region_code, np.validity_days,
           np.data_mb, np.is_unlimited, np.name
    FROM provider_offers po
    JOIN normalized_plans np ON np.id = po.normalized_plan_id
    WHERE po.id = ${order.normalizedPlanId}
    LIMIT 1
  `);
  const offer = offerRows.rows[0];
  if (offer) {
    const dataAmountGb = offer.is_unlimited ? 0 : (offer.data_mb ?? 0) / 1024;
    return {
      countryCode: offer.region_code,
      dataAmountGb,
      validityDays: offer.validity_days,
      providerRef: offer.provider_plan_code,
      name: offer.name,
      destination: offer.region_code,
      region: '',
      dataAmount: offer.is_unlimited
        ? 'Unlimited'
        : dataAmountGb >= 1
          ? `${Math.round(dataAmountGb * 10) / 10} GB`
          : `${offer.data_mb ?? 0} MB`,
      validity: `${offer.validity_days} Day${offer.validity_days !== 1 ? 's' : ''}`,
    };
  }

  const [normalizedPlan] = await db
    .select()
    .from(normalizedPlans)
    .where(eq(normalizedPlans.id, order.normalizedPlanId));
  if (!normalizedPlan) return null;

  const dataAmountGb = normalizedPlan.isUnlimited ? 0 : normalizedPlan.dataMb / 1024;
  return {
    countryCode: normalizedPlan.regionCode,
    dataAmountGb,
    validityDays: normalizedPlan.validityDays,
    name: normalizedPlan.name,
    destination: normalizedPlan.regionCode,
    region: '',
    dataAmount: normalizedPlan.isUnlimited
      ? 'Unlimited'
      : dataAmountGb >= 1
        ? `${Math.round(dataAmountGb * 10) / 10} GB`
        : `${normalizedPlan.dataMb} MB`,
    validity: `${normalizedPlan.validityDays} Day${normalizedPlan.validityDays !== 1 ? 's' : ''}`,
  };
}

/**
 * Persist a provider result and send the same customer notifications for both
 * the normal and reconciliation paths. The caller must have claimed the order
 * first; the order/provider IDs make the operation auditable and idempotent.
 */
async function completeInitialFulfillment(
  order: typeof orders.$inferSelect,
  user: typeof users.$inferSelect | null,
  planData: PlanData,
  result: EsimProvisionResult,
  resolvedProviderName: string,
  resolvedProviderKey: string,
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + planData.validityDays);

  const esimRecord = await db.transaction(async tx => {
    const [completedOrder] = await tx.update(orders).set({
      status: 'fulfilled',
      esimStatus: 'issued',
      qrCode: result.qrCodeUrl,
      iccid: result.iccid,
      providerName: resolvedProviderName,
      providerEsimId: result.providerEsimId,
      providerReference: result.activationUrl,
      activationDate: new Date(),
      dataTotalMb: result.dataTotalMb,
      dataUsedMb: result.dataUsedMb,
      dataRemainingMb: result.dataRemainingMb,
      daysRemaining: planData.validityDays,
      expiresAt,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
      ...(result.apn ? { apn: result.apn } : {}),
    }).where(and(
      eq(orders.id, order.id),
      inArray(orders.status, ['fulfilling', 'reconciling']),
    )).returning({ id: orders.id });

    // Another worker completed this claim first. Do not insert a duplicate
    // eSIM or send duplicate customer emails.
    if (!completedOrder) return null;

    const [existingEsim] = await tx.select().from(esims).where(eq(esims.orderId, order.id));
    if (existingEsim) return existingEsim;

    return (await tx.insert(esims).values({
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
    }).returning())[0];
  });

  if (!esimRecord) {
    console.log(`[Fulfillment] Order ${order.id} was already completed by another worker`);
    return;
  }

  await logSync(order.id, esimRecord?.id ?? null, 'initial_purchase', resolvedProviderName,
    `purchaseEsim planId=${order.planId ?? order.normalizedPlanId ?? 'unknown'}`,
    `iccid=${result.iccid} status=${result.activationStatus}`,
    'ok');

  // Fire-and-forget notifications. If a process restarts after the DB write,
  // the eSIM remains issued and the existing order can still be re-sent by
  // support; email delivery must not roll back fulfillment.
  sendPurchaseConfirmation({
    email: order.email, name: user?.name, orderId: order.id,
    planName: planData.name,
    destination: planData.destination,
    dataAmount: planData.dataAmount,
    validity: planData.validity,
    totalPrice: order.totalPrice,
    currency: order.currency,
  }).catch(console.error);

  sendEsimReadyEmail({
    email: order.email, name: user?.name, orderId: order.id,
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

  console.log(`[Fulfillment] ✓ Order ${order.id} fulfilled via ${resolvedProviderKey} — ICCID: ${result.iccid}`);
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
        providerKey: planRow.plan.provider,
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
    // Resolve plan data via two paths:
    //   Path A: normalizedPlanId is a provider_offers.id (old checkout flow)
    //   Path B: normalizedPlanId is a normalized_plans.id (new checkout flow — Stripe stores np.id)
    // Both paths resolve to a normalized_plan_id so we can build the dynamic chain after.

    let resolvedNormalizedPlanId: string | null = null;

    // ── Path A: try provider_offers lookup first ──────────────────────────────
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
          providerKey: offer.provider_key,
        name: offer.name,
        destination: offer.region_code,
        region: '',
        dataAmount: dataAmountLabel,
        validity: validityLabel,
      };
      resolvedNormalizedPlanId = offer.normalized_plan_id;
    } else {
      // ── Path B: normalizedPlanId is a normalized_plans.id (new checkout) ──
      const [np] = await db.select().from(normalizedPlans).where(eq(normalizedPlans.id, order.normalizedPlanId));
      if (np) {
        const dataAmountGb = np.isUnlimited ? 0 : np.dataMb / 1024;
        const dataAmountLabel = np.isUnlimited ? 'Unlimited' : dataAmountGb >= 1 ? `${Math.round(dataAmountGb * 10) / 10} GB` : `${np.dataMb} MB`;
        const validityLabel = `${np.validityDays} Day${np.validityDays !== 1 ? 's' : ''}`;
        planData = {
          countryCode: np.regionCode,
          dataAmountGb,
          validityDays: np.validityDays,
          providerRef: undefined, // will be resolved per-provider in dynamic chain
          providerKey: undefined,
          name: np.name,
          destination: np.regionCode,
          region: '',
          dataAmount: dataAmountLabel,
          validity: validityLabel,
        };
        resolvedNormalizedPlanId = np.id;
        console.log(`[Fulfillment] Resolved plan via normalized_plans.id for order ${orderId}: ${np.name}`);
      }
    }

    // ── Build dynamic fallback chain once planData & normalizedPlanId are known ──
    // This runs for BOTH Path A and Path B now.
    if (planData && resolvedNormalizedPlanId) {
      // Admin forced provider override — bypass the dynamic chain entirely.
      if (opts?.forceProviderKey) {
        dynamicFallbackChain = [{ r: 1, k: opts.forceProviderKey, c: opts.forcePlanCode ?? '', w: 0 }];
        console.log(`[Fulfillment] Admin force-provider "${opts.forceProviderKey}" planCode="${opts.forcePlanCode ?? 'auto'}" for order ${orderId}`);
      }

      // Only build dynamic chain if no routing chain was stored at checkout time.
      // (If selectedProviderKey+fallbackProvidersJson were stored by the routing engine,
      //  those take priority and are used directly at line ~402.)
      if (!opts?.forceProviderKey && !order.selectedProviderKey) {
        const allOffersRows = await getOffersForNormalizedPlan(resolvedNormalizedPlanId);

        if (allOffersRows.length > 0) {
          // Filter to only providers that have a working adapter with credentials
          const adapterReady = allOffersRows.filter(r => {
            const adapter = getProviderAdapterByKey(r.providerKey);
            if (!adapter) {
              console.warn(`[Fulfillment] Excluding "${r.providerKey}" from dynamic chain — no adapter/credentials`);
              return false;
            }
            return true;
          });

          if (adapterReady.length > 0) {
            dynamicFallbackChain = adapterReady.map((row, i) => ({
              r: i + 1,
              k: row.providerKey,
              c: row.providerPlanCode,
              w: row.wholesalePriceUsd,
            }));

            console.log(`[Fulfillment] Dynamic chain for ${orderId}: ${dynamicFallbackChain.map(e => e.k).join(' → ')}`);
          } else {
            console.warn(`[Fulfillment] No adapter-ready eligible providers in dynamic chain for ${orderId}`);
            dynamicFallbackChain = [];
          }
        } else {
          console.warn(`[Fulfillment] No eligible offers in dynamic chain for ${orderId}`);
          dynamicFallbackChain = [];
        }
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
    dynamicFallbackChain = [{ r: 1, k: opts.forceProviderKey, c: opts.forcePlanCode ?? '', w: 0 }];
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
    } else if (order.normalizedPlanId) {
      throw new Error('No provider in this order is currently eligible for fulfillment');
    } else {
      // ── Legacy path ─────────────────────────────────────────────────────
      // No routing data — choose only from providers that pass the same live gate.
      let selected: { provider: ProviderAdapter; providerKey: string };
      try {
        selected = await resolveEligibleProviderAdapter(planData.providerKey);
      } catch (preferredError: any) {
        console.warn(`[Fulfillment] Legacy preferred provider unavailable: ${preferredError.message}`);
        selected = await resolveEligibleProviderAdapter();
      }
      const { provider, providerKey } = selected;
      console.log(`[Fulfillment] No routing chain for order ${orderId} — using eligible provider ${providerKey}`);
      // For routing-engine orders (normalizedPlanId set), the providerRef stored in baseParams
      // belongs to whichever provider was selected at checkout (e.g. eSIM Access plan code).
      // Passing that code to a different provider (e.g. Airalo) causes a hard 422/400 error.
      // Clear it here so each provider in the failover chain does a spec-based lookup instead.
      const preferredKey = planData.providerKey ? canonicalProviderKey(planData.providerKey) : null;
      const legacyParams: typeof baseParams = preferredKey === providerKey
        ? baseParams
        : { ...baseParams, providerRef: undefined };
      if (legacyParams.providerRef) {
        const offerEligibility = await getProviderOfferEligibility(providerKey, legacyParams.providerRef);
        if (!offerEligibility.eligible) {
          throw new Error(`Legacy stored provider offer is not eligible: ${offerEligibility.reason}`);
        }
      }
      const startMs = Date.now();
      try {
        const providerParams = providerKey === 'zendit'
          ? {
              ...legacyParams,
              providerTransactionId: await reserveZenditTransaction(orderId),
            }
          : legacyParams;
        result = await provider.purchaseEsim(providerParams, ctx);
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
      resolvedProviderKey = providerKey;
    }

    await completeInitialFulfillment(
      order,
      user,
      planData,
      result,
      resolvedProviderName,
      resolvedProviderKey,
    );
  } catch (err: any) {
    if (err instanceof ZenditPurchasePendingError) {
      console.warn(
        `[Fulfillment] Zendit purchase ${err.providerEsimId} for ${orderId} is pending allocation`,
      );
      await db.update(orders).set({
        status: 'fulfillment_pending',
        esimStatus: 'pending',
        providerName: 'zendit',
        providerEsimId: err.providerEsimId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orders.id, orderId));
      await logSync(
        orderId,
        null,
        'initial_purchase_pending',
        'zendit',
        `reconcile transactionId=${err.providerEsimId}`,
        err.message,
        'ok',
      );
      return;
    }

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

// ─── Zendit delayed-allocation reconciliation ────────────────────────────────

/**
 * Reconcile one Zendit transaction that has already been purchased. The order
 * status is used as a database-backed claim so concurrent scheduler ticks or
 * multiple app instances cannot process the same pending allocation together.
 */
export async function reconcilePendingZenditOrder(orderId: string): Promise<boolean> {
  const [claimed] = await db
    .update(orders)
    .set({ status: 'reconciling', updatedAt: new Date() })
    .where(and(
      eq(orders.id, orderId),
      eq(orders.status, 'fulfillment_pending'),
    ))
    .returning();

  if (!claimed) return false;

  try {
    if (!claimed.providerEsimId) {
      throw new Error(`Pending Zendit order ${orderId} has no transaction ID`);
    }

    const provider = getProviderAdapterByKey('zendit');
    if (!provider?.reconcilePendingPurchase) {
      throw new Error('Zendit reconciliation adapter is unavailable');
    }

    const planData = await resolvePlanDataForOrder(claimed);
    if (!planData) {
      throw new Error(`Plan data not found for pending Zendit order ${orderId}`);
    }

    const result = await provider.reconcilePendingPurchase(claimed.providerEsimId, {
      planId: claimed.planId ?? undefined,
      countryCode: planData.countryCode,
      dataAmountGb: planData.dataAmountGb,
      validityDays: planData.validityDays,
      providerRef: planData.providerRef,
      customerEmail: claimed.email,
    });

    if (!result) {
      await db.update(orders).set({
        status: 'fulfillment_pending',
        esimStatus: 'pending',
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(orders.id, orderId), eq(orders.status, 'reconciling')));
      return false;
    }

    const user = claimed.userId
      ? (await db.select().from(users).where(eq(users.id, claimed.userId)))[0] ?? null
      : null;

    await completeInitialFulfillment(
      claimed,
      user,
      planData,
      result,
      'zendit',
      'zendit',
    );
    await logSync(
      orderId,
      null,
      'initial_purchase_reconciled',
      'zendit',
      `reconcile transactionId=${claimed.providerEsimId}`,
      `iccid=${result.iccid} status=${result.activationStatus}`,
      'ok',
    );
    recordFulfillmentOutcome({
      providerKey: 'zendit',
      destination: planData.countryCode,
      outcome: 'success',
      isPrimary: true,
      marginPercent: claimed.marginPercent ?? undefined,
    }).catch(() => {});
    return true;
  } catch (err: any) {
    // Supplier/network errors are not proof that the already-paid purchase
    // failed. Put it back in the pending queue instead of buying again or
    // presenting a terminal failure to the customer.
    await db.update(orders).set({
      status: 'fulfillment_pending',
      esimStatus: 'pending',
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.status, 'reconciling')));
    await logSync(
      orderId,
      null,
      'initial_purchase_reconcile',
      'zendit',
      `reconcile orderId=${orderId}`,
      err.message,
      'error',
    );
    throw err;
  }
}

let zenditReconciliationRunning = false;

export async function runZenditReconciliationJob(): Promise<void> {
  if (zenditReconciliationRunning) return;
  zenditReconciliationRunning = true;
  try {
    // Recover a claim left behind by a process restart. Normal Zendit API
    // calls are capped at 15 seconds, so two minutes safely distinguishes a
    // dead worker from one still reconciling.
    const staleClaimCutoff = new Date(Date.now() - 2 * 60_000);
    await db.update(orders).set({
      status: 'fulfillment_pending',
      updatedAt: new Date(),
    }).where(and(
      eq(orders.providerName, 'zendit'),
      eq(orders.status, 'reconciling'),
      lt(orders.updatedAt, staleClaimCutoff),
    ));

    const pendingOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(
        eq(orders.providerName, 'zendit'),
        eq(orders.status, 'fulfillment_pending'),
      ));

    for (const pending of pendingOrders) {
      try {
        const completed = await reconcilePendingZenditOrder(pending.id);
        if (completed) {
          console.log(`[Fulfillment] Reconciled delayed Zendit order ${pending.id}`);
        }
      } catch (err: any) {
        console.warn(`[Fulfillment] Zendit reconciliation failed for ${pending.id}: ${err.message}`);
      }
    }
  } finally {
    zenditReconciliationRunning = false;
  }
}

export function startZenditReconciliationScheduler(): void {
  const INITIAL_DELAY_MS = 15_000;
  const INTERVAL_MS = 60_000;
  setTimeout(() => void runZenditReconciliationJob(), INITIAL_DELAY_MS);
  setInterval(() => void runZenditReconciliationJob(), INTERVAL_MS);
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

  let topupProviderName = order.providerName ?? "unknown";
  try {
    // Top-ups must use the original supplier and are blocked if it is unhealthy.
    const { provider } = await resolveEligibleProviderAdapter(order.providerName ?? undefined);
    topupProviderName = provider.name;
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
    await logSync(order.id, null, 'topup', topupProviderName,
      `purchaseTopup orderId=${order.id}`, err.message, 'error');
    throw err;
  }
}
