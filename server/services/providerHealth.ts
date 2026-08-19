// ─── Provider Health & Routing Eligibility ───────────────────────────────────
// Converts safe provider probe results into one fail-closed eligibility decision.
// This module never calls supplier APIs and never places orders.

import { db } from "../storage";
import { providers, type Provider } from "@shared/schema";
import type { ProviderWalletSnapshot } from "./providerBalance";

export type ProviderHealthStatus = "healthy" | "degraded" | "down" | "unknown";
export type ProviderEligibilityStatus = "eligible" | "degraded" | "excluded";

export interface ProviderHealthSnapshot {
  status: ProviderHealthStatus;
  eligible: boolean;
  reason: string;
  checkedAt: string;
  lastSuccessfulProbeAt?: string;
  checks: {
    configuration: "ok" | "failed" | "unsupported";
    connection: "ok" | "failed" | "unsupported";
    service: "ok" | "failed" | "unsupported";
    wallet: "ok" | "low" | "failed" | "unsupported";
  };
}

export interface ProviderEligibility {
  eligible: boolean;
  status: ProviderEligibilityStatus;
  healthStatus: ProviderHealthStatus;
  reason: string;
  codes: string[];
  checkedAt: string | null;
  ageMs: number | null;
}

type ProviderMetadata = Record<string, unknown> & {
  wallet?: ProviderWalletSnapshot;
  health?: ProviderHealthSnapshot;
};

const SUPPORTED_PROVIDER_KEYS = new Set(["airalo", "esimaccess", "esimgo", "zendit", "mock"]);
export const PROVIDER_HEALTH_MAX_AGE_MS = 20 * 60 * 1000;

export function canonicalProviderKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

export function resolveCanonicalProviderRow<T extends { key: string }>(
  rows: T[],
  requestedKey: string,
): { provider: T | null; conflict: boolean } {
  const canonicalKey = canonicalProviderKey(requestedKey);
  const matches = rows.filter(row => canonicalProviderKey(row.key) === canonicalKey);
  const canonical = matches.find(row => row.key === canonicalKey);
  if (canonical) return { provider: canonical, conflict: false };
  if (matches.length === 1) return { provider: matches[0], conflict: false };
  return { provider: null, conflict: matches.length > 1 };
}

function asMetadata(value: unknown): ProviderMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ProviderMetadata
    : {};
}

export function deriveProviderHealthSnapshot(
  providerKey: string,
  wallet: ProviderWalletSnapshot,
  now: Date,
  previous?: ProviderHealthSnapshot,
): ProviderHealthSnapshot {
  const key = canonicalProviderKey(providerKey);
  const checkedAt = now.toISOString();
  const successfulProbe = wallet.status === "ok" || wallet.status === "low" || wallet.status === "not_supported";
  const lastSuccessfulProbeAt = successfulProbe
    ? checkedAt
    : previous?.lastSuccessfulProbeAt;

  const base = {
    checkedAt,
    ...(lastSuccessfulProbeAt ? { lastSuccessfulProbeAt } : {}),
  };

  if (!SUPPORTED_PROVIDER_KEYS.has(key)) {
    return {
      ...base,
      status: "down",
      eligible: false,
      reason: "No supported provider health probe is registered",
      checks: { configuration: "unsupported", connection: "unsupported", service: "unsupported", wallet: "unsupported" },
    };
  }

  if (key === "mock") {
    const allowed =
      process.env.NODE_ENV !== "production" &&
      (process.env.ALLOW_MOCK_PROVIDER === "true" || process.env.PROVIDER_NAME === "mock");
    return {
      ...base,
      status: allowed ? "healthy" : "down",
      eligible: allowed,
      reason: allowed ? "Development mock provider is available" : "Mock provider is disabled in production",
      checks: {
        configuration: allowed ? "ok" : "failed",
        connection: "unsupported",
        service: "unsupported",
        wallet: "unsupported",
      },
    };
  }

  if (wallet.status === "not_configured") {
    return {
      ...base,
      status: "down",
      eligible: false,
      reason: "Provider credentials are not configured",
      checks: { configuration: "failed", connection: "failed", service: "failed", wallet: "failed" },
    };
  }

  if (wallet.status === "error") {
    return {
      ...base,
      status: "down",
      eligible: false,
      reason: wallet.error ? `Safe provider probe failed: ${wallet.error}` : "Safe provider probe failed",
      checks: { configuration: "ok", connection: "failed", service: "failed", wallet: "failed" },
    };
  }

  if (wallet.status === "low") {
    const amount = wallet.amount == null ? "unknown" : wallet.amount.toFixed(2);
    const currency = wallet.currency ?? "";
    return {
      ...base,
      status: "degraded",
      eligible: false,
      reason: `Wallet balance ${currency} ${amount} is at or below the routing threshold`,
      checks: { configuration: "ok", connection: "ok", service: "ok", wallet: "low" },
    };
  }

  if (wallet.status === "not_supported") {
    if (key !== "airalo") {
      return {
        ...base,
        status: "down",
        eligible: false,
        reason: "Provider does not have a supported live health probe",
        checks: { configuration: "ok", connection: "unsupported", service: "unsupported", wallet: "unsupported" },
      };
    }
    return {
      ...base,
      status: "healthy",
      eligible: true,
      reason: "Authentication and catalogue service checks passed; wallet balance is not exposed",
      checks: { configuration: "ok", connection: "ok", service: "ok", wallet: "unsupported" },
    };
  }

  return {
    ...base,
    status: "healthy",
    eligible: true,
    reason: "Authentication, service, and wallet checks passed",
    checks: { configuration: "ok", connection: "ok", service: "ok", wallet: "ok" },
  };
}

