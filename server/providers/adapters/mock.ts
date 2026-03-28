// ─── Mock Provider Adapter ────────────────────────────────────────────────────
// Provides realistic simulated responses for development and testing.
// Replace with a real provider adapter when API credentials are available.

import type {
  ProviderAdapter, ProviderPurchaseParams, EsimProvisionResult,
  EsimUsageResult, TopupOption, TopupResult,
} from './base';

function randomIccid(): string {
  const digits = Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('');
  return `89` + digits;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export class MockProviderAdapter implements ProviderAdapter {
  name = 'mock';

  async purchaseEsim(params: ProviderPurchaseParams): Promise<EsimProvisionResult> {
    // Simulate ~100ms provider latency
    await new Promise(r => setTimeout(r, 100));

    const iccid = randomIccid();
    const providerEsimId = randomId('MOCK_ESIM');
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
    await new Promise(r => setTimeout(r, 50));

    // Simulate semi-realistic usage — seed from provider ID for consistency
    const seed = providerEsimId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const dataTotalMb = 5120; // 5 GB
    const dataUsedMb = (seed % 4096); // 0-4 GB used
    const dataRemainingMb = Math.max(0, dataTotalMb - dataUsedMb);
    const daysRemaining = 30 - (seed % 28);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysRemaining);

    return {
      providerEsimId,
      activationStatus: dataRemainingMb > 0 && daysRemaining > 0 ? 'active' : 'expired',
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
      { optionCode: '1gb',       name: '+1 GB',        dataAddedMb: 1024,  price: 3.00,  currency: 'USD', tag: undefined },
      { optionCode: '3gb',       name: '+3 GB',        dataAddedMb: 3072,  price: 7.00,  currency: 'USD', tag: 'Popular' },
      { optionCode: '5gb',       name: '+5 GB',        dataAddedMb: 5120,  price: 11.00, currency: 'USD', tag: undefined },
      { optionCode: 'unlimited', name: 'Go Unlimited',  dataAddedMb: 0,     price: 15.00, currency: 'USD', tag: 'Best value' },
      { optionCode: '7days',     name: '+7 Days',       validityAddedDays: 7, price: 5.00, currency: 'USD', tag: undefined },
      { optionCode: '30days',    name: '+30 Days',      validityAddedDays: 30, price: 12.00, currency: 'USD', tag: undefined },
    ];
  }

  async purchaseTopup(providerEsimId: string, optionCode: string): Promise<TopupResult> {
    await new Promise(r => setTimeout(r, 100));

    const optionMap: Record<string, { dataAddedMb?: number; validityAddedDays?: number }> = {
      '1gb':       { dataAddedMb: 1024 },
      '3gb':       { dataAddedMb: 3072 },
      '5gb':       { dataAddedMb: 5120 },
      'unlimited': { dataAddedMb: 999999 },
      '7days':     { validityAddedDays: 7 },
      '30days':    { validityAddedDays: 30 },
    };

    const option = optionMap[optionCode] || { dataAddedMb: 1024 };

    return {
      providerTopupId: randomId('TOPUP'),
      status: 'completed',
      dataAddedMb: option.dataAddedMb,
      validityAddedDays: option.validityAddedDays,
      updatedDataRemainingMb: option.dataAddedMb ? option.dataAddedMb + 2048 : undefined,
    };
  }
}
