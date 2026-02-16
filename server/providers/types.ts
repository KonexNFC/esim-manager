export interface ProviderPlan {
  provider: string;
  providerRef?: string;
  countryCode: string;
  dataAmountGb: number;
  validityDays: number;
  wholesaleCost: number;
  currency: string;
  name: string;
  dataAmount: string;
  validity: string;
  speedInfo?: string;
  coverage: string;
  features: string[];
}

export interface ProviderOrderResult {
  iccid: string;
  qrCodeUrl: string;
  activationUrl?: string;
}

export interface EsimProvider {
  name: string;
  getPlans(countryCode: string): Promise<ProviderPlan[]>;
  purchaseEsim(planDetails: { countryCode: string; dataAmountGb: number; validityDays: number; providerRef?: string }): Promise<ProviderOrderResult>;
  getEsimStatus(iccid: string): Promise<string>;
}
