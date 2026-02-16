import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";

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

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[zendit] Not configured — skipping plan fetch");
      return [];
    }

    // TODO: Replace with real API call when key is provided
    // const res = await fetch(`${this.baseUrl}/esim/plans?country=${countryCode}`, {
    //   headers: { "X-API-Key": this.apiKey },
    // });
    // const data = await res.json();
    // return data.items.map(p => ({
    //   provider: this.name,
    //   countryCode,
    //   dataAmountGb: p.data_amount_gb,
    //   validityDays: p.validity_days,
    //   wholesaleCost: p.cost.amount / 100,
    //   currency: "USD",
    //   name: p.title,
    //   dataAmount: `${p.data_amount_gb} GB`,
    //   validity: `${p.validity_days} Days`,
    //   speedInfo: p.network_speed || "4G/LTE",
    //   coverage: p.coverage_countries?.join(", ") || countryCode,
    //   features: p.features || ["Data Only"],
    // }));

    return [];
  }

  async purchaseEsim(planDetails: {
    countryCode: string;
    dataAmountGb: number;
    validityDays: number;
  }): Promise<ProviderOrderResult> {
    if (!this.apiKey) {
      throw new Error("Zendit provider not configured");
    }

    // TODO: Replace with real API call
    // const res = await fetch(`${this.baseUrl}/esim/purchases`, {
    //   method: "POST",
    //   headers: {
    //     "X-API-Key": this.apiKey,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     country: planDetails.countryCode,
    //     data_gb: planDetails.dataAmountGb,
    //     validity_days: planDetails.validityDays,
    //   }),
    // });
    // const data = await res.json();
    // return {
    //   iccid: data.esim.iccid,
    //   qrCodeUrl: data.esim.qr_code_url,
    //   activationUrl: data.esim.activation_url,
    // };

    throw new Error("Zendit purchase not yet implemented");
  }

  async getEsimStatus(iccid: string): Promise<string> {
    if (!this.apiKey) {
      return "unknown";
    }

    // TODO: Replace with real API call
    // const res = await fetch(`${this.baseUrl}/esim/${iccid}`, {
    //   headers: { "X-API-Key": this.apiKey },
    // });
    // const data = await res.json();
    // return data.status;

    return "unknown";
  }
}

export const zendit = new ZenditProvider();
