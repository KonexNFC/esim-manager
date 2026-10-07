// ─── Provider performance history ─────────────────────────────────────────────
//
// This module is deliberately read-only.  It normalises the two sources that
// already exist in the database (orders and provider_attempts) at read time,
// rather than introducing a backfill table or migration.  A non-pending
// provider attempt is the authoritative observation when one exists; a
// terminal order is also used when reconciliation only left pending/skipped
// attempt rows.
//
// There are two important distinctions here:
//
//   * `issued_success` means that the order reached the issued/fulfilled state.
//     An API response of `ok` is not enough to call an eSIM issued.
//   * `api_accepted` means the provider accepted the request, but the order has
//     not been observed as issued yet.  It is retained for operational
//     visibility and latency, but is not counted as a successful issuance.
//
// Pending and skipped attempts never become observations.  In particular, a
// fallback being used is not a failure or a quality penalty: a successful
// fallback contributes a successful issuance for that provider just like a
// successful primary attempt.

import { desc, gte, inArray, or } from "drizzle-orm";
import { db } from "../storage";
import {
  destinations,
  normalizedPlans,
  orders,
  plans,
  providerAttempts,
  providerOffers,
} from "@shared/schema";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PerformanceOutcome = "issued_success" | "api_accepted" | "failure";

/**
 * Failure classes intentionally describe provider/fulfilment causes rather
 * than customer or payment state.  `unknown` is explicit so a new provider
 * error never silently disappears from the history.
 */
export type FailureClass =
  | "timeout"
  | "authentication"
  | "insufficient_funds"
  | "offer_unavailable"
  | "rate_limited"
  | "network"
  | "provider_rejected"
  | "unknown";

export type PerformanceHistorySource = "provider_attempt" | "order";

/**
 * A normalised, de-duplicated event used by the router.
 *
 * `isFallback` is descriptive only.  It must not be used as a negative score:
 * fallback success is still provider success.
 */
export interface PerformanceObservation {
  orderId: string;
  providerKey: string;
  destination: string;
  outcome: PerformanceOutcome;
  isFallback: boolean;
  latencyMs: number | null;
  failureClass: FailureClass | null;
  occurredAt: Date;
  source: PerformanceHistorySource;
}

export interface PerformanceHistoryAttemptInput {
  id?: string | null;
  orderId: string;
  providerKey: string;
  status: string;
  attemptNumber?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  failureClass?: FailureClass | null;
  providerPlanCode?: string | null;
  destination?: string | null;
  isPrimary?: boolean | null;
  createdAt?: Date | string | null;
}

export interface PerformanceHistoryOrderInput {
  id: string;
  status: string;
  providerName?: string | null;
  selectedProviderKey?: string | null;
  destination?: string | null;
  esimStatus?: string | null;
  providerEsimId?: string | null;
  providerReference?: string | null;
  qrCode?: string | null;
  iccid?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface PerformanceHistorySeed {
  attempts: PerformanceHistoryAttemptInput[];
  orders: PerformanceHistoryOrderInput[];
}

export interface PerformanceHistoryOptions {
  /**
   * The recent window used by the database source.  Pure normalisation does
   * not discard events based on this value.
   */
  lookbackDays?: number;
  maxAttempts?: number;
  maxOrders?: number;
  /**
   * Short shared-cache lifetime for source history.  Candidate/provider
   * lookups share one snapshot during this window instead of reloading the
   * source rows for every product.  Set to zero only for explicit bypasses.
   */
  cacheTtlMs?: number;
  now?: Date;
  /**
   * Half-life for recency weighting.  The default keeps recent production
   * behaviour responsive without making one incident permanently dominant.
   */
  halfLifeDays?: number;
  /**
   * Number of pseudo-observations in the global prior.  This is deliberately
   * small enough for destination evidence to win once it has a useful sample.
   */
  priorWeight?: number;
  defaultGlobalSuccessRate?: number;
}

export type PerformanceHistoryStatus = "fresh" | "stale" | "failed";

export interface PerformanceHistorySnapshot {
  observations: PerformanceObservation[];
  loadedAt: Date | null;
  status: PerformanceHistoryStatus;
  error: string | null;
}

export type PerformanceHistoryLoader = (
  options: PerformanceHistoryOptions,
) => Promise<PerformanceObservation[]>;

/**
 * The routing-facing performance contract.
 *
 * `successRate` / `effectiveSuccessRate` are confidence-weighted issuance
 * rates.  They shrink destination observations toward a conservative
 * provider-global prior (excluding the requested destination);
 * neither `apiAcceptedCount` nor fallback usage is treated as an issuance
 * success or a failure.  `avgLatencyMs` covers actual non-pending provider
 * responses (issued, API-accepted, and errors).
 */
export interface ProviderPerformance {
  providerKey: string;
  destination: string;

