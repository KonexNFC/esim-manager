import { MockProviderAdapter } from './mock';
import type { ProviderAdapter } from './base';

const PROVIDER_NAME = process.env.PROVIDER_NAME || 'mock';

export function getActiveProvider(): ProviderAdapter {
  switch (PROVIDER_NAME) {
    case 'mock':
    default:
      return new MockProviderAdapter();
  }
}

export type {
  ProviderAdapter,
  EsimProvisionResult,
  EsimStatusResult,
  EsimUsageResult,
  EsimBalanceResult,
  EsimQrCodeResult,
  EsimSyncResult,
  TopupOption,
  TopupResult,
  ProviderPlan,
  ProviderPurchaseParams,
  CustomerContext,
} from './base';
