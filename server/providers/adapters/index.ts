import { MockProviderAdapter } from './mock';
import { EsimGoAdapter } from './esimgo';
import type { ProviderAdapter } from './base';

const PROVIDER_NAME = process.env.PROVIDER_NAME || 'esimgo';

export function getActiveProvider(): ProviderAdapter {
  switch (PROVIDER_NAME) {
    case 'esimgo': {
      const key = process.env.ESIMGO_API_KEY;
      if (!key) {
        console.warn('[Provider] ESIMGO_API_KEY not set — falling back to mock');
        return new MockProviderAdapter();
      }
      return new EsimGoAdapter(key);
    }
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
