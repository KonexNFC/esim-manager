import crypto from "crypto";
import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";

const BASE_URL = "https://api.esimaccess.com/api/v1/open";

interface EsimAccessPackage {
  packageCode: string;
  slug: string;
  name: string;
  price: number;
  currencyCode: string;
  volume: number;
  unusedValidTime: number;
  duration: number;
  durationUnit: string;
  location: string;
  description: string;
  activeType: number;
  favorite: boolean;
  retailPrice: number;
  speed: string;
  supportTopUpType?: number;
  dataType?: number;
  fupPolicy?: string;
  locationNetworkList?: Array<{
    locationName: string;
    locationLogo: string;
    operatorList?: Array<{ operatorName: string; networkType: string }>;
  }>;
}

interface EsimAccessOrderResponse {
  success: boolean;
  errorCode: string | null;
  errorMsg: string | null;
  obj: {
    orderNo: string;
  };
}

interface EsimAccessQueryResponse {
  success: boolean;
  errorCode: string | null;
  errorMsg: string | null;
  obj: {
    esimList: Array<{
      iccid: string;
      smdpAddress: string;
      matchingId: string;
      esimStatus: string;
      orderNo: string;
      packageCode: string;
    }>;
  };
}

export class EsimAccessProvider implements EsimProvider {
  name = "esimAccess";
  private accessCode: string | undefined;
  private secretKey: string | undefined;

  constructor() {
    this.accessCode = process.env.ESIM_ACCESS_API_KEY;
    this.secretKey = process.env.ESIM_ACCESS_SECRET_KEY;
  }

  isConfigured(): boolean {
    return !!this.accessCode && !!this.secretKey;
  }

  private generateSignature(body: string, timestamp: string, requestId: string): string {
    const signData = timestamp + requestId + this.accessCode + body;
    return crypto
      .createHmac("sha256", this.secretKey!)
      .update(signData)
      .digest("hex")
      .toLowerCase();
  }

