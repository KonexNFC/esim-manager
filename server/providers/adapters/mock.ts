// ─── Mock Provider Adapter ────────────────────────────────────────────────────
// Provides realistic, deterministic simulated responses for dev/testing.
// Each eSIM gets a consistent scenario seeded from its providerEsimId so
// dashboards show a variety of statuses and usage levels rather than identical cards.

import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

// ─── Seeded helpers ───────────────────────────────────────────────────────────

function numericSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  return h;
}

function randomIccid(): string {
  const digits = Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('');
  return `89` + digits;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// ─── Lifecycle scenarios (deterministic per providerEsimId) ──────────────────

type Scenario = {
  status: string;
  usagePct: number;
  daysRemaining: number;
  description: string;
};

function pickScenario(seed: number): Scenario {
  const scenarios: Scenario[] = [
    { status: 'issued',    usagePct: 0,    daysRemaining: 30, description: 'Ready to install' },
    { status: 'installed', usagePct: 0.05, daysRemaining: 28, description: 'Installed, not yet active' },
    { status: 'active',    usagePct: 0.32, daysRemaining: 22, description: 'Normal active usage' },
    { status: 'active',    usagePct: 0.85, daysRemaining: 18, description: 'Active — low data warning' },
    { status: 'active',    usagePct: 0.55, daysRemaining: 2,  description: 'Active — expiring soon' },
  ];
  return scenarios[seed % scenarios.length];
}

function resolveUsageFromSeed(providerEsimId: string): {
  dataTotalMb: number; dataUsedMb: number; dataRemainingMb: number;
  daysRemaining: number; activationStatus: string; expiresAt: Date;
} {
  const seed = numericSeed(providerEsimId);
  const scenario = pickScenario(seed);
  const totalOptions = [1024, 3072, 5120, 10240, 20480];
  const dataTotalMb = totalOptions[seed % totalOptions.length];
  const dataUsedMb = Math.round(dataTotalMb * scenario.usagePct);
  const dataRemainingMb = Math.max(0, dataTotalMb - dataUsedMb);
  const daysRemaining = scenario.daysRemaining;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysRemaining);
  const activationStatus = dataRemainingMb === 0 || daysRemaining === 0 ? 'expired' : scenario.status;
  return { dataTotalMb, dataUsedMb, dataRemainingMb, daysRemaining, activationStatus, expiresAt };
}

// ─── Sample supported plans ───────────────────────────────────────────────────

