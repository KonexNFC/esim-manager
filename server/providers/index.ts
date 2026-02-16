import { esimAccess } from "./esimAccess";
import { zendit } from "./zendit";
import { esimgo } from "./esimgo";
import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";

const providers: EsimProvider[] = [esimAccess, zendit, esimgo];

function getConfiguredProviders(): EsimProvider[] {
  return providers.filter((p) => {
    if ("isConfigured" in p && typeof (p as any).isConfigured === "function") {
      return (p as any).isConfigured();
    }
    return true;
  });
}

export async function fetchProviderPlans(countryCode: string): Promise<ProviderPlan[]> {
  const configured = getConfiguredProviders();
  if (configured.length === 0) {
    console.log("[providers] No providers configured — using manual plans only");
    return [];
  }

  const results = await Promise.allSettled(
    configured.map((p) => p.getPlans(countryCode))
  );

  const allPlans: ProviderPlan[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPlans.push(...result.value);
    } else {
      console.error("[providers] Plan fetch failed:", result.reason);
    }
  }

  return allPlans;
}

export async function getBestPlan(
  countryCode: string,
  dataAmountGb: number,
  validityDays: number
): Promise<ProviderPlan | null> {
  const allPlans = await fetchProviderPlans(countryCode);

  const matching = allPlans.filter(
    (p) => p.dataAmountGb >= dataAmountGb && p.validityDays >= validityDays
  );

  if (matching.length === 0) return null;

  matching.sort((a, b) => a.wholesaleCost - b.wholesaleCost);
  return matching[0];
}

export async function purchaseFromProvider(
  providerName: string,
  planDetails: { countryCode: string; dataAmountGb: number; validityDays: number }
): Promise<ProviderOrderResult> {
  const provider = providers.find((p) => p.name === providerName);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return provider.purchaseEsim(planDetails);
}

export async function checkEsimStatus(
  providerName: string,
  iccid: string
): Promise<string> {
  const provider = providers.find((p) => p.name === providerName);
  if (!provider) return "unknown";
  return provider.getEsimStatus(iccid);
}

export { providers, type ProviderPlan, type ProviderOrderResult };
