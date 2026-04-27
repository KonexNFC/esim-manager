export type CoverageType = "country" | "regional" | "global";

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
  /** Whether this plan covers a single country, a multi-country region, or the whole world. */
  coverageType?: CoverageType;
}

export interface ProviderOrderResult {
  iccid: string;
  qrCodeUrl: string;
  activationUrl?: string;
  apn?: string;
}

export interface EsimProvider {
  name: string;
  getPlans(countryCode: string): Promise<ProviderPlan[]>;
  purchaseEsim(planDetails: { countryCode: string; dataAmountGb: number; validityDays: number; providerRef?: string }): Promise<ProviderOrderResult>;
  getEsimStatus(iccid: string): Promise<string>;
}
