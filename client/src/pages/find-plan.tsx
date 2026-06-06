import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryCombobox } from "@/components/country-combobox";
import { PlanCard, PlanCardGrid, type PlanBadgeVariant } from "@/components/plan-card";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import { ChevronRight, Sparkles, TrendingDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecommendedOffer {
  id: string;
  bucket: string;
  validityDays: number;
  offerType: "UNLIMITED" | "ESSENTIAL" | "PLUS" | "MAX";
  dataGb: number | null;
  isUnlimited: boolean;
  hotspotSupported: boolean;
  isSynthetic: boolean;
  priceGbp: number;
  priceUsd: number;
  pricePerDayUsd: number;
  role: "RECOMMENDED" | "CHEAPER" | "PREMIUM";
}

interface PricingBreakdown {
  recommended_price_usd: number | null;
  recommended_per_day_usd: number | null;
  cheaper_price_usd: number | null;
  cheaper_per_day_usd: number | null;
  premium_price_usd: number | null;
  premium_per_day_usd: number | null;
  savings_rec_vs_premium_pct: number | null;
  savings_cheaper_vs_rec_pct: number | null;
}

interface RecommendResponse {
  country: string;
  tripDays: number;
  bucket: string;
  requestedBucket: string;
  isFallback: boolean;
  validityDays: number;
  recommended: RecommendedOffer | null;
  alternatives: RecommendedOffer[];
  pricing_breakdown: PricingBreakdown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bucketLabel(bucket: string): string {
  const map: Record<string, string> = {
    DAY_1: "1-Day", DAY_3: "3-Day", DAY_5: "5-Day", DAY_7: "7-Day",
    DAY_14: "14-Day", DAY_30: "30-Day",
  };
  return map[bucket] ?? bucket;
}

function dataLabel(offer: RecommendedOffer): string {
  if (offer.isUnlimited || offer.dataGb === null) return "Unlimited";
  const gb = offer.dataGb;
  return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
}

function planTitle(offer: RecommendedOffer): string {
  if (offer.isUnlimited) return "Unlimited Data Plan";
  const offerLabels: Record<string, string> = {
    ESSENTIAL: "Essential Data Plan",
    PLUS: "Plus Data Plan",
    MAX: "Max Data Plan",
  };
  return offerLabels[offer.offerType] ?? "Data Plan";
}

const ROLE_BADGE: Record<string, { label: string; variant: PlanBadgeVariant }> = {
  RECOMMENDED: { label: "Best Value", variant: "recommended" },
  CHEAPER:     { label: "Budget Pick", variant: "budget" },
  PREMIUM:     { label: "Premium",    variant: "premium" },
};

const DURATION_OPTIONS = [1, 5, 7, 14, 30];

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="h-1 bg-gradient-to-r from-muted via-muted/70 to-muted animate-pulse" />
      <div className="p-5 space-y-4 pt-4">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-2 pt-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FindPlan() {
  const [, navigate] = useLocation();
  const { fmt } = useCurrency();

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initCountry = searchParams.get("country")?.toUpperCase() || undefined;
  const initDays = parseInt(searchParams.get("days") ?? "7", 10);

  const [countryCode, setCountryCode] = useState<string | undefined>(initCountry);
  const [tripDays, setTripDays] = useState(isNaN(initDays) ? 7 : Math.min(30, Math.max(1, initDays)));
  const [shouldFetch, setShouldFetch] = useState(!!initCountry);

  const { data, isLoading, isError, error } = useQuery<RecommendResponse>({
    queryKey: ["/api/recommend", countryCode, tripDays],
    queryFn: async () => {
      const res = await fetch(`/api/recommend?country=${countryCode}&days=${tripDays}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Failed to load recommendations");
      }
      return res.json();
    },
    enabled: shouldFetch && !!countryCode,
    staleTime: 60_000,
  });

  function handleSearch() {
    if (!countryCode) return;
    setShouldFetch(true);
  }

  const breakdown = data?.pricing_breakdown;

  // Build PlanCard props from API response
  type CardEntry = Parameters<typeof PlanCard>[0] & { _role: string };
  const allCards: CardEntry[] = [];

  if (data?.recommended) {
    const o = data.recommended;
    const cfg = ROLE_BADGE[o.role];
    const savingsPct = breakdown?.savings_rec_vs_premium_pct;
    allCards.push({
      _role: "RECOMMENDED",
      "data-testid": "plan-card-recommended",
      title: planTitle(o),
      price: fmt(o.priceUsd),
      pricePerDay: `${fmt(o.pricePerDayUsd)}/day`,
      badge: cfg.label,
      badgeVariant: cfg.variant,
      dataAmount: dataLabel(o),
      coverage: countryCode ?? "—",
      validity: `${o.validityDays} ${o.validityDays === 1 ? "Day" : "Days"}`,
      hotspot: o.hotspotSupported,
      isRecommended: true,
      savings: savingsPct ? `Save ${savingsPct}% vs Premium` : undefined,
      ctaLabel: "Get This Plan",
      onSelect: () => navigate(`/destinations/${countryCode?.toLowerCase()}?bucket=${data?.bucket ?? "DAY_3"}&plan=${o.id}`),
    });
  }

  for (const o of data?.alternatives ?? []) {
    const cfg = ROLE_BADGE[o.role] ?? ROLE_BADGE.PREMIUM;
    const savingsPct =
      o.role === "CHEAPER" ? breakdown?.savings_cheaper_vs_rec_pct : null;
    allCards.push({
      _role: o.role,
      "data-testid": `plan-card-${o.role.toLowerCase()}`,
      title: planTitle(o),
      price: fmt(o.priceUsd),
      pricePerDay: `${fmt(o.pricePerDayUsd)}/day`,
      badge: cfg.label,
      badgeVariant: cfg.variant,
      dataAmount: dataLabel(o),
      coverage: countryCode ?? "—",
      validity: `${o.validityDays} ${o.validityDays === 1 ? "Day" : "Days"}`,
      hotspot: o.hotspotSupported,
      isRecommended: false,
      savings: savingsPct ? `Save ${savingsPct}% vs Best Value` : undefined,
      ctaLabel: o.role === "CHEAPER" ? "Choose Budget Plan" : "Go Premium",
      onSelect: () => navigate(`/destinations/${countryCode?.toLowerCase()}?bucket=${o.bucket ?? data?.bucket ?? "DAY_3"}&plan=${o.id}`),
    });
  }

  const roleOrder: Record<string, number> = { RECOMMENDED: 0, CHEAPER: 1, PREMIUM: 2 };
  allCards.sort((a, b) => (roleOrder[a._role] ?? 9) - (roleOrder[b._role] ?? 9));

  const hasResults = !isLoading && !!data;

  return (
    <main className="min-h-screen bg-background">
      {/* ── Hero / input section ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-950/20 via-background to-background pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/10 blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold px-4 py-1.5 mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            Smart Plan Recommender
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
            Find Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">
              Perfect eSIM
            </span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto mb-8">
            Tell us your destination and trip length — we'll instantly match you with the best-value plan.
          </p>

          {/* ── Input card ── */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-lg text-left space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2 text-foreground">
                Destination
              </label>
              <CountryCombobox
                value={countryCode}
                onSelect={(code) => {
                  setCountryCode(code);
                  setShouldFetch(false);
                }}
                placeholder="Search for a country…"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-foreground">
                Trip Duration
                <span className="ml-2 font-normal text-muted-foreground text-xs">
                  ({tripDays} {tripDays === 1 ? "day" : "days"})
                </span>
              </label>
              <div className="flex gap-2 flex-wrap" data-testid="group-duration">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    data-testid={`button-day-${d}`}
                    onClick={() => {
                      setTripDays(d);
                      setShouldFetch(false);
                    }}
                    className={cn(
                      "min-w-[44px] h-10 rounded-xl text-sm font-semibold border transition-all duration-150",
                      tripDays === d
                        ? "bg-primary border-primary text-white shadow-md scale-[1.05]"
                        : "bg-background border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {tripDays === 1  && "Perfect for a day trip or short layover."}
                {tripDays === 5  && "Great value for a short holiday or business trip."}
                {tripDays === 7  && "Our most popular plan — best rate per day."}
                {tripDays === 14 && "Ideal for a two-week holiday or extended stay."}
                {tripDays === 30 && "Best value for long trips, relocation, or a full month abroad."}
              </p>
            </div>

            <Button
              data-testid="button-find-plan"
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-11 text-base shadow-md shadow-primary/25 transition-all"
              onClick={handleSearch}
              disabled={!countryCode}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Find My Plan
            </Button>
          </div>
        </div>
      </section>

      {/* ── Results section ──────────────────────────────────────────────── */}
      {shouldFetch && countryCode && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
          {/* Header */}
          {hasResults && data && (
            <div className="text-center mb-10">
              <h2 className="text-xl sm:text-2xl font-bold mb-1">
                Plans for{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  {data.country}
                </span>
                {" "}· {data.tripDays}-day trip
              </h2>
              <p className="text-sm text-muted-foreground">
                {bucketLabel(data.bucket)} coverage · showing {allCards.length} curated options
              </p>
              {data.isFallback && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 inline-block">
                  No {bucketLabel(data.requestedBucket).toLowerCase()} plan available — showing the shortest available option ({bucketLabel(data.bucket)})
                </p>
              )}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="text-center py-16 max-w-sm mx-auto">
              <div className="text-5xl mb-4">😕</div>
              <p className="text-lg font-semibold mb-1">No plans found</p>
              <p className="text-muted-foreground text-sm">
                {(error as Error)?.message ?? "We couldn't find plans for this destination."}
              </p>
            </div>
          )}

          {/* Cards */}
          {isLoading ? (
            <div className={cn(
              "grid gap-5 items-start",
              "grid-cols-1 sm:grid-cols-3",
            )}>
              <PlanCardSkeleton />
              <PlanCardSkeleton />
              <PlanCardSkeleton />
            </div>
          ) : (
            <PlanCardGrid
              cards={allCards.map(({ _role, ...rest }) => rest)}
            />
          )}

          {/* Pricing breakdown */}
          {hasResults && breakdown && (
            <div
              data-testid="section-pricing-breakdown"
              className="mt-10 bg-muted/40 border border-border rounded-2xl p-6 max-w-2xl mx-auto"
            >
              <h3 className="text-sm font-semibold mb-5 flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <TrendingDown className="w-4 h-4 text-blue-500" />
                Price Comparison
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {(
                  [
                    {
                      label: "Budget",
                      price: breakdown.cheaper_price_usd,
                      ppd: breakdown.cheaper_per_day_usd,
                      color: "text-emerald-600 dark:text-emerald-400",
                      ring: "ring-1 ring-emerald-200 dark:ring-emerald-900",
                    },
                    {
                      label: "Best Value",
                      price: breakdown.recommended_price_usd,
                      ppd: breakdown.recommended_per_day_usd,
                      color: "text-blue-600 dark:text-blue-400",
                      ring: "ring-2 ring-blue-300 dark:ring-blue-700",
                    },
                    {
                      label: "Premium",
                      price: breakdown.premium_price_usd,
                      ppd: breakdown.premium_per_day_usd,
                      color: "text-amber-600 dark:text-amber-400",
                      ring: "ring-1 ring-amber-200 dark:ring-amber-900",
                    },
                  ] as const
                ).map(({ label, price, ppd, color, ring }) =>
                  price !== null ? (
                    <div
                      key={label}
                      data-testid={`breakdown-${label.toLowerCase().replace(" ", "-")}`}
                      className={cn(
                        "rounded-xl p-3 bg-background",
                        ring,
                      )}
                    >
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 font-semibold">
                        {label}
                      </div>
                      <div className={cn("text-xl font-bold", color)}>
                        {fmt(price)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {ppd !== null && ppd !== undefined ? `${fmt(ppd)}/day` : ""}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* View all plans CTA */}
          {hasResults && (
            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Want to see all available plans for this destination?
              </p>
              <Button
                data-testid="button-view-all-plans"
                variant="outline"
                className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-semibold"
                onClick={() => navigate(`/destinations/${countryCode.toLowerCase()}?bucket=${data?.bucket ?? "DAY_3"}`)}
              >
                View All Plans
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ── Empty / pre-search state ─────────────────────────────────────── */}
      {!shouldFetch && (
        <section className="pb-16 pt-4 text-center">
          <div className="max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">🌍</div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Select a country and trip duration above, then tap{" "}
              <span className="font-semibold text-foreground">Find My Plan</span>{" "}
              to see your personalised recommendations.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
