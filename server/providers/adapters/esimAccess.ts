// ─── eSIM Access Provider Adapter ────────────────────────────────────────────
// Implements ProviderAdapter using the eSIM Access REST API.
// Auth: HMAC-SHA256 signed requests (RT-AccessCode + RT-Signature headers).
// Docs: https://www.esimaccess.com/open-api

import crypto from 'crypto';
import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

const BASE_URL = 'https://api.esimaccess.com/api/v1/open';

// eSIM Access esimStatus string → normalised internal status
const STATUS_MAP: Record<string, string> = {
  'GOT_RESOURCE': 'issued',
  'RELEASED':     'issued',
  'USED_UP':      'consumed',
  'EXPIRED':      'expired',
  'CANCEL':       'cancelled',
  'INSTALLED':    'installed',
  'ENABLED':      'active',
  'DELETED':      'expired',
};

function normStatus(s: string | undefined): string {
  if (!s) return 'issued';
  return STATUS_MAP[s.toUpperCase()] ?? s.toLowerCase();
}

// eSIM Access price unit is 10,000ths of USD (e.g. 10000 = $1.00)
function priceToUsd(raw: number): number { return raw / 10_000; }

export class EsimAccessAdapter implements ProviderAdapter {
  name = 'esimAccess';
  private accessCode: string;
  private secretKey: string;

