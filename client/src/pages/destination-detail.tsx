import { useRoute, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Wifi, Clock, Globe, Check, Zap, Star,
  Smartphone, BarChart2, ShoppingCart, Lock, ChevronDown,
  Flame, Gauge, Timer, TrendingUp,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import type { Destination, Plan } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the id looks like a UUID (old-style destination id) */
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || (!id.match(/^[A-Z]{2,3}$/i) && id.length > 5);
}

/** Flag emoji from CDN */
function flagSrc(code: string) {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function parseDataGb(dataAmount: string): number | null {
  const lower = dataAmount.toLowerCase();
  const gbMatch = lower.match(/(\d+(?:\.\d+)?)\s*gb/);
  if (gbMatch) return parseFloat(gbMatch[1]);
  const mbMatch = lower.match(/(\d+(?:\.\d+)?)\s*mb/);
  if (mbMatch) return parseFloat(mbMatch[1]) / 1000;
  if (lower.includes("unlimited")) return Infinity;
  return null;
}

function parseValidityDays(validity: string): number | null {
  const lower = validity.toLowerCase();
  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1]);
  const weekMatch = lower.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1]) * 7;
  const monthMatch = lower.match(/(\d+)\s*month/);
  if (monthMatch) return parseInt(monthMatch[1]) * 30;
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CountryMeta {
  countryCode: string;
  name: string;
  flagEmoji: string;
  region: string;
  planCount: number;
  isRegion?: boolean;
  type?: "country" | "region" | "global";
}

interface CountryPlan {
  normalizedPlanId: string;
  dataMb: number;
  validityDays: number;
  dataAmountGb: number;
  isUnlimited: boolean;
  dataLabel: string;
  validityLabel: string;
  estimatedPriceUsd: number;
  wholesaleCostUsd: number;
  providerCount: number;
}

// ─── Usage estimator (shared component) ───────────────────────────────────────

const usageProfiles = [
  { id: "light", label: "Light", description: "Maps, messaging, email", gbPerDay: 0.1, icon: "~100 MB/day" },
  { id: "moderate", label: "Moderate", description: "Social media, browsing, video calls", gbPerDay: 0.5, icon: "~500 MB/day" },
  { id: "heavy", label: "Heavy", description: "Streaming, hotspot, working remotely", gbPerDay: 2, icon: "~2 GB/day" },
];