  /** Number of terminal observations after recency weighting. */
  sampleSize: number;
  rawSampleSize: number;
  issuedSuccessCount: number;
  failureCount: number;
  apiAcceptedCount: number;
  weightedIssuedSuccesses: number;
  weightedFailures: number;
  weightedTerminalSampleSize: number;

  /** Raw destination rate and the confidence-weighted rate for routing. */
  issuedSuccessRate: number;
  successRate: number;
  effectiveSuccessRate: number;
  confidence: number;
  confidenceScore: number;
  globalSuccessRate: number;
  /** The conservative provider-global prior used for this destination. */
  destinationPriorSuccessRate: number;
  globalSampleSize: number;
  /** Source snapshot health; stale/failed never masquerades as fresh history. */
  historyStatus: PerformanceHistoryStatus;
  historyLoadedAt: Date | null;
  historyError: string | null;

  avgLatencyMs: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;

  fallbackSuccessCount: number;
  fallbackFailureCount: number;
  fallbackSuccessRate: number | null;
  fallbackUsageCount: number;
  fallbackUsageRate: number | null;

  failureClasses: Record<FailureClass, number>;
  recentFailureClass: FailureClass | null;
  observations: PerformanceObservation[];
  source: "derived_recent_history" | "no_history";
}

const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MAX_ATTEMPTS = 5_000;
const DEFAULT_MAX_ORDERS = 5_000;
const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_PRIOR_WEIGHT = 8;
const DEFAULT_GLOBAL_SUCCESS_RATE = 0.75;
const DEFAULT_HISTORY_CACHE_TTL_MS = 2_000;
const MAX_HISTORY_CACHE_ENTRIES = 8;

const EMPTY_FAILURE_CLASSES: Record<FailureClass, number> = {
  timeout: 0,
  authentication: 0,
  insufficient_funds: 0,
  offer_unavailable: 0,
  rate_limited: 0,
  network: 0,
  provider_rejected: 0,
  unknown: 0,
};

const PENDING_ATTEMPT_STATUSES = new Set(["pending", "skipped"]);
const ISSUED_ORDER_STATUSES = new Set(["fulfilled", "completed"]);
// `failed` is also used by payment flows and does not prove that a provider
// was called.  Only fulfillment-specific terminal states may seed an
// order-level provider failure when no attempt row exists.
const FAILED_ORDER_STATUSES = new Set(["fulfillment_failed", "partially_fulfilled"]);
const NON_TERMINAL_ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "fulfilling",
  "fulfillment_pending",
  "reconciling",
  "refund_pending",
  "refunded",
  "rejected_below_floor",
]);
// Payment method labels are written to providerName before fulfillment starts
// on some legacy PayPal/Paddle paths.  They are not provider identities; the
// selected routed key remains the best identity until fulfillment overwrites
// providerName with the provider that actually issued the eSIM.
const PAYMENT_PROVIDER_ALIASES = new Set(["stripe", "paypal", "paddle", "manual", "payment", "checkout"]);

interface HistoryCacheEntry {
  snapshot: PerformanceHistorySnapshot;
  expiresAt: number;
  lastAccessedAt: number;
}

