// ─── Airalo Provider Adapter ──────────────────────────────────────────────────
// Implements ProviderAdapter using the Airalo REST API v2.
// Auth: OAuth2 Client Credentials (POST /v2/token) → Bearer access_token.
//   Token is cached in memory and refreshed automatically on expiry.
//
// Key flow:
//   purchaseEsim → POST /v2/orders (package_id + quantity=1)
//                → returns order with sims[].iccid + qrcode_url
//   providerEsimId = iccid  (Airalo uses iccid for all subsequent calls)
//
// Docs: https://partners.airalo.com/docs

import type {
  ProviderAdapter, ProviderPurchaseParams, CustomerContext,
  EsimProvisionResult, EsimStatusResult, EsimUsageResult,
  EsimBalanceResult, EsimQrCodeResult, EsimSyncResult,
  TopupOption, TopupResult, ProviderPlan,
} from './base';

// ─── Status mapping ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  'not installed': 'issued',
  'installed':     'installed',
  'enabled':       'active',
  'active':        'active',
  'expired':       'expired',
  'cancelled':     'cancelled',
  'deleted':       'cancelled',
};

function normStatus(s: string | undefined): string {
  if (!s) return 'issued';
  return STATUS_MAP[s.toLowerCase()] ?? 'issued';
}

// ─── Response shapes ──────────────────────────────────────────────────────────

interface AiraloTokenResponse {
  data: { access_token: string; token_type: string; expires_in: number };
}

interface AiraloSim {
  iccid:                      string;
  lpa?:                       string;
  qrcode?:                    string;
  qrcode_url?:                string;
  direct_apple_installation_url?: string;
  status?:                    string;
  data_remaining?:            number;   // MB
  data_initial?:              number;   // MB
  expired_at?:                string;
  remaining_days?:            number;
}

interface AiraloOrder {
  id:   number;
  sims: AiraloSim[];
}

interface AiraloOrderResponse { data: AiraloOrder }

interface AiraloSimResponse   { data: AiraloSim  }

interface AiraloUsageResponse {
  data: {
    remaining: { data: number; unit: string }; // unit=MB|GB
    total:     { data: number; unit: string };
  };
}

interface AiraloPackage {
  id:          string;
  title:       string;
  data:        string;   // e.g. "1 GB"
  day:         number;
  price:       number;   // USD cents? actually USD float
  country?:    string;
  net_price?:  number;
  data_unit?:  string;
}

