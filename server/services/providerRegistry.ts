// ─── Provider Registry Service ───────────────────────────────────────────────
// Core service layer for the multi-provider routing system.
// Manages the `providers`, `normalized_plans`, and `provider_offers` tables.
//
// Routing logic (used by the fulfillment service):
//   1. Look up the normalizedPlan for the requested destination/data/validity
//   2. Fetch all active provider_offers for that plan
//   3. Sort by providers.priority (lower = preferred)
//   4. The fulfillment adapter picks the winner at provisioning time

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "../storage";
import {
  providers, normalizedPlans, providerOffers,
  type Provider, type InsertProvider,
  type NormalizedPlan, type InsertNormalizedPlan,
  type ProviderOffer, type InsertProviderOffer,
} from "@shared/schema";
import {
  canonicalProviderKey,
  evaluateProviderEligibility,
  resolveCanonicalProviderRow,
  type ProviderEligibility,
} from "./providerHealth";

const PROVIDER_OFFER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function applyOfferFreshness(
  eligibility: ProviderEligibility,
  lastSyncedAt: Date | null,
  now: Date = new Date(),
): ProviderEligibility {
  if (!eligibility.eligible) return eligibility;
  const syncedAtMs = lastSyncedAt?.getTime() ?? NaN;
  const offerAgeMs = Number.isFinite(syncedAtMs) ? now.getTime() - syncedAtMs : null;
  if (offerAgeMs != null && offerAgeMs <= PROVIDER_OFFER_MAX_AGE_MS) return eligibility;
  return {
    eligible: false,
    status: "excluded",
    healthStatus: eligibility.healthStatus,
    reason: offerAgeMs == null
      ? "Provider offer has never completed a catalogue sync"
      : `Provider offer is stale (${Math.floor(offerAgeMs / 60000)} minutes old)`,
    codes: ["offer_stale"],
    checkedAt: eligibility.checkedAt,
    ageMs: eligibility.ageMs,
  };
}

// ─── Provider CRUD ───────────────────────────────────────────────────────────

/** Return all providers ordered by priority (ascending). */
export async function getAllProviders(): Promise<Provider[]> {
  return db.select().from(providers).orderBy(asc(providers.priority));
}

/** Return all providers with their current fail-closed routing eligibility. */
export async function getAllProvidersWithEligibility(): Promise<Array<Provider & { eligibility: ProviderEligibility }>> {
  const rows = await getAllProviders();
  return rows.map(provider => ({
    ...provider,
    eligibility: evaluateProviderEligibility(provider),
  }));
}

/** Return only enabled providers ordered by priority. */
export async function getEnabledProviders(): Promise<Provider[]> {
  return db
    .select()
    .from(providers)
    .where(eq(providers.enabled, true))
    .orderBy(asc(providers.priority));
}

/** Look up a single provider by its string key (e.g. "esimgo"). */
export async function getProviderByKey(key: string): Promise<Provider | undefined> {
  const [row] = await db.select().from(providers).where(eq(providers.key, key));
  return row;
}

/** Upsert a provider row (insert or update by key). */
export async function upsertProvider(data: InsertProvider): Promise<Provider> {
  const existing = await getProviderByKey(data.key);
  if (existing) {
    const [updated] = await db
      .update(providers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(providers.key, data.key))
      .returning();
    return updated;
  }
  const [created] = await db.insert(providers).values(data).returning();
  return created;
}

/** Update a provider's health status and timestamp. */
export async function updateProviderHealth(
  key: string,
  status: "healthy" | "degraded" | "down" | "unknown",
): Promise<void> {
  await db
    .update(providers)
    .set({ healthStatus: status, lastHealthCheck: new Date(), updatedAt: new Date() })
    .where(eq(providers.key, key));
}

// ─── Normalized Plan CRUD ────────────────────────────────────────────────────

/** Return all active normalized plans. */
export async function getAllNormalizedPlans(): Promise<NormalizedPlan[]> {
  return db.select().from(normalizedPlans).where(eq(normalizedPlans.isActive, true));
}