const MOCK_PLANS: ProviderPlan[] = [
  { providerPlanCode: 'MOCK_EU_1GB_7D',  name: 'Europe 1 GB / 7 Days',   destination: 'Europe',        region: 'Europe',       dataMb: 1024,  durationDays: 7,  priceMinor: 599,  currency: 'USD', isActive: true },
  { providerPlanCode: 'MOCK_EU_3GB_30D', name: 'Europe 3 GB / 30 Days',  destination: 'Europe',        region: 'Europe',       dataMb: 3072,  durationDays: 30, priceMinor: 1499, currency: 'USD', isActive: true },
  { providerPlanCode: 'MOCK_US_5GB_30D', name: 'USA 5 GB / 30 Days',     destination: 'United States', region: 'North America', dataMb: 5120,  durationDays: 30, priceMinor: 1999, currency: 'USD', isActive: true },
  { providerPlanCode: 'MOCK_GL_10GB_30D',name: 'Global 10 GB / 30 Days', destination: 'Global',        region: 'Global',       dataMb: 10240, durationDays: 30, priceMinor: 3999, currency: 'USD', isActive: true },
  { providerPlanCode: 'MOCK_AS_2GB_15D', name: 'Asia 2 GB / 15 Days',    destination: 'Asia',          region: 'Asia',         dataMb: 2048,  durationDays: 15, priceMinor: 999,  currency: 'USD', isActive: true },
];

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class MockProviderAdapter implements ProviderAdapter {
  readonly name = 'mock';

  // ── Provisioning ────────────────────────────────────────────────────────────

  async purchaseEsim(params: ProviderPurchaseParams, _ctx?: CustomerContext): Promise<EsimProvisionResult> {
    await new Promise(r => setTimeout(r, 80));

    const iccid = randomIccid();
    const providerEsimId = randomId('MOCK');
    const dataTotalMb = Math.round(params.dataAmountGb * 1024);

    return {
      providerEsimId,
      iccid,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$esim.konexesim.com$${iccid}`,
      activationUrl: `https://esim.konexesim.com/activate/${iccid}`,
      manualCode: `LPA:1$esim.konexesim.com$${iccid}`,
      activationStatus: 'issued',
      dataTotalMb,
      dataUsedMb: 0,
      dataRemainingMb: dataTotalMb,
    };
  }

  async assignExistingEsim(params: ProviderPurchaseParams, ctx?: CustomerContext): Promise<EsimProvisionResult> {
    return this.purchaseEsim(params, ctx);
  }

  // ── Status & Usage ──────────────────────────────────────────────────────────

  async getEsimStatus(providerEsimId: string): Promise<EsimStatusResult> {
    await new Promise(r => setTimeout(r, 40));
    const { activationStatus } = resolveUsageFromSeed(providerEsimId);
    return { providerEsimId, activationStatus, lastSyncedAt: new Date() };
  }

  async getEsimUsage(providerEsimId: string): Promise<EsimUsageResult> {
    await new Promise(r => setTimeout(r, 40));
    const { dataTotalMb, dataUsedMb, dataRemainingMb, daysRemaining, expiresAt } =
      resolveUsageFromSeed(providerEsimId);
    return {
      providerEsimId, dataTotalMb, dataUsedMb, dataRemainingMb,
      daysRemaining, expiresAt, lastSyncedAt: new Date(),
    };
  }

  async getEsimBalance(providerEsimId: string): Promise<EsimBalanceResult> {
    await new Promise(r => setTimeout(r, 40));
    const { dataRemainingMb, daysRemaining, expiresAt } = resolveUsageFromSeed(providerEsimId);
    return { providerEsimId, dataRemainingMb, daysRemaining, expiresAt };
  }

  async getEsimQrCode(providerEsimId: string): Promise<EsimQrCodeResult> {
    await new Promise(r => setTimeout(r, 30));
    const seed = numericSeed(providerEsimId);
    const fakeIccid = `89${seed.toString().padStart(17, '0').slice(0, 17)}`;
    return {
      providerEsimId,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$esim.konexesim.com$${fakeIccid}`,
      manualCode: `LPA:1$esim.konexesim.com$${fakeIccid}`,
      activationUrl: `https://esim.konexesim.com/activate/${fakeIccid}`,
    };
  }

  // ── Sync (combined) ──────────────────────────────────────────────────────────

  async syncEsim(providerEsimId: string): Promise<EsimSyncResult> {
    await new Promise(r => setTimeout(r, 60));
    const { dataTotalMb, dataUsedMb, dataRemainingMb, daysRemaining, activationStatus, expiresAt } =
      resolveUsageFromSeed(providerEsimId);
    const seed = numericSeed(providerEsimId);
    const fakeIccid = `89${seed.toString().padStart(17, '0').slice(0, 17)}`;
    return {
      providerEsimId, activationStatus,
      dataTotalMb, dataUsedMb, dataRemainingMb, daysRemaining, expiresAt,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$esim.konexesim.com$${fakeIccid}`,
      manualCode: `LPA:1$esim.konexesim.com$${fakeIccid}`,
      lastSyncedAt: new Date(),
    };
  }

  // ── Top-ups ──────────────────────────────────────────────────────────────────

  async getTopupOptions(_providerEsimId: string): Promise<TopupOption[]> {
    return [
      { optionCode: '1gb',       name: '+1 GB',        dataAddedMb: 1024,   price: 3.00,  currency: 'USD' },
      { optionCode: '3gb',       name: '+3 GB',        dataAddedMb: 3072,   price: 7.00,  currency: 'USD', tag: 'Popular' },
      { optionCode: '5gb',       name: '+5 GB',        dataAddedMb: 5120,   price: 11.00, currency: 'USD' },
      { optionCode: 'unlimited', name: 'Go Unlimited', dataAddedMb: 999999, price: 15.00, currency: 'USD', tag: 'Best value' },
      { optionCode: '7days',     name: '+7 Days',      validityAddedDays: 7,  price: 5.00,  currency: 'USD' },
      { optionCode: '30days',    name: '+30 Days',     validityAddedDays: 30, price: 12.00, currency: 'USD' },
    ];
  }

  async purchaseTopup(providerEsimId: string, optionCode: string): Promise<TopupResult> {
    await new Promise(r => setTimeout(r, 80));

    const optionMap: Record<string, { dataAddedMb?: number; validityAddedDays?: number }> = {
      '1gb':       { dataAddedMb: 1024 },
      '3gb':       { dataAddedMb: 3072 },
      '5gb':       { dataAddedMb: 5120 },
      'unlimited': { dataAddedMb: 999999 },
      '7days':     { validityAddedDays: 7 },
      '30days':    { validityAddedDays: 30 },
    };

    const option = optionMap[optionCode] ?? { dataAddedMb: 1024 };

    return {
      providerTopupId: randomId('TOPUP'),
      status: 'completed',
      dataAddedMb: option.dataAddedMb,
      validityAddedDays: option.validityAddedDays,
    };
  }

  // ── Plans ────────────────────────────────────────────────────────────────────

  async getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]> {
    await new Promise(r => setTimeout(r, 50));
    if (!countryCode) return MOCK_PLANS;
    return MOCK_PLANS.filter(p =>
      p.destination.toLowerCase().includes(countryCode.toLowerCase()) ||
      p.region.toLowerCase().includes(countryCode.toLowerCase())
    );
  }
}
