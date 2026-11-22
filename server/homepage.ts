import type { Express } from "express";
import { and, eq, gt, gte } from "drizzle-orm";
import { normalizedPlans, providerOffers, providers } from "@shared/schema";
import { db, storage } from "./storage";
import { canonicalProviderKey, evaluateProviderEligibility, resolveCanonicalProviderRow } from "./services/providerHealth";
import { selectBestProviderForPlan } from "./services/routingEngine";
import { getOffersForNormalizedPlan } from "./services/providerRegistry";
import { createCheckoutQuoteForOffer, toPublicCheckoutQuote } from "./services/checkoutQuote";
import { getDbSupplierPlans } from "./catalogue/db-supplier-plans";
import { buildPublicCatalogue } from "./catalogue/catalogue-service";
import { attachPublicCatalogueQuotes } from "./catalogue/public-catalogue";
import { catalogueCounts, lowestCataloguePrice } from "./catalogue/homepage-summary";

// Read-only homepage projection. Reuse existing quotation/routing unchanged.
// Single-flight + short cache prevent each visitor repeating the catalogue work.
export function registerHomepageRoutes(app: Express) {
  let cached: Awaited<ReturnType<typeof loadSummary>> | undefined;
  let expires = 0;
  let pending: Promise<Awaited<ReturnType<typeof loadSummary>>> | undefined;

  async function loadSummary() {
    const [destinations, providerRows, rows] = await Promise.all([
      storage.getPopularDestinations(),
      db.select().from(providers),
      db.select({
        id: normalizedPlans.id,
        regionCode: normalizedPlans.regionCode,
        validityDays: normalizedPlans.validityDays,
        providerKey: providerOffers.providerKey,
      }).from(normalizedPlans).innerJoin(providerOffers, eq(providerOffers.normalizedPlanId, normalizedPlans.id))
        .where(and(
          eq(normalizedPlans.isActive, true),
          eq(providerOffers.isActive, true),
          gt(providerOffers.wholesalePriceUsd, 0),
          // Same two-hour catalogue freshness window as the provider registry.
          gte(providerOffers.lastSyncedAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
        )),
    ]);
    const eligibleRows = rows.filter(row => {
      const resolved = resolveCanonicalProviderRow(providerRows, canonicalProviderKey(row.providerKey));
      return !resolved.conflict && resolved.provider && evaluateProviderEligibility(resolved.provider).eligible;
    });
    const popularPrices: Record<string, number> = {};
    const bundlePrices: Record<string, number> = {};
    const priceByCode = new Map<string, number | undefined>();
    async function priceFor(code: string) {
      if (priceByCode.has(code)) return priceByCode.get(code);
      const catalogue = buildPublicCatalogue(code, await getDbSupplierPlans(code));
      const quoted = await attachPublicCatalogueQuotes(catalogue, {
        selectBestProviderForPlan, getOffersForNormalizedPlan,
        createCheckoutQuoteForOffer, toPublicCheckoutQuote,
      });
      const price = lowestCataloguePrice(quoted);
      priceByCode.set(code, price);
      return price;
    }
    // Deliberately serial between destinations to bound database fan-out.
    for (const destination of destinations.slice(0, 8)) {
      const price = await priceFor(destination.countryCode.toUpperCase());
      if (price !== undefined) popularPrices[destination.id] = price;
    }
    for (const [key, code] of [["europe", "EUROPE"], ["nigeria-arrival", "NG"], ["global", "GLOBAL"]]) {
      const price = await priceFor(code);
      if (price !== undefined) bundlePrices[key] = price;
    }
    // No verified UK+Nigeria coverage metadata: omit the corridor bundle price.
    return { ...catalogueCounts(eligibleRows), popularPrices, bundlePrices, updatedAt: new Date().toISOString() };
  }

  app.get("/api/homepage/catalogue", async (_req, res) => {
    try {
      if (!cached || Date.now() >= expires) {
        if (!pending) {
          pending = loadSummary().then(result => {
            cached = result;
            expires = Date.now() + 60_000;
            return result;
          }).finally(() => { pending = undefined; });
        }
        await pending;
      }
      res.set("Cache-Control", "no-store").json(cached);
    } catch {
      // Never publish fabricated numbers or a stale price when the read failed.
      res.status(503).json({ message: "Catalogue summary is temporarily unavailable. Please try again." });
    }
  });
}
