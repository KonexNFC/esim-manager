import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderPerformance,
  classifyFailure,
  normalizePerformanceHistory,
  PerformanceHistorySnapshotCache,
  type PerformanceHistorySeed,
} from "./performanceHistory";

const now = new Date("2026-08-21T12:00:00.000Z");

function order(
  id: string,
  status: string,
  overrides: Partial<PerformanceHistorySeed["orders"][number]> = {},
): PerformanceHistorySeed["orders"][number] {
  return {
    id,
    status,
    selectedProviderKey: "airalo",
    providerName: "airalo",
    destination: "GB",
    updatedAt: now,
    ...overrides,
  };
}

function attempt(
  orderId: string,
  providerKey: string,
  status: string,
  overrides: Partial<PerformanceHistorySeed["attempts"][number]> = {},
): PerformanceHistorySeed["attempts"][number] {
  return {
    id: `${orderId}-${providerKey}-${status}`,
    orderId,
    providerKey,
    status,
    attemptNumber: 1,
    createdAt: now,
    ...overrides,
  };
}

test("failure classification remains explicit and does not hide unknown errors", () => {
  assert.equal(classifyFailure("ETIMEDOUT while purchasing bundle"), "timeout");
  assert.equal(classifyFailure("Provider returned 401 invalid API key"), "authentication");
  assert.equal(classifyFailure("wallet balance is insufficient"), "insufficient_funds");
  assert.equal(classifyFailure("offer is no longer available"), "offer_unavailable");
  assert.equal(classifyFailure("HTTP 429 rate limit"), "rate_limited");
  assert.equal(classifyFailure("ECONNRESET"), "network");
  assert.equal(classifyFailure("supplier rejected purchase"), "provider_rejected");
  assert.equal(classifyFailure("a new supplier error"), "unknown");
});

test("pending and skipped attempts are excluded, and order fallback does not double count", () => {
  const seed: PerformanceHistorySeed = {
    orders: [
      order("issued", "fulfilled"),
      order("pending", "fulfillment_pending"),
      order("reconciled", "fulfilled", {
        providerName: "zendit",
        selectedProviderKey: "zendit",
        esimStatus: "pending",
      }),
      order("legacy", "fulfilled"),
    ],
    attempts: [
      attempt("issued", "airalo", "ok"),
      attempt("pending", "airalo", "pending"),
      attempt("pending", "airalo", "skipped"),
      attempt("reconciled", "zendit", "error", {
        attemptNumber: 1,
        errorMessage: "allocation still pending",
        createdAt: new Date(now.getTime() - 60_000),
      }),
      attempt("reconciled", "zendit", "pending"),
    ],
  };

  const observations = normalizePerformanceHistory(seed);
  assert.equal(observations.length, 3);
  assert.equal(observations.filter(row => row.orderId === "issued").length, 1);
  assert.equal(observations.find(row => row.orderId === "issued")?.outcome, "issued_success");
  assert.equal(observations.find(row => row.orderId === "reconciled")?.outcome, "issued_success");
  assert.equal(observations.find(row => row.orderId === "reconciled")?.source, "order");
  assert.equal(observations.find(row => row.orderId === "legacy")?.source, "order");
  assert.equal(observations.some(row => row.orderId === "pending"), false);
});

test("an accepted provider API response is not an issued success", () => {
  const observations = normalizePerformanceHistory({
    orders: [order("accepted", "fulfillment_pending")],
    attempts: [attempt("accepted", "airalo", "ok")],
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0].outcome, "api_accepted");
});

test("payment aliases resolve through the selected provider and retries use timestamps", () => {
  const observations = normalizePerformanceHistory({
    orders: [
      order("retry", "fulfilled", {
        providerName: "PayPal",
        selectedProviderKey: "eSIM Access",
      }),
    ],
    attempts: [
      attempt("retry", "esimaccess", "error", {
        attemptNumber: 4,
        errorMessage: "timeout",
        createdAt: new Date(now.getTime() - 60_000),
      }),
      // A later retry may restart attempt numbering; timestamp, not attempt
      // number, determines the terminal attempt for this order/provider.
      attempt("retry", "eSIM Access", "ok", {
        attemptNumber: 1,
        createdAt: now,
      }),
    ],
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0].providerKey, "esimaccess");
  assert.equal(observations[0].outcome, "issued_success");
});

test("a fallback issuance counts as provider success without a fallback penalty", () => {
  const observations = normalizePerformanceHistory({
    orders: [
      order("fallback", "fulfilled", { selectedProviderKey: "airalo", providerName: "esimaccess" }),
      order("primary", "fulfilled", { selectedProviderKey: "airalo" }),
    ],
    attempts: [
      attempt("fallback", "airalo", "error", {
        errorMessage: "timeout",
        createdAt: new Date(now.getTime() - 60_000),
      }),
      attempt("fallback", "esimAccess", "ok", {
        attemptNumber: 2,
        createdAt: now,
      }),
      attempt("primary", "airalo", "ok"),
    ],
  });

  const fallback = observations.find(row => row.providerKey === "esimaccess");
  assert.ok(fallback);
  assert.equal(fallback.outcome, "issued_success");
  assert.equal(fallback.isFallback, true);
  const performance = buildProviderPerformance("esimaccess", "GB", observations, { now });
  assert.equal(performance.issuedSuccessCount, 1);
  assert.equal(performance.failureCount, 0);
  assert.equal(performance.fallbackSuccessCount, 1);
  assert.equal(performance.fallbackSuccessRate, 1);
  assert.equal(performance.successRate, 0.7778);
});

