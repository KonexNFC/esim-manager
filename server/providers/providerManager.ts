import { storage } from "../storage";
import { db } from "../storage";
import { esimgo } from "./esimgo";
import { esimAccess } from "./esimAccess";
import { zendit } from "./zendit";
import { airalo } from "./airalo";
import type { EsimProvider, ProviderOrderResult } from "./types";
import { and, eq } from "drizzle-orm";
import { destinations, normalizedPlans } from "@shared/schema";
import { canonicalProviderKey } from "../services/providerHealth";
import { getOffersForNormalizedPlan } from "../services/providerRegistry";
import { selectBestProviderForPlan } from "../services/routingEngine";

const providerRegistry: Record<string, EsimProvider> = {
  esimgo,
  esimAccess,
  zendit,
  airalo,
};

function providerForKey(providerName: string): { key: string; provider: EsimProvider } | null {
  const key = canonicalProviderKey(providerName);
  const entry = Object.entries(providerRegistry).find(([registeredKey]) =>
    canonicalProviderKey(registeredKey) === key,
  );
  return entry ? { key: canonicalProviderKey(entry[0]), provider: entry[1] } : null;
}

/**
 * Resolve a legacy plans-table plan to the same policy used by normalized
 * checkout.  An explicit providerName is intentionally treated as a pinned
 * singleton (admin/legacy compatibility), never as an invitation to silently
 * fail over to another supplier SKU.
 */
async function resolveProviderForPlan(plan: Awaited<ReturnType<typeof storage.getPlan>>, providerName?: string) {
  if (!plan) throw new Error("Plan not found");

  if (providerName && providerName !== "manual") {
    const selected = providerForKey(providerName);
    if (!selected) throw new Error(`Unknown provider: ${providerName}`);
    if (!plan.externalPlanCode) {
      throw new Error(`Pinned provider ${providerName} requires the plan's exact supplier SKU`);
    }
    return {
      ...selected,
      providerRef: plan.externalPlanCode ?? undefined,
      pinned: true,
    };
  }

  if (plan.provider && plan.provider !== "manual") {
    const selected = providerForKey(plan.provider);
    if (!selected) throw new Error(`Unknown pinned provider: ${plan.provider}`);
    if (!plan.externalPlanCode) {
      throw new Error(`Pinned provider ${plan.provider} requires the plan's exact supplier SKU`);
    }
    return {
      ...selected,
      providerRef: plan.externalPlanCode ?? undefined,
      pinned: true,
    };
  }

  const destination = plan.destinationId
    ? (await db.select().from(destinations).where(eq(destinations.id, plan.destinationId)))[0]
    : undefined;
  if (!destination) throw new Error(`Plan ${plan.id} has no destination for routing`);

  const dataMb = Math.round(plan.dataAmountGb * 1024);
  const normalizedCandidates = await db
    .select()
    .from(normalizedPlans)
    .where(and(
      eq(normalizedPlans.regionCode, destination.countryCode.toUpperCase()),
      eq(normalizedPlans.validityDays, plan.validityDays),
      eq(normalizedPlans.isActive, true),
    ))
    .limit(20);
  const normalized = normalizedCandidates.find(candidate =>
    candidate.isUnlimited || candidate.dataMb === dataMb,
  );
  if (!normalized) {
    throw new Error(`Plan ${plan.id} has no normalized product for routing`);
  }

  const decision = await selectBestProviderForPlan(normalized.id, "blended_score");
  const winner = decision.fallbackChain[0];
  if (!winner) throw new Error(`No eligible provider for normalized plan ${normalized.id}`);
  const offers = await getOffersForNormalizedPlan(normalized.id);
  const offer = offers.find(candidate =>
    candidate.providerKey === winner.providerKey &&
    candidate.providerPlanCode === winner.providerPlanCode,
  );
  const selected = providerForKey(winner.providerKey);
  if (!selected || !offer) {
    throw new Error(`Routed provider ${winner.providerKey} is unavailable`);
  }
  return {
    ...selected,
    providerRef: offer.providerPlanCode,
    pinned: false,
  };
}

export interface PurchaseResult {
  iccid: string;
  qrCodeUrl: string;
  activationUrl?: string;
  provider: string;
}

export async function purchaseEsim(
  planId: string | number,
  providerName?: string,
): Promise<PurchaseResult> {
  const plan = await storage.getPlan(String(planId));
  if (!plan) {
    throw new Error(`Plan with id ${planId} not found`);
  }

  const selected = await resolveProviderForPlan(plan, providerName);
  const provider = selected.provider;
  const providerKey = selected.key;

  if ("isConfigured" in provider && typeof (provider as any).isConfigured === "function") {
    if (!(provider as any).isConfigured()) {
      throw new Error(`Provider ${providerKey} is not configured (missing API key)`);
    }
  }

  console.log(
    `[providerManager] Purchasing via ${providerKey}${selected.pinned ? " (pinned)" : ""} — plan #${planId} (${plan.dataAmount}, ${plan.validity})`
  );

  const result: ProviderOrderResult = await provider.purchaseEsim({
    countryCode: plan.coverage,
    dataAmountGb: plan.dataAmountGb,
    validityDays: plan.validityDays,
    providerRef: selected.providerRef,
  });

  console.log(`[providerManager] Purchase successful — ICCID: ${result.iccid}`);

  return {
    iccid: result.iccid,
    qrCodeUrl: result.qrCodeUrl,
    activationUrl: result.activationUrl,
    provider: providerKey,
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
