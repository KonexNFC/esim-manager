import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Globe, Zap, Shield, Smartphone, ChevronRight, Wifi } from "lucide-react";
import type { Destination } from "@shared/schema";

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.png"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-24 sm:py-32 lg:py-40">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="mb-6 bg-white/15 text-white border-white/20">
            Stay Connected Worldwide
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight" data-testid="text-hero-title">
            Travel with
            <span className="block text-cyan-400">
              Instant Data
            </span>
          </h1>
          <p className="mt-5 text-lg text-white/80 max-w-lg leading-relaxed" data-testid="text-hero-subtitle">
            Get connected in 200+ destinations worldwide. Buy, install, and activate your eSIM in minutes. No physical SIM needed.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/destinations">
              <Button size="lg" data-testid="button-browse-plans">
                Browse Plans
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/orders">
              <Button size="lg" variant="outline" className="bg-white/10 backdrop-blur-sm text-white border-white/20" data-testid="button-my-esims">
                My eSIMs
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { value: "200+", label: "Destinations" },
    { value: "5M+", label: "eSIMs Sold" },
    { value: "4.8", label: "App Rating" },
    { value: "24/7", label: "Support" },
  ];

  return (
    <section className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-foreground" data-testid={`text-stat-${stat.label.toLowerCase().replace(/[^a-z]/g, '')}`}>
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Zap,
      title: "Instant Activation",
      description: "Scan the QR code and get connected in seconds. No store visits needed.",
    },
    {
      icon: Globe,
      title: "Global Coverage",
      description: "Stay connected in 200+ countries and regions across 6 continents.",
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Enterprise-grade security with reliable 4G/5G network connections.",
    },
    {
      icon: Smartphone,
      title: "Easy to Use",
      description: "Compatible with all eSIM-enabled devices. Simple setup process.",
    },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-features-title">
            Why Choose GlobeSIM?
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            The smarter way to stay connected while traveling
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature) => (
            <Card key={feature.title} className="p-5">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 mb-4">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2" data-testid={`text-feature-${feature.title.toLowerCase().replace(/\s/g, '-')}`}>
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function PopularDestinations() {
  const { data: destinations, isLoading } = useQuery<Destination[]>({
    queryKey: ["/api/destinations", "popular"],
    queryFn: async () => {
      const res = await fetch("/api/destinations?popular=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <section className="py-16 sm:py-20 bg-card border-y">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-popular-title">
              Popular Destinations
            </h2>
            <p className="mt-2 text-muted-foreground">
              Top picks from millions of travelers
            </p>
          </div>
          <Link href="/destinations">
            <Button variant="ghost" data-testid="link-view-all-destinations">
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-visible">
                  <Skeleton className="aspect-[16/10] rounded-md" />
                  <div className="p-3">
                    <Skeleton className="h-5 w-24 mb-2" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </Card>
              ))
            : destinations?.map((dest) => (
                <Link key={dest.id} href={`/destinations/${dest.id}`}>
                  <Card className="overflow-visible hover-elevate cursor-pointer group" data-testid={`card-destination-${dest.id}`}>
                    <div className="aspect-[16/10] overflow-hidden rounded-t-md">
                      <img
                        src={dest.imageUrl}
                        alt={dest.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{dest.flagEmoji}</span>
                        <h3 className="font-semibold text-sm" data-testid={`text-destination-name-${dest.id}`}>
                          {dest.name}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{dest.region}</p>
                    </div>
                  </Card>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { step: "1", title: "Choose Your Plan", description: "Select a destination and pick the data plan that fits your trip." },
    { step: "2", title: "Receive QR Code", description: "Get your eSIM QR code instantly via email after purchase." },
    { step: "3", title: "Scan & Connect", description: "Scan the QR code on your device and enjoy instant connectivity." },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-how-it-works-title">
            How It Works
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Get online in three simple steps
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {steps.map((item) => (
            <div key={item.step} className="text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="font-semibold mb-2" data-testid={`text-step-${item.step}`}>{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-card py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Wifi className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">GlobeSIM</span>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-footer-copyright">
            2026 GlobeSIM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <StatsBar />
      <PopularDestinations />
      <FeaturesSection />
      <HowItWorks />
      <Footer />
    </div>
  );
}
