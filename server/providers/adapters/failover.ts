// ─── Failover Provider Adapter ───────────────────────────────────────────────
// Tries the primary provider for each operation. If it throws, automatically
// retries with the secondary. Provisioning failures trigger a full fallback;
// status/usage/sync failures fall back silently.

import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

export class FailoverProviderAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(
    private readonly primary: ProviderAdapter,
    private readonly secondary: ProviderAdapter,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
  }

  // ── Provisioning (hard failover — try primary, then secondary) ──────────

  async purchaseEsim(params: ProviderPurchaseParams, ctx?: CustomerContext): Promise<EsimProvisionResult> {
    try {
      const result = await this.primary.purchaseEsim(params, ctx);
      console.log(`[failover] purchaseEsim succeeded via ${this.primary.name}`);
      return result;
    } catch (primaryErr: any) {
      console.warn(`[failover] ${this.primary.name} purchaseEsim failed (${primaryErr.message}), trying ${this.secondary.name}…`);
      try {
        const result = await this.secondary.purchaseEsim(params, ctx);
        console.log(`[failover] purchaseEsim succeeded via ${this.secondary.name} (fallback)`);
        return result;
      } catch (secondaryErr: any) {
        console.error(`[failover] Both providers failed. Primary: ${primaryErr.message} | Secondary: ${secondaryErr.message}`);
        throw new Error(`All providers failed — ${this.primary.name}: ${primaryErr.message} | ${this.secondary.name}: ${secondaryErr.message}`);
      }
    }
  }

  // ── Status & Usage (try primary, fall back silently) ────────────────────

  async getEsimStatus(id: string): Promise<EsimStatusResult> {
    try { return await this.primary.getEsimStatus(id); }
    catch { return this.secondary.getEsimStatus(id); }
  }

  async getEsimUsage(id: string): Promise<EsimUsageResult> {
    try { return await this.primary.getEsimUsage(id); }
    catch { return this.secondary.getEsimUsage(id); }
  }

  async getEsimBalance(id: string): Promise<EsimBalanceResult> {
    try { return await this.primary.getEsimBalance(id); }
    catch { return this.secondary.getEsimBalance(id); }
  }

  async getEsimQrCode(id: string): Promise<EsimQrCodeResult> {
    try { return await this.primary.getEsimQrCode(id); }
    catch { return this.secondary.getEsimQrCode(id); }
  }

  async syncEsim(id: string): Promise<EsimSyncResult> {
    try { return await this.primary.syncEsim(id); }
    catch { return this.secondary.syncEsim(id); }
  }

  // ── Top-ups (follow same failover pattern) ──────────────────────────────

  async getTopupOptions(id: string): Promise<TopupOption[]> {
    try {
      const opts = await this.primary.getTopupOptions(id);
      if (opts.length > 0) return opts;
      throw new Error('empty');
    } catch {
      return this.secondary.getTopupOptions(id);
    }
  }

  async purchaseTopup(id: string, optionCode: string): Promise<TopupResult> {
    try { return await this.primary.purchaseTopup(id, optionCode); }
    catch (e: any) {
      console.warn(`[failover] ${this.primary.name} purchaseTopup failed, trying ${this.secondary.name}…`);
      return this.secondary.purchaseTopup(id, optionCode);
    }
  }

  // ── Plans (merge both providers' catalogues) ────────────────────────────

  async getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]> {
    const [primary, secondary] = await Promise.allSettled([
      this.primary.getSupportedPlans(countryCode),
      this.secondary.getSupportedPlans(countryCode),
    ]);
    const p = primary.status  === 'fulfilled' ? primary.value  : [];
    const s = secondary.status === 'fulfilled' ? secondary.value : [];
    return [...p, ...s];
  }
}