function sourceHistoryCacheKey(options: PerformanceHistoryOptions): string {
  const lookbackDays = Math.max(1, options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const maxOrders = Math.max(1, options.maxOrders ?? DEFAULT_MAX_ORDERS);
  // Explicit clock values are used by deterministic callers/tests and must
  // not share a query window with a different clock. Normal routing calls
  // omit `now`, so all catalogue candidates use the single rolling key.
  const nowKey = options.now == null
    ? "rolling"
    : String(asDate(options.now, new Date(0)).getTime());
  return `${lookbackDays}:${maxAttempts}:${maxOrders}:${nowKey}`;
}

function requestedCacheTtlMs(
  options: PerformanceHistoryOptions,
  defaultTtlMs: number,
): number {
  const configured = options.cacheTtlMs ?? defaultTtlMs;
  return Number.isFinite(configured) ? Math.max(0, configured) : defaultTtlMs;
}

/**
 * Bounded, single-flight cache for the normalised source history.
 *
 * A failed load is never cached as an empty successful snapshot. If a prior
 * snapshot exists it is returned as `stale` while the next caller retries the
 * source; otherwise callers receive `failed` and the next call can recover.
 */
export class PerformanceHistorySnapshotCache {
  private readonly entries = new Map<string, HistoryCacheEntry>();
  private readonly inFlight = new Map<string, Promise<PerformanceHistorySnapshot>>();
  private generation = 0;

  constructor(
    private readonly defaultTtlMs = DEFAULT_HISTORY_CACHE_TTL_MS,
    private readonly maxEntries = MAX_HISTORY_CACHE_ENTRIES,
  ) {}

  invalidate(): void {
    this.generation++;
    this.entries.clear();
    this.inFlight.clear();
  }

  async get(
    options: PerformanceHistoryOptions,
    loader: PerformanceHistoryLoader,
  ): Promise<PerformanceHistorySnapshot> {
    const key = sourceHistoryCacheKey(options);
    const ttlMs = requestedCacheTtlMs(options, this.defaultTtlMs);
    const now = Date.now();
    const cached = this.entries.get(key);
    if (ttlMs > 0 && cached && cached.expiresAt > now) {
      cached.lastAccessedAt = now;
      return cached.snapshot;
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const stale = cached?.snapshot ?? null;
    const generation = this.generation;
    const request = (async (): Promise<PerformanceHistorySnapshot> => {
      try {
        const observations = await loader(options);
        const snapshot: PerformanceHistorySnapshot = {
          observations,
          loadedAt: new Date(),
          status: "fresh",
          error: null,
        };
        if (generation === this.generation && ttlMs > 0) {
          const timestamp = Date.now();
          this.entries.set(key, {
            snapshot,
            expiresAt: timestamp + ttlMs,
            lastAccessedAt: timestamp,
          });
          this.prune();
        }
        return snapshot;
      } catch (error: any) {
        const message = error?.message ?? String(error);
        console.warn("[performanceHistory] Could not derive recent history:", message);
        if (stale) {
          return {
            observations: stale.observations,
            loadedAt: stale.loadedAt,
            status: "stale",
            error: String(message),
          };
        }
        return {
          observations: [],
          loadedAt: null,
          status: "failed",
          error: String(message),
        };
      }
    })();
    this.inFlight.set(key, request);
    request.finally(() => {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    }).catch(() => {});
    return request;
  }

  private prune(): void {
    while (this.entries.size > Math.max(1, this.maxEntries)) {
      const oldest = [...this.entries.entries()].sort(
        (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
      )[0];
      if (!oldest) return;
      this.entries.delete(oldest[0]);
    }
  }
}

const recentPerformanceHistoryCache = new PerformanceHistorySnapshotCache();

function isAcceptedAttemptStatus(status: string): boolean {
  return status === "ok" || status === "accepted" || status === "success";
}

function asDate(value: Date | string | null | undefined, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

/** Canonicalises historical spelling variants without changing the public key. */
export function normalizeProviderKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/[_\-\s]/g, "");
}

export function normalizeDestination(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

/**
 * Classify provider errors with stable, intentionally conservative rules.
 * Classification is for diagnostics and future routing policy; an unknown
 * provider message remains a failure rather than being dropped.
 */
export function classifyFailure(errorMessage: string | null | undefined): FailureClass {
  const message = String(errorMessage ?? "").toLowerCase();

  if (
    /\b(timeout|timed out|etimedout|408 request timeout|gateway timeout)\b/.test(message)
  ) return "timeout";
  if (
    /\b(401|403|unauthori[sz]ed|forbidden|invalid (?:api ?)?key|authentication|credential)\b/.test(message)
  ) return "authentication";
  if (
    /\b(insufficient funds?|not enough funds?|low balance|wallet|credit balance|out of credit)\b/.test(message)
  ) return "insufficient_funds";
  if (
    /\b(offer|plan|bundle|sku).{0,32}\b(unavailable|not found|inactive|removed|invalid|expired)\b/.test(message) ||
    /\b(no longer available|catalog(?:ue)?\s+(?:offer|plan)|unknown plan)\b/.test(message)
  ) return "offer_unavailable";
  if (/\b(429|rate[- ]?limit|too many requests|throttl)/.test(message)) return "rate_limited";
  if (
    /\b(network|econnreset|econnrefused|enotfound|fetch failed|socket|dns|5\d\d|service unavailable|bad gateway)\b/.test(message)
  ) return "network";
  if (
    /\b(reject(?:ed|ion)?|declin(?:ed|e)|invalid request|provider error|purchase failed|provision(?:ing)? failed)\b/.test(message)
  ) return "provider_rejected";
  return "unknown";
}

function isIssuedOrder(order: PerformanceHistoryOrderInput): boolean {
  if (!ISSUED_ORDER_STATUSES.has(String(order.status).toLowerCase())) return false;
  // Fulfilled is the application-level issuance boundary.  In particular, a
  // reconciliation may leave a stale/pending esimStatus while the order has
  // already reached its terminal fulfilled state.
  return true;
}

function isFailedOrder(order: PerformanceHistoryOrderInput): boolean {
  return FAILED_ORDER_STATUSES.has(String(order.status).toLowerCase());
}

function terminalOrderProvider(order: PerformanceHistoryOrderInput): string {
  // Fulfillment updates providerName to the provider that actually issued the
  // eSIM.  selectedProviderKey is the original primary and is therefore not
  // sufficient when a fallback succeeded.
  const providerName = normalizeProviderKey(order.providerName);
  const selectedProvider = normalizeProviderKey(order.selectedProviderKey);
  return providerName && !PAYMENT_PROVIDER_ALIASES.has(providerName)
    ? providerName
    : selectedProvider;
}

function eventDate(
  attempt: PerformanceHistoryAttemptInput,
  order: PerformanceHistoryOrderInput | undefined,
): Date {
  return asDate(
    attempt.createdAt,
    asDate(order?.updatedAt, asDate(order?.createdAt, new Date(0))),
  );
}

function compareAttempts(
  a: PerformanceHistoryAttemptInput,
  b: PerformanceHistoryAttemptInput,
): number {
  const aTime = asDate(a.createdAt, new Date(0)).getTime();
  const bTime = asDate(b.createdAt, new Date(0)).getTime();
  if (aTime !== bTime) return bTime - aTime;
  // Timestamps are authoritative for retries.  Attempt number is only a
  // deterministic tie-breaker for legacy rows that share a timestamp (or
  // have no timestamp at all).
  const aNumber = a.attemptNumber ?? -1;
  const bNumber = b.attemptNumber ?? -1;
  if (aNumber !== bNumber) return bNumber - aNumber;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

function attemptIsPrimary(
  attempt: PerformanceHistoryAttemptInput,
  order: PerformanceHistoryOrderInput | undefined,
): boolean {
  if (typeof attempt.isPrimary === "boolean") return attempt.isPrimary;
  const selected = normalizeProviderKey(order?.selectedProviderKey);
  if (selected) return selected === normalizeProviderKey(attempt.providerKey);
  return (attempt.attemptNumber ?? 1) <= 1;
}

function makeObservation(
  attempt: PerformanceHistoryAttemptInput,
  order: PerformanceHistoryOrderInput | undefined,
  outcome: PerformanceOutcome,
): PerformanceObservation | null {
  const providerKey = normalizeProviderKey(attempt.providerKey);
  const destination = normalizeDestination(attempt.destination || order?.destination);
  if (!providerKey || !destination) return null;

  return {
    orderId: attempt.orderId,
    providerKey,
    destination,
    outcome,
    isFallback: !attemptIsPrimary(attempt, order),
    latencyMs: Number.isFinite(attempt.durationMs) && (attempt.durationMs ?? 0) >= 0
      ? Math.round(attempt.durationMs as number)
      : null,
    failureClass: outcome === "failure"
      ? attempt.failureClass ?? classifyFailure(attempt.errorMessage)
      : null,
    occurredAt: eventDate(attempt, order),
    source: "provider_attempt",
  };
}

/**
 * Convert existing order/attempt rows into one observation per
 * (order,provider).  Grouping is important: re-fulfilment retries must not
 * count the same paid order several times, and order-level fallback metadata
 * must not duplicate a provider_attempts row.
 */
export function normalizePerformanceHistory(seed: PerformanceHistorySeed): PerformanceObservation[] {
  const ordersById = new Map(seed.orders.map(order => [order.id, order]));
  const attemptsByOrderProvider = new Map<string, PerformanceHistoryAttemptInput[]>();
  const attemptsByOrder = new Map<string, PerformanceHistoryAttemptInput[]>();

  for (const attempt of seed.attempts) {
    const orderAttempts = attemptsByOrder.get(attempt.orderId) ?? [];
    orderAttempts.push(attempt);
    attemptsByOrder.set(attempt.orderId, orderAttempts);

    const key = `${attempt.orderId}\u0000${normalizeProviderKey(attempt.providerKey)}`;
    const grouped = attemptsByOrderProvider.get(key) ?? [];
    grouped.push(attempt);
    attemptsByOrderProvider.set(key, grouped);
  }

  const observations: PerformanceObservation[] = [];

  for (const attempts of attemptsByOrderProvider.values()) {
    const latest = [...attempts].sort(compareAttempts)[0];
    const order = ordersById.get(latest.orderId);
    const status = String(latest.status ?? "").toLowerCase();
    if (PENDING_ATTEMPT_STATUSES.has(status)) continue;

    const attemptProvider = normalizeProviderKey(latest.providerKey);
    const orderProvider = terminalOrderProvider(order ?? {
      id: latest.orderId,
      status: "",
    });
    let outcome: PerformanceOutcome = isAcceptedAttemptStatus(status) ? "api_accepted" : "failure";

    // A provider attempt's `ok` only becomes an issued success when the same
    // provider is recorded on an issued order.  For old rows with no selected
    // key, providerName is the best available terminal provider identity.
    if (isAcceptedAttemptStatus(status) && order && isIssuedOrder(order) &&
      (!orderProvider || orderProvider === attemptProvider)) {
      outcome = "issued_success";
    }

    const observation = makeObservation(latest, order, outcome);
    if (observation) observations.push(observation);
  }

  // Reconcile the terminal order state with attempt history.  A pending
  // provider attempt is expected for delayed suppliers (for example Zendit);
  // reconciliation may fulfil the order without inserting another
  // provider_attempts row.  In that case the fulfilled order is authoritative
  // evidence of one issued success, while the pending attempt itself remains
  // excluded.  The same terminal-order fallback also supports legacy orders
  // created before provider_attempts existed.
  for (const order of seed.orders) {
    const providerKey = terminalOrderProvider(order);
    const destination = normalizeDestination(order.destination);
    if (!providerKey || !destination) continue;

    const orderAttempts = attemptsByOrder.get(order.id) ?? [];
    const terminalProviderAttempts = attemptsByOrderProvider.get(
      `${order.id}\u0000${providerKey}`,
    ) ?? [];
    const latestProviderAttempt = [...terminalProviderAttempts].sort(compareAttempts)[0];
    const hasTerminalProviderAttempt = Boolean(
      latestProviderAttempt &&
      !PENDING_ATTEMPT_STATUSES.has(String(latestProviderAttempt.status ?? "").toLowerCase()),
    );

    // An actionable attempt for the provider already represents this order.
    // This prevents an order row from being counted alongside its attempt,
    // while still allowing a reconciled pending order to seed success.
    if (hasTerminalProviderAttempt) continue;

    let outcome: PerformanceOutcome | null = null;
    if (isIssuedOrder(order)) {
      outcome = "issued_success";
    } else if (isFailedOrder(order) && orderAttempts.length === 0) {
      // A failed order with only pending/skipped attempts has no terminal
      // provider failure and must stay excluded.
      outcome = "failure";
    }
    // Never infer an outcome from a pending/skipped/non-terminal order.
    if (!outcome || NON_TERMINAL_ORDER_STATUSES.has(String(order.status).toLowerCase())) continue;

    observations.push({
      orderId: order.id,
      providerKey,
      destination,
      outcome,
      isFallback: false,
      latencyMs: null,
      failureClass: outcome === "failure" ? "unknown" : null,
      occurredAt: asDate(order.updatedAt, asDate(order.createdAt, new Date(0))),
      source: "order",
    });
  }

  return observations.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

function cloneFailureClasses(): Record<FailureClass, number> {
  return { ...EMPTY_FAILURE_CLASSES };
}

function recencyWeight(
  occurredAt: Date,
  now: Date,
  halfLifeDays: number,
): number {
  const ageMs = Math.max(0, now.getTime() - occurredAt.getTime());
  const ageDays = ageMs / 86_400_000;
  return Math.pow(0.5, ageDays / Math.max(0.1, halfLifeDays));
}

function weightedRate(
  observations: PerformanceObservation[],
  now: Date,
  halfLifeDays: number,
): { successes: number; failures: number; terminal: number } {
  let successes = 0;
  let failures = 0;
  for (const observation of observations) {
    const weight = recencyWeight(observation.occurredAt, now, halfLifeDays);
    if (observation.outcome === "issued_success") successes += weight;
    else if (observation.outcome === "failure") failures += weight;
  }
  return { successes, failures, terminal: successes + failures };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index];
}

function buildPerformance(
  providerKey: string,
  destination: string,
  allObservations: PerformanceObservation[],
  options: PerformanceHistoryOptions = {},
  history: Pick<PerformanceHistorySnapshot, "status" | "loadedAt" | "error"> = {
    status: "fresh",
    loadedAt: null,
    error: null,
  },
): ProviderPerformance {
  const normalizedProvider = normalizeProviderKey(providerKey);
  const normalizedDestination = normalizeDestination(destination);
  const now = options.now ?? new Date();
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const priorWeight = Math.max(0, options.priorWeight ?? DEFAULT_PRIOR_WEIGHT);
  const defaultGlobal = Math.max(0, Math.min(1, options.defaultGlobalSuccessRate ?? DEFAULT_GLOBAL_SUCCESS_RATE));

  const providerObservations = allObservations.filter(o => o.providerKey === normalizedProvider);
  const observations = providerObservations.filter(o => o.destination === normalizedDestination);
  // Do not let a destination teach its own prior.  Otherwise one lucky
  // destination success is counted once as destination evidence and again as
  // a perfect global prior.
  const otherDestinationObservations = providerObservations.filter(
    o => o.destination !== normalizedDestination,
  );
  const providerTerminal = weightedRate(providerObservations, now, halfLifeDays);
  const destinationTerminal = weightedRate(observations, now, halfLifeDays);
  const otherDestinationTerminal = weightedRate(otherDestinationObservations, now, halfLifeDays);
  const shrinkRate = (
    terminal: { successes: number; terminal: number },
  ): number => priorWeight === 0
    ? (terminal.terminal > 0 ? terminal.successes / terminal.terminal : defaultGlobal)
    : (terminal.successes + defaultGlobal * priorWeight) /
      (terminal.terminal + priorWeight);
  // globalSuccessRate is useful for diagnostics and remains conservative even
  // when all observed events happen at one destination.
  const globalSuccessRate = shrinkRate(providerTerminal);
  // The destination prior uses global evidence from other destinations only.
  const destinationPriorSuccessRate = shrinkRate(otherDestinationTerminal);
  const rawRate = destinationTerminal.terminal > 0
    ? destinationTerminal.successes / destinationTerminal.terminal
    : globalSuccessRate;
  const effectiveRate = priorWeight === 0
    ? rawRate
    : (destinationTerminal.successes + destinationPriorSuccessRate * priorWeight) /
      (destinationTerminal.terminal + priorWeight);
  const confidence = priorWeight === 0
    ? (destinationTerminal.terminal > 0 ? 1 : 0)
    : destinationTerminal.terminal / (destinationTerminal.terminal + priorWeight);

  const responseObservations = observations.filter(o => o.latencyMs != null);
  const latencyWeights = responseObservations.map(o => recencyWeight(o.occurredAt, now, halfLifeDays));
  const totalLatencyWeight = latencyWeights.reduce((sum, weight) => sum + weight, 0);
  const avgLatencyMs = totalLatencyWeight > 0
    ? Math.round(responseObservations.reduce(
      (sum, observation, index) => sum + (observation.latencyMs as number) * latencyWeights[index],
      0,
    ) / totalLatencyWeight)
    : null;

  const issuedSuccessCount = observations.filter(o => o.outcome === "issued_success").length;
  const failureCount = observations.filter(o => o.outcome === "failure").length;
  const apiAcceptedCount = observations.filter(o => o.outcome === "api_accepted").length;
  const fallbackSuccessCount = observations.filter(o => o.isFallback && o.outcome === "issued_success").length;
  const fallbackFailureCount = observations.filter(o => o.isFallback && o.outcome === "failure").length;
  const fallbackUsageCount = observations.filter(o => o.isFallback).length;
  const fallbackTerminal = fallbackSuccessCount + fallbackFailureCount;

  const failureClasses = cloneFailureClasses();
  for (const observation of observations) {
    if (observation.outcome === "failure") {
      failureClasses[observation.failureClass ?? "unknown"]++;
    }
  }
  const latestFailure = observations.find(o => o.outcome === "failure");

  return {
    providerKey: normalizedProvider,
    destination: normalizedDestination,
    sampleSize: Math.round(destinationTerminal.terminal * 100) / 100,
    rawSampleSize: observations.filter(o => o.outcome !== "api_accepted").length,
    issuedSuccessCount,
    failureCount,
    apiAcceptedCount,
    weightedIssuedSuccesses: Math.round(destinationTerminal.successes * 1000) / 1000,
    weightedFailures: Math.round(destinationTerminal.failures * 1000) / 1000,
    weightedTerminalSampleSize: Math.round(destinationTerminal.terminal * 1000) / 1000,
    issuedSuccessRate: Math.round(rawRate * 10_000) / 10_000,
    successRate: Math.round(effectiveRate * 10_000) / 10_000,
    effectiveSuccessRate: Math.round(effectiveRate * 10_000) / 10_000,
    confidence: Math.round(confidence * 10_000) / 10_000,
    confidenceScore: Math.round(confidence * 100),
    globalSuccessRate: Math.round(globalSuccessRate * 10_000) / 10_000,
    destinationPriorSuccessRate: Math.round(destinationPriorSuccessRate * 10_000) / 10_000,
    globalSampleSize: Math.round(providerTerminal.terminal * 100) / 100,
    historyStatus: history.status,
    historyLoadedAt: history.loadedAt,
    historyError: history.error,
    avgLatencyMs,
    averageLatencyMs: avgLatencyMs,
    p95LatencyMs: percentile(responseObservations.map(o => o.latencyMs as number), 0.95),
    fallbackSuccessCount,
    fallbackFailureCount,
    fallbackSuccessRate: fallbackTerminal > 0 ? fallbackSuccessCount / fallbackTerminal : null,
    fallbackUsageCount,
    // This is an observational metric only.  It is intentionally absent from
    // successRate/effectiveSuccessRate and must never be used as a penalty.
    fallbackUsageRate: observations.length > 0 ? fallbackUsageCount / observations.length : null,
    failureClasses,
    recentFailureClass: latestFailure?.failureClass ?? null,
    observations,
    source: observations.length > 0 ? "derived_recent_history" : "no_history",
  };
}

/** Pure builder exported for routing/tests that already have normalised rows. */
export function buildProviderPerformance(
  providerKey: string,
  destination: string,
  observations: PerformanceObservation[],
  options: PerformanceHistoryOptions = {},
): ProviderPerformance {
  return buildPerformance(providerKey, destination, observations, options);
}

function orderDestination(
  order: typeof orders.$inferSelect,
  planById: Map<string, typeof plans.$inferSelect>,
  destinationById: Map<string, typeof destinations.$inferSelect>,
  normalizedById: Map<string, typeof normalizedPlans.$inferSelect>,
  offerById: Map<string, typeof providerOffers.$inferSelect>,
): string | null {
  if (order.planId) {
    const plan = planById.get(order.planId);
    const destination = plan ? destinationById.get(plan.destinationId)?.countryCode : null;
    if (destination) return normalizeDestination(destination);
  }

  if (order.normalizedPlanId) {
    const direct = normalizedById.get(order.normalizedPlanId);
    if (direct?.regionCode) return normalizeDestination(direct.regionCode);
    const offer = offerById.get(order.normalizedPlanId);
    const offeredPlan = offer ? normalizedById.get(offer.normalizedPlanId) : undefined;
    if (offeredPlan?.regionCode) return normalizeDestination(offeredPlan.regionCode);
  }
  return null;
}

async function selectByIds<T>(
  table: any,
  idColumn: any,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  return db.select().from(table).where(inArray(idColumn, ids)) as Promise<T[]>;
}

/**
 * Read the recent source rows and normalise them.  This is intentionally
 * exported so the destination stats compatibility layer and diagnostics can
 * share one source without re-counting it.
 */
async function loadRecentPerformanceHistoryFromDatabase(
  options: PerformanceHistoryOptions = {},
): Promise<PerformanceObservation[]> {
  const lookbackDays = Math.max(1, options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const maxOrders = Math.max(1, options.maxOrders ?? DEFAULT_MAX_ORDERS);
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - lookbackDays * 86_400_000);

  try {
    const recentAttempts = await db
      .select()
      .from(providerAttempts)
      .where(gte(providerAttempts.createdAt, since))
      .orderBy(desc(providerAttempts.createdAt))
      .limit(maxAttempts);

    const attemptOrderIds = [...new Set(recentAttempts.map(row => row.orderId))];
    const orderPredicates = [
      gte(orders.updatedAt, since),
      gte(orders.createdAt, since),
    ];
    if (attemptOrderIds.length > 0) orderPredicates.push(inArray(orders.id, attemptOrderIds) as any);
    const recentOrders = await db
      .select()
      .from(orders)
      .where(or(...orderPredicates))
      .orderBy(desc(orders.updatedAt))
      .limit(maxOrders);

    // An attempt can be recent even when its order is old, so include those
    // order IDs in addition to the normal recent-order window.
    const ordersById = new Map(recentOrders.map(order => [order.id, order]));
    const missingOrderIds = attemptOrderIds.filter(id => !ordersById.has(id));
    if (missingOrderIds.length > 0) {
      const missing = await selectByIds<typeof orders.$inferSelect>(orders, orders.id, missingOrderIds);
      for (const order of missing) ordersById.set(order.id, order);
    }

    const orderRows = [...ordersById.values()];
    const planIds = [...new Set(orderRows.map(order => order.planId).filter((id): id is string => Boolean(id)))];
    const destinationIds = new Set<string>();
    const normalizedIds = new Set<string>();
    const offerIds = new Set<string>();
    for (const order of orderRows) {
      if (order.normalizedPlanId) {
        normalizedIds.add(order.normalizedPlanId);
        offerIds.add(order.normalizedPlanId);
      }
    }

    const planRows = await selectByIds<typeof plans.$inferSelect>(plans, plans.id, planIds);
    for (const plan of planRows) destinationIds.add(plan.destinationId);
    const [destinationRows, directNormalizedRows, offerRows] = await Promise.all([
      selectByIds<typeof destinations.$inferSelect>(destinations, destinations.id, [...destinationIds]),
      selectByIds<typeof normalizedPlans.$inferSelect>(normalizedPlans, normalizedPlans.id, [...normalizedIds]),
      selectByIds<typeof providerOffers.$inferSelect>(providerOffers, providerOffers.id, [...offerIds]),
    ]);
    const offeredNormalizedIds = offerRows.map(offer => offer.normalizedPlanId);
    const offeredNormalizedRows = await selectByIds<typeof normalizedPlans.$inferSelect>(
      normalizedPlans,
      normalizedPlans.id,
      offeredNormalizedIds,
    );
    const normalizedRows = [...directNormalizedRows, ...offeredNormalizedRows];

    const planById = new Map(planRows.map(plan => [plan.id, plan]));
    const destinationById = new Map(destinationRows.map(destination => [destination.id, destination]));
    const normalizedById = new Map(normalizedRows.map(plan => [plan.id, plan]));
    const offerById = new Map(offerRows.map(offer => [offer.id, offer]));

    const inputOrders: PerformanceHistoryOrderInput[] = orderRows.map(order => ({
      id: order.id,
      status: order.status,
      providerName: order.providerName,
      selectedProviderKey: order.selectedProviderKey,
      destination: orderDestination(order, planById, destinationById, normalizedById, offerById),
      esimStatus: order.esimStatus,
      providerEsimId: order.providerEsimId,
      providerReference: order.providerReference,
      qrCode: order.qrCode,
      iccid: order.iccid,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
    const destinationByOrderId = new Map(inputOrders.map(order => [order.id, order.destination]));
    const inputAttempts: PerformanceHistoryAttemptInput[] = recentAttempts.map(attempt => ({
      id: attempt.id,
      orderId: attempt.orderId,
      providerKey: attempt.providerKey,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      durationMs: attempt.durationMs,
      errorMessage: attempt.errorMessage,
      providerPlanCode: attempt.providerPlanCode,
      destination: destinationByOrderId.get(attempt.orderId) ?? null,
      createdAt: attempt.createdAt,
    }));
    return normalizePerformanceHistory({ attempts: inputAttempts, orders: inputOrders });
  } catch (error: any) {
    // The cache layer decides whether this is a hard failure or whether a
    // previously loaded snapshot can be served as stale. Never turn an error
    // into a cacheable empty-success result here.
    throw error;
  }
}

export async function getRecentPerformanceHistorySnapshot(
  options: PerformanceHistoryOptions = {},
): Promise<PerformanceHistorySnapshot> {
  return recentPerformanceHistoryCache.get(
    options,
    loadRecentPerformanceHistoryFromDatabase,
  );
}

export function invalidatePerformanceHistoryCache(): void {
  recentPerformanceHistoryCache.invalidate();
}

export async function getRecentPerformanceHistory(
  options: PerformanceHistoryOptions = {},
): Promise<PerformanceObservation[]> {
  const snapshot = await getRecentPerformanceHistorySnapshot(options);
  return snapshot.observations;
}

/**
 * Return confidence-weighted recent provider performance for a destination.
 *
 * This is the stable interface for routing.  It is read-only, seeds itself
 * from existing orders/provider_attempts, and never counts the same
 * (order,provider) event twice.
 */
export async function getProviderPerformance(
  providerKey: string,
  destination: string,
  options: PerformanceHistoryOptions = {},
): Promise<ProviderPerformance> {
  const snapshot = await getRecentPerformanceHistorySnapshot(options);
  return buildPerformance(
    providerKey,
    destination,
    snapshot.observations,
    options,
    snapshot,
  );
}