  private async request<T>(path: string, body: Record<string, any> = {}): Promise<T> {
    if (!this.accessCode || !this.secretKey) {
      throw new Error("eSIM Access provider not configured");
    }

    const url = `${BASE_URL}${path}`;
    const bodyStr = JSON.stringify(body);
    const timestamp = Date.now().toString();
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const signature = this.generateSignature(bodyStr, timestamp, requestId);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "RT-AccessCode": this.accessCode,
        "RT-RequestID": requestId,
        "RT-Timestamp": timestamp,
        "RT-Signature": signature,
      },
      body: bodyStr,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eSIM Access API error ${res.status}: ${text}`);
    }

    const data = await res.json() as any;
    if (data.success === false) {
      throw new Error(`eSIM Access error ${data.errorCode}: ${data.errorMsg}`);
    }

    return data as T;
  }

  async getPlans(countryCode: string): Promise<ProviderPlan[]> {
    if (!this.isConfigured()) {
      console.log("[esimAccess] Not configured — skipping plan fetch");
      return [];
    }

    try {
      const response = await this.request<{
        success: boolean;
        obj: { packageList: EsimAccessPackage[] };
      }>("/package/list", {
        locationCode: countryCode.toUpperCase(),
        type: "BASE",
        packageCode: "",
        iccid: "",
      });

      const packages = response.obj?.packageList || [];

      return packages.map((pkg) => {
        const volumeBytes = pkg.volume || 0;
        const dataGb = volumeBytes / (1024 * 1024 * 1024);
        const dataMb = volumeBytes / (1024 * 1024);

        const isUnlimited = pkg.dataType === 4;
        const isDayPass = pkg.dataType === 2 || pkg.dataType === 3;

        let dataLabel: string;
        if (isUnlimited) {
          dataLabel = "Unlimited";
        } else if (dataGb >= 1) {
          dataLabel = `${Math.round(dataGb)} GB`;
        } else if (dataMb > 0) {
          dataLabel = `${Math.round(dataMb)} MB`;
        } else {
          dataLabel = "Unlimited";
        }

        const priceUsd = pkg.price / 10000;
        const validityDays = pkg.duration || pkg.unusedValidTime || 1;

        const locations = pkg.location ? pkg.location.split(",") : [countryCode];
        const coverageNames = pkg.locationNetworkList
          ? pkg.locationNetworkList.map((l) => l.locationName).join(", ")
          : locations.join(", ");

        const features: string[] = ["Data only", "Instant activation"];
        if (isDayPass) features.push("Daily plan");
        if (pkg.speed?.includes("5G")) features.push("5G where available");
        if (pkg.supportTopUpType === 2) features.push("Top-up available");
        if (pkg.fupPolicy) features.push(`FUP: ${pkg.fupPolicy}`);

        return {
          provider: this.name,
          providerRef: pkg.packageCode,
          countryCode: countryCode.toUpperCase(),
          dataAmountGb: isUnlimited ? 999 : dataGb,
          validityDays,
          wholesaleCost: priceUsd,
          currency: pkg.currencyCode || "USD",
          name: pkg.name,
          dataAmount: dataLabel,
          validity: `${validityDays} Days`,
          speedInfo: pkg.speed || "4G/LTE",
          coverage: coverageNames,
          features,
        };
      });
    } catch (err) {
      console.error("[esimAccess] Failed to fetch packages:", err);
      return [];
    }
  }

  async purchaseEsim(planDetails: {
    countryCode: string;
    dataAmountGb: number;
    validityDays: number;
    providerRef?: string;
  }): Promise<ProviderOrderResult> {
    if (!this.isConfigured()) {
      throw new Error("eSIM Access provider not configured");
    }

    let packageCode = planDetails.providerRef;

    if (!packageCode) {
      const plans = await this.getPlans(planDetails.countryCode);
      const match = plans.find(
        (p) =>
          p.dataAmountGb >= planDetails.dataAmountGb &&
          p.validityDays >= planDetails.validityDays
      );
      if (!match || !match.providerRef) {
        throw new Error("No matching eSIM Access package found");
      }
      packageCode = match.providerRef;
    }

    const transactionId = crypto.randomUUID().replace(/-/g, "");

    const orderResponse = await this.request<EsimAccessOrderResponse>("/esim/order", {
      transactionId,
      packageInfoList: [
        {
          packageCode,
          count: 1,
        },
      ],
    });

    const orderNo = orderResponse.obj?.orderNo;
    if (!orderNo) {
      throw new Error("eSIM Access order succeeded but no orderNo returned");
    }

    console.log(`[esimAccess] Order placed — orderNo: ${orderNo}, waiting for profile allocation...`);

    let esimData: EsimAccessQueryResponse["obj"]["esimList"][0] | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        const queryResponse = await this.request<EsimAccessQueryResponse>("/esim/query", {
          orderNo,
        });

        const esims = queryResponse.obj?.esimList;
        if (esims && esims.length > 0 && esims[0].iccid) {
          esimData = esims[0];
          break;
        }
      } catch {
      }
    }

    if (!esimData) {
      throw new Error(`eSIM Access order ${orderNo} placed but profile not yet allocated. Check status later.`);
    }

    const qrCodeData = `LPA:1$${esimData.smdpAddress}$${esimData.matchingId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}`;

    console.log(`[esimAccess] Purchase successful — ICCID: ${esimData.iccid}`);

    return {
      iccid: esimData.iccid,
      qrCodeUrl,
      activationUrl: qrCodeData,
    };
  }

  async getEsimStatus(iccid: string): Promise<string> {
    if (!this.isConfigured()) return "unknown";

    try {
      const response = await this.request<EsimAccessQueryResponse>("/esim/query", {
        iccid,
      });

      const esims = response.obj?.esimList;
      if (esims && esims.length > 0) {
        return esims[0].esimStatus?.toLowerCase() || "unknown";
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }
}

export const esimAccess = new EsimAccessProvider();
