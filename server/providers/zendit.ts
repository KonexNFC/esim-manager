import type { EsimProvider, ProviderPlan, ProviderOrderResult, CoverageType } from "./types";

// ─── Zendit eSIM Provider ─────────────────────────────────────────────────────
// API base:  https://api.zendit.io/v1
// Auth:      X-API-Key header
// Key env:   ZENDIT_API_KEY
//
// Catalogue endpoint (per-country):
//   GET /esim/plans?country={ISO2}
//   Response: { items: ZenditPlan[] }
//
// Full catalogue helper:
//   getAllCataloguePlans(countryCodes) iterates each code and deduplicates.

interface ZenditPlanCost {
  amount: number;       // in cents (USD)
  currency?: string;
}

interface ZenditPlan {
  id?: string;
  productId?: string;   // canonical plan identifier
  title?: string;
  name?: string;
  data_amount_gb?: number;
  dataAmountGb?: number;
  validity_days?: number;
  validityDays?: number;
  cost?: ZenditPlanCost;
  price?: ZenditPlanCost;
  network_speed?: string;
  networkSpeed?: string;
  coverage_countries?: string[];
  coverageCountries?: string[];
  features?: string[];
  is_unlimited?: boolean;
  isUnlimited?: boolean;
}

export class ZenditProvider implements EsimProvider {
  name = "zendit";
  private apiKey: string | undefined;
  private baseUrl = "https://api.zendit.io/v1";

  constructor() {
    this.apiKey = process.env.ZENDIT_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async fetchCountryPlans(countryCode: string): Promise<ProviderPlan[]> {
    const res = await fetch(
      `${this.baseUrl}/esim/plans?country=${countryCode.toUpperCase()}`,
      { headers: { "X-API-Key": this.apiKey! } },
    );
    if (!res.ok) {
      throw new Error(`Zendit API ${res.status} for country ${countryCode}`);
    }
    const data = await res.json() as { items?: ZenditPlan[] };
    const items: ZenditPlan[] = Array.isArray(data.items) ? data.items : [];
    return items.map(p => this.mapItem(p, countryCode));
  }

  private mapItem(p: ZenditPlan, countryCode: string): ProviderPlan {
    const providerRef = p.productId ?? p.id ?? "";
    const dataGb = p.data_amount_gb ?? p.dataAmountGb ?? 0;
    const isUnlimited = p.is_unlimited ?? p.isUnlimited ?? false;
    const validityDays = p.validity_days ?? p.validityDays ?? 1;
    const costCents = p.cost?.amount ?? p.price?.amount ?? 0;
    const wholesaleCost = costCents / 100;

    const dataLabel = isUnlimited
      ? "Unlimited"
      : dataGb >= 1
        ? `${Math.round(dataGb * 10) / 10} GB`
        : `${Math.round(dataGb * 1024)} MB`;

    const speedInfo = p.network_speed ?? p.networkSpeed ?? "4G/LTE";
    const coveredCountries = p.coverage_countries ?? p.coverageCountries ?? [countryCode];

    // Determine coverage type from how many countries this plan covers
    const coverageType: CoverageType =
      coveredCountries.length === 0 ? "country"
      : coveredCountries.length === 1 ? "country"
      : coveredCountries.length >= 50 ? "global"
      : "regional";

    const features: string[] = Array.isArray(p.features) ? p.features : ["Data only", "Instant activation"];
    if (speedInfo.toLowerCase().includes("5g")) features.push("5G where available");

    return {
      provider: this.name,
      providerRef,
      countryCode: countryCode.toUpperCase(),
      dataAmountGb: isUnlimited ? 999 : dataGb,
      validityDays,
      wholesaleCost,
      currency: "USD",
      name: p.title ?? p.name ?? `${dataLabel} — ${validityDays} Days`,
      dataAmount: dataLabel,
      validity: `${validityDays} Days`,
      speedInfo,
      coverage: coveredCountries.join(", ") || countryCode,
      features,
      coverageType,
    };
  }

  /**
   * Fetch the full Zendit catalogue across the given country codes.
   * Deduplicates by (providerRef, countryCode) to avoid double-counting plans
   * that appear in multiple country responses.
   */
  async getAllCataloguePlans(countryCodes: string[]): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[zendit] Not configured (ZENDIT_API_KEY missing) — skipping catalogue fetch");
      return [];
    }

    const seen = new Set<string>();
    const all: ProviderPlan[] = [];
    let errors = 0;

    for (const code of countryCodes) {
      try {
        const plans = await this.fetchCountryPlans(code);
        for (const p of plans) {
          const key = `${p.providerRef}__${p.countryCode}`;
          if (!seen.has(key)) {
            seen.add(key);
            all.push(p);
          }
        }
      } catch (err: any) {
        errors++;
        if (errors <= 3) {
          // Log first few errors, suppress the rest to keep noise low
          console.warn(`[zendit] Failed to fetch plans for ${code}: ${err.message}`);
        }
      }
    }

    if (errors > 3) {
      console.warn(`[zendit] ...and ${errors - 3} more country fetch errors suppressed`);
    }

    return all;
  }

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[zendit] Not configured — skipping plan fetch");
      return [];
    }
    try {
      return await this.fetchCountryPlans(countryCode);
    } catch (err: any) {
      console.error(`[zendit] getPlans(${countryCode}) failed:`, err.message);
      return [];
    }
  }

  async purchaseEsim(planDetails: {
    countryCode: string;
    dataAmountGb: number;
    validityDays: number;
    providerRef?: string;
  }): Promise<ProviderOrderResult> {
    if (!this.apiKey) {
      throw new Error("Zendit provider not configured");
    }

    const res = await fetch(`${this.baseUrl}/esim/purchases`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        country: planDetails.countryCode,
        data_gb: planDetails.dataAmountGb,
        validity_days: planDetails.validityDays,
        ...(planDetails.providerRef ? { product_id: planDetails.providerRef } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Zendit purchase failed (${res.status}): ${body}`);
    }

    const data = await res.json() as { esim?: { iccid?: string; qr_code_url?: string; activation_url?: string } };
    const esim = data.esim ?? {};

    return {
      iccid: esim.iccid ?? "",
      qrCodeUrl: esim.qr_code_url ?? "",
      activationUrl: esim.activation_url,
    };
  }

  async getEsimStatus(iccid: string): Promise<string> {
    if (!this.apiKey) return "unknown";
    try {
      const res = await fetch(`${this.baseUrl}/esim/${iccid}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!res.ok) return "unknown";
      const data = await res.json() as { status?: string };
      return data.status ?? "unknown";
    } catch {
      return "unknown";
    }
  }
}

export const zendit = new ZenditProvider();
