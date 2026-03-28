import { MockProviderAdapter } from './mock';
import { EsimGoAdapter } from './esimgo';
import { EsimAccessAdapter } from './esimAccess';
import { FailoverProviderAdapter } from './failover';
import type { ProviderAdapter } from './base';

// PROVIDER_NAME env var lets you force a specific provider for testing.
// When unset the system auto-selects the best available option:
//   • Both keys present  → eSIMGo primary + eSIM Access fallback (recommended)
//   • Only eSIMGo key   → eSIMGo only
//   • Only eSIM Access  → eSIM Access only
//   • Neither           → Mock (dev/test only)
const PROVIDER_NAME = process.env.PROVIDER_NAME;

export function getActiveProvider(): ProviderAdapter {
  const esimgoKey = process.env.ESIMGO_API_KEY;
  const eaAccessCode = process.env.ESIM_ACCESS_API_KEY;
  const eaSecret = process.env.ESIM_ACCESS_SECRET_KEY;

  // Explicit override
  if (PROVIDER_NAME === 'mock') return new MockProviderAdapter();

  if (PROVIDER_NAME === 'esimgo') {
    if (!esimgoKey) { console.warn('[Provider] ESIMGO_API_KEY missing — falling back to mock'); return new MockProviderAdapter(); }
    return new EsimGoAdapter(esimgoKey);
  }

  if (PROVIDER_NAME === 'esimAccess') {
    if (!eaAccessCode || !eaSecret) { console.warn('[Provider] eSIM Access keys missing — falling back to mock'); return new MockProviderAdapter(); }
    return new EsimAccessAdapter(eaAccessCode, eaSecret);
  }

  // Auto-select: prefer failover when both providers are configured
  const hasEsimGo = !!esimgoKey;
  const hasEsimAccess = !!(eaAccessCode && eaSecret);

  if (hasEsimGo && hasEsimAccess) {
    console.log('[Provider] Auto: eSIMGo (primary) + eSIM Access (failover)');
    return new FailoverProviderAdapter(
      new EsimGoAdapter(esimgoKey!),
      new EsimAccessAdapter(eaAccessCode!, eaSecret!),
    );
  }

  if (hasEsimGo) {
    console.log('[Provider] Auto: eSIMGo only');
    return new EsimGoAdapter(esimgoKey!);
  }

  if (hasEsimAccess) {
    console.log('[Provider] Auto: eSIM Access only');
    return new EsimAccessAdapter(eaAccessCode!, eaSecret!);
  }

  console.warn('[Provider] No real provider keys found — using mock');
  return new MockProviderAdapter();
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