/** Return normalized plans for a specific region/country code. */
export async function getNormalizedPlansByRegion(regionCode: string): Promise<NormalizedPlan[]> {
  return db
    .select()
    .from(normalizedPlans)
    .where(and(eq(normalizedPlans.regionCode, regionCode), eq(normalizedPlans.isActive, true)));
}

/** Look up a normalized plan by ID. */
export async function getNormalizedPlan(id: string): Promise<NormalizedPlan | undefined> {
  const [row] = await db.select().from(normalizedPlans).where(eq(normalizedPlans.id, id));
  return row;
}

/** Insert a new normalized plan. */
export async function createNormalizedPlan(data: InsertNormalizedPlan): Promise<NormalizedPlan> {
  const [created] = await db.insert(normalizedPlans).values(data).returning();
  return created;
}

// ─── Provider Offers CRUD ────────────────────────────────────────────────────

export type ProviderOfferWithEligibility = ProviderOffer & {
  providerPriority: number;
  providerEnabled: boolean;
  providerAutoPaused: boolean;
  providerHealthStatus: string;
  eligibility: ProviderEligibility;
};

/**
 * Return active offers ordered by provider priority.
 * Ineligible providers are excluded by default so every caller fails closed.
 * Routing audit callers may request them explicitly to record exclusion reasons.
 */
export async function getOffersForNormalizedPlan(
  normalizedPlanId: string,
  options: { includeIneligible?: boolean } = {},
): Promise<ProviderOfferWithEligibility[]> {
  // Fetch offers + join provider priority in-process (avoids complex ORM join)
  const offers = await db
    .select()
    .from(providerOffers)
    .where(and(
      eq(providerOffers.normalizedPlanId, normalizedPlanId),
      eq(providerOffers.isActive, true),
    ));

  if (offers.length === 0) return [];

  const providerKeys = Array.from(new Set(offers.map(o => o.providerKey)));
  // Provider keys in early data used mixed casing (e.g. esimAccess). The
  // registry is tiny, so loading all rows makes canonical matching reliable.
  const providerRows = await db.select().from(providers);

  return offers
    .map(offer => {
      const canonicalKey = canonicalProviderKey(offer.providerKey);
      const resolved = resolveCanonicalProviderRow(providerRows, canonicalKey);
      const p = resolved.provider;
      let eligibility: ProviderEligibility = resolved.conflict
        ? {
            eligible: false,
            status: "excluded",
            healthStatus: "unknown",
            reason: "Conflicting legacy provider registry rows must be reconciled",
            codes: ["provider_registry_conflict"],
            checkedAt: null,
            ageMs: null,
          }
        : p
        ? evaluateProviderEligibility(p)
        : {
            eligible: false,
            status: "excluded",
            healthStatus: "unknown",
            reason: "Provider is not registered",
            codes: ["not_registered"],
            checkedAt: null,
            ageMs: null,
          };
      eligibility = applyOfferFreshness(eligibility, offer.lastSyncedAt);
      return {
        ...offer,
        providerKey: canonicalKey,
        providerPriority: p?.priority ?? 999,
        providerEnabled: p?.enabled ?? false,
        providerAutoPaused: p?.autoPaused ?? false,
        providerHealthStatus: p?.healthStatus ?? "unknown",
        eligibility,
      };
    })
    .filter(offer => options.includeIneligible || offer.eligibility.eligible)
    .sort((a, b) => a.providerPriority - b.providerPriority);
}

/**
 * Revalidate a stored provider plan code immediately before fulfillment.
 * This prevents an old checkout fallback chain from purchasing a removed or
 * stale catalogue offer even when the provider itself is healthy.
 */
