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

// ─── Provider CRUD ───────────────────────────────────────────────────────────

/** Return all providers ordered by priority (ascending). */
export async function getAllProviders(): Promise<Provider[]> {
  return db.select().from(providers).orderBy(asc(providers.priority));
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

/** Return all active offers for a normalized plan, ordered by provider priority. */
export async function getOffersForNormalizedPlan(
  normalizedPlanId: string,
): Promise<(ProviderOffer & { providerPriority: number; providerEnabled: boolean })[]> {
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
  const providerRows = await db
    .select()
    .from(providers)
    .where(inArray(providers.key, providerKeys));

  const providerMap = new Map(providerRows.map(p => [p.key, p]));

  return offers
    .map(offer => {
      const p = providerMap.get(offer.providerKey);
      return {
        ...offer,
        providerPriority: p?.priority ?? 999,
        providerEnabled: p?.enabled ?? false,
      };
    })
    .filter(o => o.providerEnabled)
    .sort((a, b) => a.providerPriority - b.providerPriority);
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
