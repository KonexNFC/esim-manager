import { MockProviderAdapter } from './mock';
import { EsimGoAdapter } from './esimgo';
import { EsimAccessAdapter } from './esimAccess';
import { ZenditAdapter } from './zendit';
import { AiraloAdapter } from './airalo';
import type { ProviderAdapter } from './base';

// PROVIDER_NAME is an explicit adapter choice for health/import tooling. It is
// not a purchase-selection policy; purchase paths must supply a routed key.
const PROVIDER_NAME = process.env.PROVIDER_NAME;

/** Return a specific provider adapter by its registry key, or null if unavailable.
 *  Accepts both canonical and lowercase variants for resilience:
 *    esimgo / esimGo / ESIMGO      → EsimGoAdapter
 *    esimAccess / esimaccess / ...  → EsimAccessAdapter
 */
export function getProviderAdapterByKey(key: string): ProviderAdapter | null {
  const esimgoKey = process.env.ESIMGO_API_KEY;
  // Accept both naming conventions for backward compatibility
  const eaCode   = process.env.ESIM_ACCESS_API_KEY   || process.env.ESIMACCESS_API_KEY;
  const eaSecret = process.env.ESIM_ACCESS_SECRET_KEY || process.env.ESIMACCESS_PARTNER_ID || process.env.ESIMACCESS_SECRET_KEY;

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
  // Accept both naming conventions for backward compatibility
  const eaAccessCode   = process.env.ESIM_ACCESS_API_KEY   || process.env.ESIMACCESS_API_KEY;
  const eaSecret       = process.env.ESIM_ACCESS_SECRET_KEY || process.env.ESIMACCESS_PARTNER_ID || process.env.ESIMACCESS_SECRET_KEY;
  const airaloId       = process.env.AIRALO_CLIENT_ID;
  const airaloSecret   = process.env.AIRALO_CLIENT_SECRET;

  if (PROVIDER_NAME) {
    const selected = getProviderAdapterByKey(PROVIDER_NAME);
    if (!selected) throw new Error(`Configured provider "${PROVIDER_NAME}" is unavailable`);
    return selected;
  }

  const configured = [
    esimgoKey ? 'esimgo' : null,
    eaAccessCode && eaSecret ? 'esimaccess' : null,
    airaloId && airaloSecret ? 'airalo' : null,
  ].filter((key): key is string => Boolean(key));

  if (configured.length > 1) {
    throw new Error(
      `Multiple providers are configured (${configured.join(', ')}); getActiveProvider requires an explicit provider key`,
    );
  }
  if (configured.length === 1) {
    const selected = getProviderAdapterByKey(configured[0]);
    if (!selected) throw new Error(`Configured provider "${configured[0]}" is unavailable`);
    return selected;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[Provider] No real provider keys found — using mock outside production');
    return new MockProviderAdapter();
  }
  throw new Error('No provider is configured; route a provider key before performing provider work');
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