export function evaluateProviderEligibility(
  provider: Provider,
  now: Date = new Date(),
): ProviderEligibility {
  const metadata = asMetadata(provider.metadata);
  const health = metadata.health;
  const checkedAt = health?.checkedAt ?? provider.lastHealthCheck?.toISOString() ?? null;
  const checkedAtMs = checkedAt ? new Date(checkedAt).getTime() : NaN;
  const ageMs = Number.isFinite(checkedAtMs) ? Math.max(0, now.getTime() - checkedAtMs) : null;
  const reasons: Array<{ code: string; reason: string }> = [];

  if (!provider.enabled) {
    reasons.push({ code: "disabled", reason: "Provider is manually disabled" });
  }
  if (provider.autoPaused) {
    reasons.push({
      code: "auto_paused",
      reason: provider.autoPauseReason ? `Provider is auto-paused: ${provider.autoPauseReason}` : "Provider is auto-paused",
    });
  }
  if (!health || ageMs == null) {
    reasons.push({ code: "health_not_checked", reason: "No successful live health assessment is available" });
  } else if (ageMs > PROVIDER_HEALTH_MAX_AGE_MS) {
    reasons.push({
      code: "health_stale",
      reason: `Health check is stale (${Math.floor(ageMs / 60000)} minutes old)`,
    });
  } else if (!health.eligible || health.status !== "healthy") {
    const code =
      metadata.wallet?.status === "low" ? "wallet_low"
      : metadata.wallet?.status === "not_configured" ? "not_configured"
      : metadata.wallet?.status === "error" ? "provider_unavailable"
      : health.status === "degraded" ? "health_degraded"
      : "health_down";
    reasons.push({ code, reason: health.reason });
  }

  const eligible = reasons.length === 0;
  const onlyDegraded = reasons.length > 0 && reasons.every(r =>
    r.code === "wallet_low" || r.code === "health_degraded"
  );

  return {
    eligible,
    status: eligible ? "eligible" : onlyDegraded ? "degraded" : "excluded",
    healthStatus: health?.status ?? (provider.healthStatus as ProviderHealthStatus) ?? "unknown",
    reason: eligible ? (health?.reason ?? "Provider is eligible") : reasons.map(r => r.reason).join("; "),
    codes: reasons.map(r => r.code),
    checkedAt,
    ageMs,
  };
}

export async function getProviderEligibilityByKey(
  providerKey: string,
  now: Date = new Date(),
): Promise<ProviderEligibility> {
  try {
    const canonicalKey = canonicalProviderKey(providerKey);
    const rows = await db.select().from(providers);
    const resolved = resolveCanonicalProviderRow(rows, canonicalKey);
    if (resolved.conflict) {
      return {
        eligible: false,
        status: "excluded",
        healthStatus: "unknown",
        reason: "Conflicting legacy provider registry rows must be reconciled",
        codes: ["provider_registry_conflict"],
        checkedAt: null,
        ageMs: null,
      };
    }
    const provider = resolved.provider;
    if (!provider) {
      return {
        eligible: false,
        status: "excluded",
        healthStatus: "unknown",
        reason: "Provider is not registered",
        codes: ["not_registered"],
        checkedAt: null,
        ageMs: null,
      };
    }
    return evaluateProviderEligibility(provider, now);
  } catch (error: any) {
    return {
      eligible: false,
      status: "excluded",
      healthStatus: "unknown",
      reason: `Provider eligibility check failed: ${String(error?.message ?? error).slice(0, 200)}`,
      codes: ["eligibility_check_failed"],
      checkedAt: null,
      ageMs: null,
    };
  }
}