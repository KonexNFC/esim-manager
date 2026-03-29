import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";

const BASE_URL = "https://api.esim-go.com/v2.5";

interface EsimGoCatalogueItem {
  name: string;
  description: string;
  groups: string[];
  countries: { name: string; region: string; iso: string }[];
  dataAmount: number;
  duration: number;
  speed: string[];
  autostart: boolean;
  unlimited: boolean;
  roamingEnabled: { name: string; region: string; iso: string }[];
  price: number;
  billingType: string;
  profileName: string;
  allowances: {
    type: string;
    service: string;
    description: string;
    amount: number;
    unit: string;
    unlimited: boolean;
  }[];
}

interface EsimGoOrderResponse {
  order: {
    type: string;
    item: string;
    quantity: number;
    subTotal: number;
    pricePerUnit: number;
    esims?: { iccid: string; matchingId: string; smdpAddress: string }[];
    iccids?: string[];
  }[];
  total: number;
  currency: string;
  status?: string;
  orderReference?: string;
  assigned: boolean;
}

export class EsimGoProvider implements EsimProvider {
  name = "esimgo";
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ESIMGO_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) throw new Error("eSIMGo provider not configured");

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "X-API-Key": this.apiKey,
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eSIMGo API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /** Fetch the FULL catalogue (all countries). Returns one ProviderPlan per bundle×country. */
  async getAllCataloguePlans(): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[esimgo] Not configured — skipping full catalogue fetch");
      return [];
    }
    try {
      const response = await this.request<{ bundles: EsimGoCatalogueItem[] }>("/catalogue");
      const catalogue = response.bundles || [];
      const plans: ProviderPlan[] = [];
      for (const item of catalogue) {
        const countryCodes = item.countries.length > 0
          ? item.countries.map(c => c.iso.toUpperCase())
          : ["GLOBAL"];
        for (const iso of countryCodes) {
          plans.push(this.mapItemToProviderPlan(item, iso));
        }
      }
      return plans;
    } catch (err) {
      console.error("[esimgo] Failed to fetch full catalogue:", err);
      return [];
    }
  }

  private mapItemToProviderPlan(item: EsimGoCatalogueItem, countryCode: string): ProviderPlan {
    const rawMb = item.dataAmount > 0 ? item.dataAmount : 0;
    const dataGb = rawMb / 1024;
    const roundedGb = rawMb >= 1000 ? Math.round(rawMb / 1000) : Math.round(dataGb * 10) / 10;
    const dataLabel = item.unlimited
      ? "Unlimited"
      : rawMb >= 1000
        ? `${roundedGb} GB`
        : `${rawMb} MB`;
    const coverageCountries = item.countries.map((c) => c.name).join(", ");
    const speeds = item.speed.length > 0 ? item.speed.join("/") : "4G/LTE";
    const features: string[] = ["Data only", "Instant activation"];
    if (item.speed.some((s) => s.toLowerCase().includes("5g"))) features.push("5G where available");
    if (item.roamingEnabled && item.roamingEnabled.length > 0) features.push(`Roaming in ${item.roamingEnabled.length} countries`);
    return {
      provider: this.name,
      providerRef: item.name,
      countryCode,
      dataAmountGb: item.unlimited ? 999 : dataGb,
      validityDays: item.duration,
      wholesaleCost: item.price,
      currency: "USD",
      name: item.description || `${dataLabel} - ${item.duration} Days`,
      dataAmount: dataLabel,
      validity: `${item.duration} Days`,
      speedInfo: speeds,
      coverage: coverageCountries || countryCode,
      features,
    };
  }

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[esimgo] Not configured — skipping plan fetch");
      return [];
    }

    try {
      const response = await this.request<{ bundles: EsimGoCatalogueItem[] }>(
        `/catalogue?countries=${countryCode.toUpperCase()}`
      );
      const catalogue = response.bundles || [];

      return catalogue.map((item) => {
        const rawMb = item.dataAmount > 0 ? item.dataAmount : 0;
        const dataGb = rawMb / 1024;
        const roundedGb = rawMb >= 1000 ? Math.round(rawMb / 1000) : Math.round(dataGb * 10) / 10;
        const dataLabel = item.unlimited
          ? "Unlimited"
          : rawMb >= 1000
            ? `${roundedGb} GB`
            : `${rawMb} MB`;

        const coverageCountries = item.countries.map((c) => c.name).join(", ");
        const speeds = item.speed.length > 0 ? item.speed.join("/") : "4G/LTE";

        const features: string[] = ["Data only", "Instant activation"];
        if (item.speed.some((s) => s.toLowerCase().includes("5g"))) {
          features.push("5G where available");
        }
        if (item.roamingEnabled && item.roamingEnabled.length > 0) {
          features.push(`Roaming in ${item.roamingEnabled.length} countries`);
        }

        return {
          provider: this.name,
          providerRef: item.name,
          countryCode: countryCode.toUpperCase(),
          dataAmountGb: item.unlimited ? 999 : dataGb,
          validityDays: item.duration,
          wholesaleCost: item.price,
          currency: "USD",
          name: item.description || `${dataLabel} - ${item.duration} Days`,
          dataAmount: dataLabel,
          validity: `${item.duration} Days`,
          speedInfo: speeds,
          coverage: coverageCountries || countryCode.toUpperCase(),
          features,
        };
      });
    } catch (err) {
      console.error("[esimgo] Failed to fetch catalogue:", err);
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
      throw new Error("eSIMGo provider not configured");
    }

    let bundleName = planDetails.providerRef;

    if (!bundleName) {
      const plans = await this.getPlans(planDetails.countryCode);
      const match = plans.find(
        (p) =>
          p.dataAmountGb >= planDetails.dataAmountGb &&
          p.validityDays >= planDetails.validityDays
      );
      if (!match || !match.providerRef) {
        throw new Error("No matching eSIMGo bundle found");
      }
      bundleName = match.providerRef;
    }

    const orderResponse = await this.request<EsimGoOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify({
        type: "transaction",
        assign: true,
        order: [
          {
            type: "bundle",
            quantity: 1,
            item: bundleName,
            allowReassign: true,
          },
        ],
      }),
    });

    const esimData = orderResponse.order[0]?.esims?.[0];
    if (!esimData) {
      throw new Error("eSIMGo order succeeded but no eSIM data returned");
    }

    const qrCodeData = `LPA:1$${esimData.smdpAddress}$${esimData.matchingId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}`;

    return {
      iccid: esimData.iccid,
      qrCodeUrl,
      activationUrl: qrCodeData,
    };
  }

  async getEsimStatus(iccid: string): Promise<string> {
    if (!this.apiKey) return "unknown";

    try {
      const esims = await this.request<any[]>(`/esims?iccid=${iccid}`);
      if (esims && esims.length > 0) {
        const esim = esims[0];
        if (esim.status) return esim.status.toLowerCase();
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }
}

export const esimgo = new EsimGoProvider();