export async function getProviderOfferEligibility(
  providerKey: string,
  providerPlanCode: string | null | undefined,
): Promise<ProviderEligibility> {
  const providerRows = await db.select().from(providers);
  const canonicalKey = canonicalProviderKey(providerKey);
  const resolved = resolveCanonicalProviderRow(providerRows, canonicalKey);
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

  const providerEligibility = evaluateProviderEligibility(provider);
  if (!providerEligibility.eligible || !providerPlanCode) return providerEligibility;

  try {
    const matches = await db
      .select()
      .from(providerOffers)
      .where(and(
        eq(providerOffers.providerPlanCode, providerPlanCode),
        eq(providerOffers.isActive, true),
      ));
    const offer = matches.find(row => canonicalProviderKey(row.providerKey) === canonicalKey);
    if (!offer) {
      return {
        eligible: false,
        status: "excluded",
        healthStatus: providerEligibility.healthStatus,
        reason: "Stored provider offer is no longer active in the live catalogue",
        codes: ["offer_unavailable"],
        checkedAt: providerEligibility.checkedAt,
        ageMs: providerEligibility.ageMs,
      };
    }
    return applyOfferFreshness(providerEligibility, offer.lastSyncedAt);
  } catch (error: any) {
    return {
      eligible: false,
      status: "excluded",
      healthStatus: providerEligibility.healthStatus,
      reason: `Stored offer eligibility check failed: ${String(error?.message ?? error).slice(0, 200)}`,
      codes: ["offer_check_failed"],
      checkedAt: providerEligibility.checkedAt,
      ageMs: providerEligibility.ageMs,
    };
  }
}

/** Return all offers for a given provider key. */
export async function getOffersByProvider(providerKey: string): Promise<ProviderOffer[]> {
  return db
    .select()
    .from(providerOffers)
    .where(and(eq(providerOffers.providerKey, providerKey), eq(providerOffers.isActive, true)));
}

/** Upsert a provider offer (by normalizedPlanId + providerKey + providerPlanCode). */
export async function upsertProviderOffer(data: InsertProviderOffer): Promise<ProviderOffer> {
  const [existing] = await db
    .select()
    .from(providerOffers)
    .where(and(
      eq(providerOffers.normalizedPlanId, data.normalizedPlanId),
      eq(providerOffers.providerKey, data.providerKey),
      eq(providerOffers.providerPlanCode, data.providerPlanCode),
    ));

  if (existing) {
    const [updated] = await db
      .update(providerOffers)
      .set({ ...data, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerOffers.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(providerOffers)
    .values({ ...data, lastSyncedAt: new Date() })
    .returning();
  return created;
}

/** Deactivate all offers for a provider (used when a provider goes offline). */
export async function deactivateProviderOffers(providerKey: string): Promise<void> {
  await db
    .update(providerOffers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(providerOffers.providerKey, providerKey));
}

// ─── Routing helper ──────────────────────────────────────────────────────────

/**
 * Find the best offer for a given region + data + validity requirement.
 * Returns offers sorted by provider priority (primary first).
 * The fulfillment adapter tries them in order, stopping at the first success.
 */
export async function getBestOffersForRequirement(
  regionCode: string,
  minDataMb: number,
  minValidityDays: number,
): Promise<(ProviderOffer & { providerPriority: number; providerEnabled: boolean; planName: string })[]> {
  const plans = await db
    .select()
    .from(normalizedPlans)
    .where(and(
      eq(normalizedPlans.regionCode, regionCode),
      eq(normalizedPlans.isActive, true),
    ));

  const matching = plans.filter(p =>
    (p.isUnlimited || p.dataMb >= minDataMb) && p.validityDays >= minValidityDays,
  );

  if (matching.length === 0) return [];

  // Gather all offers for matching plans
  const allOffers: (ProviderOffer & { providerPriority: number; providerEnabled: boolean; planName: string })[] = [];

  for (const plan of matching) {
    const offers = await getOffersForNormalizedPlan(plan.id);
    allOffers.push(...offers.map(o => ({ ...o, planName: plan.name })));
  }

  return allOffers.sort((a, b) => a.providerPriority - b.providerPriority);
}
