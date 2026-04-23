// ─── Airalo Provider Wrapper ──────────────────────────────────────────────────
// Thin wrapper around AiraloAdapter that exposes the interface expected by
// providerSync.ts — mirrors the pattern used by esimAccess.ts / zendit.ts.

import type { ProviderPlan } from "./types";
import { AiraloAdapter } from "./adapters/airalo";

class AiraloProvider {
  private adapter: AiraloAdapter | null = null;

  private getAdapter(): AiraloAdapter | null {
    if (this.adapter) return this.adapter;
    const clientId     = process.env.AIRALO_CLIENT_ID;
    const clientSecret = process.env.AIRALO_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    const env = (process.env.AIRALO_ENV ?? "").toLowerCase() === "sandbox" ? "sandbox" : "production";
    this.adapter = new AiraloAdapter(clientId, clientSecret, env);
    return this.adapter;
  }

  isConfigured(): boolean {
    return !!(process.env.AIRALO_CLIENT_ID && process.env.AIRALO_CLIENT_SECRET);
  }

  /**
   * Fetch all Airalo plans across the given country codes.
   * Uses getSupportedPlans() per country; 100-plan pages are sufficient
   * because Airalo's catalogue is ~2–3 plans per country.
   */
  async getAllPackages(countryCodes: string[]): Promise<ProviderPlan[]> {
    const adapter = this.getAdapter();
    if (!adapter) throw new Error("Airalo not configured");

    const results: ProviderPlan[] = [];

    // Process in batches of 10 to avoid hammering the auth endpoint
    const BATCH = 10;
    for (let i = 0; i < countryCodes.length; i += BATCH) {
      const batch = countryCodes.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(code => adapter.getSupportedPlans(code)),
      );

      for (let j = 0; j < settled.length; j++) {
        const res = settled[j];
        const countryCode = batch[j].toUpperCase();
        if (res.status === "rejected") {
          console.warn(`[airalo] ${countryCode}: ${res.reason?.message}`);
          continue;
        }
        for (const pkg of res.value) {
          if (!pkg.providerPlanCode || !pkg.dataMb || !pkg.durationDays) continue;
          const dataGb = pkg.dataMb / 1024;
          results.push({
            provider:       "airalo",
            providerRef:    pkg.providerPlanCode,
            countryCode,
            dataAmountGb:   dataGb,
            validityDays:   pkg.durationDays,
            wholesaleCost:  pkg.priceMinor / 100,
            currency:       pkg.currency || "USD",
            name:           pkg.name,
            dataAmount:     dataGb >= 999 ? "Unlimited" : `${dataGb % 1 === 0 ? dataGb : dataGb.toFixed(1)} GB`,
            validity:       `${pkg.durationDays} day${pkg.durationDays === 1 ? "" : "s"}`,
            coverage:       countryCode,
            features:       [],
            coverageType:   "country",
          });
        }
      }
    }

    return results;
  }
}

export const airalo = new AiraloProvider();
