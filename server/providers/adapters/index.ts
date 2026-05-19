import { MockProviderAdapter } from './mock';
import { EsimGoAdapter } from './esimgo';
import { EsimAccessAdapter } from './esimAccess';
import { ZenditAdapter } from './zendit';
import { AiraloAdapter } from './airalo';
import { FailoverProviderAdapter } from './failover';
import type { ProviderAdapter } from './base';

// PROVIDER_NAME env var lets you force a specific provider for testing.
// When unset the system auto-selects the best available option:
//   • Both keys present  → eSIMGo primary + eSIM Access fallback (recommended)
//   • Only eSIMGo key   → eSIMGo only
//   • Only eSIM Access  → eSIM Access only
//   • Neither           → Mock (dev/test only)
const PROVIDER_NAME = process.env.PROVIDER_NAME;

/** Return a specific provider adapter by its registry key, or null if unavailable.
 *  Accepts both canonical and lowercase variants for resilience:
 *    esimgo / esimGo / ESIMGO      → EsimGoAdapter
 *    esimAccess / esimaccess / ...  → EsimAccessAdapter
 */
export function getProviderAdapterByKey(key: string): ProviderAdapter | null {
  const esimgoKey = process.env.ESIMGO_API_KEY;
  const eaCode = process.env.ESIM_ACCESS_API_KEY;
  const eaSecret = process.env.ESIM_ACCESS_SECRET_KEY;

  const norm = key.toLowerCase().replace(/[_\-\s]/g, '');

  if (norm === 'esimgo') {
    if (!esimgoKey) { console.warn(`[Provider] getProviderAdapterByKey: ESIMGO_API_KEY missing`); return null; }
    return new EsimGoAdapter(esimgoKey);
  }

  if (norm === 'esimaccess') {
    if (!eaCode || !eaSecret) { console.warn(`[Provider] getProviderAdapterByKey: eSIM Access keys missing`); return null; }
    return new EsimAccessAdapter(eaCode, eaSecret);
  }

  if (norm === 'zendit') {
    const zKey = process.env.ZENDIT_API_KEY;
    if (!zKey) { console.warn(`[Provider] getProviderAdapterByKey: ZENDIT_API_KEY missing`); return null; }
    // Default to production — only use test API when ZENDIT_ENV is explicitly set to 'test'
    const zEnv = (process.env.ZENDIT_ENV ?? '').toLowerCase() === 'test' ? 'test' : 'production';
    return new ZenditAdapter(zKey, zEnv);
  }

  if (norm === 'airalo') {
    const aId     = process.env.AIRALO_CLIENT_ID;
    const aSecret = process.env.AIRALO_CLIENT_SECRET;
    if (!aId || !aSecret) { console.warn(`[Provider] getProviderAdapterByKey: AIRALO_CLIENT_ID/SECRET missing`); return null; }
    const aEnv = (process.env.AIRALO_ENV ?? '').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
    return new AiraloAdapter(aId, aSecret, aEnv);
  }

  if (norm === 'mock') {
    return new MockProviderAdapter();
  }

  console.warn(`[Provider] getProviderAdapterByKey: unknown key "${key}" (normalised: "${norm}")`);
  return null;
}

export function getActiveProvider(): ProviderAdapter {
  const esimgoKey      = process.env.ESIMGO_API_KEY;
  const eaAccessCode   = process.env.ESIM_ACCESS_API_KEY;
  const eaSecret       = process.env.ESIM_ACCESS_SECRET_KEY;
  const airaloId       = process.env.AIRALO_CLIENT_ID;
  const airaloSecret   = process.env.AIRALO_CLIENT_SECRET;

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

  if (PROVIDER_NAME === 'airalo') {
    if (!airaloId || !airaloSecret) { console.warn('[Provider] Airalo keys missing — falling back to mock'); return new MockProviderAdapter(); }
    return new AiraloAdapter(airaloId, airaloSecret, 'production');
  }

  // Auto-select: priority order is Airalo → eSIMGo → eSIM Access
  const hasAiralo    = !!(airaloId && airaloSecret);
  const hasEsimGo    = !!esimgoKey;
  const hasEsimAccess = !!(eaAccessCode && eaSecret);

  // Build ordered chain of available providers (Airalo first per priority)
  const chain: ProviderAdapter[] = [];
  if (hasAiralo)     chain.push(new AiraloAdapter(airaloId!, airaloSecret!, 'production'));
  if (hasEsimGo)     chain.push(new EsimGoAdapter(esimgoKey!));
  if (hasEsimAccess) chain.push(new EsimAccessAdapter(eaAccessCode!, eaSecret!));

  if (chain.length === 0) {
    console.warn('[Provider] No real provider keys found — using mock');
    return new MockProviderAdapter();
  }

  if (chain.length === 1) {
    console.log(`[Provider] Auto: ${chain[0].name} only`);
    return chain[0];
  }

  // Use failover adapter: primary = first in chain, secondary = second
  // For 3-provider scenario, wrap nested failovers: Airalo → (eSIMGo → eSIM Access)
  const names = chain.map(p => p.name).join(' → ');
  console.log(`[Provider] Auto: ${names}`);
  if (chain.length === 2) {
    return new FailoverProviderAdapter(chain[0], chain[1]);
  }
  return new FailoverProviderAdapter(chain[0], new FailoverProviderAdapter(chain[1], chain[2]));
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
