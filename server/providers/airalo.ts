// ─── Airalo Provider Wrapper ──────────────────────────────────────────────────
// Thin wrapper around AiraloAdapter that satisfies both:
//   - EsimProvider (providerManager registry — order fulfillment)
//   - providerSync getAllPackages (catalogue sync)

import type { ProviderPlan, EsimProvider, ProviderOrderResult } from "./types";
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
   * Fetch all Airalo local plans in a single paginated call (no country filter),
   * then expand each package across the countries it covers.
   * This avoids making 194 per-country requests and stays well within the 40 req/min limit.
   */
  async getAllPackages(_countryCodes: string[]): Promise<ProviderPlan[]> {
    const adapter = this.getAdapter();
    if (!adapter) throw new Error("Airalo not configured");

    const results: ProviderPlan[] = [];
    let page = 1;

    while (true) {
      console.log(`[airalo] Fetching page ${page} of all local packages...`);
      const pkgs = await adapter.getSupportedPlans(undefined, page);
      if (!pkgs.length) break;

      for (const pkg of pkgs) {
        if (!pkg.providerPlanCode || !pkg.durationDays) continue;

        const dataGb = pkg.dataMb >= 999_000
          ? Infinity
          : +(pkg.dataMb / 1024).toFixed(2);

        const countryCode = (pkg.destination ?? pkg.region ?? '').toUpperCase();
        if (!countryCode) continue;

        results.push({
          provider:      "airalo",
          providerRef:   pkg.providerPlanCode,
          countryCode,
          dataAmountGb:  dataGb === Infinity ? 999 : dataGb,
          validityDays:  pkg.durationDays,
          wholesaleCost: pkg.priceMinor / 100,
          currency:      pkg.currency || "USD",
          name:          pkg.name,
          dataAmount:    dataGb === Infinity ? "Unlimited" : `${Number.isInteger(dataGb) ? dataGb : dataGb.toFixed(1)} GB`,
          validity:      `${pkg.durationDays} day${pkg.durationDays === 1 ? "" : "s"}`,
          coverage:      countryCode,
          features:      [],
          coverageType:  "country",
        });
      }

      // Check if there are more pages (adapter returns [] when past last page)
      if (pkgs.length < 1000) break;
      page++;
    }

    console.log(`[airalo] Fetched ${results.length} plan-country entries from ${page} page(s)`);
    return results;
  }

  // ── EsimProvider interface (used by providerManager for order fulfillment) ──

  name = 'airalo';

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    const adapter = this.getAdapter();
    if (!adapter) return [];
    const plans = await adapter.getSupportedPlans(countryCode);
    return plans.map(p => ({
      provider:      'airalo',
      providerRef:   p.providerPlanCode,
      countryCode:   (p.destination ?? p.region ?? countryCode).toUpperCase(),
      dataAmountGb:  p.dataMb >= 999_000 ? 999 : +(p.dataMb / 1024).toFixed(2),
      validityDays:  p.durationDays,
      wholesaleCost: p.priceMinor / 100,
      currency:      p.currency,
      name:          p.name,
      dataAmount:    p.dataMb >= 999_000 ? 'Unlimited' : `${+(p.dataMb / 1024).toFixed(1)} GB`,
      validity:      `${p.durationDays} day${p.durationDays === 1 ? '' : 's'}`,
      coverage:      (p.destination ?? p.region ?? countryCode).toUpperCase(),
      features:      [],
      coverageType:  'country',
    }));
  }

  async purchaseEsim(planDetails: {
    countryCode:   string;
    dataAmountGb:  number;
    validityDays:  number;
    providerRef?:  string;
  }): Promise<ProviderOrderResult> {
    const adapter = this.getAdapter();
    if (!adapter) throw new Error('Airalo not configured');
    const result = await adapter.purchaseEsim({
      countryCode:  planDetails.countryCode,
      dataAmountGb: planDetails.dataAmountGb,
      validityDays: planDetails.validityDays,
      providerRef:  planDetails.providerRef,
    });
    return {
      iccid:         result.iccid,
      qrCodeUrl:     result.qrCodeUrl,
      activationUrl: result.activationUrl,
    };
  }

  async getEsimStatus(iccid: string): Promise<string> {
    const adapter = this.getAdapter();
    if (!adapter) return 'unknown';
    const status = await adapter.getEsimStatus(iccid);
    return status.activationStatus ?? 'unknown';
  }
}

export const airalo = new AiraloProvider() as AiraloProvider & EsimProvider;
