// ─── Airalo Provider Wrapper ──────────────────────────────────────────────────
// Thin wrapper around AiraloAdapter that satisfies both:
//   - EsimProvider (providerManager registry — order fulfillment)
//   - providerSync getAllPackages (catalogue sync)

import type { ProviderPlan, EsimProvider, ProviderOrderResult } from "./types";
import type { ProviderPurchaseParams } from "./adapters/base";
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
   * Fetch the full Airalo catalogue — local, regional, and global packages —
   * in a single paginated call with no type filter.
   * Omitting filter[type] returns all ~3,200 packages (local + regional + global).
   */
  async getAllPackages(_countryCodes: string[]): Promise<ProviderPlan[]> {
    const adapter = this.getAdapter();
    if (!adapter) throw new Error("Airalo not configured");

    const results: ProviderPlan[] = [];
    let page = 1;

    while (true) {
      console.log(`[airalo] Fetching page ${page} of all packages (local + regional + global)...`);
      // No type filter → API returns all types in one response
      const pkgs = await adapter.getSupportedPlans(undefined, page, undefined);
      if (!pkgs.length) break;

      for (const pkg of pkgs) {
        if (!pkg.providerPlanCode || !pkg.durationDays) continue;

        const dataGb = pkg.dataMb >= 999_000
          ? Infinity
          : +(pkg.dataMb / 1024).toFixed(2);

        const destination = (pkg.destination ?? pkg.region ?? '');
        if (!destination) continue;

        // For local plans: countryCode = ISO-2 upper (e.g. "GB").
        // For regional/global: countryCode = slug (e.g. "europe", "world").
        const countryCode = pkg.coverageType === 'country'
          ? destination.toUpperCase()
          : destination.toLowerCase();

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
          coverageType:  pkg.coverageType ?? "country",
        });
      }

      // Adapter returns fewer than 1000 entries when on the last page
      if (pkgs.length < 1000) break;
      page++;
    }

    const localCount    = results.filter(r => r.coverageType === 'country').length;
    const regionalCount = results.filter(r => r.coverageType === 'regional').length;
    const globalCount   = results.filter(r => r.coverageType === 'global').length;
    console.log(`[airalo] Fetched ${results.length} packages from ${page} page(s): ${localCount} local, ${regionalCount} regional, ${globalCount} global`);
    return results;
  }

  // ── EsimProvider interface (used by providerManager for order fulfillment) ──

  name = 'airalo';

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    const adapter = this.getAdapter();
    if (!adapter) return [];
    // For single-country lookup, restrict to local packages only
    const plans = await adapter.getSupportedPlans(countryCode, 1, 'local');
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
      coverageType:  p.coverageType ?? 'country',
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
    } as ProviderPurchaseParams);
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
