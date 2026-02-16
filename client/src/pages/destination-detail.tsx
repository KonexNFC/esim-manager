import { useRoute, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wifi, Clock, Globe, Check, Zap, Star } from "lucide-react";
import type { Destination, Plan } from "@shared/schema";

export default function DestinationDetail() {
  const [, params] = useRoute("/destinations/:id");
  const [, navigate] = useLocation();
  const destId = params?.id;

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

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-1">
          Available Plans
        </h2>
        <p className="text-sm text-muted-foreground">
          {sortedPlans.length} plan{sortedPlans.length !== 1 ? "s" : ""} available for {destination.name}
        </p>
      </div>

      {sortedPlans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlans.map((plan) => {
            const isPopular = plan.popular || false;
            return (
              <Card key={plan.id} className={`p-5 flex flex-col relative ${isPopular ? "ring-2 ring-primary" : ""}`} data-testid={`card-plan-${plan.id}`}>
                {isPopular && (
                  <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground">
                    <Star className="w-3 h-3 mr-1" />
                    Popular
                  </Badge>
                )}
                <div className="mb-4">
                  <h3 className="font-semibold text-base" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold" data-testid={`text-plan-price-${plan.id}`}>
                      ${plan.price.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground">{plan.currency}</span>
                  </div>
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
                  variant={isPopular ? "default" : "outline"}
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
    </div>
  );
}
