import type { EsimProvider, ProviderPlan, ProviderOrderResult, CoverageType } from "./types";
import { randomUUID } from "crypto";
import { regionSlugFromZenditRegions } from "../services/regionSlugs";

// ─── Zendit eSIM Provider ─────────────────────────────────────────────────────
// Swagger (test):  https://test-api.zendit.io/swagger/index.html
// Swagger (prod):  https://api.zendit.io/swagger/index.html
// Base URL:        https://{test-api|api}.zendit.io/v1
// Auth:            Authorization: Bearer <API_KEY>
// Keys:            ZENDIT_API_KEY (required)
//                  ZENDIT_ENV     "production" → api.zendit.io; else test-api.zendit.io
//
// Catalogue:  GET /esim/offers?limit=100&offset=N[&country=ISO2]
//   Response: { list: ESimOffer[], total: number, limit: number, offset: number }
//
// Purchase:   POST /esim/purchases  { offerId, transactionId }
// QR code:    GET  /esim/purchases/{transactionId}/qrcode
// Status:     GET  /esim/purchases/{transactionId}  → .status

interface ZenditCost {
  currency?: string;
  currencyDivisor?: number;  // e.g. 100 for cents
  fixed?: number;            // price in minor currency units (fixed / currencyDivisor = USD)
  fee?: number;
}

interface ZenditESimOffer {
  offerId: string;
  brand?: string;
  brandName?: string;
  country?: string;          // Primary ISO-2 country code (always present per schema)
  regions?: string[];        // e.g. ["Global"] or ["Europe", "Southeast Asia"]
  dataGB?: number;           // Data in GB
  dataUnlimited?: boolean;
  durationDays?: number;     // Validity in days
  cost?: ZenditCost;
  price?: ZenditCost;
  dataSpeeds?: string[];     // e.g. ["4G", "LTE"]
  enabled?: boolean;
  notes?: string;
  shortNotes?: string;
  brand_name?: string;
}

interface ZenditOffersResponse {
  list?: ZenditESimOffer[];
  total?: number;            // NOTE: "total" not "count"
  limit?: number;
  offset?: number;
}

interface ZenditESimConfirmation {
  iccid?: string;
  smdpAddress?: string;
  activationCode?: string;
  externalReferenceId?: string;
}

interface ZenditPurchaseResponse {
  transactionId?: string;
  status?: string;
  confirmation?: ZenditESimConfirmation;
}

interface ZenditQRCodeResponse {
  qrCode?: string;
}

export class ZenditProvider implements EsimProvider {
  name = "zendit";
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ZENDIT_API_KEY;
    // Default to production — only use test API when ZENDIT_ENV is explicitly set to 'test'
    const isTest = (process.env.ZENDIT_ENV ?? "").toLowerCase() === "test";
    const host = isTest ? "test-api.zendit.io" : "api.zendit.io";
    this.baseUrl = `https://${host}/v1`;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /** Determine coverage type from regions array. */
  private resolveCoverageType(regions: string[] = [], country?: string): CoverageType {
    const regionLower = regions.map(r => r.toLowerCase());
    if (regionLower.some(r => r === "global" || r.includes("global"))) return "global";
    if (regions.length > 0) return "regional";
    return country ? "country" : "global";
  }

  /** Resolve wholesale cost from cost/price object. Returns USD. */
  private resolveCost(cost?: ZenditCost, price?: ZenditCost): { usd: number; currency: string } {
    const c = cost ?? price;
    if (!c) return { usd: 0, currency: "USD" };
    const divisor = c.currencyDivisor ?? 100;
    const fixed = c.fixed ?? 0;
    const currency = c.currency ?? "USD";
    return { usd: fixed / divisor, currency };
  }

