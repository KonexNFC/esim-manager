import { useRoute, Link, useLocation } from "wouter";
import { TravelImage } from "@/components/travel-image";
import { DestinationImage } from "@/components/destination-image";
import { getDestinationPhoto } from "@/lib/travel-imagery";
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
  Flame, Gauge, Timer, TrendingUp, Infinity as InfinityIcon, HardDrive,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency, Price, formatCharge } from "@/lib/currency";
import type { Destination, Plan } from "@shared/schema";
import { purchasableCatalogue } from "@shared/purchasable-catalogue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the id looks like a UUID (old-style destination id) */
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || (!id.match(/^[A-Z]{2,3}$/i) && id.length > 5);
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

function DataCalculatorLegacy({ plans, onHighlight }: { plans: Plan[]; onHighlight: (id: string | null) => void }) {
  const { fmt, isApprox } = useCurrency();
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
            <p className="font-bold">{isApprox ? "≈ " : ""}{fmt(recommended.price)}</p>
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
  const { fmt, isApprox } = useCurrency();
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
            <p className="font-bold">{isApprox ? "≈ " : ""}{fmt(recommended.estimatedPriceUsd)}</p>
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
      apiRequest("POST", "/api/checkout/stripe/create-session", {
        normalizedPlanId: plan.normalizedPlanId,
        countryCode,
        countryName: countryCode,
        region: countryCode,
        dataLabel: plan.dataLabel,
        validityLabel: plan.validityLabel,
        dataAmountGb: plan.dataAmountGb,
        validityDays: plan.validityDays,
        email: me?.email || email,
        userId: me?.id,
        userName: me?.name,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.sessionUrl) window.location.href = data.sessionUrl;
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
  // Western Europe leisure
  "FR","ES","IT","PT","GR","HR","CY","MT","IS","MC","SM","AD",
  // Eastern / Central Europe city-break
  "AL","ME","RS","SI","SK","BG","MK","BA","XK","LT","LV","EE","UA",
  // Turkey + North Africa
  "TR","MA","TN","EG",
  // Middle East leisure (JO in business codes; these are additional leisure markets)
  "KZ",
  // South / Southeast Asia beach & tourism
  "TH","ID","PH","VN","KH","LK","MV","MM","LA","BT",
  // East Asia leisure
  "TW",
  // Indian Ocean / islands
  "MU","RE","SC","YT",
  // Pacific
  "FJ","NC","PF","WS","TO",
  // Latin America leisure
  "MX","CU","DO","PR","JM","BB","LC","VC","GD","TT","AW","CW","BQ",
  "PA","CR","GT","HN","NI","BZ","SV",
  // Africa leisure
  "ZW","BW","LS","SZ","TZ","RW","UG","ZM",
  // Caucasus / Central Asia tourism
  "GE","AM","AZ",
  // Ireland (listed separately from GB which is business)
  "IE",
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
    description: "Unlimited data — check the plan terms before buying",
    daysMin: 1, daysMax: 999, isUnlimited: true,
  };
  if (profile === "holiday_travel") {
    // Holiday: city-breaks (1–4d) → week/fortnight (5–14d) → long holiday (15–30d)
    return [
      { id: "short",    label: "City break",    icon: Timer,      description: "1–4 days",    daysMin: 1,  daysMax: 4  },
      { id: "standard", label: "Week away",      icon: Gauge,      description: "5–14 days",   daysMin: 5,  daysMax: 14 },
      { id: "extended", label: "Long holiday",   icon: TrendingUp, description: "15–30 days",  daysMin: 15, daysMax: 30 },
      unlimitedBucket,
    ];
  }
  // Business/diaspora/default:
  // short=1–6d (so 7-day plans fall into the "Standard trip" bracket — more accurate)
  return [
    { id: "short",    label: "Quick trip",    icon: Timer,      description: "1–6 days",    daysMin: 1,  daysMax: 6  },
    { id: "standard", label: "Standard trip", icon: Gauge,      description: "7–14 days",   daysMin: 7,  daysMax: 14 },
    { id: "extended", label: "Extended stay", icon: TrendingUp, description: "15–30 days",  daysMin: 15, daysMax: 30 },
    unlimitedBucket,
  ];
}

// ─── Plan curation logic ───────────────────────────────────────────────────────

type PlanBadge = "Recommended" | "Most Popular" | "Best Value" | "Unlimited";

interface CuratedPlan extends CountryPlan {
  badge?: PlanBadge;
  useCase: string;
  bucketId: string;
  isHighlighted: boolean;
  isPrimary: boolean;
}

function getUseCase(plan: CountryPlan, bucketId: string, profile: DestinationProfile): string {
  if (plan.isUnlimited) {
    if (plan.validityDays <= 3)  return "Unlimited data for your trip — check the plan terms before buying";
    if (plan.validityDays <= 7)  return "Unlimited data for your week away — check the plan terms before buying";
    if (plan.validityDays <= 14) return "Two weeks of unlimited data — ideal for remote work, streaming, and heavy use";
    return "Month-long unlimited data — use as much as you need, no restrictions";
  }
  const gb = plan.dataAmountGb;
  const days = plan.validityDays;
  const isHoliday = profile === "holiday_travel";
  const isBusiness = profile === "business_travel";

  if (bucketId === "short") {
    if (gb <= 1)  return "Maps, WhatsApp, and ride apps — everything you need for a short visit";
    if (gb <= 2)  return isHoliday
      ? "Enough for maps, Instagram stories, and staying in touch while you explore"
      : "Maps, email, messaging, and Uber — perfect for a quick business trip";
    if (gb <= 4)  return isHoliday
      ? "Browse, share photos, and use Google Maps without watching your usage"
      : "Stay connected, check emails, and join video calls for a few days";
    return `${gb} GB for ${days} days — plenty to browse, share photos, and stream clips`;
  }

  if (bucketId === "standard") {
    if (gb <= 3)  return "Messaging, maps, and light browsing for the week — great if you're mostly on Wi-Fi";
    if (gb <= 6)  return isHoliday
      ? "Maps, social media, and video calls — all you need for a relaxed week away"
      : "Email, video calls, maps, and messaging throughout the working week";
    if (gb <= 10) return isHoliday
      ? "Browse freely, share photos, and video call home without running out of data"
      : "A full week of meetings, maps, emails, and browsing without rationing";
    if (gb <= 20) return "Generous data for the week — stream, video call, and share without thinking about it";
    return `${gb} GB over ${days} days — for heavy users who don't want to think about data`;
  }

  if (bucketId === "extended") {
    if (gb <= 8)  return "Light daily use — maps, messaging, and occasional browsing for a longer stay";
    if (gb <= 15) return isBusiness
      ? "Daily connectivity for a longer assignment — email, calls, and browsing covered"
      : "Enough for regular daily use across a longer stay without running short";
    if (gb <= 25) return "Solid data for an extended trip — browse, stream, and video call every day";
    return `${gb} GB for the longer haul — stream, work remotely, and share without worry`;
  }

  // fallback
  return `${gb} GB · ${days} days — one-time payment, instant activation`;
}

