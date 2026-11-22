import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export interface ChinaPlan {
  id: string;
  bucket: string;
  dataGb: number | null;
  isUnlimited: boolean;
  validityDays?: number;
  quote: { amount: number; currency: "USD"; token: string; expiresAt: string };
}

interface ChinaCatalogue {
  durations: Record<string, {
    recommended?: ChinaPlan | null;
    cheaper?: ChinaPlan | null;
    premium?: ChinaPlan | null;
    browseAll?: ChinaPlan[];
  }>;
}

export function quotedChinaPlans(catalogue: ChinaCatalogue | undefined, now: number): ChinaPlan[] {
  const unique = new Map<string, ChinaPlan>();
  for (const duration of Object.values(catalogue?.durations ?? {})) {
    for (const plan of [duration.recommended, duration.cheaper, duration.premium, ...(duration.browseAll ?? [])]) {
      if (!plan?.id || !plan.bucket || plan.quote?.currency !== "USD"
        || !Number.isFinite(plan.quote.amount) || plan.quote.amount <= 0
        || !plan.quote.token || !(Date.parse(plan.quote.expiresAt) > now)) continue;
      if (!unique.has(plan.id)) unique.set(plan.id, plan);
    }
  }
  return [...unique.values()].sort((a, b) => a.quote.amount - b.quote.amount);
}

export function chinaDataLabel(plan: ChinaPlan): string {
  return plan.isUnlimited ? "Unlimited data" : typeof plan.dataGb === "number" && plan.dataGb > 0 ? chinaDataSize(plan.dataGb) : "Data plan";
}

export function chinaDataSize(gb: number): string {
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb} GB`;
}

export function chinaValidity(plan: ChinaPlan): number | undefined {
  return typeof plan.validityDays === "number" && Number.isFinite(plan.validityDays) && plan.validityDays > 0 ? plan.validityDays : undefined;
}

export function chinaPlanHref(plan: ChinaPlan): string {
  return `/destinations/CN?${new URLSearchParams({ plan: plan.id, bucket: plan.bucket })}`;
}

export function useChinaPlans() {
  const query = useQuery<ChinaCatalogue>({
    queryKey: ["/api/plans/public/CN"],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const plans = quotedChinaPlans(query.data, Math.max(now, Date.now()));
  const groups = new Map<string, ChinaPlan>();
  for (const plan of plans) {
    const label = chinaDataLabel(plan);
    if (!groups.has(label)) groups.set(label, plan);
  }
  const sizes = [...new Set(plans.filter(p => !p.isUnlimited && typeof p.dataGb === "number" && p.dataGb > 0).map(p => p.dataGb as number))].sort((a, b) => a - b);
  const validityOptions = [...new Set(plans.map(chinaValidity).filter((day): day is number => day !== undefined))].sort((a, b) => a - b);
  return {
    ...query,
    plans,
    groupedPlans: [...groups.values()],
    fromPrice: plans[0]?.quote.amount,
    sizes,
    validityOptions,
    hasUnlimited: plans.some(p => p.isUnlimited),
  };
}