test("a single success or failure is conservatively adjusted by the default prior", () => {
  const successObservation = normalizePerformanceHistory({
    orders: [order("one-success", "fulfilled")],
    attempts: [attempt("one-success", "airalo", "ok")],
  });
  const failureObservation = normalizePerformanceHistory({
    orders: [order("one-failure", "fulfillment_failed")],
    attempts: [attempt("one-failure", "airalo", "error", { errorMessage: "rejected" })],
  });

  const success = buildProviderPerformance("airalo", "GB", successObservation, { now, priorWeight: 8 });
  const failure = buildProviderPerformance("airalo", "GB", failureObservation, { now, priorWeight: 8 });
  assert.ok(success.effectiveSuccessRate < 1);
  assert.ok(success.effectiveSuccessRate > 0.75);
  assert.ok(failure.effectiveSuccessRate > 0);
  assert.ok(failure.effectiveSuccessRate < 0.75);
});

test("destination success is shrunk toward the provider global prior", () => {
  const observations = normalizePerformanceHistory({
    orders: [
      order("gb-success", "fulfilled", { destination: "GB" }),
      order("fr-failure", "fulfillment_failed", { destination: "FR" }),
      order("fr-success", "fulfilled", { destination: "FR" }),
    ],
    attempts: [
      attempt("gb-success", "airalo", "ok", { destination: "GB" }),
      attempt("fr-failure", "airalo", "error", { destination: "FR", errorMessage: "rejected" }),
      attempt("fr-success", "airalo", "ok", { destination: "FR" }),
    ],
  });

  const gb = buildProviderPerformance("airalo", "GB", observations, { now, priorWeight: 8 });
  const fr = buildProviderPerformance("airalo", "FR", observations, { now, priorWeight: 8 });
  const unknown = buildProviderPerformance("airalo", "JP", observations, { now, priorWeight: 8 });
  assert.equal(gb.issuedSuccessRate, 1);
  assert.equal(gb.globalSuccessRate, 0.7273);
  assert.ok(gb.successRate < 1);
  assert.ok(gb.successRate > gb.globalSuccessRate);
  assert.equal(fr.issuedSuccessRate, 0.5);
  assert.ok(fr.successRate > 0.5);
  assert.ok(fr.successRate < gb.successRate);
  assert.equal(unknown.effectiveSuccessRate, unknown.globalSuccessRate);
  assert.ok(unknown.effectiveSuccessRate < 1);
  assert.equal(fr.confidenceScore, 20);
});

test("latency is recent and failure classes are available to routing diagnostics", () => {
  const observations = normalizePerformanceHistory({
    orders: [order("old", "fulfilled"), order("new", "fulfillment_failed")],
    attempts: [
      attempt("old", "airalo", "ok", {
        durationMs: 2_000,
        createdAt: new Date(now.getTime() - 90 * 86_400_000),
      }),
      attempt("new", "airalo", "error", {
        durationMs: 400,
        errorMessage: "ETIMEDOUT",
        createdAt: now,
      }),
    ],
  });

  const performance = buildProviderPerformance("airalo", "GB", observations, { now });
  assert.equal(performance.failureClasses.timeout, 1);
  assert.equal(performance.recentFailureClass, "timeout");
  assert.ok(performance.avgLatencyMs != null);
  assert.ok(performance.avgLatencyMs < 1_000);
  assert.equal(performance.p95LatencyMs, 2_000);
});

test("shared history cache single-flights concurrent provider/product rankings", async () => {
  const cache = new PerformanceHistorySnapshotCache(100);
  let loaderCalls = 0;
  const observation = normalizePerformanceHistory({
    orders: [order("cached", "fulfilled")],
    attempts: [attempt("cached", "airalo", "ok")],
  })[0];
  const options = { now, cacheTtlMs: 100 };
  const work = ["airalo", "esimgo", "zendit"].flatMap(provider =>
    ["GB", "FR", "US"].map(async destination => {
      const snapshot = await cache.get(options, async () => {
        loaderCalls++;
        await Promise.resolve();
        return observation ? [observation] : [];
      });
      return buildProviderPerformance(provider, destination, snapshot.observations, { now });
    }),
  );

  const results = await Promise.all(work);
  assert.equal(results.length, 9);
  assert.equal(loaderCalls, 1);
  assert.ok(results.every(result => result.historyStatus === "fresh"));
});

test("expired snapshots report stale on failure and recover on the next load", async () => {
  const cache = new PerformanceHistorySnapshotCache(5);
  const observation = normalizePerformanceHistory({
    orders: [order("recover", "fulfilled")],
    attempts: [attempt("recover", "airalo", "ok")],
  })[0];
  let loaderCalls = 0;
  const loader = async () => {
    loaderCalls++;
    if (loaderCalls === 2) throw new Error("temporary source outage");
    return observation ? [observation] : [];
  };
  const options = { now, cacheTtlMs: 5 };

  const fresh = await cache.get(options, loader);
  assert.equal(fresh.status, "fresh");
  await new Promise(resolve => setTimeout(resolve, 12));

  const stale = await cache.get(options, loader);
  assert.equal(stale.status, "stale");
  assert.equal(stale.error, "temporary source outage");
  assert.equal(stale.observations.length, 1);

  await new Promise(resolve => setTimeout(resolve, 0));
  const recovered = await cache.get(options, loader);
  assert.equal(recovered.status, "fresh");
  assert.equal(recovered.error, null);
  assert.equal(loaderCalls, 3);
});
