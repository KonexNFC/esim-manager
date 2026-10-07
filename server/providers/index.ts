import { esimAccess } from "./esimAccess";
import { zendit } from "./zendit";
import { esimgo } from "./esimgo";
import { airalo } from "./airalo";
import type { EsimProvider, ProviderPlan, ProviderOrderResult } from "./types";
import { db } from "../storage";
import { normalizedPlans } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { getOffersForNormalizedPlan } from "../services/providerRegistry";
import { selectBestProviderForPlan } from "../services/routingEngine";
import { canonicalProviderKey } from "../services/providerHealth";

// This list is for catalogue reads only.  It is intentionally not a routing
// priority list; all initial supplier selection goes through routingEngine.
const providers: EsimProvider[] = [esimAccess, zendit, esimgo, airalo];

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
  // Do not select from a provider API response by price.  That bypasses health,
  // quarantine, destination history, and the routing audit.  Resolve the
  // canonical normalized product first, then ask the common routing policy for
  // its exact supplier SKU.
  const dataMb = Math.round(dataAmountGb * 1024);
  const matchingPlans = await db
    .select()
    .from(normalizedPlans)
    .where(and(
      eq(normalizedPlans.regionCode, countryCode.toUpperCase()),
      eq(normalizedPlans.isActive, true),
    ));

  const normalizedPlan = matchingPlans
    .filter(plan =>
      (plan.isUnlimited || plan.dataMb >= dataMb) &&
      plan.validityDays >= validityDays,
    )
    .sort((a, b) =>
      // This only resolves an ambiguous product family.  Supplier selection
      // remains entirely in routingEngine; prefer the tightest product fit.
      (a.validityDays - b.validityDays) ||
      (a.dataMb - b.dataMb),
    )[0];
  if (!normalizedPlan) return null;

  const decision = await selectBestProviderForPlan(normalizedPlan.id, "blended_score");
  const winner = decision.fallbackChain[0];
  if (!winner) return null;
  const offers = await getOffersForNormalizedPlan(normalizedPlan.id);
  const offer = offers.find(candidate =>
    candidate.providerKey === winner.providerKey &&
    candidate.providerPlanCode === winner.providerPlanCode,
  );
  if (!offer) return null;

  const dataAmountLabel = normalizedPlan.isUnlimited
    ? "Unlimited"
    : normalizedPlan.dataMb >= 1024
      ? `${Math.round((normalizedPlan.dataMb / 1024) * 10) / 10} GB`
      : `${normalizedPlan.dataMb} MB`;
  return {
    provider: offer.providerKey,
    providerRef: offer.providerPlanCode,
    countryCode: normalizedPlan.regionCode,
    dataAmountGb: normalizedPlan.isUnlimited ? 999 : normalizedPlan.dataMb / 1024,
    validityDays: normalizedPlan.validityDays,
    wholesaleCost: offer.wholesalePriceUsd,
    currency: offer.currency,
    name: normalizedPlan.name,
    dataAmount: dataAmountLabel,
    validity: `${normalizedPlan.validityDays} Day${normalizedPlan.validityDays !== 1 ? "s" : ""}`,
    coverage: normalizedPlan.regionCode,
    features: [],
    coverageType: offer.coverageType as "country" | "regional" | "global",
  };
}

export async function purchaseFromProvider(
  providerName: string,
  planDetails: { countryCode: string; dataAmountGb: number; validityDays: number }
): Promise<ProviderOrderResult> {
  // This compatibility API has no order/quote context, so it must still
  // resolve a concrete routed SKU before touching a supplier. Never issue a
  // spec-only purchase against an arbitrary provider name.
  const routed = await getBestPlan(
    planDetails.countryCode,
    planDetails.dataAmountGb,
    planDetails.validityDays,
  );
  if (!routed?.providerRef) {
    throw new Error("No routed supplier offer is available for this plan");
  }
  if (canonicalProviderKey(providerName) !== canonicalProviderKey(routed.provider)) {
    throw new Error(
      `Provider ${providerName} is not the routed supplier for this plan; use the common routing entrypoint`,
    );
  }
  const provider = providers.find(p =>
    canonicalProviderKey(p.name) === canonicalProviderKey(routed.provider),
  );
  if (!provider) throw new Error(`Unknown routed provider: ${routed.provider}`);
  return provider.purchaseEsim({
    ...planDetails,
    providerRef: routed.providerRef,
  });
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
export { purchaseEsim, getAvailableProviders } from "./providerManager";
