// ─── Provider Adapter Interface ──────────────────────────────────────────────
// All providers must implement this interface, making them interchangeable.
// Switch providers by setting PROVIDER_NAME env var (default: mock).

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
  apn?: string;
}

export interface EsimStatusResult {
  providerEsimId: string;
  activationStatus: string; // issued | installed | active | expired | cancelled
  lastSyncedAt: Date;
}

export interface EsimUsageResult {
  providerEsimId: string;
  dataTotalMb: number;
  dataUsedMb: number;
  dataRemainingMb: number;
  daysRemaining: number;
  expiresAt?: Date;
  lastSyncedAt: Date;
}

export interface EsimBalanceResult {
  providerEsimId: string;
  dataRemainingMb: number;
  daysRemaining: number;
  expiresAt?: Date;
}

export interface EsimQrCodeResult {
  providerEsimId: string;
  qrCodeUrl: string;
  manualCode?: string;
  activationUrl?: string;
}

export interface EsimSyncResult {
  providerEsimId: string;
  activationStatus: string;
  dataTotalMb: number;
  dataUsedMb: number;
  dataRemainingMb: number;
  daysRemaining: number;
  expiresAt?: Date;
  qrCodeUrl?: string;
  manualCode?: string;
  lastSyncedAt: Date;
}

export interface ProviderPlan {
  providerPlanCode: string;
  name: string;
  destination: string;
  region: string;
  dataMb: number;
  durationDays: number;
  priceMinor: number;
  currency: string;
  isActive: boolean;
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
  planId?: string;
  countryCode: string;
  dataAmountGb: number;
  validityDays: number;
  providerRef?: string;
  /** Caller-reserved idempotency key for providers with asynchronous purchases. */
  providerTransactionId?: string;
  customerEmail: string;
}

export interface CustomerContext {
  email: string;
  userId?: string;
  name?: string;
}

export interface ProviderAdapter {
  name: string;

  // ── Provisioning ────────────────────────────────────
  purchaseEsim(params: ProviderPurchaseParams, customerContext?: CustomerContext): Promise<EsimProvisionResult>;
  /**
   * Check a provider purchase that was already charged but did not finish
   * before the request timeout. This must never create a second purchase.
   * Returns null while the provider is still allocating the profile.
   */
  reconcilePendingPurchase?(providerEsimId: string, params: ProviderPurchaseParams): Promise<EsimProvisionResult | null>;
  assignExistingEsim?(params: ProviderPurchaseParams, customerContext?: CustomerContext): Promise<EsimProvisionResult>;

  // ── Status & Usage ──────────────────────────────────
  getEsimStatus(providerEsimId: string): Promise<EsimStatusResult>;
  getEsimUsage(providerEsimId: string): Promise<EsimUsageResult>;
  getEsimBalance(providerEsimId: string): Promise<EsimBalanceResult>;
  getEsimQrCode(providerEsimId: string): Promise<EsimQrCodeResult>;

  // ── Sync (combined status + usage) ──────────────────
  syncEsim(providerEsimId: string): Promise<EsimSyncResult>;

  // ── Top-ups ─────────────────────────────────────────
  getTopupOptions(providerEsimId: string): Promise<TopupOption[]>;
  purchaseTopup(providerEsimId: string, optionCode: string): Promise<TopupResult>;

  // ── Plans ───────────────────────────────────────────
  getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]>;
}