// Score a plan within a specific bucket: lower is better.
// Considers value-per-GB, provider confidence, commercial attractiveness,
// duration fit, and data appropriateness for the bucket.
function planScoreForBucket(p: CountryPlan, bucket: TripBucket): number {
  if (p.dataAmountGb <= 0) return 9999;

  // Value: cost per GB — primary efficiency signal
  const ppgb = p.estimatedPriceUsd / p.dataAmountGb;

  // Provider confidence: more providers = more reliable (reduces score)
  const providerBonus = 1 / Math.max(1, p.providerCount);

  // Commercial price window: $3–$35 is the sweet spot; extremes are penalised
  let pricePenalty = 0;
  if      (p.estimatedPriceUsd < 2)  pricePenalty = 5;
  else if (p.estimatedPriceUsd < 3)  pricePenalty = 1.5;
  else if (p.estimatedPriceUsd > 50) pricePenalty = 2;
  else if (p.estimatedPriceUsd > 35) pricePenalty = 0.5;

  // Data floor: micro plans are deprioritised even if cheap per GB
  const dataPenalty = p.dataAmountGb < 0.5 ? 5 : p.dataAmountGb < 1 ? 2 : 0;

  // Duration fit: plans whose validity is near the bucket midpoint are preferred.
  // A 7-day plan is a great fit for a "7–14 day" standard bucket midpoint of 10.5 days.
  const bucketMid = (bucket.daysMin + Math.min(bucket.daysMax, 21)) / 2;
  const daysFit   = Math.abs(p.validityDays - bucketMid) * 0.04;

  // Data overkill guard: a 50 GB plan for a 1-day trip is a bad recommendation
  let dataOverkill = 0;
  if (!bucket.isUnlimited) {
    // Typical max sensible data: ~1.5 GB/day for the bucket midpoint
    const sensibleMax = Math.max(3, bucketMid * 1.5);
    if (p.dataAmountGb > sensibleMax * 2) {
      dataOverkill = (p.dataAmountGb - sensibleMax * 2) * 0.08;
    }
  }

  return ppgb * providerBonus + pricePenalty + dataPenalty + daysFit + dataOverkill;
}

// Two plans are meaningfully different only when they offer a clearly distinct option:
// noticeably different data tier (≥50% difference) OR validity tier (≥4 days apart),
// AND a clear price step (≥25%). This prevents near-duplicates appearing as "alternatives".
function meaningfullyDifferent(primary: CountryPlan, candidate: CountryPlan): boolean {
  const dataRatio  = primary.dataAmountGb > 0
    ? Math.abs(candidate.dataAmountGb - primary.dataAmountGb) / primary.dataAmountGb
    : 0;
  const validDiff  = Math.abs(candidate.validityDays - primary.validityDays);
  const priceDiff  = primary.estimatedPriceUsd > 0
    ? Math.abs(candidate.estimatedPriceUsd - primary.estimatedPriceUsd) / primary.estimatedPriceUsd
    : 0;
  // Need a real data-tier jump OR a different validity window — AND a visible price step
  return (dataRatio >= 0.5 || validDiff >= 4) && priceDiff >= 0.25;
}

function buildCuratedPlans(allPlans: CountryPlan[], profile: DestinationProfile): CuratedPlan[] {
  const buckets = getTripBuckets(profile);
  const used = new Set<string>();
  const result: CuratedPlan[] = [];

  // Noise floor: skip fixed plans under 1 GB (useless for most travellers).
  // Fall back to 0.5 GB floor if the destination has very few plans.
  const pool1gb = allPlans.filter(p => p.isUnlimited || p.dataAmountGb >= 1.0);
  const pool    = pool1gb.length >= 4 ? pool1gb : allPlans.filter(p => p.isUnlimited || p.dataAmountGb >= 0.5);

  for (const bucket of buckets) {
    if (bucket.isUnlimited) {
      // Unlimited bucket: prefer 7-day plans (most commercially useful), then sort by price.
      // 7d > 5d > 10d > 14d > 3d > 30d > anything else, tiebreak on provider count then price.
      const PREFERRED_DAYS = [7, 5, 10, 14, 3, 30, 1, 2];
      const unlimiteds = pool
        .filter(p => p.isUnlimited && !used.has(p.normalizedPlanId))
        .sort((a, b) => {
          const ai = PREFERRED_DAYS.indexOf(a.validityDays);
          const bi = PREFERRED_DAYS.indexOf(b.validityDays);
          const ap = ai === -1 ? 99 : ai;
          const bp = bi === -1 ? 99 : bi;
          if (ap !== bp) return ap - bp;
          if (a.providerCount !== b.providerCount) return b.providerCount - a.providerCount;
          return a.estimatedPriceUsd - b.estimatedPriceUsd;
        });

      const primary = unlimiteds[0];
      if (!primary) continue;
      used.add(primary.normalizedPlanId);
      result.push({
        ...primary, bucketId: bucket.id, badge: undefined,
        useCase: getUseCase(primary, bucket.id, profile),
        isHighlighted: false, isPrimary: true,
      });

      // One alternative only — must be clearly different validity (≥5 days apart)
      const secondary = unlimiteds.slice(1).find(p => Math.abs(p.validityDays - primary.validityDays) >= 5);
      if (secondary) {
        used.add(secondary.normalizedPlanId);
        result.push({
          ...secondary, bucketId: bucket.id, badge: undefined,
          useCase: getUseCase(secondary, bucket.id, profile),
          isHighlighted: false, isPrimary: false,
        });
      }
    } else {
      // Fixed-data bucket: score plans using bucket-aware scoring so duration fit
      // and data-overkill penalties apply, not just raw cost-per-GB.
      const matching = pool
        .filter(p =>
          !p.isUnlimited &&
          p.validityDays >= bucket.daysMin &&
          p.validityDays <= bucket.daysMax &&
          !used.has(p.normalizedPlanId)
        )
        .sort((a, b) => planScoreForBucket(a, bucket) - planScoreForBucket(b, bucket));

      if (matching.length === 0) continue;

      const primary = matching[0];
      used.add(primary.normalizedPlanId);
      result.push({
        ...primary, bucketId: bucket.id, badge: undefined,
        useCase: getUseCase(primary, bucket.id, profile),
        isHighlighted: false, isPrimary: true,
      });

      // One alternative only — must be meaningfully different (stricter thresholds)
      const secondary = matching.slice(1).find(p => meaningfullyDifferent(primary, p));
      if (secondary) {
        used.add(secondary.normalizedPlanId);
        result.push({
          ...secondary, bucketId: bucket.id, badge: undefined,
          useCase: getUseCase(secondary, bucket.id, profile),
          isHighlighted: false, isPrimary: false,
        });
      }
    }
  }

  // Assign per-bucket badges to all primary plans
  assignCuratedBadges(result, buckets);
  return result;
}