function DataCalculatorLegacy({ plans, onHighlight }: { plans: Plan[]; onHighlight: (id: number | null) => void }) {
  const [usage, setUsage] = useState("moderate");
  const [days, setDays] = useState(7);
  const profile = usageProfiles.find(p => p.id === usage)!;
  const neededGb = profile.gbPerDay * days;

  const recommended = useMemo(() => {
    const eligible = plans.filter(p => {
      const gb = parseDataGb(p.dataAmount);
      if (gb === null) return false;
      if (gb === Infinity) return true;
      return gb >= neededGb;
    });
    if (eligible.length === 0) return null;
    return eligible.reduce((best, p) => p.price < best.price ? p : best, eligible[0]);
  }, [plans, neededGb]);

  return (
    <Card className="p-5 mb-8 border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
          <BarChart2 className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-semibold" data-testid="text-calculator-title">How much data do you need?</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Usage style</p>
          <div className="flex flex-col gap-2">
            {usageProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => { setUsage(p.id); onHighlight(null); }}
                className={`flex items-center justify-between px-3 py-2 rounded-md border text-left text-sm transition-colors ${usage === p.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                data-testid={`button-usage-${p.id}`}
              >
                <span>
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="ml-2 text-xs">{p.description}</span>
                </span>
                <span className="text-xs font-medium ml-2 flex-shrink-0">{p.icon}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Trip length</p>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 5, 7, 10, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); onHighlight(null); }}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${days === d ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                data-testid={`button-days-${d}`}
              >{d}d</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Estimated need: <strong className="text-foreground">{neededGb < 1 ? `${(neededGb * 1000).toFixed(0)} MB` : `${neededGb.toFixed(1)} GB`}</strong> for {days} day{days !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {recommended ? (
        <div
          className="flex items-center justify-between p-3 rounded-md border border-primary/40 bg-background cursor-pointer"
          onClick={() => onHighlight(recommended.id)}
          data-testid="button-recommended-plan"
        >
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Best match for your trip</p>
            <p className="text-sm font-semibold">{recommended.name} — {recommended.dataAmount}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">${recommended.price.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{recommended.validity}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="text-no-recommendation">
          No single plan covers this usage. Consider multiple top-ups.
        </p>
      )}
    </Card>
  );
}

function DataCalculatorNew({ plans, onHighlight }: { plans: CountryPlan[]; onHighlight: (id: string | null) => void }) {
  const [usage, setUsage] = useState("moderate");
  const [days, setDays] = useState(7);
  const profile = usageProfiles.find(p => p.id === usage)!;
  const neededGb = profile.gbPerDay * days;

  const recommended = useMemo(() => {
    const eligible = plans.filter(p => p.isUnlimited || p.dataAmountGb >= neededGb);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, p) =>
      p.estimatedPriceUsd < best.estimatedPriceUsd ? p : best, eligible[0]
    );
  }, [plans, neededGb]);

  return (
    <Card className="p-5 mb-8 border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
          <BarChart2 className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-semibold" data-testid="text-calculator-title">How much data do you need?</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Usage style</p>
          <div className="flex flex-col gap-2">
            {usageProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => { setUsage(p.id); onHighlight(null); }}
                className={`flex items-center justify-between px-3 py-2 rounded-md border text-left text-sm transition-colors ${usage === p.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                data-testid={`button-usage-${p.id}`}
              >
                <span>
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="ml-2 text-xs">{p.description}</span>
                </span>
                <span className="text-xs font-medium ml-2 flex-shrink-0">{p.icon}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Trip length</p>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 5, 7, 10, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); onHighlight(null); }}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${days === d ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                data-testid={`button-days-${d}`}
              >{d}d</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Estimated need: <strong className="text-foreground">{neededGb < 1 ? `${(neededGb * 1000).toFixed(0)} MB` : `${neededGb.toFixed(1)} GB`}</strong> for {days} day{days !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {recommended ? (
        <div
          className="flex items-center justify-between p-3 rounded-md border border-primary/40 bg-background cursor-pointer"
          onClick={() => onHighlight(recommended.normalizedPlanId)}
          data-testid="button-recommended-plan"
        >
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Best match for your trip</p>
            <p className="text-sm font-semibold">{recommended.dataLabel} · {recommended.validityLabel}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">${recommended.estimatedPriceUsd.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{recommended.validityLabel}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="text-no-recommendation">
          No single plan covers this usage.
        </p>
      )}
    </Card>
  );
}

function PricePerGb({ dataAmountGb, price, isUnlimited }: { dataAmountGb: number; price: number; isUnlimited: boolean }) {
  const { fmt, isApprox } = useCurrency();
  if (isUnlimited || dataAmountGb <= 0) return null;
  const ppgbUsd = price / dataAmountGb;
  return (
    <span className="text-xs text-muted-foreground" data-testid="text-price-per-gb">
      {isApprox ? "≈ " : ""}{fmt(ppgbUsd)}/GB
    </span>
  );
}

// ─── Currency-aware price summary for checkout modal ─────────────────────────────

function CheckoutPriceSummary({ usd }: { usd: number }) {
  const { fmt, isApprox, currency } = useCurrency();
  return (
    <div className="bg-muted/50 rounded-lg p-3 mb-4">
      <div className="flex justify-between text-sm items-end">
        <span className="text-muted-foreground">Estimated price</span>
        <div className="text-right">
          <span className="font-bold text-lg">{isApprox ? "≈ " : ""}{fmt(usd)}</span>
          {isApprox && (
            <p className="text-[11px] text-muted-foreground">${usd.toFixed(2)} USD</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
        <Lock className="w-3 h-3" />
        {isApprox
          ? `Checkout processed in USD · ${currency.code} is approximate`
          : "Final price confirmed at checkout"}
      </p>
    </div>
  );
}

// ─── Checkout modal (email capture for guests) ─────────────────────────────────

function CheckoutModal({
  plan,
  countryCode,
  onClose,
}: {
  plan: CountryPlan;
  countryCode: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const { data: me } = useQuery<{ id: string; email: string; name: string } | null>({
    queryKey: ["/api/auth/me"],
  });

  const checkout = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/checkout/country-plan", {
        normalizedPlanId: plan.normalizedPlanId,
        countryCode,
        dataLabel: plan.dataLabel,
        validityLabel: plan.validityLabel,
        dataAmountGb: plan.dataAmountGb,
        validityDays: plan.validityDays,
        email: me?.email || email,
        name: me?.name,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    checkout.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Confirm your plan</h3>
            <p className="text-sm text-muted-foreground">
              {plan.dataLabel} · {plan.validityLabel}
            </p>
          </div>
        </div>

        <CheckoutPriceSummary usd={plan.estimatedPriceUsd} />

        <form onSubmit={handleSubmit} className="space-y-3">
          {!me && (
            <div>
              <Label htmlFor="checkout-email" className="text-sm">Email for eSIM delivery</Label>
              <Input
                id="checkout-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="mt-1"
                data-testid="input-checkout-email"
              />
            </div>
          )}
          {me && (
            <p className="text-sm text-muted-foreground">
              eSIM will be sent to <strong>{me.email}</strong>
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={checkout.isPending}
            data-testid="button-confirm-checkout"
          >
            {checkout.isPending ? "Redirecting…" : "Continue to Payment"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onClose}
          >
            Cancel
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ─── Destination profile classification ───────────────────────────────────────

type DestinationProfile = "business_travel" | "holiday_travel" | "default_travel";

// Urban / work / diaspora corridors — 1-7 day short-trip rhythm
const BUSINESS_CODES = new Set([
  "NG","US","AE","CA","SG","HK","JP","DE","NL","AU","ZA","KE","GH",
  "QA","KW","BH","SA","OM","JO","LB","IN","CN","KR","RU","BR","AR",
  "GB","SE","NO","DK","FI","CH","AT","BE","PL","CZ","HU","RO",
]);

// Leisure / city-break / beach destinations — shorter stays, leisure data use
const HOLIDAY_CODES = new Set([
  "ES","IT","PT","GR","TR","TH","ID","MX","MA","EG","HR","CY","MT",
  "PH","VN","KH","LK","MV","MU","GE","AL","ME","RS","SI","SK",
  "IS","IE","LT","LV","EE","BG","MK","BA","XK","RE","NC","FJ",
]);

function getDestinationProfile(code: string): DestinationProfile {
  const c = code.toUpperCase();
  if (BUSINESS_CODES.has(c)) return "business_travel";
  if (HOLIDAY_CODES.has(c)) return "holiday_travel";
  return "default_travel";
}

// ─── Trip bucket definitions ───────────────────────────────────────────────────

interface TripBucket {
  id: "short" | "standard" | "extended" | "unlimited";
  label: string;
  description: string;
  icon: React.ElementType;
  daysMin: number;
  daysMax: number;
  isUnlimited?: boolean;
}

function getTripBuckets(profile: DestinationProfile): TripBucket[] {
  const unlimitedBucket: TripBucket = {
    id: "unlimited", label: "Heavy usage", icon: Flame,
    description: "Streaming, hotspot, or remote work",
    daysMin: 1, daysMax: 999, isUnlimited: true,
  };
  if (profile === "holiday_travel") {
    return [
      { id: "short",    label: "Short trips",   icon: Timer,      description: "Up to 3 days",              daysMin: 1,  daysMax: 4  },
      { id: "standard", label: "Standard trips", icon: Gauge,      description: "5–14 days — best for most", daysMin: 4,  daysMax: 15 },
      { id: "extended", label: "Extended trips", icon: TrendingUp, description: "Two weeks or more",         daysMin: 14, daysMax: 35 },
      unlimitedBucket,
    ];
  }
  return [
    { id: "short",    label: "Short trips",   icon: Timer,      description: "Up to 7 days",              daysMin: 1,  daysMax: 8  },
    { id: "standard", label: "Standard trips", icon: Gauge,      description: "7–14 days — best for most", daysMin: 7,  daysMax: 15 },
    { id: "extended", label: "Extended trips", icon: TrendingUp, description: "Two weeks or more",         daysMin: 14, daysMax: 35 },
    unlimitedBucket,
  ];
}

// ─── Plan curation logic ───────────────────────────────────────────────────────

type PlanBadge = "Most Popular" | "Best Value" | "Unlimited" | "Best for short trips" | "Best for longer stays";

interface CuratedPlan extends CountryPlan {
  badge?: PlanBadge;
  useCase: string;
  bucketId: string;
  isHighlighted: boolean;
}

function getUseCase(plan: CountryPlan, bucketId: string): string {
  if (plan.isUnlimited) return "Ideal for streaming, hotspot, and remote work";
  const gb = plan.dataAmountGb;
  if (bucketId === "short") {
    return gb <= 2 ? "Great for WhatsApp, maps, and light browsing" : "Plenty of data for a quick trip";
  }
  if (bucketId === "extended") return "Ideal for longer stays and regular use";
  if (gb <= 3)  return "Best for messaging, maps, and essential use";
  if (gb <= 8)  return "Great for browsing, social media, and video calls";
  return "Plenty of data for streaming and daily use";
}

function buildCuratedPlans(allPlans: CountryPlan[], profile: DestinationProfile): CuratedPlan[] {
  const buckets = getTripBuckets(profile);
  const used = new Set<string>();
  const result: CuratedPlan[] = [];

  // Strip noise: hide < 0.5 GB fixed-data plans
  const viable = allPlans.filter(p => p.isUnlimited || p.dataAmountGb >= 0.5);

  for (const bucket of buckets) {
    if (bucket.isUnlimited) {
      const unlimiteds = viable
        .filter(p => p.isUnlimited && !used.has(p.normalizedPlanId))
        .sort((a, b) => a.estimatedPriceUsd - b.estimatedPriceUsd)
        .slice(0, 2);
      unlimiteds.forEach(p => {
        used.add(p.normalizedPlanId);
        result.push({ ...p, bucketId: bucket.id, badge: undefined, useCase: getUseCase(p, bucket.id), isHighlighted: false });
      });
    } else {
      const matching = viable
        .filter(p => !p.isUnlimited && p.validityDays >= bucket.daysMin - 1 && p.validityDays <= bucket.daysMax + 2 && !used.has(p.normalizedPlanId))
        // Score: best cost-per-GB weighted by provider availability
        .sort((a, b) => {
          const scoreA = (a.dataAmountGb > 0 ? a.estimatedPriceUsd / a.dataAmountGb : 999) / Math.max(1, a.providerCount);
          const scoreB = (b.dataAmountGb > 0 ? b.estimatedPriceUsd / b.dataAmountGb : 999) / Math.max(1, b.providerCount);
          return scoreA - scoreB;
        })
        .slice(0, 2);
      matching.forEach(p => {
        used.add(p.normalizedPlanId);
        result.push({ ...p, bucketId: bucket.id, badge: undefined, useCase: getUseCase(p, bucket.id), isHighlighted: false });
      });
    }
  }

  // Apply pricing psychology labels
  const nonUnlimited = result.filter(p => !p.isUnlimited);

  // Most Popular = highest provider count (broadest availability)
  if (nonUnlimited.length > 0) {
    const pop = [...nonUnlimited].sort((a, b) => b.providerCount - a.providerCount)[0];
    pop.badge = "Most Popular";
    pop.isHighlighted = true;
  }

  // Best Value = best cost-per-GB among remaining non-highlighted
  const forValue = nonUnlimited.filter(p => !p.isHighlighted);
  if (forValue.length > 0) {
    const bv = forValue.sort((a, b) => {
      const ppA = a.dataAmountGb > 0 ? a.estimatedPriceUsd / a.dataAmountGb : 999;
      const ppB = b.dataAmountGb > 0 ? b.estimatedPriceUsd / b.dataAmountGb : 999;
      return ppA - ppB;
    })[0];
    bv.badge = "Best Value";
  }

  // First unlimited gets "Unlimited" badge
  const firstUnlimited = result.find(p => p.isUnlimited && !p.badge);
  if (firstUnlimited) firstUnlimited.badge = "Unlimited";

  return result;
}

// ─── Curated plan card ─────────────────────────────────────────────────────────

function CuratedPlanCard({
  plan,
  isHighlightedByCalc,
  onSelect,
}: {
  plan: CuratedPlan;
  isHighlightedByCalc: boolean;
  onSelect: (p: CountryPlan) => void;
}) {
  const highlighted = plan.isHighlighted || isHighlightedByCalc;
  const { fmt, isApprox } = useCurrency();
  const ppgb = !plan.isUnlimited && plan.dataAmountGb > 0
    ? `${isApprox ? "≈ " : ""}${fmt(plan.estimatedPriceUsd / plan.dataAmountGb)}/GB`
    : null;

  const badgeColor =
    plan.badge === "Most Popular" || isHighlightedByCalc ? "bg-primary text-primary-foreground"
    : plan.badge === "Best Value" ? "bg-emerald-500 text-white"
    : plan.badge === "Unlimited" ? "bg-violet-500 text-white"
    : "bg-muted text-foreground";

  return (
    <Card
      className={`relative flex flex-col p-5 transition-all duration-200 ${
        highlighted ? "ring-2 ring-primary shadow-lg" : "hover:border-primary/40"
      }`}
      data-testid={`card-plan-${plan.normalizedPlanId}`}
    >
      {/* Badge */}
      {(plan.badge || isHighlightedByCalc) && (
        <div className="absolute -top-3 left-4">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeColor}`}>
            {isHighlightedByCalc && !plan.badge && <><Star className="w-3 h-3" /> Recommended</>}
            {plan.badge === "Most Popular" && <><Star className="w-3 h-3" /> Most Popular</>}
            {plan.badge === "Best Value" && <><Check className="w-3 h-3" /> Best Value</>}
            {plan.badge === "Unlimited" && <><Zap className="w-3 h-3" /> Unlimited</>}
            {plan.badge && !["Most Popular","Best Value","Unlimited"].includes(plan.badge) && plan.badge}
          </span>
        </div>
      )}

      {/* Price */}
      <div className="mt-2 mb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold" data-testid={`text-plan-price-${plan.normalizedPlanId}`}>
            {isApprox ? "≈ " : ""}{fmt(plan.estimatedPriceUsd)}
          </span>
          {ppgb && <span className="text-xs text-muted-foreground">{ppgb}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isApprox ? `$${plan.estimatedPriceUsd.toFixed(2)} USD · ` : ""}one-time payment
        </p>
      </div>

      {/* Data + validity + providers */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <p className="font-bold text-sm leading-tight">{plan.dataLabel}</p>
          <p className="text-[11px] text-muted-foreground">data</p>
        </div>
        <div className="w-px h-8 bg-border flex-shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm leading-tight">{plan.validityLabel}</p>
          <p className="text-[11px] text-muted-foreground">validity</p>
        </div>
        {plan.providerCount > 1 && (
          <>
            <div className="w-px h-8 bg-border flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm leading-tight">{plan.providerCount}</p>
              <p className="text-[11px] text-muted-foreground">providers</p>
            </div>
          </>
        )}
      </div>

      {/* Use case */}
      <p className="text-xs text-muted-foreground flex-1 mb-4 leading-relaxed">{plan.useCase}</p>

      <Button
        className="w-full"
        variant={highlighted ? "default" : "outline"}
        onClick={() => onSelect(plan)}
        data-testid={`button-select-plan-${plan.normalizedPlanId}`}
      >
        Select Plan
      </Button>
    </Card>
  );
}

// ─── Curated plans section ─────────────────────────────────────────────────────

function CuratedPlansSection({
  plans,
  countryCode,
  countryName,
  highlightedPlanId,
  onSelect,
  onHighlight,
}: {
  plans: CountryPlan[];
  countryCode: string;
  countryName: string;
  highlightedPlanId: string | null;
  onSelect: (p: CountryPlan) => void;
  onHighlight: (id: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { fmt, isApprox } = useCurrency();
  const profile = getDestinationProfile(countryCode);
  const buckets = getTripBuckets(profile);
  const curated = useMemo(() => buildCuratedPlans(plans, profile), [plans, profile]);

  const totalPlans = plans.length;
  const curatedCount = curated.length;

  return (
    <div>
      {/* Section header */}
      <div className="mb-7">
        <h2 className="text-xl font-bold mb-1" data-testid="text-curated-title">
          Recommended plans for {countryName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick the right plan based on how long you're staying and how much data you need.
        </p>
      </div>

      {/* Grouped buckets */}
      <div className="space-y-7 mb-8">
        {buckets.map(bucket => {
          const bucketPlans = curated.filter(p => p.bucketId === bucket.id);
          if (bucketPlans.length === 0) return null;
          const BucketIcon = bucket.icon;
          return (
            <div key={bucket.id} data-testid={`section-bucket-${bucket.id}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BucketIcon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">{bucket.label}</p>
                  <p className="text-xs text-muted-foreground">{bucket.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bucketPlans.map(plan => (
                  <CuratedPlanCard
                    key={plan.normalizedPlanId}
                    plan={plan}
                    isHighlightedByCalc={highlightedPlanId === plan.normalizedPlanId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* View all plans toggle */}
      {totalPlans > curatedCount && (
        <div className="border-t pt-5">
          <button
            onClick={() => setShowAll(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline underline-offset-2 transition-colors"
            data-testid="button-toggle-all-plans"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`} />
            {showAll ? "Hide full plan list" : `Compare all ${totalPlans} plans`}
          </button>

          {showAll && (
            <div className="mt-5">
              <p className="text-xs text-muted-foreground mb-4 uppercase tracking-widest font-bold">All available plans</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map(plan => {
                  const isHighlighted = highlightedPlanId === plan.normalizedPlanId;
                  return (
                    <Card
                      key={plan.normalizedPlanId}
                      className={`p-5 flex flex-col relative transition-shadow ${isHighlighted ? "ring-2 ring-primary shadow-lg" : ""}`}
                      data-testid={`card-plan-all-${plan.normalizedPlanId}`}
                    >
                      {isHighlighted && (
                        <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground">
                          <Star className="w-3 h-3 mr-1" /> Recommended
                        </Badge>
                      )}
                      {plan.isUnlimited && !isHighlighted && (
                        <Badge variant="secondary" className="absolute top-3 left-3 text-xs">Unlimited</Badge>
                      )}
                      <div className="mb-3 mt-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-2xl font-bold">
                            {isApprox ? "≈ " : ""}{fmt(plan.estimatedPriceUsd)}
                          </span>
                          <PricePerGb dataAmountGb={plan.dataAmountGb} price={plan.estimatedPriceUsd} isUnlimited={plan.isUnlimited} />
                        </div>
                        {isApprox && (
                          <p className="text-[11px] text-muted-foreground">${plan.estimatedPriceUsd.toFixed(2)} USD</p>
                        )}
                      </div>
                      <div className="space-y-2 flex-1 mb-4">
                        <FeatureRow icon={<Wifi />} label={plan.dataLabel} sub="Data" />
                        <FeatureRow icon={<Clock />} label={plan.validityLabel} sub="Validity" />
                        <FeatureRow icon={<Globe />} label={countryName} sub="Coverage" />
                        {plan.providerCount > 1 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            {plan.providerCount} providers available
                          </div>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        variant={isHighlighted ? "default" : "outline"}
                        onClick={() => onSelect(plan)}
                        data-testid={`button-buy-plan-${plan.normalizedPlanId}`}
                      >
                        Select Plan
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Legacy mode (UUID-based destinations) ────────────────────────────────────

function LegacyDetail({ destId }: { destId: string }) {
  const [, navigate] = useLocation();
  const [highlightedPlanId, setHighlightedPlanId] = useState<number | null>(null);

  const { data: destination, isLoading: destLoading } = useQuery<Destination>({
    queryKey: ["/api/destinations", destId],
    queryFn: async () => {
      const res = await fetch(`/api/destinations/${destId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans", destId],
    queryFn: async () => {
      const res = await fetch(`/api/plans?destinationId=${destId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const isLoading = destLoading || plansLoading;

  if (isLoading) return <LoadingSkeleton />;
  if (!destination) return <NotFoundState />;

  const sortedPlans = plans ? [...plans].sort((a, b) => a.price - b.price) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <BackButton />
      <CountryHero imageUrl={destination.imageUrl} name={destination.name} region={destination.region ?? ""} />
      {sortedPlans.length > 0 && (
        <DataCalculatorLegacy plans={sortedPlans} onHighlight={setHighlightedPlanId} />
      )}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-1">Available Plans</h2>
        <p className="text-sm text-muted-foreground">
          {sortedPlans.length} plan{sortedPlans.length !== 1 ? "s" : ""} — sorted by price
        </p>
      </div>
      {sortedPlans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlans.map(plan => {
            const isPopular = plan.popular || false;
            const isHighlighted = highlightedPlanId === plan.id;
            const dataGb = parseDataGb(plan.dataAmount);
            const isUnlimited = dataGb === Infinity;

            return (
              <Card
                key={plan.id}
                className={`p-5 flex flex-col relative transition-shadow ${isHighlighted ? "ring-2 ring-primary shadow-lg" : isPopular ? "ring-2 ring-primary" : ""}`}
                data-testid={`card-plan-${plan.id}`}
              >
                {(isPopular || isHighlighted) && (
                  <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground">
                    <Star className="w-3 h-3 mr-1" />
                    {isHighlighted ? "Recommended" : "Popular"}
                  </Badge>
                )}
                <h3 className="font-semibold text-base mb-2" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h3>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold" data-testid={`text-plan-price-${plan.id}`}>${plan.price.toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">{plan.currency}</span>
                  {dataGb && dataGb !== Infinity && (
                    <span className="text-xs text-muted-foreground">${(plan.price / dataGb).toFixed(2)}/GB</span>
                  )}
                </div>
                <div className="space-y-2 flex-1 mb-5">
                  <FeatureRow icon={<Wifi />} label={plan.dataAmount} sub="Data" />
                  <FeatureRow icon={<Clock />} label={plan.validity} sub="Validity" />
                  <FeatureRow icon={<Globe />} label={plan.coverage} sub="Coverage" />
                  {plan.speedInfo && <FeatureRow icon={<Zap />} label={plan.speedInfo} sub="Speed" />}
                </div>
                {plan.features && plan.features.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  className="w-full"
                  variant={isPopular || isHighlighted ? "default" : "outline"}
                  onClick={() => navigate(`/checkout/${plan.id}`)}
                  data-testid={`button-buy-plan-${plan.id}`}
                >
                  Select Plan
                </Button>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyPlans />
      )}
      <CompatibilityCard />
    </div>
  );
}

// ─── New mode (country-code-based destinations) ───────────────────────────────

function CountryDetail({ countryCode }: { countryCode: string }) {
  const [highlightedPlanId, setHighlightedPlanId] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<CountryPlan | null>(null);
  const code = countryCode.toUpperCase();

  const { data: meta, isLoading: metaLoading } = useQuery<CountryMeta>({
    queryKey: ["/api/countries", code],
    queryFn: async () => {
      const res = await fetch(`/api/countries/${code}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: planData, isLoading: plansLoading } = useQuery<{ countryCode: string; plans: CountryPlan[] }>({
    queryKey: ["/api/countries", code, "plans"],
    queryFn: async () => {
      const res = await fetch(`/api/countries/${code}/plans`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const isLoading = metaLoading || plansLoading;
  if (isLoading) return <LoadingSkeleton />;
  if (!meta) return <NotFoundState />;

  const plans = planData?.plans ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          countryCode={code}
          onClose={() => setCheckoutPlan(null)}
        />
      )}

      <BackButton />

      {/* Hero */}
      <div className="relative rounded-xl overflow-hidden mb-8 h-48 sm:h-56 bg-muted">
        {/* Flag image (only for country codes; hidden for regions via onError) */}
        {!meta.isRegion && (
          <img
            src={`https://flagcdn.com/w1280/${code.toLowerCase()}.png`}
            alt={meta.name}
            className="w-full h-full object-cover opacity-60"
            onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
          />
        )}
        {/* Decorative gradient background for regions */}
        {meta.isRegion && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5 flex items-center gap-3">
          <span className="text-4xl">{meta.flagEmoji}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" data-testid="text-destination-title">
              {meta.name}
            </h1>
            <p className="text-white/70 text-sm" data-testid="text-destination-region">
              {meta.isRegion ? "Multi-country plan" : meta.region}
            </p>
          </div>
        </div>
        {plans.length > 0 && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-black/50 text-white border-white/20 backdrop-blur-sm">
              {plans.length} plan{plans.length !== 1 ? "s" : ""} available
            </Badge>
          </div>
        )}
      </div>

      {plans.length > 0 ? (
        <CuratedPlansSection
          plans={plans}
          countryCode={code}
          countryName={meta.name}
          highlightedPlanId={highlightedPlanId}
          onSelect={setCheckoutPlan}
          onHighlight={setHighlightedPlanId}
        />
      ) : (
        <EmptyPlans />
      )}

      <CompatibilityCard />
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FeatureRow({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 flex-shrink-0">
        <span className="w-4 h-4 text-primary [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function CountryHero({ imageUrl, name, region }: { imageUrl: string; name: string; region: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden mb-8">
      <img src={imageUrl} alt={name} className="w-full h-48 sm:h-56 object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute bottom-0 left-0 p-5 flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-white/20 backdrop-blur-sm">
          <Globe className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white" data-testid="text-destination-title">{name}</h1>
          <p className="text-white/70 text-sm" data-testid="text-destination-region">{region}</p>
        </div>
      </div>
    </div>
  );
}

function BackButton() {
  return (
    <Link href="/destinations">
      <Button variant="ghost" className="mb-4" data-testid="button-back-destinations">
        <ArrowLeft className="w-4 h-4 mr-2" />
        All Destinations
      </Button>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Skeleton className="h-8 w-48 mb-6" />
      <Skeleton className="h-52 w-full rounded-xl mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-5 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-4" />
            <Skeleton className="h-9 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-20 text-center">
      <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">Destination not found</h2>
      <Link href="/destinations">
        <Button variant="outline">Browse Destinations</Button>
      </Link>
    </div>
  );
}

function EmptyPlans() {
  return (
    <Card className="p-10 text-center">
      <Wifi className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground">No plans available for this destination yet</p>
    </Card>
  );
}

function CompatibilityCard() {
  return (
    <Card className="mt-8 p-5 flex items-start gap-3 border-border bg-muted/30">
      <Smartphone className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium mb-1">Need to check your device?</p>
        <p className="text-xs text-muted-foreground mb-2">
          Most phones from 2018 onwards support eSIM. Verify yours before purchasing.
        </p>
        <Link href="/compatibility">
          <Button variant="outline" size="sm" data-testid="button-check-compatibility">
            Check device compatibility
          </Button>
        </Link>
      </div>
    </Card>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default function DestinationDetail() {
  const [, params] = useRoute("/destinations/:id");
  const destId = params?.id ?? "";

  // Canonical region slugs used by the catalog engine
  const REGION_SLUGS = new Set([
    "GLOBAL", "EUROPE", "APAC", "LATAM", "MENA", "AFRICA",
    "NORTHAM", "SEASIA", "SOUTHASIA", "CARIBBEAN",
  ]);

  // Match: ISO country codes (2-3 letters) OR canonical region slugs
  const upper = destId.toUpperCase();
  const isCountryCode = /^[A-Za-z]{2,3}$/.test(destId) || REGION_SLUGS.has(upper);

  if (isCountryCode) {
    return <CountryDetail countryCode={upper} />;
  }

  return <LegacyDetail destId={destId} />;
}
