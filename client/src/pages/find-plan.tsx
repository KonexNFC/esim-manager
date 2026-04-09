import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryCombobox } from "@/components/country-combobox";
import { cn } from "@/lib/utils";
import {
  Wifi, Clock, Zap, Star, ChevronRight, Sparkles,
  TrendingDown, Award, Globe, Flame,
} from "lucide-react";

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
  validityDays: number;
  recommended: RecommendedOffer | null;
  alternatives: RecommendedOffer[];
  pricing_breakdown: PricingBreakdown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bucketLabel(bucket: string): string {
  const map: Record<string, string> = {
    DAY_1: "1-Day", DAY_3: "3-Day", DAY_5: "5-Day", DAY_7: "7-Day",
  };
  return map[bucket] ?? bucket;
}

function dataLabel(offer: RecommendedOffer): string {
  if (offer.isUnlimited) return "Unlimited";
  if (offer.dataGb === null) return "Unlimited";
  return `${offer.dataGb % 1 === 0 ? offer.dataGb : offer.dataGb.toFixed(1)} GB`;
}

function offerTypeLabel(type: string): string {
  const map: Record<string, string> = {
    UNLIMITED: "Unlimited",
    ESSENTIAL: "Essential",
    PLUS: "Plus",
    MAX: "Max",
  };
  return map[type] ?? type;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

// ─── Plan Card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  offer: RecommendedOffer;
  savingsPct: number | null;
  savingsLabel: string | null;
  isHighlighted?: boolean;
  countryCode: string;
  onSelect: (offer: RecommendedOffer) => void;
}