function assignCuratedBadges(plans: CuratedPlan[], buckets: TripBucket[]): void {
  // Strategy: every PRIMARY plan gets a badge. Alternative plans get none.
  // Badge per bucket:
  //   short    → "Recommended"   (the obvious first choice)
  //   standard → "Most Popular"  (highest-traffic bucket)
  //   extended → "Best Value"    (longer stay = better per-day economics)
  //   unlimited → "Unlimited"    (self-explanatory)
  //
  // If a destination only has one bucket visible, that primary gets "Recommended".

  const primaryPlans = plans.filter(p => p.isPrimary);

  // Build default badge per bucket id
  const DEFAULT_BADGE: Record<string, PlanBadge> = {
    short:    "Recommended",
    standard: "Most Popular",
    extended: "Best Value",
    unlimited: "Unlimited",
  };

  // If there's only one primary, always use "Recommended"
  if (primaryPlans.length === 1) {
    primaryPlans[0].badge = "Recommended";
    primaryPlans[0].isHighlighted = true;
    return;
  }

  // Assign per-bucket defaults to all primaries
  for (const plan of primaryPlans) {
    plan.badge = DEFAULT_BADGE[plan.bucketId] ?? "Recommended";
  }

  // isHighlighted drives the filled button on the card.
  // Award it to the standard-bucket primary (most commercially important),
  // or the first primary if there's no standard bucket.
  const standardPrimary = primaryPlans.find(p => p.bucketId === "standard");
  const highlightTarget = standardPrimary ?? primaryPlans[0];
  if (highlightTarget) {
    highlightTarget.isHighlighted = true;
  }

  // Prevent "Best Value" from being awarded if the extended plan is NOT meaningfully
  // cheaper per GB than the standard plan — replace with "Recommended" instead.
  const extPrimary = primaryPlans.find(p => p.bucketId === "extended");
  const stdPrimary = primaryPlans.find(p => p.bucketId === "standard");
  if (extPrimary && stdPrimary && extPrimary.dataAmountGb > 0 && stdPrimary.dataAmountGb > 0) {
    const extPpgb = extPrimary.estimatedPriceUsd / extPrimary.dataAmountGb;
    const stdPpgb = stdPrimary.estimatedPriceUsd / stdPrimary.dataAmountGb;
    if (extPpgb >= stdPpgb * 0.90) {
      // Extended plan isn't genuinely better value — call it "Recommended" for the bucket
      extPrimary.badge = "Recommended";
    }
  }
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
  const { fmt, isApprox } = useCurrency();

  // Price per GB shown lightly for fixed plans (not the hero value prop)
  const ppgb = !plan.isUnlimited && plan.dataAmountGb > 0
    ? `${isApprox ? "≈ " : ""}${fmt(plan.estimatedPriceUsd / plan.dataAmountGb)}/GB`
    : null;

  const badge = isHighlightedByCalc && !plan.badge ? "Recommended" : plan.badge;

  const isRecommended   = badge === "Recommended";
  const isMostPopular   = badge === "Most Popular";
  const isBestValue     = badge === "Best Value";
  const isUnlimitedBadge = badge === "Unlimited";
  const hasBadge        = !!badge;

  // Card ring treatment: Most Popular and calc-highlighted get the strongest treatment
  const cardRing =
    isMostPopular || isHighlightedByCalc
      ? "ring-2 ring-primary shadow-lg bg-primary/[0.03]"
      : isRecommended
      ? "ring-1 ring-primary/50 shadow-sm"
      : isBestValue
      ? "ring-1 ring-emerald-500/50 hover:ring-emerald-500/70"
      : isUnlimitedBadge
      ? "ring-1 ring-violet-500/40 hover:ring-violet-500/60"
      : "hover:border-primary/40";

  const badgeBg =
    isMostPopular || isHighlightedByCalc ? "bg-primary text-primary-foreground"
    : isRecommended  ? "bg-primary/90 text-primary-foreground"
    : isBestValue    ? "bg-emerald-500 text-white"
    : isUnlimitedBadge ? "bg-violet-600 text-white"
    : "bg-muted text-foreground";

  // All primary plans get a filled button; alternatives stay outline
  const buttonVariant: "default" | "outline" = plan.isPrimary || isHighlightedByCalc ? "default" : "outline";

  return (
    <Card
      className={`relative flex flex-col p-5 transition-all duration-200 ${cardRing}`}
      data-testid={`card-plan-${plan.normalizedPlanId}`}
    >
      {/* Badge pill — floated above the card top edge */}
      {hasBadge && (
        <div className="absolute -top-3 left-4">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${badgeBg}`}>
            {(isRecommended || isMostPopular || isHighlightedByCalc) && <Star className="w-3 h-3" />}
            {isBestValue      && <Check className="w-3 h-3" />}
            {isUnlimitedBadge && <Zap className="w-3 h-3" />}
            {badge}
          </span>
        </div>
      )}

      {/* Price — hero element */}
      <div className="mt-2 mb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold tracking-tight" data-testid={`text-plan-price-${plan.normalizedPlanId}`}>
            {isApprox ? "≈ " : ""}{fmt(plan.estimatedPriceUsd)}
          </span>
          {ppgb && (
            <span className="text-xs text-muted-foreground">{ppgb}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          one-time · instant activation
        </p>
      </div>

      {/* Data / validity / providers row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{plan.dataLabel}</p>
          <p className="text-[11px] text-muted-foreground">data</p>
        </div>
        <div className="w-px h-8 bg-border flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{plan.validityLabel}</p>
          <p className="text-[11px] text-muted-foreground">validity</p>
        </div>
        {plan.providerCount > 1 && (
          <>
            <div className="w-px h-8 bg-border flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">{plan.providerCount}</p>
              <p className="text-[11px] text-muted-foreground">providers</p>
            </div>
          </>
        )}
      </div>

      {/* Use case helper text */}
      <p className="text-xs text-muted-foreground flex-1 mb-4 leading-relaxed">{plan.useCase}</p>

      <Button
        className="w-full"
        variant={buttonVariant}
        onClick={() => onSelect(plan)}
        data-testid={`button-select-plan-${plan.normalizedPlanId}`}
      >
        Select Plan
      </Button>
    </Card>
  );
}

// ─── Compact alternative plan row ─────────────────────────────────────────────

function AlternativePlanRow({
  plan,
  isHighlightedByCalc,
  fmt,
  isApprox,
  onSelect,
}: {
  plan: CuratedPlan;
  isHighlightedByCalc: boolean;
  fmt: (v: number) => string;
  isApprox: boolean;
  onSelect: (p: CountryPlan) => void;
}) {
  const ppgb = !plan.isUnlimited && plan.dataAmountGb > 0
    ? `${isApprox ? "≈ " : ""}${fmt(plan.estimatedPriceUsd / plan.dataAmountGb)}/GB`
    : null;

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
        isHighlightedByCalc
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-muted/20 hover:border-primary/30"
      }`}
      data-testid={`row-alternative-${plan.normalizedPlanId}`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="flex-shrink-0">
          <p className="text-sm font-semibold">{plan.dataLabel}</p>
          <p className="text-xs text-muted-foreground">{plan.validityLabel}</p>
        </div>
        {ppgb && (
          <span className="text-xs text-muted-foreground hidden sm:inline flex-shrink-0">{ppgb}</span>
        )}
        <p className="text-xs text-muted-foreground truncate hidden md:block">{plan.useCase}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <div className="text-right">
          <p className="font-bold text-sm whitespace-nowrap">
            {isApprox ? "≈ " : ""}{fmt(plan.estimatedPriceUsd)}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-3 whitespace-nowrap"
          onClick={() => onSelect(plan)}
          data-testid={`button-select-alternative-${plan.normalizedPlanId}`}
        >
          Select
        </Button>
      </div>
    </div>
  );
}

// ─── Public-plans types (for /api/plans/public/:code) ─────────────────────────

interface PublicPlan {
  id: string;
  normalizedPlanId?: string;
  bucket: string;
  offerType: string;
  dataGb: number | null;
  isUnlimited: boolean;
  hotspotSupported?: boolean | null;
  isSynthetic: boolean;
  wholesaleCostUsd: number;
  sellPriceGbp: number;
  recommendationRole: string;
  score: number;
  inTargetBand: boolean;
  quote?: {
    token: string;
    amount: number;
    currency: "USD";
    expiresAt: string;
  };
}

interface DurationData {
  bucket: string;
  recommended: PublicPlan | null;
  cheaper: PublicPlan | null;
  premium: PublicPlan | null;
  browseAll: PublicPlan[];
}

interface PublicPlansResponse {
  countryCode: string;
  defaultDuration: string;
  availableDurations: string[];
  durations: Record<string, DurationData>;
}

const BUCKET_LABELS: Record<string, string> = {
  DAY_1: "1 Day", DAY_3: "3 Days", DAY_5: "5 Days",
  DAY_7: "7 Days", DAY_14: "14 Days", DAY_30: "30 Days",
};

const BUCKET_DAYS: Record<string, number> = {
  DAY_1: 1, DAY_3: 3, DAY_5: 5, DAY_7: 7, DAY_14: 14, DAY_30: 30,
};

// ─── All plans comparison table (legacy use) ──────────────────────────────────

function AllPlansTable({
  plans,
  curatedIds,
  highlightedPlanId,
  isApprox,
  fmt,
  onSelect,
}: {
  plans: CountryPlan[];
  curatedIds: Set<string>;
  highlightedPlanId: string | null;
  isApprox: boolean;
  fmt: (v: number) => string;
  onSelect: (p: CountryPlan) => void;
}) {
  // Split and sort: fixed data sorted by validity then data; unlimited by validity
  const fixedPlans = [...plans.filter(p => !p.isUnlimited)].sort((a, b) => {
    if (a.validityDays !== b.validityDays) return a.validityDays - b.validityDays;
    return a.dataAmountGb - b.dataAmountGb;
  });
  const unlimitedPlans = [...plans.filter(p => p.isUnlimited)].sort((a, b) => a.validityDays - b.validityDays);

  const ColHeader = ({ label, right }: { label: string; right?: boolean }) => (
    <th className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${right ? "text-right" : "text-left"}`}>
      {label}
    </th>
  );

  const renderRows = (rows: CountryPlan[]) =>
    rows.map((plan, idx) => {
      const isCurated    = curatedIds.has(plan.normalizedPlanId);
      const isRec        = highlightedPlanId === plan.normalizedPlanId;
      const ppgb         = !plan.isUnlimited && plan.dataAmountGb > 0
        ? `${isApprox ? "≈ " : ""}${fmt(plan.estimatedPriceUsd / plan.dataAmountGb)}`
        : "—";
      const rowBg        = isRec
        ? "bg-primary/5"
        : idx % 2 === 0 ? "" : "bg-muted/20";

      return (
        <tr
          key={plan.normalizedPlanId}
          className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${rowBg}`}
          data-testid={`row-plan-${plan.normalizedPlanId}`}
        >
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{plan.dataLabel}</span>
              {isCurated && (
                <span className="text-[10px] text-primary font-bold leading-none">★</span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
            {plan.validityLabel}
          </td>
          <td className="px-4 py-3 text-sm text-right font-bold whitespace-nowrap">
            {isApprox ? "≈ " : ""}{fmt(plan.estimatedPriceUsd)}
          </td>
          <td className="px-4 py-3 text-xs text-right text-muted-foreground hidden sm:table-cell whitespace-nowrap">
            {ppgb}
          </td>
          <td className="px-4 py-3 text-right">
            <Button
              size="sm"
              variant={isRec ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => onSelect(plan)}
              data-testid={`button-buy-plan-${plan.normalizedPlanId}`}
            >
              Select
            </Button>
          </td>
        </tr>
      );
    });

  return (
    <div className="mt-5 space-y-5">
      {/* Fixed data plans */}
      {fixedPlans.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Fixed data plans ({fixedPlans.length})
          </p>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <ColHeader label="Data" />
                  <ColHeader label="Validity" />
                  <ColHeader label="Price" right />
                  <ColHeader label="$/GB" right />
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>{renderRows(fixedPlans)}</tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">★ highlighted in recommended plans above</p>
        </div>
      )}

      {/* Unlimited plans */}
      {unlimitedPlans.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Unlimited plans ({unlimitedPlans.length})
          </p>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <ColHeader label="Data" />
                  <ColHeader label="Validity" />
                  <ColHeader label="Price" right />
                  <ColHeader label="$/GB" right />
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>{renderRows(unlimitedPlans)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Legacy mode (UUID-based destinations) ────────────────────────────────────

function LegacyDetail({ destId }: { destId: string }) {
  const { fmt, isApprox } = useCurrency();
  const [, navigate] = useLocation();
  const [highlightedPlanId, setHighlightedPlanId] = useState<string | null>(null);

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

  useEffect(() => {
    if (destination?.name) {
      document.title = `${destination.name} eSIM Plans | Konex eSIM`;
    } else {
      document.title = "Konex eSIM | Instant Data Plans for 205+ Countries";
    }
  }, [destination?.name]);

  const isLoading = destLoading || plansLoading;

  if (isLoading) return <LoadingSkeleton />;
  if (!destination) return <NotFoundState />;

  const sortedPlans = plans ? [...plans].sort((a, b) => a.price - b.price) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <BackButton />
      <CountryHero countryCode={destination.countryCode} name={destination.name} region={destination.region ?? ""} planCount={new Set(sortedPlans.map(p => p.id)).size} fromPrice={sortedPlans[0]?.price} />
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
                  <span className="text-3xl font-bold" data-testid={`text-plan-price-${plan.id}`}>{isApprox ? "≈ " : ""}{fmt(plan.price)}</span>
                  {dataGb && dataGb !== Infinity && (
                    <span className="text-xs text-muted-foreground"><Price amount={plan.price / dataGb} />/GB</span>
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

// ─── Travel Plans Flow (duration-based, using /api/plans/public/:code) ────────

// ─── Pricing engine ───────────────────────────────────────────────────────────

// ─── Plan data label helpers ──────────────────────────────────────────────────

function publicPlanDataLabel(plan: PublicPlan): string {
  if (plan.isUnlimited) return "Unlimited";
  if (plan.dataGb === null) return "—";
  return plan.dataGb >= 1
    ? `${Math.round(plan.dataGb * 10) / 10} GB`
    : `${Math.round(plan.dataGb * 1024)} MB`;
}

function publicPlanTitle(plan: PublicPlan): string {
  if (plan.isUnlimited) return "Unlimited Data";
  if (plan.dataGb === null) return "Data Plan";
  const gb = plan.dataGb;
  return gb >= 1 ? `${Math.round(gb * 10) / 10} GB Data` : `${Math.round(gb * 1024)} MB Data`;
}

function quoteAmount(plan: PublicPlan): number {
  return plan.quote?.amount ?? 0;
}

function quotePrice(plan: PublicPlan) {
  return <Price amount={quoteAmount(plan)} />;
}

function travelCopy(plan: PublicPlan, durationDays: number): string {
  if (plan.isUnlimited) {
    if (durationDays <= 1) return "Full-speed data all day — maps, streaming, video calls, no limits.";
    if (durationDays <= 3) return "No data caps for your whole trip — stream, navigate, and stay in touch freely.";
    if (durationDays <= 5) return "Five days of unlimited data — perfect for an extended break or city trip.";
    return "Unlimited data for your trip — check the plan terms before buying.";
  }
  const gb = plan.dataGb ?? 0;
  if (gb < 0.5) return "Essential connectivity — messaging apps and light browsing for the trip.";
  if (gb < 2) return "Maps, WhatsApp, and ride apps — everything you need for a short visit.";
  if (gb < 5) return "Maps, social media, and video calls — great if you'll also have Wi-Fi access.";
  return `${publicPlanDataLabel(plan)} of data — browse, share photos, and video call without running out.`;
}

// ─── Travel Plans Flow (uses /api/plans/public/:code data) ────────────────────

function PlanTrustBadges() {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-4">
      {["Instant QR delivery", "Works on arrival", "No roaming charges"].map(t => (
        <span key={t} className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="w-3 h-3 text-primary flex-shrink-0" /> {t}
        </span>
      ))}
    </div>
  );
}

function deduplicatePlans(plans: PublicPlan[]): PublicPlan[] {
  const seen = new Map<string, PublicPlan>();
  for (const p of plans) {
    const key = p.isUnlimited
      ? `unlimited::${quoteAmount(p).toFixed(2)}`
      : `fixed::${(p.dataGb ?? 0).toFixed(3)}::${quoteAmount(p).toFixed(2)}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

function PublicBrowseAll({
  plans,
  fmt,
  onSelect,
}: {
  plans: PublicPlan[];
  fmt: (usd: number) => string;
  onSelect: (p: PublicPlan) => void;
}) {
  if (plans.length === 0) return null;

  const allUnlimited = plans.filter(p => p.isUnlimited).sort((a, b) => quoteAmount(a) - quoteAmount(b));
  const allFixed = plans.filter(p => !p.isUnlimited && (p.dataGb ?? 0) >= 0.5)
    .sort((a, b) => (a.dataGb ?? 0) - (b.dataGb ?? 0) || quoteAmount(a) - quoteAmount(b));

  const unlimited = deduplicatePlans(allUnlimited);
  const fixed = deduplicatePlans(allFixed);

  const renderGroup = (items: PublicPlan[], label: string) => {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        <div className="space-y-1.5">
          {items.map(p => (
            <div
              key={p.id}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-border bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.02] transition-colors"
              data-testid={`row-browse-${p.id}`}
            >
              <div className="min-w-0">
                <span className="font-semibold text-sm">{publicPlanDataLabel(p)}</span>
                <span className="text-muted-foreground text-xs ml-2">
                  {`· ${BUCKET_LABELS[p.bucket] ?? p.bucket} validity`}
                </span>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0 ml-3">
                <span className="font-bold text-sm">{quotePrice(p)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-3"
                  onClick={() => onSelect(p)}
                  data-testid={`button-browse-select-${p.id}`}
                >
                  Select
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-4">
      {renderGroup(fixed, `Data allowance plans (${fixed.length})`)}
      {renderGroup(unlimited, `Unlimited plans (${unlimited.length})`)}
    </div>
  );
}

function PlanComparison({ data, bucket, onBucketChange, onSelect }: {
  data: PublicPlansResponse;
  bucket: string;
  onBucketChange: (bucket: string) => void;
  onSelect: (plan: PublicPlan) => void;
}) {
  const duration = data.durations[bucket];
  const tiers = [
    { label: "Budget", plan: duration?.cheaper },
    { label: "Recommended", plan: duration?.recommended },
    { label: "Premium", plan: duration?.premium },
  ];
  const rows: { label: string; render: (plan: PublicPlan) => React.ReactNode }[] = [
    { label: "Data allowance", render: publicPlanDataLabel },
    { label: "Validity", render: p => BUCKET_LABELS[p.bucket] ?? "Not stated" },
    { label: "Total price", render: p => p.quote ? quotePrice(p) : "Not available" },
    { label: "Price per day", render: p => p.quote && BUCKET_DAYS[p.bucket] ? <><Price amount={p.quote.amount / BUCKET_DAYS[p.bucket]} />/day</> : "Not stated" },
    { label: "Price per GB", render: p => p.isUnlimited ? "Unlimited" : p.quote && p.dataGb != null && p.dataGb > 0 ? <><Price amount={p.quote.amount / p.dataGb} />/GB</> : "Not stated" },
    { label: "Hotspot", render: p => p.hotspotSupported === true ? "Supported" : p.hotspotSupported === false ? "Not supported" : "Check before buying" },
  ];
  return (
    <section aria-labelledby="compare-options-title" className="mb-10">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Your trip, compared</p>
        <h2 id="compare-options-title" className="text-2xl sm:text-3xl font-bold">Compare your options</h2>
        <p className="text-sm text-muted-foreground mt-2">Choose a duration to compare the available tiers side by side. You are charged in USD; other display currencies are approximate.</p>
      </div>
      <div role="group" aria-label="Comparison duration" className="flex flex-wrap gap-2 mb-5">
        {data.availableDurations.map(b => (
          <button key={b} type="button" aria-pressed={bucket === b} onClick={() => onBucketChange(b)}
            data-testid={`button-compare-duration-${b}`}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${bucket === b ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}>
            {BUCKET_LABELS[b] ?? b}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card" role="region" aria-label="Plan tier comparison, scroll horizontally for all options" tabIndex={0}>
        <table className="w-full min-w-[660px] table-fixed text-sm">
          <caption className="sr-only">Compare Budget, Recommended and Premium options for {BUCKET_LABELS[bucket] ?? bucket}. Validity and daily prices use the plan's duration bucket.</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="w-[24%] p-4 text-left text-muted-foreground font-medium">Plan details</th>
              {tiers.map(({ label }) => <th key={label} scope="col" className={`p-4 text-center text-base ${label === "Recommended" ? "bg-primary/10 text-primary" : ""}`}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, render }) => (
              <tr key={label} className="border-b">
                <th scope="row" className="p-4 text-left font-medium text-muted-foreground">{label}</th>
                {tiers.map(({ label: tier, plan }) => (
                  <td key={tier} className={`p-4 text-center tabular-nums ${tier === "Recommended" ? "bg-primary/5" : ""}`}>
                    {plan ? render(plan) : <span className="text-xs text-muted-foreground">Not available for this duration</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="p-4 text-left text-muted-foreground font-medium">Choose a plan</th>
              {tiers.map(({ label, plan }) => (
                <td key={label} className={`p-4 text-center ${label === "Recommended" ? "bg-primary/5" : ""}`}>
                  {plan ? <Button variant={label === "Recommended" ? "default" : "outline"} disabled={!plan.quote} onClick={() => onSelect(plan)} aria-label={`Select ${label} plan for ${BUCKET_LABELS[bucket] ?? bucket}`} data-testid={`button-compare-select-${label.toLowerCase()}`}>Select</Button> : <span className="text-xs text-muted-foreground">Not available for this duration</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Validity is shown by duration bucket. Daily prices use the same bucket days.</p>
    </section>
  );
}

function TravelPlansFlow({
  data,
  onSelectPublic,
  initialBucket,
}: {
  data: PublicPlansResponse;
  onSelectPublic: (p: PublicPlan) => void;
  initialBucket?: string;
}) {
  const { fmt, isApprox } = useCurrency();
  const availBuckets = data.availableDurations.filter(b => BUCKET_LABELS[b]);
  const defaultBucket = availBuckets.includes(data.defaultDuration)
    ? data.defaultDuration
    : availBuckets[0] ?? "DAY_3";

  const [selectedComparisonBucket, setComparisonBucket] = useState(() =>
    initialBucket && data.availableDurations.includes(initialBucket) ? initialBucket : defaultBucket
  );
  const comparisonBucket = availBuckets.includes(selectedComparisonBucket) ? selectedComparisonBucket : defaultBucket;
  const [viewMode, setViewMode] = useState<"flow" | "matrix">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "matrix" : "flow"
  );
  const [expandedBrowse, setExpandedBrowse] = useState<Set<string>>(new Set());

  // ── Price inversion hints ─────────────────────────────────────────────────
  // When a shorter-duration bucket's recommended plan costs MORE than a
  // longer-duration bucket's recommended plan, show a "better value" tip.
  const inversions = useMemo(() => {
    const map = new Map<string, { nextBucket: string; nextPrice: number; nextLabel: string }>();
    for (let i = 0; i < availBuckets.length - 1; i++) {
      const cur = availBuckets[i];
      const curRec = data.durations[cur]?.recommended;
      if (!curRec) continue;
      for (let j = i + 1; j < availBuckets.length; j++) {
        const next = availBuckets[j];
        const nextRec = data.durations[next]?.recommended;
        if (nextRec && quoteAmount(nextRec) < quoteAmount(curRec)) {
          map.set(cur, {
            nextBucket: next,
            nextPrice: quoteAmount(nextRec),
            nextLabel: BUCKET_LABELS[next] ?? next,
          });
          break;
        }
      }
    }
    return map;
  }, [availBuckets, data.durations]);

  // ── Build plan matrix: dataKey × bucket → best plan ──────────────────────
  const availableAllowances = new Set<number | "unknown">();
  const matrixMap = new Map<string, PublicPlan>(); // key = `${gb}::${bucket}`
  for (const bucket of availBuckets) {
    const durData = data.durations[bucket];
    if (!durData) continue;
    const allInBucket = [
      durData.recommended,
      durData.cheaper,
      durData.premium,
      ...durData.browseAll,
    ].filter((p): p is PublicPlan => p !== null && p !== undefined);
    for (const plan of allInBucket) {
      // Preserve the historic unlimited cell ID (0), without treating missing
      // or zero fixed allowances as unlimited.
      const gb = plan.isUnlimited ? 0 : plan.dataGb != null && plan.dataGb > 0 ? plan.dataGb : "unknown";
      availableAllowances.add(gb);
      const key = `${gb}::${bucket}`;
      const existing = matrixMap.get(key);
      if (!existing || quoteAmount(plan) < quoteAmount(existing)) {
        matrixMap.set(key, plan);
      }
    }
  }
  const matrixRows = Array.from(availableAllowances).sort((a, b) =>
    (a === "unknown" ? Infinity : a === 0 ? Number.MAX_VALUE : a) -
    (b === "unknown" ? Infinity : b === 0 ? Number.MAX_VALUE : b)
  );

  return (
    <div>
      <PlanComparison data={data} bucket={comparisonBucket} onBucketChange={setComparisonBucket} onSelect={onSelectPublic} />
      {/* Header + view toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" data-testid="text-duration-title">
          {viewMode === "flow" ? "Choose your plan" : "All available plans"}
        </h2>
        <div className="flex border rounded-lg overflow-hidden text-xs font-semibold">
          <button
            onClick={() => setViewMode("flow")}
            aria-pressed={viewMode === "flow"}
            className={`px-3 py-1.5 transition-colors ${viewMode === "flow" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            data-testid="button-view-flow"
          >
            By duration
          </button>
          <button
            onClick={() => setViewMode("matrix")}
            aria-pressed={viewMode === "matrix"}
            className={`px-3 py-1.5 transition-colors border-l ${viewMode === "matrix" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            data-testid="button-view-matrix"
          >
            Plan grid
          </button>
        </div>
      </div>

      {/* ── Matrix view ─────────────────────────────────────────────── */}
      {viewMode === "matrix" && (
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Tap any cell to select that plan. Greyed cells have no plan available.
          </p>
          <div className="overflow-x-auto -mx-0 rounded-xl border" role="region" aria-label="All plans grid, scroll horizontally" tabIndex={0}>
            <table className="text-sm border-collapse" style={{ minWidth: "100%" }}>
              <caption className="sr-only">Available plans by data allowance and duration bucket. Select a price to continue.</caption>
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground border-b border-r whitespace-nowrap min-w-[68px] sticky left-0 bg-muted z-10">
                    Data
                  </th>
                  {availBuckets.map(b => (
                    <th scope="col" key={b} className="px-2 py-2 text-xs font-semibold text-center border-b border-r last:border-r-0 whitespace-nowrap min-w-[58px]">
                      {BUCKET_LABELS[b]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((gb, ri) => (
                  <tr key={gb} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <th scope="row" className={`px-2 py-2 text-left text-xs font-semibold border-r border-b last:border-b-0 whitespace-nowrap sticky left-0 z-10 ${ri % 2 === 0 ? "bg-background" : "bg-muted"}`}>
                      {gb === 0 ? "Unlimited" : gb === "unknown" ? "Not stated" : `${gb} GB`}
                    </th>
                    {availBuckets.map(b => {
                      const plan = matrixMap.get(`${gb}::${b}`);
                      return (
                        <td key={b} className="px-1.5 py-1.5 text-center border-r border-b last:border-r-0 last:border-b-0">
                          {plan ? (
                            <button
                              onClick={() => onSelectPublic(plan)}
                              aria-label={`Select ${publicPlanDataLabel(plan)}, ${BUCKET_LABELS[b] ?? b}`}
                              className="w-full rounded-md px-1.5 py-1.5 font-semibold text-xs bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap"
                              data-testid={`button-matrix-${gb}-${b}`}
                            >
                              {quotePrice(plan)}
                            </button>
                          ) : (
                            <span className="block rounded-md bg-muted px-1.5 py-1.5 text-muted-foreground text-xs"><span aria-hidden="true">—</span><span className="sr-only">Not available</span></span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Flow view — all durations simultaneously ──────────────── */}
      {viewMode === "flow" && (
        <div className="space-y-3">
          {availBuckets.map(bucket => {
            const durData = data.durations[bucket];
            const rec = durData?.recommended ?? null;
            const cheaper = durData?.cheaper ?? null;
            const browseAll = durData?.browseAll ?? [];
            const days = parseInt(bucket.replace("DAY_", ""), 10);
            const isPopular = bucket === defaultBucket;

            // Best fixed-data alternative: prefer cheaper slot, then first non-unlimited in browseAll
            const fixedAlt: PublicPlan | null =
              (cheaper && !cheaper.isUnlimited ? cheaper : null) ??
              browseAll.find(p => !p.isUnlimited) ??
              null;

            // Extra browse options (excluding rec + fixedAlt), deduplicated by price
            const excludeIds = new Set([rec?.id, fixedAlt?.id].filter(Boolean) as string[]);
            const extraOptions = deduplicatePlans(browseAll.filter(p => !excludeIds.has(p.id)));
            const isExpanded = expandedBrowse.has(bucket);

            return (
              <div
                key={bucket}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  isPopular
                    ? "border-primary"
                    : "border-border"
                }`}
                data-testid={`card-bucket-${bucket}`}
              >
                {/* Duration header */}
                <div className={`px-4 py-2.5 flex items-center justify-between ${isPopular ? "bg-primary/5" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{BUCKET_LABELS[bucket]}</span>
                    {isPopular && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                        <Star className="w-2.5 h-2.5" /> Popular
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {days === 1 ? "Daily plan" : `${days}-day validity`}
                  </span>
                </div>

                {/* Price inversion hint — shown when a longer plan is cheaper */}
                {inversions.has(bucket) && (() => {
                  const hint = inversions.get(bucket)!;
                  return (
                    <div
                      className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/50 dark:border-amber-800/40 flex items-start gap-2"
                      data-testid={`banner-inversion-${bucket}`}
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                        <span className="font-semibold">Better value tip:</span>{" "}
                        the {hint.nextLabel} plan costs only <Price amount={hint.nextPrice} /> — less than this plan. Consider stepping up.
                      </p>
                    </div>
                  );
                })()}

                {/* Plan rows */}
                <div className="divide-y divide-border/40">
                  {/* Recommended plan row */}
                  {rec ? (
                    <div className="flex items-center justify-between px-4 py-3.5 bg-background gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${rec.isUnlimited ? "bg-primary/10" : "bg-emerald-50 dark:bg-emerald-950/40"}`}>
                          {rec.isUnlimited
                            ? <InfinityIcon className="w-4 h-4 text-primary" />
                            : <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">{publicPlanTitle(rec)}</span>
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">
                              <Zap className="w-2.5 h-2.5" /> {fixedAlt ? "Top pick" : "Best value"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            <Price amount={quoteAmount(rec) / days} />/day
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="font-bold text-base tabular-nums">
                          {quotePrice(rec)}
                        </span>
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs font-semibold"
                          onClick={() => onSelectPublic(rec)}
                          data-testid={`button-get-plan-${bucket}`}
                        >
                          Get plan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3.5 text-sm text-muted-foreground italic">
                      No recommended plan for this duration. See the other available options below.
                    </div>
                  )}

                  {/* Fixed-data alternative row */}
                  {fixedAlt && (
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/20 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-foreground">{publicPlanTitle(fixedAlt)}</span>
                          <div className="text-xs text-muted-foreground">
                            Fixed data · <Price amount={quoteAmount(fixedAlt) / days} />/day
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="font-semibold text-sm tabular-nums text-muted-foreground">
                          {quotePrice(fixedAlt)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => onSelectPublic(fixedAlt)}
                          data-testid={`button-get-fixed-${bucket}`}
                        >
                          Select
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* More options toggle */}
                  {extraOptions.length > 0 && (
                    <div className="bg-muted/10">
                      <button
                        className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setExpandedBrowse(prev => {
                          const next = new Set(prev);
                          if (next.has(bucket)) next.delete(bucket);
                          else next.add(bucket);
                          return next;
                        })}
                        data-testid={`button-more-options-${bucket}`}
                      >
                        <span>{isExpanded ? "Hide" : `${extraOptions.length} more option${extraOptions.length > 1 ? "s" : ""}`}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-1.5">
                          {extraOptions.map(p => {
                            const roleLabel =
                              p.recommendationRole === "PREMIUM" ? "Premium" :
                              p.recommendationRole === "CHEAPER" ? "Budget" : null;
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/60 bg-background hover:border-primary/30 transition-colors"
                                data-testid={`row-extra-${p.id}`}
                              >
                                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{publicPlanTitle(p)}</span>
                                  {roleLabel && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      {roleLabel}
                                    </span>
                                  )}
                                  {p.hotspotSupported && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                                      Hotspot
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                  <span className="font-semibold text-sm tabular-nums">
                                    {quotePrice(p)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => onSelectPublic(p)}
                                    data-testid={`button-extra-select-${p.id}`}
                                  >
                                    Select
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <PlanTrustBadges />
        </div>
      )}
    </div>
  );
}

// ─── New mode (country-code-based destinations) ───────────────────────────────

function CountryDetail({ countryCode }: { countryCode: string }) {
  const [checkoutPlan, setCheckoutPlan] = useState<PublicPlan | null>(null);
  const code = countryCode.toUpperCase();

  const urlParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const urlBucket = urlParams.get("bucket") ?? undefined;
  const urlPlan   = urlParams.get("plan")   ?? undefined;

  const { data: meta, isLoading: metaLoading } = useQuery<CountryMeta>({
    queryKey: ["/api/countries", code],
    queryFn: async () => {
      const res = await fetch(`/api/countries/${code}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: publicPlans, isLoading: plansLoading } = useQuery<PublicPlansResponse>({
    queryKey: ["/api/plans/public", code],
    queryFn: async () => {
      const res = await fetch(`/api/plans/public/${code}`);
      if (!res.ok) throw new Error("Failed");
      return purchasableCatalogue(await res.json() as PublicPlansResponse);
    },
  });

  useEffect(() => {
    if (meta?.name) {
      document.title = `${meta.name} eSIM Plans | Konex eSIM`;
    } else {
      document.title = "Konex eSIM | Instant Data Plans for 205+ Countries";
    }
  }, [meta?.name]);

  // Auto-open checkout when a specific plan ID is passed via ?plan=<id>
  useEffect(() => {
    if (!urlPlan || !publicPlans) return;
    for (const dur of Object.values(publicPlans.durations)) {
      const candidates = [
        dur.recommended,
        dur.cheaper,
        dur.premium,
        ...(dur.browseAll ?? []),
      ].filter(Boolean) as PublicPlan[];
      const found = candidates.find(p => p.id === urlPlan);
      if (found) {
        setCheckoutPlan(found);
        break;
      }
    }
  }, [publicPlans, urlPlan]);

  const isLoading = metaLoading || plansLoading;
  if (isLoading) return <LoadingSkeleton />;
  if (!meta) return <NotFoundState />;

  const hasPlans = publicPlans && publicPlans.availableDurations.length > 0;
  const availableSummaryPlans = publicPlans
    ? Object.values(publicPlans.durations).flatMap(d =>
        [d.recommended, d.cheaper, d.premium, ...(d.browseAll ?? [])]
          .filter((p): p is PublicPlan => !!p && !!p.quote)
      )
    : [];
  const totalPlansCount = new Set(availableSummaryPlans.map(p => p.id)).size;
  const lowestQuote = availableSummaryPlans.length > 0
    ? Math.min(...availableSummaryPlans.map(p => p.quote!.amount))
    : undefined;

  const handleSelectPublic = (p: PublicPlan) => setCheckoutPlan(p);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {checkoutPlan && (
        <PublicCheckoutModal
          plan={checkoutPlan}
          countryCode={code}
          onClose={() => setCheckoutPlan(null)}
        />
      )}

      <BackButton />

      <CountryHero countryCode={code} name={meta.name} region={meta.region}
        isRegion={meta.isRegion || meta.type === "region" || meta.type === "global"}
        planCount={totalPlansCount} fromPrice={lowestQuote} />

      {hasPlans ? (
        <TravelPlansFlow
          data={publicPlans!}
          onSelectPublic={handleSelectPublic}
          initialBucket={urlBucket}
        />
      ) : (
        <EmptyPlans />
      )}

      <CompatibilityCard />
    </div>
  );
}

// ─── PayPal JS SDK loader ──────────────────────────────────────────────────────

function loadPayPalScript(clientId: string, sandbox: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).paypal) { resolve(); return; }
    const existing = document.getElementById("paypal-sdk");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&components=buttons`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });
}

// ─── Public plan checkout modal ────────────────────────────────────────────────

function PublicCheckoutModal({
  plan,
  countryCode,
  onClose,
}: {
  plan: PublicPlan;
  countryCode: string;
  onClose: () => void;
}) {
  const { currency } = useCurrency();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [step, setStep] = useState<"email" | "pay">("email");
  const [paddleLoading, setPaddleLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState("");
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: me } = useQuery<{ id: string; email: string; name: string } | null>({
    queryKey: ["/api/auth/me"],
  });
  // Retain the exact quote displayed on the selected plan card. A replacement
  // quote is never fetched silently; the customer must explicitly refresh it.
  const [quote, setQuote] = useState<NonNullable<PublicPlan["quote"]> | null>(plan.quote ?? null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(
    plan.quote ? null : "This plan is no longer available.",
  );

  const { data: checkoutConfig } = useQuery<{
    paypal: { enabled: boolean; clientId: string; sandbox: boolean };
    paddle: { enabled: boolean; clientToken: string; sandbox: boolean };
    stripe: { enabled: boolean; publishableKey: string };
  }>({ queryKey: ["/api/checkout/config"] });

  const bucketDays = parseInt(plan.bucket.replace("DAY_", ""), 10);
  const dataLabel = publicPlanDataLabel(plan);
  const validityLabel = `${bucketDays} ${bucketDays === 1 ? "Day" : "Days"}`;
  const resolvedEmail = me?.email || email;

  const refreshQuote = async () => {
    setQuoteLoading(true);
    try {
      const res = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerOfferId: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "This plan is no longer available");
      setQuote(data);
      setQuoteError(null);
      setPaypalError("");
    } catch (err: any) {
      setQuote(null);
      setQuoteError(err.message || "This plan is no longer available.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const isEmailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me && !isEmailValid(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setEmailError("");
    setStep("pay");
  };

  // Mount PayPal buttons when step = "pay" and SDK is available
  useEffect(() => {
    if (step !== "pay" || !checkoutConfig?.paypal.enabled || !quote) return;
    const { clientId, sandbox } = checkoutConfig.paypal;

    let cancelled = false;
    loadPayPalScript(clientId, sandbox)
      .then(() => {
        if (cancelled) return;
        const paypal = (window as any).paypal;
        if (!paypal || !paypalContainerRef.current) return;

        paypalContainerRef.current.innerHTML = "";
        setPaypalReady(false);

        paypal.Buttons({
          fundingSource: paypal.FUNDING?.PAYPAL ?? "paypal",
          style: { layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 44 },
          createOrder: async () => {
            const res = await fetch("/api/checkout/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quoteToken: quote.token,
                countryCode,
                dataLabel,
                validityLabel,
                email: resolvedEmail,
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setQuoteError(data.message || "This quote is no longer available. Refresh the price to continue.");
              throw new Error(data.message || "Failed to create order");
            }
            return data.orderId;
          },
          onApprove: async (paypalData: any) => {
            const res = await fetch("/api/checkout/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paypalOrderId: paypalData.orderID,
                quoteToken: quote.token,
                email: resolvedEmail,
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setQuoteError(data.message || "This quote is no longer available. Refresh the price to continue.");
              throw new Error(data.message || "Capture failed");
            }
            window.location.href = `/checkout-success?orderId=${data.orderId}&provider=paypal`;
          },
          onError: (err: any) => {
            setPaypalError("Payment failed. Please try again or use a different method.");
            console.error("[PayPal]", err);
          },
        }).render(paypalContainerRef.current).then(() => {
          if (!cancelled) setPaypalReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) setPaypalError("Could not load PayPal. Please try Paddle instead.");
      });

    return () => { cancelled = true; };
  }, [step, checkoutConfig?.paypal.enabled, checkoutConfig?.paypal.clientId, quote?.token, resolvedEmail]);

  const handlePaddle = async () => {
    if (!quote) return;
    setPaddleLoading(true);
    try {
      const res = await fetch("/api/checkout/paddle/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteToken: quote.token,
          countryCode,
          dataLabel,
          validityLabel,
          email: resolvedEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Paddle checkout failed");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setQuoteError(err.message || "This quote is no longer available. Refresh the price to continue.");
      toast({ title: "Paddle checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setPaddleLoading(false);
    }
  };

  const handleStripe = async () => {
    if (!quote) return;
    setStripeLoading(true);
    try {
      const res = await fetch("/api/checkout/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteToken: quote.token,
          countryCode,
          countryName: countryCode,
          region: countryCode,
          dataLabel,
          validityLabel,
          email: resolvedEmail,
          userId: me?.id,
          userName: me?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Stripe checkout failed");
      window.location.href = data.sessionUrl;
    } catch (err: any) {
      setQuoteError(err.message || "This quote is no longer available. Refresh the price to continue.");
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setStripeLoading(false);
    }
  };

  const noProviders = checkoutConfig &&
    !checkoutConfig.paypal.enabled &&
    !checkoutConfig.paddle.enabled &&
    !checkoutConfig.stripe?.enabled;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
      <Card className="w-full sm:max-w-sm rounded-b-none sm:rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold" data-testid="text-checkout-title">Your eSIM Plan</h3>
            <p className="text-sm text-muted-foreground">{dataLabel} · {validityLabel}</p>
          </div>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Price summary */}
        <div className="bg-muted/50 rounded-lg p-3 mb-5">
          <div className="flex justify-between items-end text-sm">
            <span className="text-muted-foreground">Total</span>
            <div className="text-right">
              <span className="font-bold text-lg" data-testid="text-checkout-price">
                {quoteLoading ? "Loading…" : quote ? <Price amount={quote.amount} /> : "Unavailable"}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {quote ? `Actual charge: ${formatCharge(quote.amount, quote.currency)}` : "Checking live availability"}
          </p>
          {quote && currency.code !== quote.currency && (
            <p className="text-xs text-muted-foreground mt-2">
              Displayed in {currency.code}; charged in {quote.currency}. Conversion is approximate.
            </p>
          )}
          {quoteError && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-destructive">{quoteError}</p>
              <Button type="button" variant="outline" size="sm" onClick={refreshQuote} disabled={quoteLoading}>
                {quoteLoading ? "Refreshing…" : "Refresh price"}
              </Button>
            </div>
          )}
        </div>

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleEmailContinue} className="space-y-3">
            {me ? (
              <p className="text-sm text-muted-foreground">
                eSIM will be delivered to <strong>{me.email}</strong>
              </p>
            ) : (
              <div>
                <Label htmlFor="pub-checkout-email" className="text-sm font-medium">
                  Email for eSIM delivery
                </Label>
                <Input
                  id="pub-checkout-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                  className="mt-1"
                  data-testid="input-checkout-email"
                />
                {emailError && (
                  <p className="text-xs text-destructive mt-1">{emailError}</p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full h-11" disabled={quoteLoading || !quote} data-testid="button-continue-to-payment">
              Continue to Payment
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
              Cancel
            </Button>
          </form>
        )}

        {/* Step 2: Payment method */}
        {step === "pay" && (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground mb-1">
              Paying as <strong>{resolvedEmail}</strong> ·{" "}
              <button className="underline hover:text-foreground" onClick={() => setStep("email")}>change</button>
            </p>

            {noProviders ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-sm font-medium text-destructive mb-1">Payment not yet configured</p>
                <p className="text-xs text-muted-foreground">
                  Please check back shortly.
                </p>
              </div>
            ) : (
              <>
                {/* Stripe — Card / Apple Pay / Google Pay (primary) */}
                {checkoutConfig?.stripe?.enabled && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Card · Apple Pay · Google Pay
                    </p>
                    <Button
                      className="w-full h-11"
                      onClick={handleStripe}
                      disabled={stripeLoading || !quote}
                      data-testid="button-stripe-checkout"
                    >
                      {stripeLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Redirecting…
                        </span>
                      ) : (
                        <>Pay {quote ? formatCharge(quote.amount, quote.currency) : "—"}</>
                      )}
                    </Button>
                  </div>
                )}

                {/* Divider */}
                {checkoutConfig?.stripe?.enabled && checkoutConfig?.paypal.enabled && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* PayPal section */}
                {checkoutConfig?.paypal.enabled && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Pay with PayPal
                    </p>
                    {paypalError && (
                      <p className="text-xs text-destructive mb-2">{paypalError}</p>
                    )}
                    <div
                      ref={paypalContainerRef}
                      className="min-h-[50px]"
                      data-testid="container-paypal-buttons"
                    />
                    {!paypalReady && !paypalError && (
                      <div className="h-11 rounded-md bg-muted/50 animate-pulse" />
                    )}
                  </div>
                )}

                {/* Divider */}
                {(checkoutConfig?.stripe?.enabled || checkoutConfig?.paypal.enabled) && checkoutConfig?.paddle.enabled && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* Paddle section */}
                {checkoutConfig?.paddle.enabled && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Pay with Paddle
                    </p>
                    <Button
                      className="w-full h-11 bg-[#0c2b5e] hover:bg-[#0a2350] text-white"
                      onClick={handlePaddle}
                      disabled={paddleLoading || !quote}
                      data-testid="button-paddle-checkout"
                    >
                      {paddleLoading ? "Opening checkout…" : quote ? `Pay ${formatCharge(quote.amount, quote.currency)} with Paddle →` : "Checking price…"}
                    </Button>
                  </div>
                )}
              </>
            )}

            <Button variant="ghost" className="w-full text-sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
      </div>
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

function CountryHero({ countryCode, name, region, isRegion, planCount, fromPrice }: {
  countryCode: string;
  name: string;
  region: string;
  isRegion?: boolean;
  planCount: number;
  fromPrice?: number;
}) {
  const photo = isRegion ? getDestinationPhoto(countryCode, region) : undefined;
  return (
    <section aria-label={`${name} eSIM summary`} className="travel-photo-surface mb-8 rounded-3xl border border-white/20">
      {photo
        ? <TravelImage photo={photo} priority className="travel-photo" sizes="(max-width: 1024px) 100vw, 1024px" />
        : <DestinationImage countryCode={countryCode} priority className="travel-photo" sizes="(max-width: 1024px) 100vw, 1024px" />}
      <div className="flex flex-col gap-7 px-6 pt-20 pb-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:pt-28 sm:pb-10">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-white/90 uppercase tracking-[.18em] mb-4" data-testid="text-destination-region">{isRegion ? "Multi-country plan" : region}</p>
            <h1 className="text-4xl sm:text-6xl font-bold leading-tight" data-testid="text-destination-title">{name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{planCount} plan{planCount !== 1 ? "s" : ""} available</p>
            {countryCode.toUpperCase() === "CN" && (
              <Link href="/china-esim" className="inline-block mt-2 text-sm font-semibold text-primary underline underline-offset-4" data-testid="link-china-guide">
                Before you fly: China eSIM guide
              </Link>
            )}
            {photo?.isRegional && <p className="travel-photo-caption mt-4">Regional inspiration · {photo.alt}</p>}
          </div>
        </div>
        {fromPrice !== undefined && (
          <div className="rounded-2xl border border-white/30 bg-slate-950/35 backdrop-blur-sm p-5 self-start sm:self-auto">
            <p className="text-xs text-muted-foreground mb-1">From</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-destination-from-price"><Price amount={fromPrice} /></p>
            <p className="text-xs text-muted-foreground mt-1">One-time payment</p>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/20 bg-slate-950/35 px-6 py-4 sm:px-10">
        {["QR emailed after payment", "No contracts", "No roaming fees", "No physical SIM"].map(fact => (
          <li key={fact} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{fact}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BackButton() {
  return (
    <Link href="/destinations" className="mb-4 inline-flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" data-testid="button-back-destinations">
        <ArrowLeft className="w-4 h-4 mr-2" />
        All Destinations
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
