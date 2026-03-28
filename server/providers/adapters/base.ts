// ─── Provider Adapter Interface ──────────────────────────────────────────────
// All providers must implement this interface, making them interchangeable.

export interface EsimProvisionResult {
  providerEsimId: string;
  iccid: string;
  qrCodeUrl: string;
  activationUrl?: string;
  manualCode?: string;
  activationStatus: string;
  dataTotalMb: number;
  dataUsedMb: number;
  dataRemainingMb: number;
}

export interface EsimUsageResult {
  providerEsimId: string;
  activationStatus: string; // issued | installed | active | expired | cancelled
  dataTotalMb: number;
  dataUsedMb: number;
  dataRemainingMb: number;
  daysRemaining: number;
  expiresAt?: Date;
  lastSyncedAt: Date;
}

export interface TopupOption {
  optionCode: string;
  name: string;
  dataAddedMb?: number;
  validityAddedDays?: number;
  price: number;
  currency: string;
  tag?: string;
}

export interface TopupResult {
  providerTopupId: string;
  status: string;
  dataAddedMb?: number;
  validityAddedDays?: number;
  updatedDataRemainingMb?: number;
}

export interface ProviderPurchaseParams {
  planId: string;
  countryCode: string;
  dataAmountGb: number;
  validityDays: number;
  providerRef?: string;
  customerEmail: string;
}

export interface ProviderAdapter {
  name: string;
  purchaseEsim(params: ProviderPurchaseParams): Promise<EsimProvisionResult>;
  getEsimStatus(providerEsimId: string): Promise<EsimUsageResult>;
  getTopupOptions(providerEsimId: string): Promise<TopupOption[]>;
  purchaseTopup(providerEsimId: string, optionCode: string): Promise<TopupResult>;
}
