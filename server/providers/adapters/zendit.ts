// ─── Zendit Provider Adapter ──────────────────────────────────────────────────
// Implements ProviderAdapter using the Zendit REST API.
// Auth: Bearer token via ZENDIT_API_KEY environment variable.
// Docs: https://api.zendit.io/swagger/index.html
//
// Key difference from eSIM Access: Zendit identifies purchases by a
// caller-generated transactionId, not an ICCID.  We store the transactionId
// as providerEsimId so subsequent status/QR queries can find the right record.
// The actual ICCID from confirmation is stored separately as the customer-
// facing identifier.

import crypto from 'crypto';
import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

const STATUS_MAP: Record<string, string> = {
  'CREATED':        'issued',
  'PROCESSING':     'issued',
  'COMPLETED':      'issued',
  'ACTIVE':         'active',
  'ENABLED':        'active',
  'INSTALLED':      'installed',
  'USED_UP':        'consumed',
  'EXPIRED':        'expired',
  'FAILED':         'failed',
  'CANCELLED':      'cancelled',
};

function normStatus(s: string | undefined): string {
  if (!s) return 'issued';
  return STATUS_MAP[s.toUpperCase()] ?? 'issued';
}

interface ZenditPurchaseDetail {
  transactionId?: string;
  status?: string;
  confirmation?: {
    iccid?: string;
    smdpAddress?: string;
    activationCode?: string;
  };
}

interface ZenditQrCodeResponse {
  qrCode?: string;
}

export class ZenditAdapter implements ProviderAdapter {
  name = 'zendit';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, env: 'production' | 'test' = 'production') {
    this.apiKey = apiKey;
    const host = env === 'production' ? 'api.zendit.io' : 'test-api.zendit.io';
    this.baseUrl = `https://${host}/v1`;
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async req<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Zendit ${res.status} ${path}: ${text.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async getSupportedPlans(_countryCode?: string): Promise<ProviderPlan[]> {
    return [];
  }

  // ── Provisioning ─────────────────────────────────────────────────────────

  async purchaseEsim(
    params: ProviderPurchaseParams,
    _ctx?: CustomerContext,
  ): Promise<EsimProvisionResult> {
    if (!params.providerRef) {
      throw new Error('Zendit requires an offerId (providerRef) to purchase — spec-based lookup not supported');
    }

    const transactionId = `konex-${crypto.randomUUID()}`;
    console.log(`[zendit] Placing order offerId="${params.providerRef}" txn=${transactionId}`);

    await this.req<unknown>('POST', '/esim/purchases', {
      offerId: params.providerRef,
      transactionId,
    });

    // Poll up to 20×5 s = 100 s for profile allocation
    let detail: ZenditPurchaseDetail | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 5_000));
      try {
        const d = await this.req<ZenditPurchaseDetail>('GET', `/esim/purchases/${transactionId}`);
        if (d.confirmation?.iccid || d.confirmation?.activationCode) {
          detail = d;
          break;
        }
      } catch {
        // keep polling
      }
    }

    if (!detail?.confirmation?.smdpAddress || !detail?.confirmation?.activationCode) {
      throw new Error(`Zendit purchase ${transactionId} placed but no profile allocated within 100 s`);
    }

    const { iccid, smdpAddress, activationCode } = detail.confirmation;
    const activationUrl = `LPA:1$${smdpAddress}$${activationCode}`;

    let qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`;
    try {
      const qrResp = await this.req<ZenditQrCodeResponse>('GET', `/esim/purchases/${transactionId}/qrcode`);
      if (qrResp.qrCode) qrCodeUrl = qrResp.qrCode;
    } catch {
      // Fall back to generated QR code URL
    }

    const dataMb = Math.round(params.dataAmountGb * 1024);
    console.log(`[zendit] Provisioned txn=${transactionId} ICCID=${iccid ?? 'N/A'}`);

    return {
      providerEsimId: transactionId,
      iccid:          iccid ?? transactionId,
      qrCodeUrl,
      activationUrl,
      manualCode:     activationCode,
      activationStatus: normStatus(detail.status),
      dataTotalMb:    dataMb,
      dataUsedMb:     0,
      dataRemainingMb: dataMb,
    };
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getEsimStatus(providerEsimId: string): Promise<EsimStatusResult> {
    try {
      const d = await this.req<ZenditPurchaseDetail>('GET', `/esim/purchases/${providerEsimId}`);
      return {
        providerEsimId,
        activationStatus: normStatus(d.status),
        lastSyncedAt: new Date(),
      };
    } catch {
      return { providerEsimId, activationStatus: 'issued', lastSyncedAt: new Date() };
    }
  }

  // ── Usage ─────────────────────────────────────────────────────────────────
  // Zendit does not expose a usage/consumption endpoint so we return zeros.

  async getEsimUsage(providerEsimId: string): Promise<EsimUsageResult> {
    return {
      providerEsimId,
      dataTotalMb: 0,
      dataUsedMb: 0,
      dataRemainingMb: 0,
      daysRemaining: 0,
      lastSyncedAt: new Date(),
    };
  }

  async getEsimBalance(providerEsimId: string): Promise<EsimBalanceResult> {
    return { providerEsimId, dataRemainingMb: 0, daysRemaining: 0 };
  }

  // ── QR Code ───────────────────────────────────────────────────────────────

  async getEsimQrCode(providerEsimId: string): Promise<EsimQrCodeResult> {
    try {
      const qrResp = await this.req<ZenditQrCodeResponse>('GET', `/esim/purchases/${providerEsimId}/qrcode`);
      if (qrResp.qrCode) {
        return { providerEsimId, qrCodeUrl: qrResp.qrCode };
      }
    } catch { /* fall through */ }

    try {
      const d = await this.req<ZenditPurchaseDetail>('GET', `/esim/purchases/${providerEsimId}`);
      const { smdpAddress, activationCode } = d.confirmation ?? {};
      if (smdpAddress && activationCode) {
        const activationUrl = `LPA:1$${smdpAddress}$${activationCode}`;
        return {
          providerEsimId,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`,
          manualCode: activationCode,
          activationUrl,
        };
      }
    } catch { /* fall through */ }

    return { providerEsimId, qrCodeUrl: '' };
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async syncEsim(providerEsimId: string): Promise<EsimSyncResult> {
    const [status, qr] = await Promise.all([
      this.getEsimStatus(providerEsimId),
      this.getEsimQrCode(providerEsimId),
    ]);
    return {
      providerEsimId,
      activationStatus: status.activationStatus,
      dataTotalMb: 0,
      dataUsedMb: 0,
      dataRemainingMb: 0,
      daysRemaining: 0,
      qrCodeUrl: qr.qrCodeUrl || undefined,
      manualCode: qr.manualCode,
      lastSyncedAt: new Date(),
    };
  }

  // ── Top-ups ───────────────────────────────────────────────────────────────
  // Zendit does not support top-ups via the public API.

  async getTopupOptions(_iccid: string): Promise<TopupOption[]> {
    return [];
  }

  async purchaseTopup(_iccid: string, _optionCode: string): Promise<TopupResult> {
    throw new Error('Zendit does not support top-ups');
  }
}
