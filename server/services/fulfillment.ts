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
//     → pinned plan provider + exact externalPlanCode (singleton, no failover)

import { db } from '../storage';
import { randomUUID } from 'node:crypto';
import { esimReadyNotifications } from '@shared/schema';
import { orders, esims, users, topups, plans, destinations, normalizedPlans, providerSyncLogs, providerAttempts, providers, providerOffers } from '@shared/schema';
import { eq, sql, and, inArray, lt, isNull } from 'drizzle-orm';
import { getProviderAdapterByKey } from '../providers/adapters';
import type { ProviderAdapter, ProviderPurchaseParams, CustomerContext, EsimProvisionResult } from '../providers/adapters';
import { ZenditPurchasePendingError } from '../providers/adapters/zendit';
import {
  sendPurchaseConfirmation, sendTopupConfirmation,
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

export type FulfillmentFailureClass =
  | 'timeout'
  | 'network'
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'validation'
  | 'pending_reconciliation'
  | 'internal';

/** Keep failure classification stable in the existing text-only audit schema. */
export function classifyFulfillmentFailure(err: unknown): FulfillmentFailureClass {
  const value = err as any;
  const message = String(value?.message ?? value ?? '').toLowerCase();
  if (value instanceof ZenditPurchasePendingError || message.includes('pending')) {
    return 'pending_reconciliation';
  }
  if (value?.status === 401 || value?.status === 403 || message.includes('not configured') ||
      message.includes('unavailable') || message.includes('credentials')) {
    return 'provider_unavailable';
  }
  if (value?.status >= 400 && value?.status < 500 ||
      message.includes('invalid') || message.includes('requires') ||
      message.includes('rejected')) {
    return 'provider_rejected';
  }
  if (isTransientError(value)) {
    return message.includes('timeout') || message.includes('timed out') ? 'timeout' : 'network';
  }
  if (message.includes('plan') || message.includes('offer') || message.includes('sku')) {
    return 'validation';
  }
  return 'internal';
}

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

async function nextProviderAttemptNumber(orderId: string): Promise<number> {
  try {
    const attempts = await db
      .select({ attemptNumber: providerAttempts.attemptNumber })
      .from(providerAttempts)
      .where(eq(providerAttempts.orderId, orderId));
    return Math.max(0, ...attempts.map(attempt => attempt.attemptNumber ?? 0)) + 1;
  } catch {
    return 1;
  }
}

async function logIssuanceOutcome(
  orderId: string,
  providerKey: string,
  planCode: string | null | undefined,
  status: 'ok' | 'error' | 'pending',
  durationMs: number,
  error?: unknown,
): Promise<void> {
  const failureClass = status === 'ok'
    ? null
    : classifyFulfillmentFailure(error);
  const suffix = status === 'ok'
    ? `status=issued durationMs=${durationMs}`
    : `status=${status} durationMs=${durationMs} failureClass=${failureClass} error=${String((error as any)?.message ?? error ?? 'unknown')}`;
  await logSync(
    orderId,
    null,
    'issuance_outcome',
    canonicalProviderKey(providerKey),
    `provider=${canonicalProviderKey(providerKey)} planCode=${planCode ?? 'unknown'}`,
    suffix,
    status === 'error' ? 'error' : 'ok',
  );
}

/**
 * A stored normalized-plan order is pinned to the supplier SKU captured at
 * checkout.  Provider-plan-code lookup by itself is unsafe because codes may
 * be reused across normalized products or legacy catalogue rows.
 */
export interface StoredProviderOfferIdentity {
  normalizedPlanId: string;
  providerKey: string;
  providerPlanCode: string;
  isActive: boolean;
}

/**
 * Older orders stored provider_offers.id in normalizedPlanId. Newer orders
 * store normalized_plans.id. Resolve the former to the canonical normalized
 * product without changing the supplier identity captured by the order.
 */
export function resolveCanonicalNormalizedPlanId(
  storedReference: string,
  storedOffer?: Pick<StoredProviderOfferIdentity, 'normalizedPlanId'> | null,
): string {
  return storedOffer?.normalizedPlanId ?? storedReference;
}

/**
 * When the order reference itself is a provider-offer ID, the fallback entry
 * must remain that exact offer. A matching SKU from another supplier is not a
 * safe substitute, even when it belongs to the same normalized product.
 */
export function matchesStoredProviderOfferIdentity(
  storedOffer: StoredProviderOfferIdentity | null | undefined,
  entry: Pick<FallbackEntry, 'k' | 'c'>,
): boolean {
  if (!storedOffer) return true;
  return storedOffer.isActive
    && canonicalProviderKey(storedOffer.providerKey) === canonicalProviderKey(entry.k)
    && storedOffer.providerPlanCode === entry.c;
}

async function assertExactOrderOffer(
  order: typeof orders.$inferSelect,
  entry: FallbackEntry,
): Promise<void> {
  if (!order.normalizedPlanId) return;
  const [storedOffer] = await db
    .select({
      normalizedPlanId: providerOffers.normalizedPlanId,
      providerKey: providerOffers.providerKey,
      providerPlanCode: providerOffers.providerPlanCode,
      isActive: providerOffers.isActive,
    })
    .from(providerOffers)
    .where(eq(providerOffers.id, order.normalizedPlanId))
    .limit(1);

  if (!matchesStoredProviderOfferIdentity(storedOffer, entry)) {
    throw new Error(
      `Pinned supplier offer ${entry.k}/${entry.c} does not match the stored provider offer ${order.normalizedPlanId}`,
    );
  }
  const canonicalNormalizedPlanId = resolveCanonicalNormalizedPlanId(
    order.normalizedPlanId,
    storedOffer,
  );
  const offers = await db
    .select({
      id: providerOffers.id,
      providerKey: providerOffers.providerKey,
      providerPlanCode: providerOffers.providerPlanCode,
      isActive: providerOffers.isActive,
    })
    .from(providerOffers)
    .where(and(
      eq(providerOffers.normalizedPlanId, canonicalNormalizedPlanId),
      eq(providerOffers.providerPlanCode, entry.c),
      eq(providerOffers.isActive, true),
    ))
    ;
  const offer = offers.find(candidate =>
    canonicalProviderKey(candidate.providerKey) === canonicalProviderKey(entry.k),
  );
  if (!offer) {
    throw new Error(
      `Pinned supplier offer ${entry.k}/${entry.c} is not active for normalized plan ${canonicalNormalizedPlanId}`,
    );
  }
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
  order: typeof orders.$inferSelect,
  fallbackChain: FallbackEntry[],
  baseParams: ProviderPurchaseParams,
  ctx: CustomerContext,
  destination: string,
  marginPercent?: number | null,
): Promise<{
  result: EsimProvisionResult;
  providerName: string;
  providerKey: string;
  providerPlanCode: string;
  durationMs: number;
}> {
  let lastError: Error | null = null;

  // Deduplicate: only keep the first entry per provider key so a single-provider
  // chain (e.g. esimaccess × 6) becomes one attempt, not six.
  const deduped = dedupeFallbackChainByProvider(fallbackChain);

  for (let i = 0; i < deduped.length; i++) {
    const entry = deduped[i];
    const isPrimary = i === 0;

    try {
      await assertExactOrderOffer(order, entry);
    } catch (err: any) {
      const reason = `${classifyFulfillmentFailure(err)}: ${err.message}`;
      await logProviderAttempt(orderId, entry.k, entry.c, i + 1, 'skipped', reason);
      recordFulfillmentOutcome({ providerKey: entry.k, destination, outcome: 'skipped', isPrimary }).catch(() => {});
      continue;
    }

    // ── Runtime health gate ────────────────────────────────────────────────
    // The chain is built at order-capture time, before any attempts run.
    // Re-check all fail-closed eligibility signals before every purchase call.
    // Legacy/admin pinned plans predate provider_offers and carry their exact
    // supplier SKU on plans.external_plan_code. They still require a configured
    // adapter below, but must not be widened or rejected merely because an old
    // SKU is absent from today's normalized live-offer table.
    const eligibility = order.normalizedPlanId
      ? await getProviderOfferEligibility(entry.k, entry.c)
      : { eligible: true, reason: 'legacy pinned supplier identity' };
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
      console.log(`[Fulfillment] ✓ ${entry.k} succeeded in ${durationMs}ms`);
      return {
        result,
        providerName: provider.name,
        providerKey: entry.k,
        providerPlanCode: entry.c,
        durationMs,
      };
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

  // Reconciliation must use the supplier SKU captured in the paid routing
  // chain, not an arbitrary offer row returned by a later catalogue query.
  const storedChain = Array.isArray(order.fallbackProvidersJson)
    ? order.fallbackProvidersJson as Array<{ k?: string; c?: string; providerKey?: string; providerPlanCode?: string }>
    : [];
  const providerKey = order.providerName ? canonicalProviderKey(order.providerName) : null;
  const pinnedEntry = storedChain.find(entry =>
    canonicalProviderKey(entry.k ?? entry.providerKey ?? '') === providerKey,
  );
  const [storedOffer] = await db
    .select({
      normalizedPlanId: providerOffers.normalizedPlanId,
      providerKey: providerOffers.providerKey,
      providerPlanCode: providerOffers.providerPlanCode,
      isActive: providerOffers.isActive,
    })
    .from(providerOffers)
    .where(eq(providerOffers.id, order.normalizedPlanId))
    .limit(1);
  if (storedOffer && !storedOffer.isActive) {
    throw new Error(
      `Paid normalized order ${order.id} references an inactive supplier offer`,
    );
  }
  if (
    storedOffer &&
    providerKey &&
    canonicalProviderKey(storedOffer.providerKey) !== providerKey
  ) {
    throw new Error(
      `Paid normalized order ${order.id} provider does not match its stored provider offer`,
    );
  }
  if (
    storedOffer &&
    pinnedEntry &&
    !matchesStoredProviderOfferIdentity(storedOffer, {
      k: pinnedEntry.k ?? pinnedEntry.providerKey ?? '',
      c: pinnedEntry.c ?? pinnedEntry.providerPlanCode ?? '',
    })
  ) {
    throw new Error(
      `Paid normalized order ${order.id} supplier identity does not match its stored provider offer`,
    );
  }
  const canonicalNormalizedPlanId = resolveCanonicalNormalizedPlanId(
    order.normalizedPlanId,
    storedOffer,
  );
  const [normalizedPlanForReconciliation] = await db
    .select()
    .from(normalizedPlans)
    .where(eq(normalizedPlans.id, canonicalNormalizedPlanId))
    .limit(1);
  if (normalizedPlanForReconciliation) {
    const isUnlimited = normalizedPlanForReconciliation.isUnlimited || normalizedPlanForReconciliation.dataMb >= 999999;
    const dataAmountGb = isUnlimited ? 0 : normalizedPlanForReconciliation.dataMb / 1024;
    const reconciliationProviderRef =
      pinnedEntry?.c ??
      pinnedEntry?.providerPlanCode ??
      storedOffer?.providerPlanCode;
    if (!reconciliationProviderRef) {
      throw new Error(
        `Paid normalized order ${order.id} has no stored supplier SKU for reconciliation`,
      );
    }
    return {
      countryCode: normalizedPlanForReconciliation.regionCode,
      dataAmountGb,
      validityDays: normalizedPlanForReconciliation.validityDays,
      providerRef: reconciliationProviderRef,
      providerKey:
        pinnedEntry?.k ??
        pinnedEntry?.providerKey ??
        storedOffer?.providerKey,
      name: normalizedPlanForReconciliation.name,
      destination: normalizedPlanForReconciliation.regionCode,
      region: '',
      dataAmount: isUnlimited
        ? 'Unlimited'
        : dataAmountGb >= 1
          ? `${Math.round(dataAmountGb * 10) / 10} GB`
          : `${normalizedPlanForReconciliation.dataMb} MB`,
      validity: `${normalizedPlanForReconciliation.validityDays} Day${normalizedPlanForReconciliation.validityDays !== 1 ? 's' : ''}`,
    };
  }
  // A missing normalized product also means the paid SKU cannot be recovered.
  // Never select a replacement offer from the current catalogue.
  return null;
}

/**
 * Persist a provider result and send the same customer notifications for both
 * the normal and reconciliation paths. The caller must have claimed the order
 * first; the order/provider IDs make the operation auditable and idempotent.
 */
export async function completeInitialFulfillment(
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

    // This insert must commit (or roll back) with the issued eSIM and order.
    // Repeated fulfillment cannot reset an already-delivered notification.
    await tx.insert(esimReadyNotifications).values({
      orderId: order.id,
      payload: {
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
      },
    }).onConflictDoNothing();

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

  // The separate purchase receipt remains best-effort. The QR email above is
  // durable and is delivered independently by the notification worker.
  sendPurchaseConfirmation({
    email: order.email, name: user?.name, orderId: order.id,
    planName: planData.name,
    destination: planData.destination,
    dataAmount: planData.dataAmount,
    validity: planData.validity,
    totalPrice: order.totalPrice,
    currency: order.currency,
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
    let resolvedProviderOffer: {
      provider_key: string;
      provider_plan_code: string;
    } | null = null;

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
    resolvedProviderOffer = offer
      ? {
          provider_key: offer.provider_key,
          provider_plan_code: offer.provider_plan_code,
        }
      : null;

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
        let pinnedCode = opts.forcePlanCode;
        let pinnedWholesale = 0;
        if (!pinnedCode && resolvedNormalizedPlanId) {
          const pinnedOffers = await getOffersForNormalizedPlan(resolvedNormalizedPlanId);
          const pinned = pinnedOffers.find(offer =>
            offer.providerKey === canonicalProviderKey(opts.forceProviderKey!),
          );
          pinnedCode = pinned?.providerPlanCode;
          pinnedWholesale = pinned?.wholesalePriceUsd ?? 0;
        }
        if (!pinnedCode) {
          throw new Error(`No active ${opts.forceProviderKey} SKU is available for this normalized plan`);
        }
        dynamicFallbackChain = [{ r: 1, k: opts.forceProviderKey, c: pinnedCode, w: pinnedWholesale }];
        console.log(`[Fulfillment] Admin force-provider "${opts.forceProviderKey}" planCode="${opts.forcePlanCode ?? 'auto'}" for order ${orderId}`);
      } else if (resolvedProviderOffer) {
        // Legacy orders may store provider_offers.id in normalizedPlanId.
        // That ID is itself the authenticated supplier identity, so retain it
        // as a singleton rather than dynamically broadening to equivalents.
        dynamicFallbackChain = [{
          r: 1,
          k: resolvedProviderOffer.provider_key,
          c: resolvedProviderOffer.provider_plan_code,
          w: 0,
        }];
      }

      // No dynamic chain construction here. A paid normalized order without
      // persisted routing metadata has no authenticated supplier SKU and must
      // fail closed rather than expanding to a newly equivalent offer.
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
    if (!opts.forcePlanCode) {
      throw new Error(`A pinned provider re-fulfillment requires an explicit supplier SKU for order ${orderId}`);
    }
    dynamicFallbackChain = [{ r: 1, k: opts.forceProviderKey, c: opts.forcePlanCode, w: 0 }];
    console.log(`[Fulfillment] Admin force-provider "${opts.forceProviderKey}" planCode="${opts.forcePlanCode ?? 'auto'}" (fallback) for order ${orderId}`);
  }

  let auditProviderKey = canonicalProviderKey(
    order.selectedProviderKey ?? planData.providerKey ?? 'unknown',
  );
  let auditPlanCode: string | null = planData.providerRef ?? null;
  let auditDurationMs = 0;
  let auditUsedPrimary = true;
  const fulfillmentStartedAt = Date.now();
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
        orderId, order, chain, baseParams, ctx, countryCode, order.marginPercent,
      );
      result = fulfilled.result;
      resolvedProviderName = fulfilled.providerName;
      resolvedProviderKey = fulfilled.providerKey;
      auditProviderKey = canonicalProviderKey(fulfilled.providerKey);
      auditDurationMs = fulfilled.durationMs;
      auditPlanCode = fulfilled.providerPlanCode;
      auditUsedPrimary = canonicalProviderKey(fulfilled.providerKey) === canonicalProviderKey(chain[0]?.k ?? fulfilled.providerKey);
    } else if (order.normalizedPlanId) {
      throw new Error('No provider in this order is currently eligible for fulfillment');
    } else {
      // ── Legacy path ─────────────────────────────────────────────────────
      // A legacy plan's provider + externalPlanCode is its only supplier
      // identity. Treat it as a pinned singleton rather than retrying another
      // provider with an incompatible SKU.
      if (!planData.providerKey) {
        throw new Error('Legacy order has no pinned provider identity');
      }
      const selected = await resolveEligibleProviderAdapter(planData.providerKey);
      const { provider, providerKey } = selected;
      console.log(`[Fulfillment] Pinned legacy provider for order ${orderId}: ${providerKey}`);
      const legacyParams = baseParams;
      if (!legacyParams.providerRef) {
        throw new Error(`Legacy order ${orderId} has no pinned supplier SKU`);
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
        auditDurationMs = durationMs;
        auditPlanCode = legacyParams.providerRef ?? null;
        await logProviderAttempt(orderId, provider.name, legacyParams.providerRef ?? null, 1, 'ok', undefined, durationMs);
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
      auditProviderKey = canonicalProviderKey(providerKey);
    }

    await completeInitialFulfillment(
      order,
      user,
      planData,
      result,
      resolvedProviderName,
      resolvedProviderKey,
    );
    await logIssuanceOutcome(
      orderId,
      resolvedProviderKey,
      auditPlanCode,
      'ok',
      auditDurationMs,
    );
    recordFulfillmentOutcome({
      providerKey: resolvedProviderKey,
      destination: countryCode,
      outcome: 'success',
      isPrimary: auditUsedPrimary,
      latencyMs: auditDurationMs,
      marginPercent: order.marginPercent ?? undefined,
    }).catch(() => {});
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
      await logIssuanceOutcome(
        orderId,
        'zendit',
        err.providerEsimId,
        'pending',
        Date.now() - fulfillmentStartedAt,
        err,
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
        const reason = `${classifyFulfillmentFailure(retryErr)}: Retry failed: ${retryErr.message}`;
        await markFulfillmentFailed(orderId, reason);
        await logIssuanceOutcome(orderId, auditProviderKey, auditPlanCode, 'error', auditDurationMs, retryErr);
        await logSync(orderId, null, 'initial_purchase_retry', 'unknown',
          `retryFulfill orderId=${orderId} durationMs=${auditDurationMs}`,
          `failureClass=${classifyFulfillmentFailure(retryErr)} ${retryErr.message}`, 'error');
        throw retryErr;
      }
    }

    const failureClass = classifyFulfillmentFailure(err);
    await markFulfillmentFailed(orderId, `${failureClass}: ${err.message}`);
    await logIssuanceOutcome(orderId, auditProviderKey, auditPlanCode, 'error', auditDurationMs, err);
    await logSync(orderId, null, 'initial_purchase', 'unknown',
      `purchaseEsim orderId=${orderId} durationMs=${auditDurationMs}`,
      `failureClass=${failureClass} ${err.message}`, 'error');
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

  const reconciliationStartedAt = Date.now();
  let reconciliationPlanCode: string | null = null;
  const reconciliationAttemptNumber = await nextProviderAttemptNumber(orderId);
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
    reconciliationPlanCode = planData.providerRef ?? null;

    const result = await provider.reconcilePendingPurchase(claimed.providerEsimId, {
      planId: claimed.planId ?? undefined,
      countryCode: planData.countryCode,
      dataAmountGb: planData.dataAmountGb,
      validityDays: planData.validityDays,
      providerRef: planData.providerRef,
      customerEmail: claimed.email,
    });

    if (!result) {
      await logProviderAttempt(
        orderId,
        'zendit',
        reconciliationPlanCode,
        reconciliationAttemptNumber,
        'pending',
        'Supplier allocation is still pending',
        Date.now() - reconciliationStartedAt,
      );
      await db.update(orders).set({
        status: 'fulfillment_pending',
        esimStatus: 'pending',
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(orders.id, orderId), eq(orders.status, 'reconciling')));
      await logIssuanceOutcome(
        orderId,
        'zendit',
        claimed.providerEsimId,
        'pending',
        Date.now() - reconciliationStartedAt,
        new Error('Supplier allocation is still pending'),
      );
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
    await logProviderAttempt(
      orderId,
      'zendit',
      reconciliationPlanCode,
      reconciliationAttemptNumber,
      'ok',
      undefined,
      Date.now() - reconciliationStartedAt,
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
    await logIssuanceOutcome(
      orderId,
      'zendit',
      claimed.providerEsimId,
      'ok',
      Date.now() - reconciliationStartedAt,
    );
    recordFulfillmentOutcome({
      providerKey: 'zendit',
      destination: planData.countryCode,
      outcome: 'success',
      isPrimary: true,
      latencyMs: Date.now() - reconciliationStartedAt,
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
    await logProviderAttempt(
      orderId,
      'zendit',
      reconciliationPlanCode,
      reconciliationAttemptNumber,
      'error',
      `${classifyFulfillmentFailure(err)}: ${err.message}`,
      Date.now() - reconciliationStartedAt,
    );
    await logIssuanceOutcome(
      orderId,
      'zendit',
      claimed.providerEsimId,
      'error',
      Date.now() - reconciliationStartedAt,
      err,
    );
    await logSync(
      orderId,
      null,
      'initial_purchase_reconcile',
      'zendit',
      `reconcile orderId=${orderId} durationMs=${Date.now() - reconciliationStartedAt}`,
      `failureClass=${classifyFulfillmentFailure(err)} ${err.message}`,
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
  } catch {
    // A failed queue scan (including stale-claim recovery) must not reject the
    // timer's fire-and-forget promise and terminate the HTTP process. Leave
    // persisted orders untouched and retry on the next scheduled tick.
    // Do not log the raw Drizzle error: it can include SQL/customer data.
    console.warn('[Fulfillment] Zendit reconciliation queue unavailable; will retry on the next scheduled run');
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
