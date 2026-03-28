// ─── eSIMGo Provider Adapter ─────────────────────────────────────────────────
// Wraps the eSIMGo REST API (v2.5) to implement the standard ProviderAdapter
// interface used by the fulfillment service.

import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

const BASE_URL = 'https://api.esim-go.com/v2.5';

export class EsimGoAdapter implements ProviderAdapter {
  name = 'esimgo';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async req<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers: {
        'X-API-Key': this.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eSIMGo ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]> {
    const qs = countryCode ? `?countries=${countryCode.toUpperCase()}` : '';
    const data = await this.req<{ bundles: any[] }>(`/catalogue${qs}`);
    return (data.bundles ?? []).map(b => {
      const rawMb: number = b.dataAmount > 0 ? b.dataAmount : 0;
      const isUnlimited: boolean = b.unlimited || b.dataAmount < 0;
      const dataMb = isUnlimited ? 999_999 : rawMb;
      const dataGb = isUnlimited ? 999 : rawMb / 1024;
      const roundedGb = rawMb >= 1000 ? Math.round(rawMb / 1000) : Math.round(dataGb * 10) / 10;
      const dataLabel = isUnlimited ? 'Unlimited' : rawMb >= 1000 ? `${roundedGb} GB` : `${rawMb} MB`;
      return {
        providerPlanCode: b.name,
        name: b.description || `${dataLabel} — ${b.duration} Days`,
        destination: (b.countries ?? []).map((c: any) => c.name).join(', '),
        region: (b.countries ?? [])[0]?.region ?? '',
        dataMb,
        durationDays: b.duration,
        priceMinor: Math.round(b.price * 100),
        currency: 'USD',
        isActive: true,
      };
    });
  }

  // ── Provisioning ───────────────────────────────────────────────────────────