function PlanCard({ offer, savingsPct, savingsLabel, isHighlighted, countryCode, onSelect }: PlanCardProps) {
  const roleConfig = {
    RECOMMENDED: {
      label: "Best Value",
      icon: <Star className="w-3 h-3 fill-current" />,
      badgeClass: "bg-violet-600 text-white",
      cardClass: "ring-2 ring-violet-500 shadow-[0_0_30px_rgba(124,58,237,0.25)] dark:shadow-[0_0_40px_rgba(124,58,237,0.35)]",
      buttonClass: "bg-violet-600 hover:bg-violet-700 text-white",
      accentClass: "text-violet-600 dark:text-violet-400",
      glowClass: "bg-violet-500/10",
    },
    CHEAPER: {
      label: "Budget Pick",
      icon: <TrendingDown className="w-3 h-3" />,
      badgeClass: "bg-emerald-600 text-white",
      cardClass: "ring-1 ring-border",
      buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
      accentClass: "text-emerald-600 dark:text-emerald-400",
      glowClass: "bg-emerald-500/5",
    },
    PREMIUM: {
      label: "Premium",
      icon: <Award className="w-3 h-3" />,
      badgeClass: "bg-amber-500 text-white",
      cardClass: "ring-1 ring-border",
      buttonClass: "bg-amber-500 hover:bg-amber-600 text-white",
      accentClass: "text-amber-600 dark:text-amber-400",
      glowClass: "bg-amber-500/5",
    },
  };

  const cfg = roleConfig[offer.role] ?? roleConfig.RECOMMENDED;

  return (
    <div
      data-testid={`plan-card-${offer.role.toLowerCase()}`}
      className={cn(
        "relative rounded-2xl bg-card border border-border overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:shadow-lg",
        cfg.cardClass,
        isHighlighted && "scale-[1.01]"
      )}
    >
      {isHighlighted && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={cn("absolute inset-0 opacity-40", cfg.glowClass)} />
        </div>
      )}

      {/* Top accent bar */}
      <div className={cn(
        "h-1",
        offer.role === "RECOMMENDED" ? "bg-violet-500" :
        offer.role === "CHEAPER" ? "bg-emerald-500" : "bg-amber-500"
      )} />

      <div className="p-6">
        {/* Role badge + synthetic marker */}
        <div className="flex items-center gap-2 mb-4">
          <Badge data-testid={`badge-role-${offer.role.toLowerCase()}`} className={cn("flex items-center gap-1 text-xs font-semibold px-2 py-1", cfg.badgeClass)}>
            {cfg.icon}
            {cfg.label}
          </Badge>
          {offer.isSynthetic && (
            <Badge variant="outline" className="text-[10px] py-0.5">Bundled</Badge>
          )}
          {offer.hotspotSupported && (
            <Badge variant="outline" className="text-[10px] py-0.5 flex items-center gap-1">
              <Wifi className="w-2.5 h-2.5" />Hotspot
            </Badge>
          )}
        </div>

        {/* Data + validity */}
        <div className="mb-4">
          <div data-testid={`text-data-${offer.role.toLowerCase()}`} className={cn("text-4xl font-bold tracking-tight mb-1", cfg.accentClass)}>
            {dataLabel(offer)}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{offer.validityDays}-day plan</span>
            <span className="text-border">·</span>
            <span>{bucketLabel(offer.bucket)}</span>
          </div>
        </div>

        {/* Savings badge */}
        {savingsPct !== null && savingsLabel && (
          <div data-testid={`badge-savings-${offer.role.toLowerCase()}`} className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold px-3 py-1">
            <Flame className="w-3 h-3" />
            Save {savingsPct}% {savingsLabel}
          </div>
        )}

        {/* Pricing */}
        <div className="mb-5 pb-4 border-b border-border">
          <div data-testid={`text-price-${offer.role.toLowerCase()}`} className="text-3xl font-bold">
            ${offer.priceUsd.toFixed(2)}
          </div>
          <div data-testid={`text-price-per-day-${offer.role.toLowerCase()}`} className="text-sm text-muted-foreground mt-0.5">
            <span className={cn("font-semibold", cfg.accentClass)}>
              ${offer.pricePerDayUsd.toFixed(2)}/day
            </span>
            {" "}· one-time · instant activation
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-5 text-sm">
          <li className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            Instant eSIM delivery
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <Globe className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            No roaming fees
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <Wifi className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            {offer.isUnlimited ? "Unlimited data" : `${dataLabel(offer)} data`}
          </li>
        </ul>

        <Button
          data-testid={`button-select-${offer.role.toLowerCase()}`}
          className={cn("w-full font-semibold", cfg.buttonClass)}
          onClick={() => onSelect(offer)}
        >
          Choose Plan
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="h-1 bg-muted" />
      <div className="p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FindPlan() {
  const [location, navigate] = useLocation();

  // Read initial values from URL query string (?country=GB&days=5)
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initCountry = searchParams.get("country")?.toUpperCase() || undefined;
  const initDays = parseInt(searchParams.get("days") ?? "3", 10);

  const [countryCode, setCountryCode] = useState<string | undefined>(initCountry);
  const [tripDays, setTripDays] = useState(isNaN(initDays) ? 3 : Math.min(7, Math.max(1, initDays)));
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

  function handleSelectOffer(offer: RecommendedOffer) {
    navigate(`/destinations/${countryCode?.toLowerCase()}`);
  }

  const breakdown = data?.pricing_breakdown;

  const allCards: Array<{
    offer: RecommendedOffer;
    savingsPct: number | null;
    savingsLabel: string | null;
    isHighlighted: boolean;
  }> = [];

  if (data?.recommended) {
    allCards.push({
      offer: data.recommended,
      savingsPct: breakdown?.savings_rec_vs_premium_pct ?? null,
      savingsLabel: breakdown?.savings_rec_vs_premium_pct ? "vs Premium" : null,
      isHighlighted: true,
    });
  }

  for (const alt of data?.alternatives ?? []) {
    if (alt.role === "CHEAPER") {
      allCards.push({
        offer: alt,
        savingsPct: breakdown?.savings_cheaper_vs_rec_pct ?? null,
        savingsLabel: breakdown?.savings_cheaper_vs_rec_pct ? "vs Best Value" : null,
        isHighlighted: false,
      });
    } else {
      allCards.push({ offer: alt, savingsPct: null, savingsLabel: null, isHighlighted: false });
    }
  }

  // Sort: RECOMMENDED first, then CHEAPER, then PREMIUM
  const roleOrder = { RECOMMENDED: 0, CHEAPER: 1, PREMIUM: 2 };
  allCards.sort((a, b) => (roleOrder[a.offer.role] ?? 9) - (roleOrder[b.offer.role] ?? 9));

  const hasResults = !isLoading && !!data;

  return (
    <main className="min-h-screen bg-background">
      {/* Hero / input section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-violet-950/20 via-background to-background pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-violet-600/10 blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold px-4 py-1.5 mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            Smart Plan Recommender
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
            Find Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-fuchsia-500">
              Perfect eSIM
            </span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto mb-8">
            Tell us your destination and trip length — we'll instantly match you with the best-value plan.
          </p>

          {/* Input card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-lg text-left space-y-5">
            {/* Country selector */}
            <div>
              <label className="block text-sm font-medium mb-2">
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
                data-testid="input-country"
              />
            </div>

            {/* Duration selector */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Trip Duration
                <span className="ml-2 font-normal text-muted-foreground">
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
                      "min-w-[44px] h-10 rounded-lg text-sm font-semibold border transition-all duration-150",
                      tripDays === d
                        ? "bg-violet-600 border-violet-600 text-white shadow-md"
                        : "bg-background border-border text-foreground hover:border-violet-400 hover:text-violet-600"
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>

              {/* Duration hint */}
              <p className="text-xs text-muted-foreground mt-2">
                {tripDays <= 1 && "We'll recommend our 1-day unlimited plan."}
                {tripDays > 1 && tripDays <= 3 && "We'll recommend our 3-day plan — perfect for a weekend."}
                {tripDays > 3 && tripDays <= 5 && "We'll recommend our 5-day plan — great value for a short holiday."}
                {tripDays > 5 && "We'll recommend our 7-day plan — best rate per day."}
              </p>
            </div>

            <Button
              data-testid="button-find-plan"
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold h-11 text-base"
              onClick={handleSearch}
              disabled={!countryCode}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Find My Plan
            </Button>
          </div>
        </div>
      </section>

      {/* Results section */}
      {(shouldFetch && countryCode) && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          {/* Section header */}
          {hasResults && data && (
            <div className="text-center mb-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-1">
                Plans for{" "}
                <span className="text-violet-600 dark:text-violet-400">
                  {data.country}
                </span>
                {" "}· {data.tripDays}-day trip
              </h2>
              <p className="text-sm text-muted-foreground">
                {bucketLabel(data.bucket)} coverage · showing {allCards.length} options
              </p>
            </div>
          )}

          {isError && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">😕</div>
              <p className="text-lg font-semibold mb-1">No plans found</p>
              <p className="text-muted-foreground text-sm">
                {(error as Error)?.message ?? "We couldn't find plans for this destination."}
              </p>
            </div>
          )}

          {/* Cards grid */}
          <div className={cn(
            "grid gap-5",
            allCards.length === 1 ? "grid-cols-1 max-w-sm mx-auto" :
            allCards.length === 2 ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto" :
            "grid-cols-1 sm:grid-cols-3"
          )}>
            {isLoading ? (
              <>
                <PlanCardSkeleton />
                <PlanCardSkeleton />
                <PlanCardSkeleton />
              </>
            ) : (
              allCards.map(({ offer, savingsPct, savingsLabel, isHighlighted }) => (
                <PlanCard
                  key={offer.id}
                  offer={offer}
                  savingsPct={savingsPct}
                  savingsLabel={savingsLabel}
                  isHighlighted={isHighlighted}
                  countryCode={countryCode ?? ""}
                  onSelect={handleSelectOffer}
                />
              ))
            )}
          </div>

          {/* Pricing breakdown table */}
          {hasResults && breakdown && (
            <div className="mt-10 bg-muted/40 border border-border rounded-xl p-5 max-w-2xl mx-auto" data-testid="section-pricing-breakdown">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-violet-500" />
                Pricing Breakdown
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: "Budget", price: breakdown.cheaper_price_usd, ppd: breakdown.cheaper_per_day_usd, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Best Value", price: breakdown.recommended_price_usd, ppd: breakdown.recommended_per_day_usd, color: "text-violet-600 dark:text-violet-400" },
                  { label: "Premium", price: breakdown.premium_price_usd, ppd: breakdown.premium_per_day_usd, color: "text-amber-600 dark:text-amber-400" },
                ].map(({ label, price, ppd, color }) => (
                  price !== null && (
                    <div key={label} data-testid={`breakdown-${label.toLowerCase().replace(" ", "-")}`}>
                      <div className="text-xs text-muted-foreground mb-1">{label}</div>
                      <div className={cn("text-lg font-bold", color)}>${price?.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">${ppd?.toFixed(2)}/day</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* CTA to full destination page */}
          {hasResults && (
            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Want to see all available plans for this destination?
              </p>
              <Button
                data-testid="button-view-all-plans"
                variant="outline"
                className="border-violet-500 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                onClick={() => navigate(`/destinations/${countryCode?.toLowerCase()}`)}
              >
                View All Plans
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Empty state (before search) */}
      {!shouldFetch && (
        <section className="pb-16 pt-4 text-center">
          <div className="max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">🌍</div>
            <p className="text-muted-foreground text-sm">
              Select a country and trip duration above, then tap{" "}
              <span className="font-semibold text-foreground">Find My Plan</span>{" "}
              to see personalised recommendations.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
