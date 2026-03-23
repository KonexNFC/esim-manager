import { useRoute, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Wifi, Clock, Globe, Check, Zap, Star,
  Smartphone, BarChart2
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Destination, Plan } from "@shared/schema";

const usageProfiles = [
  {
    id: "light",
    label: "Light",
    description: "Maps, messaging, email",
    gbPerDay: 0.1,
    icon: "~100 MB/day",
  },
  {
    id: "moderate",
    label: "Moderate",
    description: "Social media, browsing, video calls",
    gbPerDay: 0.5,
    icon: "~500 MB/day",
  },
  {
    id: "heavy",
    label: "Heavy",
    description: "Streaming, hotspot, working remotely",
    gbPerDay: 2,
    icon: "~2 GB/day",
  },
];

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

function DataCalculator({ plans, onHighlight }: { plans: Plan[]; onHighlight: (id: number | null) => void }) {
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
  }, [plans, neededGb, usage]);

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
              >
                {d}d
              </button>
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
          No single plan covers this usage. Consider purchasing multiple top-ups.
        </p>
      )}
    </Card>
  );
}

function PricePerGb({ dataAmount, price }: { dataAmount: string; price: number }) {
  const gb = parseDataGb(dataAmount);
  if (!gb || gb === Infinity) return null;
  const ppgb = price / gb;
  return (
    <span className="text-xs text-muted-foreground" data-testid="text-price-per-gb">
      ${ppgb.toFixed(2)}/GB
    </span>
  );
}

export default function DestinationDetail() {
  const [, params] = useRoute("/destinations/:id");
  const [, navigate] = useLocation();
  const destId = params?.id;
  const [highlightedPlanId, setHighlightedPlanId] = useState<number | null>(null);

  const { data: destination, isLoading: destLoading } = useQuery<Destination>({
    queryKey: ["/api/destinations", destId],
    queryFn: async () => {
      const res = await fetch(`/api/destinations/${destId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!destId,
  });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans", destId],
    queryFn: async () => {
      const res = await fetch(`/api/plans?destinationId=${destId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!destId,
  });

  const isLoading = destLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-52 w-full rounded-md mb-8" />
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

  if (!destination) {
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

  const sortedPlans = plans ? [...plans].sort((a, b) => a.price - b.price) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/destinations">
        <Button variant="ghost" className="mb-4" data-testid="button-back-destinations">
          <ArrowLeft className="w-4 h-4 mr-2" />
          All Destinations
        </Button>
      </Link>

      <div className="relative rounded-md overflow-hidden mb-8">
        <img
          src={destination.imageUrl}
          alt={destination.name}
          className="w-full h-48 sm:h-56 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-white/20 backdrop-blur-sm">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white" data-testid="text-destination-title">
                {destination.name}
              </h1>
              <p className="text-white/70 text-sm" data-testid="text-destination-region">{destination.region}</p>
            </div>
          </div>
        </div>
      </div>

      {sortedPlans.length > 0 && (
        <DataCalculator plans={sortedPlans} onHighlight={setHighlightedPlanId} />
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-1">
          Available Plans
        </h2>
        <p className="text-sm text-muted-foreground">
          {sortedPlans.length} plan{sortedPlans.length !== 1 ? "s" : ""} available — sorted by price
        </p>
      </div>

      {sortedPlans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlans.map((plan) => {
            const isPopular = plan.popular || false;
            const isHighlighted = highlightedPlanId === plan.id;
            const dataGb = parseDataGb(plan.dataAmount);
            const isUnlimited = dataGb === Infinity;
            const hasHotspot = plan.features?.some(f =>
              f.toLowerCase().includes("hotspot") || f.toLowerCase().includes("tether")
            );
            const hasTopUp = plan.features?.some(f =>
              f.toLowerCase().includes("top") || f.toLowerCase().includes("recharge")
            );
            const is5G = plan.speedInfo?.includes("5G") || plan.features?.some(f => f.includes("5G"));

            return (
              <Card
                key={plan.id}
                className={`p-5 flex flex-col relative transition-shadow ${
                  isHighlighted
                    ? "ring-2 ring-primary shadow-lg"
                    : isPopular
                    ? "ring-2 ring-primary"
                    : ""
                }`}
                data-testid={`card-plan-${plan.id}`}
              >
                {(isPopular || isHighlighted) && (
                  <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground">
                    <Star className="w-3 h-3 mr-1" />
                    {isHighlighted ? "Recommended" : "Popular"}
                  </Badge>
                )}

                <div className="mb-3">
                  <h3 className="font-semibold text-base" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h3>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold" data-testid={`text-plan-price-${plan.id}`}>
                      ${plan.price.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground">{plan.currency}</span>
                    <PricePerGb dataAmount={plan.dataAmount} price={plan.price} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {is5G && (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-5g-${plan.id}`}>
                      <Zap className="w-3 h-3 mr-1" />
                      5G
                    </Badge>
                  )}
                  {hasHotspot && (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-hotspot-${plan.id}`}>
                      <Wifi className="w-3 h-3 mr-1" />
                      Hotspot
                    </Badge>
                  )}
                  {hasTopUp && (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-topup-${plan.id}`}>
                      Top-up available
                    </Badge>
                  )}
                  {isUnlimited && (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-unlimited-${plan.id}`}>
                      Unlimited
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 flex-1 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                      <Wifi className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{plan.dataAmount}</p>
                      <p className="text-xs text-muted-foreground">Data</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{plan.validity}</p>
                      <p className="text-xs text-muted-foreground">Validity</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                      <Globe className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{plan.coverage}</p>
                      <p className="text-xs text-muted-foreground">Coverage</p>
                    </div>
                  </div>
                  {plan.speedInfo && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{plan.speedInfo}</p>
                        <p className="text-xs text-muted-foreground">Speed</p>
                      </div>
                    </div>
                  )}
                </div>

                {plan.features && plan.features.length > 0 && (
                  <div className="mb-5 space-y-1.5">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{feature}</span>
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
        <Card className="p-10 text-center">
          <Wifi className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No plans available for this destination yet</p>
        </Card>
      )}

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
    </div>
  );
}
