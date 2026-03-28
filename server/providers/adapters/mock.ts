// ─── Mock Provider Adapter ────────────────────────────────────────────────────
// Provides realistic, deterministic simulated responses for dev/testing.
// Each eSIM gets a consistent scenario seeded from its ICCID — so dashboards
// show a variety of statuses and usage levels rather than identical cards.

import type {
  ProviderAdapter, ProviderPurchaseParams, EsimProvisionResult,
  EsimUsageResult, TopupOption, TopupResult,
} from './base';

// ─── Seeded helpers ───────────────────────────────────────────────────────────

function numericSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

function randomIccid(): string {
  const digits = Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('');
  return `89` + digits;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// ─── Lifecycle scenarios (deterministic per ICCID) ───────────────────────────
// Scenario is based on seed mod 5 so we get a spread of realistic states.

type Scenario = {
  status: string;
  usagePct: number;    // 0–1 fraction of total used
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

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class MockProviderAdapter implements ProviderAdapter {
  readonly name = 'mock';

  async purchaseEsim(params: ProviderPurchaseParams): Promise<EsimProvisionResult> {
    // Simulate ~80ms provider latency
    await new Promise(r => setTimeout(r, 80));

    const iccid = randomIccid();
    const providerEsimId = randomId('MOCK');
    const dataTotalMb = Math.round(params.dataAmountGb * 1024);

    return {
      providerEsimId,
      iccid,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$esim.globesim.com$${iccid}`,
      activationUrl: `https://esim.globesim.com/activate/${iccid}`,
      manualCode: `LPA:1$esim.globesim.com$${iccid}`,
      activationStatus: 'issued',
      dataTotalMb,
      dataUsedMb: 0,
      dataRemainingMb: dataTotalMb,
    };
  }

  async getEsimStatus(providerEsimId: string): Promise<EsimUsageResult> {
    await new Promise(r => setTimeout(r, 40));

    const seed = numericSeed(providerEsimId);
    const scenario = pickScenario(seed);

    // Base total from seed: 1 GB, 3 GB, 5 GB, 10 GB, or 20 GB
    const totalOptions = [1024, 3072, 5120, 10240, 20480];
    const dataTotalMb = totalOptions[seed % totalOptions.length];
    const dataUsedMb = Math.round(dataTotalMb * scenario.usagePct);
    const dataRemainingMb = Math.max(0, dataTotalMb - dataUsedMb);
    const daysRemaining = scenario.daysRemaining;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysRemaining);

    const status = dataRemainingMb === 0
      ? 'expired'
      : daysRemaining === 0
        ? 'expired'
        : scenario.status;

    return {
      providerEsimId,
      activationStatus: status,
      dataTotalMb,
      dataUsedMb,
      dataRemainingMb,
      daysRemaining,
      expiresAt,
      lastSyncedAt: new Date(),
    };
  }

  async getTopupOptions(_providerEsimId: string): Promise<TopupOption[]> {
    return [
      { optionCode: '1gb',       name: '+1 GB',        dataAddedMb: 1024,  validityAddedDays: undefined, price: 3.00,  currency: 'USD', tag: undefined },
      { optionCode: '3gb',       name: '+3 GB',        dataAddedMb: 3072,  validityAddedDays: undefined, price: 7.00,  currency: 'USD', tag: 'Popular' },
      { optionCode: '5gb',       name: '+5 GB',        dataAddedMb: 5120,  validityAddedDays: undefined, price: 11.00, currency: 'USD', tag: undefined },
      { optionCode: 'unlimited', name: 'Go Unlimited', dataAddedMb: 0,     validityAddedDays: undefined, price: 15.00, currency: 'USD', tag: 'Best value' },
      { optionCode: '7days',     name: '+7 Days',      dataAddedMb: undefined, validityAddedDays: 7,  price: 5.00,  currency: 'USD', tag: undefined },
      { optionCode: '30days',    name: '+30 Days',     dataAddedMb: undefined, validityAddedDays: 30, price: 12.00, currency: 'USD', tag: undefined },
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
}
