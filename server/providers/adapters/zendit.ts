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

import { PurchasePendingError, PurchaseRejectedError } from './purchaseOutcome';
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

/** Zendit may have accepted this transaction; it must only be reconciled. */
export class ZenditPurchasePendingError extends PurchasePendingError {
  readonly providerEsimId: string;

  constructor(providerEsimId: string, message: string) {
    super('zendit', message, providerEsimId);
    this.name = 'ZenditPurchasePendingError';
    this.providerEsimId = providerEsimId;
  }
}

export class ZenditAllocationPendingError extends ZenditPurchasePendingError {
  constructor(providerEsimId: string) {
    super(providerEsimId, `Zendit purchase ${providerEsimId} placed but no profile allocated within 100 s`);
    this.name = 'ZenditAllocationPendingError';
  }
}

class ZenditHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ZenditHttpError';
  }
}

function isAllocated(detail: ZenditPurchaseDetail): boolean {
  return Boolean(detail.confirmation?.smdpAddress && detail.confirmation?.activationCode);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ZenditHttpError(res.status, `Zendit ${res.status} ${path}: ${text.slice(0, 300)}`);
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

    if (!params.providerTransactionId) {
      throw new Error('Zendit requires a caller-reserved providerTransactionId');
    }
    const transactionId = params.providerTransactionId;
    console.log(`[zendit] Placing order offerId="${params.providerRef}" txn=${transactionId}`);

    try {
      await this.req<unknown>('POST', '/esim/purchases', {
        offerId: params.providerRef,
        transactionId,
      });
    } catch (err: any) {
      // A 4xx response definitively rejects the request. A timeout/network/5xx
      // response is ambiguous: Zendit may have committed the purchase before
      // the response was lost, so only reconciliation is safe.
      if (err instanceof ZenditHttpError && [400, 401, 403, 404, 422].includes(err.status)) {
        throw new PurchaseRejectedError(err.message);
      }
      throw new ZenditPurchasePendingError(
        transactionId,
        `Zendit purchase ${transactionId} has an uncertain response and requires reconciliation: ${err.message}`,
      );
    }

    // Poll up to 20×5 s = 100 s for profile allocation.
    let detail: ZenditPurchaseDetail | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 5_000));
      try {
        const d = await this.req<ZenditPurchaseDetail>('GET', `/esim/purchases/${transactionId}`);
        if (isAllocated(d)) {
          detail = d;
          break;
        }
      } catch {
        // keep polling
      }
    }

    if (!detail?.confirmation?.smdpAddress || !detail?.confirmation?.activationCode) {
      // The POST has already charged the Zendit wallet. Preserve the
      // transaction ID so a background reconciler can finish this purchase
      // without issuing another wholesale order.
      throw new ZenditAllocationPendingError(transactionId);
    }

    return this.buildProvisionResult(transactionId, detail, params);
  }

  /**
   * Re-check an already-created Zendit purchase. A null result means Zendit
   * still has not allocated the profile; importantly, this method never POSTs.
   */
  async reconcilePendingPurchase(
    providerEsimId: string,
    params: ProviderPurchaseParams,
  ): Promise<EsimProvisionResult | null> {
    const detail = await this.req<ZenditPurchaseDetail>(
      'GET',
      `/esim/purchases/${encodeURIComponent(providerEsimId)}`,
    );
    if (!isAllocated(detail)) return null;
    return this.buildProvisionResult(providerEsimId, detail, params);
  }

  private async buildProvisionResult(
    transactionId: string,
    detail: ZenditPurchaseDetail,
    params: ProviderPurchaseParams,
  ): Promise<EsimProvisionResult> {
    const { iccid, smdpAddress, activationCode } = detail.confirmation ?? {};
    if (!smdpAddress || !activationCode) {
      throw new Error(`Zendit purchase ${transactionId} has an incomplete profile allocation`);
    }
    const activationUrl = `LPA:1$${smdpAddress}$${activationCode}`;

    let qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`;
    try {
      const qrResp = await this.req<ZenditQrCodeResponse>(
        'GET',
        `/esim/purchases/${encodeURIComponent(transactionId)}/qrcode`,
      );
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