interface AiraloPackagesResponse {
  data: AiraloPackage[];
  meta?: { total: number; per_page: number; last_page: number };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class AiraloAdapter implements ProviderAdapter {
  name = 'airalo';

  private clientId:     string;
  private clientSecret: string;
  private baseUrl:      string;

  // Token cache
  private cachedToken:  string | null = null;
  private tokenExpiry:  number        = 0;

  constructor(clientId: string, clientSecret: string, env: 'production' | 'sandbox' = 'production') {
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl      = env === 'sandbox'
      ? 'https://sandbox.airalo.com/v2'
      : 'https://www.airalo.com/v2';
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) return this.cachedToken;

    const body = new URLSearchParams({
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      grant_type:    'client_credentials',
    });

    const res = await fetch(`${this.baseUrl}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Airalo auth failed ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = await res.json() as AiraloTokenResponse;
    this.cachedToken = json.data.access_token;
    // Expire 60 s before the real expiry so we never send a stale token
    this.tokenExpiry = now + (json.data.expires_in - 60) * 1_000;

    return this.cachedToken;
  }

  private async req<T>(
    method: 'GET' | 'POST',
    path:   string,
    body?:  Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getToken();

    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/json',
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);

    if (!res.ok) {
      // Token may have been invalidated server-side; force refresh on 401
      if (res.status === 401) this.cachedToken = null;
      const txt = await res.text().catch(() => '');
      throw new Error(`Airalo ${res.status} ${path}: ${txt.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async getSupportedPlans(countryCode?: string): Promise<ProviderPlan[]> {
    const params = new URLSearchParams({ type: 'local', limit: '100' });
    if (countryCode) params.set('country_code', countryCode.toUpperCase());

    try {
      const json = await this.req<AiraloPackagesResponse>(
        'GET', `/packages?${params.toString()}`,
      );
      return (json.data ?? []).map(pkg => ({
        providerPlanCode: pkg.id,
        name:             pkg.title,
        destination:      countryCode ?? '',
        region:           countryCode ?? '',
        dataMb:           this.parseDataMb(pkg.data),
        durationDays:     pkg.day,
        priceMinor:       Math.round((pkg.net_price ?? pkg.price) * 100),
        currency:         'USD',
        isActive:         true,
      }));
    } catch (err: any) {
      console.warn(`[airalo] getSupportedPlans(${countryCode}): ${err.message}`);
      return [];
    }
  }

  private parseDataMb(dataStr: string): number {
    const m = /^([\d.]+)\s*(GB|MB|gb|mb)/i.exec(dataStr ?? '');
    if (!m) return 0;
    const val = parseFloat(m[1]);
    return m[2].toUpperCase() === 'GB' ? Math.round(val * 1024) : Math.round(val);
  }

  // ── Provisioning ──────────────────────────────────────────────────────────

  async purchaseEsim(
    params: ProviderPurchaseParams,
    _ctx?:  CustomerContext,
  ): Promise<EsimProvisionResult> {
    if (!params.providerRef) {
      throw new Error('Airalo requires a package_id (providerRef) to purchase');
    }

    console.log(`[airalo] Placing order package_id="${params.providerRef}"`);

    const order = await this.req<AiraloOrderResponse>('POST', '/orders', {
      package_id: params.providerRef,
      quantity:   1,
      type:       'sim',
    });

    const sim = order.data?.sims?.[0];
    if (!sim?.iccid) {
      throw new Error(`Airalo order returned no SIM for package "${params.providerRef}"`);
    }

    const dataMb = Math.round(params.dataAmountGb * 1024);
    const activationUrl = sim.lpa ?? '';
    const manualCode    = sim.lpa?.split('$')[2] ?? undefined;

    // Build QR URL — prefer Airalo's hosted URL, fallback to qr-server
    const qrCodeUrl = sim.qrcode_url
      || (activationUrl
        ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`
        : '');

    console.log(`[airalo] Provisioned ICCID=${sim.iccid} order=${order.data.id}`);

    return {
      providerEsimId:   sim.iccid,
      iccid:            sim.iccid,
      qrCodeUrl,
      activationUrl,
      manualCode,
      activationStatus: normStatus(sim.status),
      dataTotalMb:      sim.data_initial ?? dataMb,
      dataUsedMb:       0,
      dataRemainingMb:  sim.data_remaining ?? dataMb,
    };
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getEsimStatus(iccid: string): Promise<EsimStatusResult> {
    try {
      const res = await this.req<AiraloSimResponse>('GET', `/sims/${iccid}`);
      return {
        providerEsimId:   iccid,
        activationStatus: normStatus(res.data?.status),
        lastSyncedAt:     new Date(),
      };
    } catch {
      return { providerEsimId: iccid, activationStatus: 'issued', lastSyncedAt: new Date() };
    }
  }

  // ── Usage ─────────────────────────────────────────────────────────────────

  async getEsimUsage(iccid: string): Promise<EsimUsageResult> {
    try {
      const res = await this.req<AiraloUsageResponse>('GET', `/sims/${iccid}/usage`);
      const toMb = (d: { data: number; unit: string }) =>
        d.unit.toUpperCase() === 'GB' ? Math.round(d.data * 1024) : Math.round(d.data);

      const totalMb     = toMb(res.data.total);
      const remainingMb = toMb(res.data.remaining);
      const usedMb      = Math.max(0, totalMb - remainingMb);

      const simRes = await this.req<AiraloSimResponse>('GET', `/sims/${iccid}`);
      const expiresAt  = simRes.data?.expired_at ? new Date(simRes.data.expired_at) : undefined;
      const daysRemaining = simRes.data?.remaining_days ?? 0;

      return {
        providerEsimId:   iccid,
        dataTotalMb:      totalMb,
        dataUsedMb:       usedMb,
        dataRemainingMb:  remainingMb,
        daysRemaining,
        expiresAt,
        lastSyncedAt:     new Date(),
      };
    } catch {
      return {
        providerEsimId:  iccid,
        dataTotalMb:     0,
        dataUsedMb:      0,
        dataRemainingMb: 0,
        daysRemaining:   0,
        lastSyncedAt:    new Date(),
      };
    }
  }

  async getEsimBalance(iccid: string): Promise<EsimBalanceResult> {
    const usage = await this.getEsimUsage(iccid);
    return {
      providerEsimId:  iccid,
      dataRemainingMb: usage.dataRemainingMb,
      daysRemaining:   usage.daysRemaining,
      expiresAt:       usage.expiresAt,
    };
  }

  // ── QR Code ───────────────────────────────────────────────────────────────

  async getEsimQrCode(iccid: string): Promise<EsimQrCodeResult> {
    try {
      const res = await this.req<AiraloSimResponse>('GET', `/sims/${iccid}`);
      const sim = res.data;

      const activationUrl = sim.lpa ?? '';
      const manualCode    = sim.lpa?.split('$')[2] ?? undefined;
      const qrCodeUrl     = sim.qrcode_url
        || (activationUrl
          ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(activationUrl)}`
          : '');

      return { providerEsimId: iccid, qrCodeUrl, manualCode, activationUrl };
    } catch {
      return { providerEsimId: iccid, qrCodeUrl: '' };
    }
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async syncEsim(iccid: string): Promise<EsimSyncResult> {
    const [usage, qr] = await Promise.all([
      this.getEsimUsage(iccid),
      this.getEsimQrCode(iccid),
    ]);

    let status = 'issued';
    try {
      const s = await this.getEsimStatus(iccid);
      status = s.activationStatus;
    } catch { /* use default */ }

    return {
      providerEsimId:   iccid,
      activationStatus: status,
      dataTotalMb:      usage.dataTotalMb,
      dataUsedMb:       usage.dataUsedMb,
      dataRemainingMb:  usage.dataRemainingMb,
      daysRemaining:    usage.daysRemaining,
      expiresAt:        usage.expiresAt,
      qrCodeUrl:        qr.qrCodeUrl || undefined,
      manualCode:       qr.manualCode,
      lastSyncedAt:     new Date(),
    };
  }

  // ── Top-ups ───────────────────────────────────────────────────────────────
  // Airalo supports top-ups via the same /orders endpoint with type="topup".

  async getTopupOptions(iccid: string): Promise<TopupOption[]> {
    try {
      // Fetch the current SIM to determine its package for compatible top-ups
      const simRes = await this.req<AiraloSimResponse>('GET', `/sims/${iccid}`);
      // Airalo doesn't have a top-up listing endpoint per ICCID in v2;
      // return empty for now — top-up packages can be listed by package family.
      void simRes;
      return [];
    } catch {
      return [];
    }
  }

  async purchaseTopup(_iccid: string, _optionCode: string): Promise<TopupResult> {
    throw new Error('Airalo top-ups must be placed as new orders — use purchaseEsim with the top-up package_id');
  }
}
