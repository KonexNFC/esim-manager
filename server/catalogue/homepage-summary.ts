import type { PublicCatalogueResponse } from "./public-catalogue";
import { normalizeValidityToBucket } from "./normalizer";
import { getLocationInfo, normaliseCode } from "../services/countryData";

/** Count products, not supplier duplicates or synthetic duration combinations. */
export function catalogueCounts(rows: Array<{ id: string; regionCode: string; validityDays: number }>) {
  const plans = new Set<string>();
  const destinations = new Set<string>();
  for (const row of rows) {
    if (!normalizeValidityToBucket(row.validityDays)) continue;
    const code = normaliseCode(row.regionCode);
    if (!getLocationInfo(code)) continue;
    plans.add(row.id);
    destinations.add(code);
  }
  return { destinationCount: destinations.size, activePlanCount: plans.size };
}

/** Use the same final quotes visitors see, never wholesale or stored retail values. */
export function lowestCataloguePrice(catalogue: PublicCatalogueResponse): number | undefined {
  const prices: number[] = [];
  for (const slot of Object.values(catalogue.durations)) {
    if (!slot) continue;
    for (const offer of [slot.recommended, slot.cheaper, slot.premium, ...slot.browseAll]) {
      if (!offer || offer.isSynthetic) continue;
      const price = offer.quote.amount;
      if (offer.quote.currency === "USD" && typeof price === "number" && Number.isFinite(price) && price > 0) {
        prices.push(price);
      }
    }
  }
  return prices.length ? Math.min(...prices) : undefined;
}
