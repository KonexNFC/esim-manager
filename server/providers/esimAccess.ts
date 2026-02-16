import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";

export class EsimAccessProvider implements EsimProvider {
  name = "esimAccess";
  private apiKey: string | undefined;
  private baseUrl = "https://api.esim-access.com/v1";

  constructor() {
    this.apiKey = process.env.ESIM_ACCESS_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[esimAccess] Not configured — skipping plan fetch");
      return [];
    }

    // TODO: Replace with real API call when key is provided
    // const res = await fetch(`${this.baseUrl}/plans?country=${countryCode}`, {
    //   headers: { "Authorization": `Bearer ${this.apiKey}` },
    // });
    // const data = await res.json();
    // return data.plans.map(p => ({
    //   provider: this.name,
    //   countryCode,
    //   dataAmountGb: p.data_gb,
    //   validityDays: p.validity_days,
    //   wholesaleCost: p.price,
    //   currency: "USD",
    //   name: p.name,
    //   dataAmount: `${p.data_gb} GB`,
    //   validity: `${p.validity_days} Days`,
    //   speedInfo: p.speed || "4G/LTE",
    //   coverage: p.coverage || countryCode,
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
      throw new Error("esimAccess provider not configured");
    }

    // TODO: Replace with real API call
    // const res = await fetch(`${this.baseUrl}/orders`, {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${this.apiKey}`,
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
    //   iccid: data.iccid,
    //   qrCodeUrl: data.qr_code_url,
    //   activationUrl: data.activation_url,
    // };

    throw new Error("esimAccess purchase not yet implemented");
  }

  async getEsimStatus(iccid: string): Promise<string> {
    if (!this.apiKey) {
      return "unknown";
    }

    // TODO: Replace with real API call
    // const res = await fetch(`${this.baseUrl}/esims/${iccid}/status`, {
    //   headers: { "Authorization": `Bearer ${this.apiKey}` },
    // });
    // const data = await res.json();
    // return data.status;

    return "unknown";
  }
}

export const esimAccess = new EsimAccessProvider();