  async purchaseEsim(params: ProviderPurchaseParams, _ctx?: CustomerContext): Promise<EsimProvisionResult> {
    let bundleName = params.providerRef;

    if (!bundleName) {
      const plans = await this.getSupportedPlans(params.countryCode);
      const match = plans.find(p =>
        p.dataMb >= params.dataAmountGb * 1024 &&
        p.durationDays >= params.validityDays
      );
      if (!match) throw new Error(`No eSIMGo bundle found for ${params.countryCode} ${params.dataAmountGb}GB/${params.validityDays}d`);
      bundleName = match.providerPlanCode;
    }

    console.log(`[esimgo] Ordering bundle "${bundleName}" for ${params.countryCode}`);

    const order = await this.req<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transaction',
        assign: true,
        order: [{ type: 'bundle', quantity: 1, item: bundleName, allowReassign: true }],
      }),
    });

    const esimData = order.order?.[0]?.esims?.[0];
    if (!esimData) throw new Error('eSIMGo order succeeded but returned no eSIM data');

    const activationUrl = `LPA:1$${esimData.smdpAddress}$${esimData.matchingId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`;
    const dataMb = params.dataAmountGb * 1024;

    console.log(`[esimgo] Provisioned ICCID=${esimData.iccid} bundle=${bundleName}`);

    return {
      providerEsimId: esimData.iccid,
      iccid: esimData.iccid,
      qrCodeUrl,
      activationUrl,
      manualCode: esimData.matchingId,
      activationStatus: 'issued',
      dataTotalMb: dataMb,
      dataUsedMb: 0,
      dataRemainingMb: dataMb,
    };
  }

  // ── Status & Usage ─────────────────────────────────────────────────────────

  async getEsimStatus(iccid: string): Promise<EsimStatusResult> {
    try {
      const data = await this.req<any[]>(`/esims?iccid=${iccid}`);
      const esim = Array.isArray(data) ? data[0] : data;
      return {
        providerEsimId: iccid,
        activationStatus: esim?.status?.toLowerCase() ?? 'issued',
        lastSyncedAt: new Date(),
      };
    } catch {
      return { providerEsimId: iccid, activationStatus: 'issued', lastSyncedAt: new Date() };
    }
  }

  async getEsimUsage(iccid: string): Promise<EsimUsageResult> {
    try {
      const data = await this.req<any[]>(`/esims?iccid=${iccid}`);
      const esim = Array.isArray(data) ? data[0] : data;
      const totalMb = esim?.allocatedData ?? 0;
      const usedMb = esim?.usedData ?? 0;
      const remaining = Math.max(0, totalMb - usedMb);
      const daysRem = esim?.daysRemaining ?? esim?.validityDays ?? 0;
      const expiresAt = esim?.expiryDate ? new Date(esim.expiryDate) : undefined;
      return {
        providerEsimId: iccid,
        dataTotalMb: totalMb,
        dataUsedMb: usedMb,
        dataRemainingMb: remaining,
        daysRemaining: daysRem,
        expiresAt,
        lastSyncedAt: new Date(),
      };
    } catch {
      return { providerEsimId: iccid, dataTotalMb: 0, dataUsedMb: 0, dataRemainingMb: 0, daysRemaining: 0, lastSyncedAt: new Date() };
    }
  }

  async getEsimBalance(iccid: string): Promise<EsimBalanceResult> {
    const u = await this.getEsimUsage(iccid);
    return { providerEsimId: iccid, dataRemainingMb: u.dataRemainingMb, daysRemaining: u.daysRemaining, expiresAt: u.expiresAt };
  }

  async getEsimQrCode(iccid: string): Promise<EsimQrCodeResult> {
    try {
      const data = await this.req<any[]>(`/esims?iccid=${iccid}`);
      const esim = Array.isArray(data) ? data[0] : data;
      if (esim?.smdpAddress && esim?.matchingId) {
        const activationUrl = `LPA:1$${esim.smdpAddress}$${esim.matchingId}`;
        return {
          providerEsimId: iccid,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`,
          manualCode: esim.matchingId,
          activationUrl,
        };
      }
    } catch { /* fall through */ }
    return { providerEsimId: iccid, qrCodeUrl: '' };
  }

  async syncEsim(iccid: string): Promise<EsimSyncResult> {
    const [status, usage] = await Promise.all([
      this.getEsimStatus(iccid),
      this.getEsimUsage(iccid),
    ]);
    const qr = await this.getEsimQrCode(iccid);
    return {
      providerEsimId: iccid,
      activationStatus: status.activationStatus,
      dataTotalMb: usage.dataTotalMb,
      dataUsedMb: usage.dataUsedMb,
      dataRemainingMb: usage.dataRemainingMb,
      daysRemaining: usage.daysRemaining,
      expiresAt: usage.expiresAt,
      qrCodeUrl: qr.qrCodeUrl || undefined,
      manualCode: qr.manualCode,
      lastSyncedAt: new Date(),
    };
  }

  // ── Top-ups ────────────────────────────────────────────────────────────────

  async getTopupOptions(iccid: string): Promise<TopupOption[]> {
    try {
      const data = await this.req<any[]>(`/esims/${iccid}/topup-options`);
      return (data ?? []).map((opt: any) => ({
        optionCode: opt.name,
        name: opt.description ?? opt.name,
        dataAddedMb: opt.dataAmount > 0 ? opt.dataAmount : undefined,
        validityAddedDays: opt.duration ?? undefined,
        price: opt.price,
        currency: 'USD',
      }));
    } catch {
      return [];
    }
  }

  async purchaseTopup(iccid: string, optionCode: string): Promise<TopupResult> {
    const order = await this.req<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transaction',
        assign: true,
        order: [{ type: 'bundle', quantity: 1, item: optionCode, iccid }],
      }),
    });
    return {
      providerTopupId: order.orderReference ?? `esimgo_topup_${Date.now()}`,
      status: 'completed',
      dataAddedMb: undefined,
      validityAddedDays: undefined,
    };
  }
}
