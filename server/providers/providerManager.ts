import { storage } from "../storage";
import { esimgo } from "./esimgo";
import { esimAccess } from "./esimAccess";
import { zendit } from "./zendit";
import { airalo } from "./airalo";
import type { EsimProvider, ProviderOrderResult } from "./types";

const providerRegistry: Record<string, EsimProvider> = {
  esimgo,
  esimAccess,
  zendit,
  airalo,
};

export interface PurchaseResult {
  iccid: string;
  qrCodeUrl: string;
  activationUrl?: string;
  provider: string;
}

export async function purchaseEsim(
  planId: string | number,
  providerName: string
): Promise<PurchaseResult> {
  const plan = await storage.getPlan(String(planId));
  if (!plan) {
    throw new Error(`Plan with id ${planId} not found`);
  }

  const provider = providerRegistry[providerName];
  if (!provider) {
    throw new Error(
      `Unknown provider: ${providerName}. Available: ${Object.keys(providerRegistry).join(", ")}`
    );
  }

  if ("isConfigured" in provider && typeof (provider as any).isConfigured === "function") {
    if (!(provider as any).isConfigured()) {
      throw new Error(`Provider ${providerName} is not configured (missing API key)`);
    }
  }

  console.log(
    `[providerManager] Purchasing via ${providerName} — plan #${planId} (${plan.dataAmount}, ${plan.validity})`
  );

  const result: ProviderOrderResult = await provider.purchaseEsim({
    countryCode: plan.coverage,
    dataAmountGb: plan.dataAmountGb,
    validityDays: plan.validityDays,
    providerRef: (plan as any).providerRef,
  });

  console.log(`[providerManager] Purchase successful — ICCID: ${result.iccid}`);

  return {
    iccid: result.iccid,
    qrCodeUrl: result.qrCodeUrl,
    activationUrl: result.activationUrl,
    provider: providerName,
  };
}

export function getAvailableProviders(): string[] {
  return Object.entries(providerRegistry)
    .filter(([_, p]) => {
      if ("isConfigured" in p && typeof (p as any).isConfigured === "function") {
        return (p as any).isConfigured();
      }
      return true;
    })
    .map(([name]) => name);
}