  constructor(accessCode: string, secretKey: string) {
    this.accessCode = accessCode;
    this.secretKey = secretKey;
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  private sign(body: string, timestamp: string, requestId: string): string {
    const data = timestamp + requestId + this.accessCode + body;
    return crypto.createHmac('sha256', this.secretKey).update(data).digest('hex').toLowerCase();
  }

  private async req<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const timestamp = Date.now().toString();
    const requestId = crypto.randomUUID().replace(/-/g, '');
    const signature = this.sign(bodyStr, timestamp, requestId);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'RT-AccessCode': this.accessCode,
        'RT-RequestID': requestId,
        'RT-Timestamp': timestamp,
        'RT-Signature': signature,
      },
      body: bodyStr,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eSIM Access ${res.status}: ${text}`);
    }

    const data = await res.json() as any;
    if (data.success === false) {
      throw new Error(`eSIM Access ${data.errorCode}: ${data.errorMsg ?? 'unknown error'}`);
    }
    return data as T;
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]> {
    try {
      const r = await this.req<{ obj: { packageList: any[] } }>('/package/list', {
        locationCode: countryCode?.toUpperCase() ?? '',
        type: 'BASE',
        packageCode: '',
        iccid: '',
      });

      return (r.obj?.packageList ?? []).map((pkg: any) => {
        const isUnlimited = pkg.dataType === 4 || pkg.volume <= 0;
        const volBytes: number = pkg.volume ?? 0;
        const dataMb = isUnlimited ? 999_999 : volBytes / (1024 * 1024);
        const dataGb = isUnlimited ? 999 : dataMb / 1024;
        const days = pkg.duration || pkg.unusedValidTime || 1;
        const dataLabel = isUnlimited
          ? 'Unlimited'
          : dataMb >= 1024
            ? `${Math.round(dataGb)} GB`
            : `${Math.round(dataMb)} MB`;

        return {
          providerPlanCode: pkg.packageCode,
          name: pkg.name ?? dataLabel,
          destination: pkg.location ?? countryCode ?? '',
          region: pkg.location ?? '',
          dataMb: isUnlimited ? 999_999 : dataMb,
          durationDays: days,
          priceMinor: Math.round(priceToUsd(pkg.price ?? 0) * 100),
          currency: pkg.currencyCode ?? 'USD',
          isActive: true,
        };
      });
    } catch (err) {
      console.error('[esimAccess] getSupportedPlans failed:', (err as Error).message);
      return [];
    }
  }

  // ── Provisioning ─────────────────────────────────────────────────────────

  async purchaseEsim(params: ProviderPurchaseParams, _ctx?: CustomerContext): Promise<EsimProvisionResult> {
    let packageCode = params.providerRef;

    if (!packageCode) {
      const plans = await this.getSupportedPlans(params.countryCode);
      const match = plans.find(p =>
        p.dataMb >= params.dataAmountGb * 1024 &&
        p.durationDays >= params.validityDays
      );
      if (!match) throw new Error(`No eSIM Access package for ${params.countryCode} ${params.dataAmountGb}GB/${params.validityDays}d`);
      packageCode = match.providerPlanCode;
    }

    const transactionId = crypto.randomUUID().replace(/-/g, '');
    console.log(`[esimAccess] Ordering package "${packageCode}" txn=${transactionId}`);

    const orderResp = await this.req<{ obj: { orderNo: string } }>('/esim/order', {
      transactionId,
      packageInfoList: [{ packageCode, count: 1 }],
    });

    const orderNo = orderResp.obj?.orderNo;
    if (!orderNo) throw new Error('eSIM Access order returned no orderNo');

    // Poll up to 20×5 s = 100 s for profile allocation.
    // eSIM Access can take 60–90 s to allocate a profile on some routes —
    // the previous 30 s timeout caused orders to be marked as failed even
    // though eSIM Access had already billed and was still allocating.
    let esimData: any;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 5_000));
      try {
        const q = await this.req<{ obj: { esimList: any[] } }>('/esim/query', { orderNo });
        const list = q.obj?.esimList ?? [];
        if (list.length > 0 && list[0].iccid) { esimData = list[0]; break; }
      } catch { /* keep polling */ }
    }

    if (!esimData) throw new Error(`eSIM Access order ${orderNo} placed but no profile allocated within 100 s`);

    const activationUrl = `LPA:1$${esimData.smdpAddress}$${esimData.matchingId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`;
    const dataMb = Math.round(params.dataAmountGb * 1024);

    console.log(`[esimAccess] Provisioned ICCID=${esimData.iccid} pkg=${packageCode}`);

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

  // ── Status & Usage ────────────────────────────────────────────────────────

  private async queryByIccid(iccid: string): Promise<any | null> {
    try {
      const r = await this.req<{ obj: { esimList: any[] } }>('/esim/query', { iccid });
      return r.obj?.esimList?.[0] ?? null;
    } catch { return null; }
  }

  async getEsimStatus(iccid: string): Promise<EsimStatusResult> {
    const e = await this.queryByIccid(iccid);
    return {
      providerEsimId: iccid,
      activationStatus: normStatus(e?.esimStatus),
      lastSyncedAt: new Date(),
    };
  }

  async getEsimUsage(iccid: string): Promise<EsimUsageResult> {
    try {
      // eSIM Access usage endpoint
      const r = await this.req<{ obj: any }>('/esim/usage', { iccid });
      const obj = r.obj ?? {};
      const totalMb: number = obj.totalVolume ? obj.totalVolume / (1024 * 1024) : 0;
      const usedMb: number  = obj.usedVolume  ? obj.usedVolume  / (1024 * 1024) : 0;
      const remaining = Math.max(0, totalMb - usedMb);
      const daysRem: number = obj.remainingDays ?? obj.daysRemaining ?? 0;
      const expiresAt = obj.expiredTime ? new Date(obj.expiredTime) : undefined;
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
      // Fallback: derive from query
      const e = await this.queryByIccid(iccid);
      return {
        providerEsimId: iccid,
        dataTotalMb: 0,
        dataUsedMb: 0,
        dataRemainingMb: 0,
        daysRemaining: 0,
        lastSyncedAt: new Date(),
      };
    }
  }

  async getEsimBalance(iccid: string): Promise<EsimBalanceResult> {
    const u = await this.getEsimUsage(iccid);
    return { providerEsimId: iccid, dataRemainingMb: u.dataRemainingMb, daysRemaining: u.daysRemaining, expiresAt: u.expiresAt };
  }

  async getEsimQrCode(iccid: string): Promise<EsimQrCodeResult> {
    const e = await this.queryByIccid(iccid);
    if (e?.smdpAddress && e?.matchingId) {
      const activationUrl = `LPA:1$${e.smdpAddress}$${e.matchingId}`;
      return {
        providerEsimId: iccid,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`,
        manualCode: e.matchingId,
        activationUrl,
      };
    }
    return { providerEsimId: iccid, qrCodeUrl: '' };
  }

  async syncEsim(iccid: string): Promise<EsimSyncResult> {
    const [status, usage, qr] = await Promise.all([
      this.getEsimStatus(iccid),
      this.getEsimUsage(iccid),
      this.getEsimQrCode(iccid),
    ]);
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

  // ── Top-ups ───────────────────────────────────────────────────────────────

  async getTopupOptions(iccid: string): Promise<TopupOption[]> {
    try {
      const r = await this.req<{ obj: { packageList: any[] } }>('/package/list', {
        locationCode: '',
        type: 'TOPUP',
        packageCode: '',
        iccid,
      });
      return (r.obj?.packageList ?? []).map((pkg: any) => ({
        optionCode: pkg.packageCode,
        name: pkg.name ?? pkg.packageCode,
        dataAddedMb: pkg.volume > 0 ? pkg.volume / (1024 * 1024) : undefined,
        validityAddedDays: pkg.duration ?? undefined,
        price: priceToUsd(pkg.price ?? 0),
        currency: pkg.currencyCode ?? 'USD',
      }));
    } catch {
      return [];
    }
  }

  async purchaseTopup(iccid: string, optionCode: string): Promise<TopupResult> {
    const transactionId = crypto.randomUUID().replace(/-/g, '');
    const r = await this.req<{ obj: { orderNo: string } }>('/esim/topup', {
      transactionId,
      iccid,
      packageCode: optionCode,
    });
    return {
      providerTopupId: r.obj?.orderNo ?? `esimaccess_topup_${Date.now()}`,
      status: 'completed',
    };
  }
}