  /** Map a raw ESimOffer to a ProviderPlan. */
  private mapOffer(offer: ZenditESimOffer): ProviderPlan {
    const coverageType = this.resolveCoverageType(offer.regions, offer.country);

    // For regional/global offers, use a canonical region slug as the countryCode so the
    // plan is filed under e.g. "EUROPE" or "GLOBAL" rather than a single country.
    let countryCode: string;
    if (coverageType === "global") {
      countryCode = "GLOBAL";
    } else if (coverageType === "regional" && (offer.regions ?? []).length > 0) {
      const slug = regionSlugFromZenditRegions(offer.regions ?? []);
      // If region list didn't match a slug, try the offer name as fallback
      if (!slug) {
        const nameLower = (offer.shortNotes ?? offer.notes ?? "").toLowerCase();
        const nameSlug = regionSlugFromZenditRegions(
          nameLower.split(/[\s,&]+/).filter(Boolean)
        );
        const fallback = (offer.country ?? "").toUpperCase() || "GLOBAL";
        countryCode = nameSlug ?? fallback;
      } else {
        countryCode = slug;
      }
    } else {
      const rawCode = (offer.country ?? "").toUpperCase();
      // Guard against empty country — fall back to GLOBAL
      countryCode = rawCode || "GLOBAL";
    }
    const { usd: wholesaleCost, currency } = this.resolveCost(offer.cost, offer.price);

    const isUnlimited = offer.dataUnlimited ?? false;
    const dataGb = isUnlimited ? 999 : (offer.dataGB ?? 0);
    const validityDays = offer.durationDays ?? 1;

    const dataLabel = isUnlimited
      ? "Unlimited"
      : dataGb >= 1
        ? `${Math.round(dataGb * 10) / 10} GB`
        : `${Math.round(dataGb * 1024)} MB`;

    const speedInfo = (offer.dataSpeeds ?? []).join("/").replace(/lte/i, "LTE") || "4G/LTE";

    const regionList = (offer.regions ?? []).join(", ");
    const coverage = regionList || countryCode;

    const features: string[] = ["Data only", "Instant activation"];
    const speedUpper = speedInfo.toUpperCase();
    if (speedUpper.includes("5G")) features.push("5G where available");

    const name =
      offer.shortNotes
      ?? offer.notes
      ?? `${offer.brandName ?? offer.brand ?? "Zendit"} — ${dataLabel} / ${validityDays}d`;

    return {
      provider: this.name,
      providerRef: offer.offerId,
      countryCode,
      dataAmountGb: dataGb,
      validityDays,
      wholesaleCost,
      currency,
      name,
      dataAmount: dataLabel,
      validity: `${validityDays} Days`,
      speedInfo,
      coverage,
      features,
      coverageType,
    };
  }

  /** Fetch one page of offers (optionally filtered by country). */
  private async fetchOffersPage(limit: number, offset: number, country?: string): Promise<ZenditOffersResponse> {
    // Zendit uses _limit/_offset (underscore-prefixed) — both are required
    const params = new URLSearchParams({ _limit: String(limit), _offset: String(offset) });
    if (country) params.set("country", country.toUpperCase());

    const res = await fetch(`${this.baseUrl}/esim/offers?${params}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Zendit API ${res.status}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<ZenditOffersResponse>;
  }

  /**
   * Fetch the full Zendit catalogue via the global /esim/offers endpoint (paginated).
   * Each offer has a single primary `country` field — no fan-out needed.
   */
  async getAllCataloguePlans(_countryCodes: string[]): Promise<ProviderPlan[]> {
    if (!this.apiKey) {
      console.log("[zendit] Not configured (ZENDIT_API_KEY missing) — skipping");
      return [];
    }

    const PAGE_SIZE = 100;
    const plans: ProviderPlan[] = [];
    let offset = 0;

    console.log(`[zendit] Fetching catalogue from ${this.baseUrl}/esim/offers ...`);

    while (true) {
      let page: ZenditOffersResponse;
      try {
        page = await this.fetchOffersPage(PAGE_SIZE, offset);
      } catch (err: any) {
        console.error(`[zendit] Catalogue fetch failed at offset ${offset}: ${err.message}`);
        break;
      }

      const items = page.list ?? [];

      if (offset === 0) {
        console.log(`[zendit] total=${page.total}, first page=${items.length} items`);
        if (items.length > 0) {
          console.log(`[zendit] Sample offer keys: ${Object.keys(items[0]).join(", ")}`);
        }
      }

      for (const offer of items) {
        if (!offer.offerId) continue;
        if (offer.enabled === false) continue;
        plans.push(this.mapOffer(offer));
      }

      const total = page.total ?? items.length;
      offset += PAGE_SIZE;
      if (offset >= total || items.length < PAGE_SIZE) break;
    }

    return plans;
  }

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.apiKey) return [];
    try {
      const page = await this.fetchOffersPage(100, 0, countryCode);
      return (page.list ?? [])
        .filter(o => o.offerId && o.enabled !== false)
        .map(o => this.mapOffer(o));
    } catch (err: any) {
      console.error(`[zendit] getPlans(${countryCode}) failed: ${err.message}`);
      return [];
    }
  }

  async purchaseEsim(planDetails: {
    countryCode: string;
    dataAmountGb: number;
    validityDays: number;
    providerRef?: string;
  }): Promise<ProviderOrderResult> {
    if (!this.apiKey) throw new Error("Zendit provider not configured");
    if (!planDetails.providerRef) throw new Error("Zendit requires an offerId (providerRef) to purchase");

    const transactionId = `konex-${randomUUID()}`;

    // 1. Create purchase
    const purchaseRes = await fetch(`${this.baseUrl}/esim/purchases`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ offerId: planDetails.providerRef, transactionId }),
    });

    if (!purchaseRes.ok) {
      const body = await purchaseRes.text().catch(() => "");
      throw new Error(`Zendit purchase failed (${purchaseRes.status}): ${body.slice(0, 200)}`);
    }

    // 2. Retrieve QR code (separate endpoint)
    const qrRes = await fetch(`${this.baseUrl}/esim/purchases/${transactionId}/qrcode`, {
      headers: this.headers,
    });

    let qrCode = "";
    if (qrRes.ok) {
      const qrData = await qrRes.json() as ZenditQRCodeResponse;
      qrCode = qrData.qrCode ?? "";
    }

    // 3. Retrieve transaction details for iccid / activation info
    const detailRes = await fetch(`${this.baseUrl}/esim/purchases/${transactionId}`, {
      headers: this.headers,
    });

    if (!detailRes.ok) {
      const body = await detailRes.text().catch(() => "");
      throw new Error(`Zendit purchase detail fetch failed (${detailRes.status}): ${body.slice(0, 200)}`);
    }

    const detail = await detailRes.json() as ZenditPurchaseResponse;
    const confirmation = detail.confirmation;

    return {
      iccid: confirmation?.iccid ?? transactionId,
      qrCodeUrl: qrCode,
      activationUrl: (confirmation?.smdpAddress && confirmation?.activationCode)
        ? `LPA:1$${confirmation.smdpAddress}$${confirmation.activationCode}`
        : undefined,
    };
  }

  async getEsimStatus(transactionId: string): Promise<string> {
    if (!this.apiKey) return "unknown";
    try {
      const res = await fetch(`${this.baseUrl}/esim/purchases/${transactionId}`, {
        headers: this.headers,
      });
      if (!res.ok) return "unknown";
      const data = await res.json() as ZenditPurchaseResponse;
      return data.status ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  /** Read the Zendit prepaid balance without placing an eSIM order. */
  async getWalletBalance(): Promise<{ amount: number; currency: string }> {
    if (!this.apiKey) throw new Error("Zendit provider not configured");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${this.baseUrl}/balance`, {
        headers: this.headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Zendit balance API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json() as {
        availableBalance?: number | string;
        currency?: string;
        currencyDivisor?: number;
      };
      const rawBalance = Number(data.availableBalance);
      const divisor = Number(data.currencyDivisor ?? 100);
      if (!Number.isFinite(rawBalance) || !Number.isFinite(divisor) || divisor <= 0) {
        throw new Error("Zendit balance response did not include a valid balance");
      }
      return { amount: rawBalance / divisor, currency: data.currency || "GBP" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const zendit = new ZenditProvider();
