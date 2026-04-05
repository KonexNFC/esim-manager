import { Link, useLocation } from "wouter";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KonexLogo } from "@/components/konex-logo";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowRight, Globe, Zap, Smartphone,
  Wifi, Star, Lock, CheckCircle2,
  Signal, Quote, Radio,
  QrCode, MapPin, Banknote, ShieldCheck,
  Package, TrendingUp, Timer, Gift, PhoneCall, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { SiVisa, SiMastercard, SiApplepay, SiStripe, SiGooglepay, SiVodafone, SiTmobile, SiOrange } from "react-icons/si";
import type { Destination, Plan } from "@shared/schema";
import { CountryCombobox } from "@/components/country-combobox";

async function goToCheckout(
  navigate: (path: string) => void,
  destId: string,
  size: string,
  duration: string,
) {
  try {
    const res = await fetch(`/api/plans?destinationId=${destId}`);
    const plans: Plan[] = await res.json();
    const active = plans.filter((p) => p.planStatus !== "inactive");
    if (!active.length) { navigate(`/destinations/${destId}`); return; }
    let pool = [...active];
    if (size && size !== "Unlimited") {
      const targetGb = parseFloat(size);
      const bySize = pool.filter((p) => {
        const m = p.dataAmount.match(/(\d+(?:\.\d+)?)/);
        return m && Math.abs(parseFloat(m[1]) - targetGb) < 0.5;
      });
      if (bySize.length) pool = bySize;
    } else if (size === "Unlimited") {
      const unl = pool.filter((p) => /unlimited/i.test(p.dataAmount));
      if (unl.length) pool = unl;
    }
    if (duration) {
      const targetDays = parseInt(duration);
      const byDur = pool.filter((p) => {
        const m = p.validity.match(/(\d+)/);
        return m && Math.abs(parseInt(m[1]) - targetDays) <= 2;
      });
      if (byDur.length) pool = byDur;
    }
    const best = pool.reduce((a, b) => (b.price < a.price ? b : a), pool[0]);
    navigate(`/checkout/${best.id}`);
  } catch {
    navigate(`/destinations/${destId}`);
  }
}

const flagStrip = [
  { code: "GB", label: "UK",        flag: "🇬🇧" },
  { code: "US", label: "USA",       flag: "🇺🇸" },
  { code: "AE", label: "UAE",       flag: "🇦🇪" },
  { code: "NG", label: "Nigeria",   flag: "🇳🇬" },
  { code: "FR", label: "France",    flag: "🇫🇷" },
  { code: "DE", label: "Germany",   flag: "🇩🇪" },
  { code: "JP", label: "Japan",     flag: "🇯🇵" },
  { code: "SG", label: "Singapore", flag: "🇸🇬" },
  { code: "ES", label: "Spain",     flag: "🇪🇸" },
  { code: "IT", label: "Italy",     flag: "🇮🇹" },
  { code: "TH", label: "Thailand",  flag: "🇹🇭" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
];

const mockPlans = [
  { dest: "United Kingdom", flag: "🇬🇧", data: "10 GB", days: 30, price: "$18" },
  { dest: "Europe",         flag: "🇪🇺", data: "5 GB",  days: 15, price: "$14" },
  { dest: "UAE",            flag: "🇦🇪", data: "3 GB",  days:  7, price: "$11" },
  { dest: "Nigeria",        flag: "🇳🇬", data: "5 GB",  days: 30, price: "$16" },
];

const planSizes     = ["1 GB", "3 GB", "5 GB", "10 GB", "Unlimited"];
const planDurations = ["1 Day", "3 Days", "5 Days", "7 Days", "15 Days", "30 Days"];

// ─────────────────────────────────────────────
// 1. HERO
// ─────────────────────────────────────────────
function HeroSection() {
  const [, navigate] = useLocation();
  const [heroCode, setHeroCode]         = useState<string>("");
  const [heroSize, setHeroSize]         = useState<string>("");
  const [heroDuration, setHeroDuration] = useState<string>("");

  const handleHeroFind = () => {
    if (!heroCode || heroCode === "any") navigate("/destinations");
    else navigate(`/destinations/${heroCode}`);
  };

  return (
    <section className="relative overflow-hidden min-h-[92vh] flex flex-col">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: "brightness(0.4) saturate(1.2)", transform: "scale(1.04)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/70 to-violet-950/80" />
        {/* Subtle purple glow in upper-right */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
      </div>

      <div className="relative flex-1 max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-0 sm:pt-28 lg:pt-36 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center pb-16 sm:pb-20">

          {/* Left: Copy */}
          <div>
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white/70 text-xs font-semibold uppercase tracking-widest mb-6 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Instant eSIM &nbsp;·&nbsp; 190+ countries &nbsp;·&nbsp; From $7.99
            </div>

            <h1
              className="font-display text-5xl sm:text-6xl lg:text-[4.5rem] xl:text-[5.5rem] font-bold text-white leading-[1.0] tracking-tight mb-6"
              data-testid="text-hero-title"
            >
              Land anywhere.
              <br />
              <span className="text-gradient-bright">Stay online.</span>
              <br />
              From $7.99.
            </h1>

            <p
              className="text-white/60 text-lg sm:text-xl max-w-lg leading-relaxed mb-8"
              data-testid="text-hero-subtitle"
            >
              Your eSIM is ready the instant you check out. Scan the QR, skip the airport queues, and land with data already working.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Link href="/destinations">
                <Button
                  size="lg"
                  className="h-12 px-7 text-base font-bold shadow-xl shadow-primary/30 bg-primary hover:bg-primary/90"
                  data-testid="button-get-esim"
                >
                  Get eSIM Now
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/destinations">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 bg-white/8 backdrop-blur-sm text-white border-white/20 hover:bg-white/15 hover:text-white text-base font-semibold"
                  data-testid="button-view-plans"
                >
                  View Plans
                </Button>
              </Link>
            </div>

            {/* Trust bullets */}
            <div className="flex flex-col gap-2 mb-4" data-testid="trust-bullets">
              {[
                "QR code delivered to your inbox in seconds",
                "Your regular number stays fully active",
                "One flat price — no daily fees, no bill shock",
              ].map((b) => (
                <div key={b} className="flex items-center gap-2.5 text-white/60 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                  {b}
                </div>
              ))}
            </div>

            {/* Quick plan finder */}
            <div
              className="mt-8 rounded-2xl bg-white/6 backdrop-blur-md border border-white/12 p-4 sm:p-5"
              data-testid="hero-plan-selector"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-3">Quick plan finder</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <CountryCombobox
                  value={heroCode}
                  onSelect={code => setHeroCode(code ?? "")}
                  placeholder="Destination"
                  allowAny
                  className="bg-white/10 border-white/20 text-white h-10 text-sm hover:bg-white/15 hover:text-white"
                  data-testid="hero-select-destination"
                />
                <Select onValueChange={setHeroSize} data-testid="hero-select-data">
                  <SelectTrigger className="bg-white/10 border-white/20 text-white h-10 text-sm [&>span]:text-white/60" data-testid="hero-trigger-data">
                    <SelectValue placeholder="Data plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {planSizes.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={setHeroDuration} data-testid="hero-select-duration">
                  <SelectTrigger className="bg-white/10 border-white/20 text-white h-10 text-sm [&>span]:text-white/60" data-testid="hero-trigger-duration">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {planDurations.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full font-bold h-10"
                onClick={handleHeroFind}
                data-testid="button-hero-get-esim"
              >
                Find My Plan
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Right: Floating plan preview */}
          <div className="hidden lg:block" data-testid="card-hero-preview">
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute inset-0 rounded-3xl opacity-30" style={{ background: "radial-gradient(ellipse, #7c3aed 0%, transparent 70%)", filter: "blur(40px)" }} />
              <div className="relative rounded-3xl border border-white/10 bg-black/50 backdrop-blur-2xl overflow-hidden shadow-2xl">
                <div className="px-6 pt-6 pb-4 border-b border-white/8 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-0.5">Popular Plans</p>
                    <p className="text-sm text-white/50">Starting from <strong className="text-white/90">$9</strong></p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold">
                    <Zap className="w-3 h-3" />
                    Instant QR
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {mockPlans.map((p) => (
                    <div
                      key={p.dest}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
                      data-testid={`mock-plan-${p.dest.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none">{p.flag}</span>
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">{p.dest}</p>
                          <p className="text-xs text-white/45 mt-0.5">{p.data} · {p.days} days</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{p.price}</p>
                        <p className="text-[10px] text-white/40">one-off</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-5">
                  <Link href="/destinations">
                    <Button className="w-full font-bold" data-testid="button-hero-card-browse">
                      Browse All Plans
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flag strip */}
        <div className="border-t border-white/8 py-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-white/25 text-[10px] uppercase tracking-widest font-bold flex-shrink-0 hidden sm:block">Popular</span>
            {flagStrip.map((item) => (
              <Link key={item.code} href={`/destinations/${item.code}`} data-testid={`flag-strip-${item.code.toLowerCase()}`}>
                <div className="flex items-center gap-1.5 hover:opacity-75 transition-opacity cursor-pointer">
                  <span className="text-base leading-none">{item.flag}</span>
                  <span className="text-white/40 text-xs font-medium">{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/6 bg-black/35 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-1.5 text-white/45" data-testid="trust-bar-rating">
                <Star className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">4.9/5 · 5,000+ travellers</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/45" data-testid="trust-bar-delivery">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Instant QR delivery</span>
              </div>
              <div className="flex items-center gap-2.5 text-white/40" data-testid="trust-bar-networks">
                <SiVodafone className="h-3.5 w-auto" title="Vodafone" />
                <SiTmobile  className="h-3.5 w-auto" title="T-Mobile" />
                <SiOrange   className="h-3.5 w-auto" title="Orange" />
              </div>
              <div className="flex items-center gap-1.5 text-white/45" data-testid="trust-bar-support">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">24/7 support</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0" data-testid="payment-icons">
              <SiVisa       className="h-4 w-auto text-white/40" data-testid="payment-icon-visa" />
              <SiMastercard className="h-4 w-auto text-white/40" data-testid="payment-icon-mc" />
              <SiApplepay   className="h-5 w-auto text-white/40" data-testid="payment-icon-apple-pay" />
              <SiGooglepay  className="h-5 w-auto text-white/40" data-testid="payment-icon-google-pay" />
              <SiStripe     className="h-4 w-auto text-white/40" data-testid="payment-icon-stripe" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 2. HOW IT WORKS
// ─────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: "01",
      icon: Globe,
      title: "Choose your plan",
      description: "Pick your destination, data size, and trip length. Done in 30 seconds.",
    },
    {
      num: "02",
      icon: QrCode,
      title: "Get your QR instantly",
      description: "Your QR code lands in your inbox the moment payment clears. No waiting.",
    },
    {
      num: "03",
      icon: Wifi,
      title: "Scan and go",
      description: "Open phone Settings, scan the QR, and you're online. That's it.",
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-20 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-16 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">How it works</p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.0]" data-testid="text-how-it-works-title">
            Online in<br /><span className="text-gradient">60 seconds.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-card p-8 sm:p-10 flex flex-col gap-6"
              data-testid={`card-step-${idx + 1}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <span className="font-display text-5xl font-bold text-border">{step.num}</span>
              </div>
              <div>
                <h3 className="font-display font-bold text-xl mb-2" data-testid={`text-step-title-${idx + 1}`}>{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 3. PLAN FINDER
// ─────────────────────────────────────────────
interface CountryPlanEntry {
  normalizedPlanId: string;
  dataMb: number;
  validityDays: number;
  dataAmountGb: number;
  isUnlimited: boolean;
  dataLabel: string;
  validityLabel: string;
  estimatedPriceUsd: number;
  providerCount: number;
}

function PlanFinder() {
  const [, navigate] = useLocation();
  const [countryCode, setCountryCode]       = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; flagEmoji: string } | undefined>();
  const [size, setSize]         = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const { fmt, isApprox } = useCurrency();

  const { data: plansData } = useQuery<{ countryCode: string; plans: CountryPlanEntry[] }>({
    queryKey: ["/api/countries", countryCode, "plans"],
    queryFn: async () => {
      const res = await fetch(`/api/countries/${countryCode}/plans`);
      if (!res.ok) return { countryCode, plans: [] };
      return res.json();
    },
    enabled: !!countryCode && countryCode !== "any",
  });

  const handleFind = () => {
    if (!countryCode || countryCode === "any") navigate("/destinations");
    else navigate(`/destinations/${countryCode}`);
  };

  const destName  = selectedCountry?.name      ?? "Japan";
  const destFlag  = selectedCountry?.flagEmoji ?? "🇯🇵";
  const planLabel = size     || "5 GB";
  const planDur   = duration || "30 Days";

  const sizeToGb:  Record<string, number> = { "1 GB": 1, "3 GB": 3, "5 GB": 5, "10 GB": 10, "Unlimited": 999 };
  const durToDays: Record<string, number> = { "1 Day": 1, "3 Days": 3, "5 Days": 5, "7 Days": 7, "15 Days": 15, "30 Days": 30 };

  const matchedPlan = (() => {
    const plans = plansData?.plans;
    if (!plans?.length) return null;
    const gb   = sizeToGb[size]     ?? 5;
    const days = durToDays[duration] ?? 30;
    const sorted = [...plans].sort((a, b) => a.estimatedPriceUsd - b.estimatedPriceUsd);
    if (size === "Unlimited") return sorted.find(p => p.isUnlimited) ?? sorted[0];
    const exact = sorted.filter(p => Math.abs(p.dataAmountGb - gb) <= 0.5 && Math.abs(p.validityDays - days) <= 3);
    return exact[0] ?? sorted[0] ?? null;
  })();

  const planPrice = () => {
    const prefix = isApprox ? "≈ " : "";
    if (matchedPlan) return `${prefix}${fmt(matchedPlan.estimatedPriceUsd)}`;
    if (size === "Unlimited") return `${prefix}${fmt(22.99)}`;
    if (size === "10 GB")     return `${prefix}${fmt(16.99)}`;
    if (size === "5 GB")      return `${prefix}${fmt(12.99)}`;
    if (size === "3 GB")      return `${prefix}${fmt(8.99)}`;
    if (size === "1 GB")      return `${prefix}${fmt(5.99)}`;
    return `${prefix}${fmt(12.99)}`;
  };

  const perfectFor = (): string[] => {
    if (size === "1 GB")      return ["Maps & transport", "WhatsApp & calls", "Email & light browsing"];
    if (size === "10 GB")     return ["Video streaming", "Hotspot sharing", "Working remotely"];
    if (size === "Unlimited") return ["Unlimited streaming", "Remote work & hotspot", "No data restrictions"];
    return ["Maps & transport", "WhatsApp & calls", "Daily browsing"];
  };

  return (
    <section id="plans" className="py-24 sm:py-32 border-t bg-card">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Plan Finder</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight" data-testid="text-plan-finder-title">
            Find your plan.<br />Done in 30 seconds.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
            Pick your destination, data allowance, and trip length — we'll show you the best plan at the sharpest price.
          </p>
        </div>

        <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Where are you going?</p>
                <CountryCombobox
                  value={countryCode}
                  onSelect={(code, country) => { setCountryCode(code ?? ""); setSelectedCountry(country); }}
                  placeholder="Select destination"
                  allowAny
                  className="w-full h-11 border-border bg-background shadow-sm justify-between"
                  data-testid="select-destination"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">How much data?</p>
                <Select onValueChange={setSize} data-testid="select-data-size">
                  <SelectTrigger className="h-11 border-border bg-background shadow-sm" data-testid="trigger-data-size">
                    <SelectValue placeholder="Data allowance" />
                  </SelectTrigger>
                  <SelectContent>
                    {planSizes.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`option-size-${s.toLowerCase().replace(/\s/g, '-')}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">How long?</p>
                <Select onValueChange={setDuration} data-testid="select-duration">
                  <SelectTrigger className="h-11 border-border bg-background shadow-sm" data-testid="trigger-duration">
                    <SelectValue placeholder="Trip length" />
                  </SelectTrigger>
                  <SelectContent>
                    {planDurations.map((d) => (
                      <SelectItem key={d} value={d} data-testid={`option-duration-${d.toLowerCase().replace(/\s/g, '-')}`}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {countryCode && countryCode !== "any" && (
              <div className="mt-6 rounded-xl border bg-card" data-testid="plan-recommendation-card">
                <div className="px-5 pt-4 pb-3 border-b flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">Best match for your trip</p>
                  <Badge variant="secondary" className="text-xs">{matchedPlan?.providerCount ?? "Multi"} providers</Badge>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl leading-none">{destFlag}</span>
                    <div>
                      <p className="font-bold text-lg leading-tight" data-testid="rec-dest-name">{destName}</p>
                      <p className="text-sm text-muted-foreground" data-testid="rec-plan-label">{planLabel} · {planDur}</p>
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Perfect for</p>
                    <ul className="space-y-1.5">
                      {perfectFor().map((b) => (
                        <li key={b} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-end justify-between gap-4 pt-4 border-t">
                    <div>
                      <p className="text-3xl font-bold tracking-tight" data-testid="rec-plan-price">{planPrice()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">one-off · no subscription</p>
                    </div>
                    <Button size="lg" className="font-bold flex-shrink-0" onClick={handleFind} data-testid="button-see-plans">
                      Find My Plan
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="risk-reversal-strip">
                    {[
                      { icon: Zap,          text: "Instant delivery" },
                      { icon: CheckCircle2, text: "Works on arrival" },
                      { icon: ShieldCheck,  text: "No hidden fees" },
                      { icon: Globe,        text: "190+ countries" },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 sm:px-8 pb-5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>No app required · From £5.99 ·</span>
            <Link href="/destinations">
              <span className="text-primary underline underline-offset-2 cursor-pointer" data-testid="link-browse-all-inline">Browse all destinations</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 4. POPULAR DESTINATIONS
// ─────────────────────────────────────────────
const regionFromPrice: Record<string, string> = {
  "Asia": "£7.99",
  "Southeast Asia": "£7.99",
  "Europe": "£9.99",
  "Middle East": "£12.99",
  "North America": "£14.99",
};

function PopularDestinations() {
  const { data: destinations } = useQuery<Destination[]>({ queryKey: ["/api/destinations"] });
  const popular = destinations?.filter(d => d.popular).slice(0, 8) ?? [];

  return (
    <section className="py-24 sm:py-32 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Popular Destinations</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              Where do you<br />want to go?
            </h2>
            <p className="text-muted-foreground text-sm">Choose from our most popular destinations and get connected before you land.</p>
          </div>
          <Link href="/destinations">
            <Button variant="outline" size="lg" className="font-bold flex-shrink-0" data-testid="button-popular-browse-all">
              Browse all destinations
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {popular.map((dest) => (
            <Link key={dest.id} href={`/destinations/${dest.id}`} data-testid={`card-popular-dest-${dest.id}`}>
              <div className="group relative overflow-hidden rounded-2xl cursor-pointer aspect-[3/4] bg-muted shadow-lg">
                <img
                  src={dest.imageUrl}
                  alt={dest.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                {/* Top badge */}
                <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm border border-white/15 rounded-lg px-2 py-1">
                  <p className="text-white/50 text-[9px] uppercase tracking-wide font-bold leading-none mb-0.5">from</p>
                  <p className="text-white font-bold text-xs">{regionFromPrice[dest.region] ?? "£9.99"}</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-xl leading-none mb-1.5">{dest.flagEmoji}</p>
                  <p className="font-bold text-white text-sm leading-tight">{dest.name}</p>
                  <p className="text-white/50 text-xs mt-0.5">{dest.region}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 5. WHY GLOBESIM
// ─────────────────────────────────────────────
function WhyKonex() {
  const benefits = [
    {
      icon: Banknote,
      accent: "text-emerald-400",
      bg: "bg-emerald-400/10",
      title: "No roaming fees — ever",
      description: "One fixed price. No per-minute charges, no bill shock. What you pay at checkout is all you pay.",
    },
    {
      icon: Zap,
      accent: "text-amber-400",
      bg: "bg-amber-400/10",
      title: "Activated in under 60 seconds",
      description: "QR code arrives the instant you check out. Scan from your phone settings and you're online.",
    },
    {
      icon: Signal,
      accent: "text-sky-400",
      bg: "bg-sky-400/10",
      title: "Keep your existing number",
      description: "Your regular SIM stays fully active. Calls, texts, and WhatsApp work normally while your eSIM handles data.",
    },
    {
      icon: Globe,
      accent: "text-violet-400",
      bg: "bg-violet-400/10",
      title: "Regional & global plans",
      description: "One eSIM, multiple countries. Cover all of Europe, the Middle East, or Southeast Asia with a single purchase.",
    },
    {
      icon: Radio,
      accent: "text-pink-400",
      bg: "bg-pink-400/10",
      title: "Tier 1 global networks",
      description: "Routed through Vodafone, T-Mobile, Orange, and other Tier 1 carriers for reliable signal everywhere.",
    },
    {
      icon: Smartphone,
      accent: "text-blue-400",
      bg: "bg-blue-400/10",
      title: "100% digital — no plastic",
      description: "No SIM card. No post. No carrier store. Buy online, install digitally, travel.",
    },
  ];

  return (
    <section className="py-24 sm:py-32 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Why Konex</p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.0] mb-5" data-testid="text-benefits-title">
            Built for how<br />people actually travel.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            No roaming fees. No lock-in. No plastic SIM. Just fast, reliable data wherever you're heading.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {benefits.map((b, i) => (
            <div
              key={b.title}
              className="p-7 rounded-2xl border bg-background hover:border-primary/30 transition-colors"
              data-testid={`card-benefit-${i}`}
            >
              <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ${b.bg} mb-5`}>
                <b.icon className={`w-5 h-5 ${b.accent}`} />
              </div>
              <h3 className="font-bold text-base mb-2 leading-snug">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 6. BUNDLES
// ─────────────────────────────────────────────
const bundles = [
  {
    id: "europe",
    flag: "🇪🇺",
    label: "Most Popular",
    highlighted: true,
    title: "Europe Pack",
    subtitle: "28 countries · One eSIM",
    description: "Full coverage across the EU, UK, and beyond. Maps, social, streaming — all without switching SIMs.",
    features: ["28 European countries", "Up to 30-day validity", "4G/5G speeds"],
    price: "From $14",
  },
  {
    id: "nigeria",
    flag: "🇳🇬🇬🇧",
    label: "Best Value",
    highlighted: false,
    title: "UK ↔ Nigeria Pack",
    subtitle: "Dual-country · Stay connected both ends",
    description: "Built for the UK–Nigeria corridor. Stay connected on both ends without roaming charges on either.",
    features: ["UK + Nigeria coverage", "5 GB data", "30-day validity"],
    price: "From $16",
  },
  {
    id: "global",
    flag: "🌍",
    label: "Premium",
    highlighted: false,
    title: "Global Traveller Pack",
    subtitle: "190+ countries · No limits",
    description: "One eSIM that works everywhere. Ideal for frequent travellers, business trips, or multi-stop tours.",
    features: ["190+ countries covered", "Unlimited data option", "Multi-trip ready"],
    price: "From $29",
  },
];

function BundlesSection() {
  return (
    <section className="py-24 sm:py-32 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-14 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Travel Bundles</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4" data-testid="text-bundles-title">
            Bundles built<br />for your route.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Pre-configured for the most popular travel corridors — buy once, stay connected throughout.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className={`flex flex-col rounded-2xl border p-7 ${bundle.highlighted ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
              data-testid={`card-bundle-${bundle.id}`}
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-4xl leading-none">{bundle.flag}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${bundle.highlighted ? "bg-white/20 border-white/30 text-white" : "bg-primary/10 border-primary/20 text-primary"}`}>
                  {bundle.label}
                </span>
              </div>
              <h3 className="font-display font-bold text-2xl mb-1">{bundle.title}</h3>
              <p className={`text-xs font-semibold mb-3 ${bundle.highlighted ? "text-white/60" : "text-muted-foreground"}`}>{bundle.subtitle}</p>
              <p className={`text-sm leading-relaxed mb-6 flex-1 ${bundle.highlighted ? "text-white/75" : "text-muted-foreground"}`}>{bundle.description}</p>
              <ul className="space-y-2 mb-7">
                {bundle.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${bundle.highlighted ? "text-white/70" : "text-primary"}`} />
                    <span className={bundle.highlighted ? "text-white/80" : ""}>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-5 border-t border-current/10">
                <span className="font-display font-bold text-xl">{bundle.price}</span>
                <Link href="/destinations">
                  <Button
                    size="sm"
                    variant={bundle.highlighted ? "secondary" : "default"}
                    className="font-bold"
                    data-testid={`button-bundle-${bundle.id}`}
                  >
                    View Bundle
                    <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 7. COMPATIBILITY
// ─────────────────────────────────────────────
function CompatibilitySection() {
  const devices = [
    "iPhone XS and newer — including all iPhone 14, 15, and 16 models",
    "Samsung Galaxy S20 series and newer",
    "Google Pixel 3 and newer",
    "Selected OnePlus, Motorola, and Xiaomi devices",
  ];

  return (
    <section className="py-24 sm:py-32 border-t bg-card">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Compatibility</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-compat-title">
              Works with most<br />modern devices.
            </h2>
            <p className="text-muted-foreground mb-7 leading-relaxed">
              Compatible with most eSIM-enabled iPhones and Android devices released since 2018. Your device must be carrier-unlocked.
            </p>
            <ul className="space-y-4 mb-8">
              {devices.map((d, i) => (
                <li key={i} className="flex items-start gap-3" data-testid={`compat-device-${i}`}>
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm leading-snug">{d}</span>
                </li>
              ))}
            </ul>
            <Link href="/compatibility">
              <Button size="lg" className="font-bold" data-testid="button-check-compat">
                Check your device
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-primary via-violet-600 to-blue-600 p-8 text-white flex flex-col shadow-2xl shadow-primary/30">
            <Smartphone className="w-12 h-12 mb-6 opacity-80" />
            <h3 className="font-display text-2xl font-bold mb-3">Not sure if your phone is compatible?</h3>
            <p className="text-white/70 leading-relaxed mb-8 flex-1">
              Our device checker covers 60+ models across Apple, Samsung, Google, and more. Takes under 30 seconds to confirm eSIM support.
            </p>
            <Link href="/compatibility">
              <Button variant="outline" size="lg" className="bg-white/10 border-white/20 text-white hover:bg-white/20 w-full sm:w-auto font-bold" data-testid="button-device-checker-cta">
                Open Device Checker
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 8. BUILT FOR REAL ROUTES
// ─────────────────────────────────────────────
function BuiltForTravellers() {
  const routes = [
    { flag: "🇬🇧🇪🇺", label: "UK → Europe",        desc: "Single eSIM across 28 EU countries. No SIM swaps mid-trip." },
    { flag: "🇬🇧🇳🇬", label: "UK ↔ Nigeria",       desc: "Stay connected in both directions without local SIM hassle." },
    { flag: "🇬🇧🇦🇪", label: "UK → Dubai / UAE",  desc: "Fast 4G/5G coverage across the UAE. Activates before you land." },
    { flag: "🌍",     label: "Multi-stop global", desc: "One plan, every continent. Built for the modern nomad." },
  ];

  return (
    <section className="py-24 sm:py-32 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Built for real routes</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-built-for-title">
              Optimised for the world's most popular travel corridors
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Konex isn't a generic eSIM reseller. We've built pricing, coverage, and plans around the routes real travellers actually take.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {["No app required", "Works worldwide", "No contracts", "Instant activation"].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-sm font-semibold"
                  data-testid={`microcopy-${item.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {routes.map((route) => (
              <div
                key={route.label}
                className="flex items-start gap-4 p-5 rounded-2xl border bg-card hover:border-primary/30 transition-colors"
                data-testid={`route-card-${route.label.toLowerCase().replace(/[\s→↔\/]/g, '-').replace(/-+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
              >
                <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{route.flag}</span>
                <div>
                  <p className="font-bold text-sm mb-0.5">{route.label}</p>
                  <p className="text-sm text-muted-foreground leading-snug">{route.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-auto flex-shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 9. UPCOMING FEATURES
// ─────────────────────────────────────────────
function DataRolloverSection() {
  const steps = [
    { pct: 100, label: "Trip 1 — Japan",     used: "3.2 GB", total: "5 GB", leftover: "1.8 GB", flag: "🇯🇵" },
    { pct: 64,  label: "Trip 2 — Thailand",  used: "2.2 GB", total: "5 GB + 1.8 GB carried", leftover: "4.6 GB", flag: "🇹🇭" },
    { pct: 38,  label: "Trip 3 — Indonesia", used: "2.6 GB", total: "5 GB + 4.6 GB carried", leftover: "7.0 GB", flag: "🇮🇩" },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card/50" id="rollover" data-testid="section-rollover">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <TrendingUp className="w-3.5 h-3.5" />
              Coming Q3 2026
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-rollover-title">
              Leftover data?<br />
              <span className="text-gradient">It rolls over.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Don't lose data you've paid for. Unused gigabytes carry forward automatically to your next trip — no expiry, no waste.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Rollover applies to all future trips with Konex",
                "No manual action required — it's automatic",
                "Pooled balance visible in your dashboard",
                "Works across any destination",
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <Button size="lg" className="font-bold" data-testid="button-rollover-notify">
                Get notified when it's live
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3" data-testid="rollover-demo">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-5 ${i === 0 ? "opacity-50 bg-muted/30" : "bg-background"}`}
                data-testid={`rollover-step-${i}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">{step.flag}</span>
                    <div>
                      <p className="font-bold text-sm">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.total}</p>
                    </div>
                  </div>
                  {i > 0 && (
                    <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                      +{steps[i - 1].leftover} carried
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{step.used} used</span>
                    <span className={`font-medium ${i > 0 ? "text-emerald-500" : ""}`}>{step.leftover} left</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${i === 0 ? "from-muted-foreground/50 to-muted-foreground/30" : i === 1 ? "from-primary to-blue-400" : "from-emerald-500 to-teal-400"}`}
                      style={{ width: `${i === 0 ? 100 - (100 * parseFloat(step.leftover) / 5) : 100 - step.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold">7.0 GB balance carried forward</p>
                <p className="text-xs text-muted-foreground">Ready for your next destination</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GiftEsimSection() {
  const [form, setForm]       = useState({ recipientName: "", recipientEmail: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleGift(e: React.FormEvent) {
    e.preventDefault();
    if (!form.recipientEmail) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <section className="py-16 sm:py-20 border-t opacity-90" id="gift" data-testid="section-gift">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="order-2 lg:order-1" data-testid="gift-demo">
            <div className="relative max-w-sm mx-auto lg:mx-0">
              <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/15 via-violet-500/10 to-blue-500/10 p-8 text-center shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-5">
                  <Gift className="w-8 h-8 text-primary" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Gift eSIM</p>
                <h3 className="font-display text-xl font-bold mb-1">5 GB · 30 Days</h3>
                <p className="text-sm text-muted-foreground mb-4">Thailand · Southeast Asia</p>
                <div className="rounded-xl bg-card border p-3 mb-5">
                  <p className="text-xs text-muted-foreground mb-1">To: Aisha Patel</p>
                  <p className="text-sm italic text-foreground/80">"Safe travels on your adventure! Stay connected 🌏"</p>
                </div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-bold border border-primary/20">
                  <CheckCircle2 className="w-4 h-4" />
                  Delivered to inbox
                </div>
              </div>
              <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                Instant delivery
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <Gift className="w-3.5 h-3.5" />
              Available now
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-gift-title">
              Send data to<br /><span className="text-gradient">a loved one.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Buy an eSIM plan as a gift. They get a link in their inbox to activate it when they're ready — no account needed.
            </p>

            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center" data-testid="gift-success">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-bold text-lg mb-1">Gift request received!</p>
                <p className="text-muted-foreground text-sm">We'll reach out to complete the gift order — this feature launches soon.</p>
              </div>
            ) : (
              <form onSubmit={handleGift} className="space-y-3" data-testid="gift-form">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Recipient's name</label>
                    <input
                      type="text"
                      placeholder="Aisha Patel"
                      value={form.recipientName}
                      onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
                      className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-gift-recipient-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Their email</label>
                    <input
                      type="email"
                      placeholder="aisha@example.com"
                      required
                      value={form.recipientEmail}
                      onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))}
                      className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-gift-recipient-email"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Personal message (optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Safe travels on your adventure..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    data-testid="input-gift-message"
                  />
                </div>
                <Button type="submit" className="w-full font-bold" size="lg" disabled={loading} data-testid="button-gift-submit">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Gift className="w-4 h-4" />
                      Send a Gift eSIM
                    </span>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  First select a plan on the next step. Recipient activates at any time.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function VoiceCallingSection() {
  const features = [
    { icon: PhoneCall,   title: "Local number included",     desc: "Get a dedicated number for your destination — calls look local." },
    { icon: Globe,       title: "Call 190+ countries",       desc: "Same eSIM, voice and data. No separate plan needed." },
    { icon: Wifi,        title: "Works over VoIP & carrier", desc: "Uses your data or the host network — whichever is stronger." },
    { icon: ShieldCheck, title: "Encrypted & private",       desc: "End-to-end encrypted calls with no call logs stored." },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card/50" id="voice" data-testid="section-voice">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-5">
            <PhoneCall className="w-3.5 h-3.5" />
            Coming Q4 2026
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4" data-testid="text-voice-title">
            Make calls with Konex.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            Your eSIM, your number — everywhere. Voice calling is coming so you can stay fully connected without juggling apps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {features.map((f, i) => (
            <div key={i} className="rounded-2xl border bg-background p-6 flex flex-col gap-4" data-testid={`card-voice-feature-${i}`}>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm mb-1">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center" data-testid="card-voice-early-access">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
            <PhoneCall className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display text-xl font-bold mb-2">Get early access to voice calling</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Create a Konex account and we'll notify you the moment voice calling launches — early users get priority access and a free trial minute pack.
          </p>
          <Link href="/signup">
            <Button size="lg" className="font-bold shadow-lg shadow-primary/20" data-testid="button-voice-signup">
              Join early access
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-4">Free to join · No credit card needed</p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 10. TESTIMONIALS
// ─────────────────────────────────────────────
function TestimonialsSection() {
  const testimonials = [
    {
      name: "Sarah K.",
      context: "London → Lisbon, Porto, Seville",
      quote: "Activated before I even left the airport. Seamless.",
      full: "I scanned the QR on the plane and had working data before I'd collected my luggage. Far better than queuing at an airport kiosk.",
      initials: "SK",
    },
    {
      name: "James O.",
      context: "Manchester → Lagos",
      quote: "Cut my connectivity costs in half.",
      full: "I travel back to Nigeria four times a year. Switching to Konex saved me significantly — and the signal is just as reliable as any local SIM.",
      initials: "JO",
    },
    {
      name: "Priya M.",
      context: "Birmingham → Dubai, Abu Dhabi",
      quote: "Fast data, first-time install, zero issues.",
      full: "The QR worked first try and the setup guide was clear. Recommended it to my whole team before our Dubai conference — everyone was happy.",
      initials: "PM",
    },
  ];

  return (
    <section className="py-24 sm:py-32 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-14 max-w-xl">
          <div className="flex items-center gap-0.5 mb-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
            ))}
            <span className="ml-2 text-sm text-muted-foreground font-medium">4.9 / 5 · 5,000+ customers</span>
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight" data-testid="text-testimonials-title">
            Trusted by modern travellers.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-14">
          {testimonials.map((t, idx) => (
            <div key={idx} className="flex flex-col p-7 rounded-2xl border bg-card" data-testid={`card-testimonial-${idx}`}>
              <Quote className="w-7 h-7 text-primary/30 mb-5 flex-shrink-0" />
              <p className="font-display font-bold text-lg leading-snug mb-3" data-testid={`text-testimonial-headline-${idx}`}>
                "{t.quote}"
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">
                {t.full}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm flex-shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight" data-testid={`text-testimonial-name-${idx}`}>{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-testimonial-context-${idx}`}>{t.context}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Lock,        label: "Secure checkout",   sub: "SSL encrypted payments" },
            { icon: Zap,         label: "Instant delivery",  sub: "QR code by email" },
            { icon: Signal,      label: "Reliable coverage", sub: "Tier 1 global carriers" },
            { icon: ShieldCheck, label: "24/7 support",      sub: "Help when you need it" },
          ].map(({ icon: Icon, label, sub }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center p-5 rounded-2xl border bg-card gap-3"
              data-testid={`trust-badge-${label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 11. COVERAGE
// ─────────────────────────────────────────────
const coverageRegions = [
  {
    id: "europe",
    label: "Europe",
    countries: [
      { name: "United Kingdom", flag: "🇬🇧" }, { name: "France",      flag: "🇫🇷" },
      { name: "Germany",        flag: "🇩🇪" }, { name: "Spain",       flag: "🇪🇸" },
      { name: "Italy",          flag: "🇮🇹" }, { name: "Portugal",    flag: "🇵🇹" },
      { name: "Netherlands",    flag: "🇳🇱" }, { name: "Greece",      flag: "🇬🇷" },
      { name: "Poland",         flag: "🇵🇱" }, { name: "Sweden",      flag: "🇸🇪" },
      { name: "Switzerland",    flag: "🇨🇭" }, { name: "Austria",     flag: "🇦🇹" },
    ],
  },
  {
    id: "north-america",
    label: "North America",
    countries: [
      { name: "United States", flag: "🇺🇸" }, { name: "Canada", flag: "🇨🇦" }, { name: "Mexico", flag: "🇲🇽" },
    ],
  },
  {
    id: "africa",
    label: "Africa",
    countries: [
      { name: "Nigeria",      flag: "🇳🇬" }, { name: "South Africa", flag: "🇿🇦" },
      { name: "Kenya",        flag: "🇰🇪" }, { name: "Ghana",        flag: "🇬🇭" },
      { name: "Egypt",        flag: "🇪🇬" }, { name: "Ethiopia",     flag: "🇪🇹" },
      { name: "Tanzania",     flag: "🇹🇿" }, { name: "Uganda",       flag: "🇺🇬" },
    ],
  },
  {
    id: "middle-east",
    label: "Middle East",
    countries: [
      { name: "UAE",          flag: "🇦🇪" }, { name: "Saudi Arabia", flag: "🇸🇦" },
      { name: "Qatar",        flag: "🇶🇦" }, { name: "Kuwait",       flag: "🇰🇼" },
      { name: "Bahrain",      flag: "🇧🇭" }, { name: "Oman",         flag: "🇴🇲" },
      { name: "Jordan",       flag: "🇯🇴" }, { name: "Lebanon",      flag: "🇱🇧" },
    ],
  },
  {
    id: "asia",
    label: "Asia",
    countries: [
      { name: "Japan",       flag: "🇯🇵" }, { name: "Singapore",   flag: "🇸🇬" },
      { name: "Thailand",    flag: "🇹🇭" }, { name: "South Korea", flag: "🇰🇷" },
      { name: "Malaysia",    flag: "🇲🇾" }, { name: "Indonesia",   flag: "🇮🇩" },
      { name: "India",       flag: "🇮🇳" }, { name: "Philippines", flag: "🇵🇭" },
      { name: "Vietnam",     flag: "🇻🇳" }, { name: "Hong Kong",   flag: "🇭🇰" },
    ],
  },
  {
    id: "global",
    label: "Global",
    countries: [
      { name: "190+ destinations covered worldwide with a single eSIM purchase", flag: "🌍" },
    ],
  },
];

function CoverageSection() {
  return (
    <section id="coverage" className="py-24 sm:py-32 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-14 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Coverage</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight" data-testid="text-coverage-title">
            190+ countries covered.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-sm leading-relaxed">
            From a weekend break in Europe to a month across Southeast Asia — Konex works the moment you land, everywhere on the list.
          </p>
        </div>

        <Tabs defaultValue="europe">
          <TabsList className="flex flex-wrap h-auto gap-1.5 mb-8 justify-start bg-transparent p-0">
            {coverageRegions.map((r) => (
              <TabsTrigger
                key={r.id}
                value={r.id}
                className="rounded-full border px-4 py-1.5 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
                data-testid={`tab-region-${r.id}`}
              >
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {coverageRegions.map((r) => (
            <TabsContent key={r.id} value={r.id}>
              <div className="rounded-2xl border bg-background p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-7">
                  {r.countries.map((country) => (
                    <div
                      key={country.name}
                      className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border bg-card"
                      data-testid={`coverage-country-${country.name.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <span className="text-base leading-none flex-shrink-0">{country.flag}</span>
                      <span className="text-sm leading-tight font-medium">{country.name}</span>
                    </div>
                  ))}
                </div>
                <Link href="/destinations">
                  <Button variant="outline" className="font-bold" data-testid={`button-region-plans-${r.id}`}>
                    Browse {r.label} Plans
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 12. FAQ
// ─────────────────────────────────────────────
function FAQSection() {
  const faqs = [
    {
      question: "What is an eSIM?",
      answer: "An eSIM is a digital SIM card built into your phone. Instead of inserting a physical card, you scan a QR code to download your data plan directly onto your device. Setup takes under a minute, and your regular number stays active alongside it.",
    },
    {
      question: "How quickly do I receive my eSIM?",
      answer: "Instantly. Your QR code is delivered to your email within seconds of completing your purchase. You can install it before you even leave for the airport — no waiting required.",
    },
    {
      question: "Can I keep my regular number?",
      answer: "Yes. Your existing SIM card and phone number remain fully active. The eSIM adds a separate data line — you'll still receive calls and messages on your regular number while using Konex for data.",
    },
    {
      question: "Does Konex work on iPhone and Android?",
      answer: "Yes. Konex works with most eSIM-compatible devices: iPhone XS and newer, Samsung Galaxy S20 and newer, Google Pixel 3 and newer, and many others. Your device must be carrier-unlocked. Use our compatibility checker to confirm before you buy.",
    },
    {
      question: "What happens if I run out of data?",
      answer: "You can purchase a top-up plan for the same destination at any time. Simply find your destination, select a plan, and check out. Your additional data is delivered instantly — no setup needed.",
    },
    {
      question: "Can I use Konex in multiple countries?",
      answer: "Yes. Our regional plans cover multiple countries in one purchase — ideal for European trips, Middle East travel, or multi-stop tours. Global plans cover 190+ countries with a single eSIM.",
    },
  ];

  return (
    <section id="faq" className="py-24 sm:py-32 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">FAQ</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-6" data-testid="text-faq-title">
              Questions?<br />We've got answers.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Everything you need to know before you buy. Can't find your answer?{" "}
              <span className="text-foreground font-medium">Reply to any email from us</span> and we'll get back within a few hours.
            </p>
            <Link href="/destinations">
              <Button size="lg" className="font-bold" data-testid="button-faq-cta">
                Browse Plans
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} value={`faq-${idx}`} className="border-b">
                <AccordionTrigger className="text-left font-bold py-5 hover:no-underline text-base" data-testid={`button-faq-${idx}`}>
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <p className="text-muted-foreground leading-relaxed text-sm">
                    {faq.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 13. FINAL CTA
// ─────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-24 sm:py-32 border-t relative overflow-hidden bg-card">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #7c3aed 0%, transparent 70%)" }} />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.0]" data-testid="text-final-cta-title">
          Get travel data<br />before you land.
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed" data-testid="text-final-cta-subtitle">
          Choose your destination, activate in minutes, and stay connected in 190+ countries with KONEX eSIM.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <Link href="/destinations">
            <Button size="lg" className="h-13 px-8 text-base font-bold shadow-xl shadow-primary/30" data-testid="button-final-get-started">
              Get eSIM Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link href="/destinations">
            <Button size="lg" variant="outline" className="h-13 px-8 text-base font-bold" data-testid="button-final-browse-plans">
              View Plans
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-final-microcopy">
          Instant delivery &nbsp;·&nbsp; No roaming fees &nbsp;·&nbsp; No contracts
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 14. FOOTER
// ─────────────────────────────────────────────
function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-14">
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-5" data-testid="text-footer-brand">
              <KonexLogo size="md" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]" data-testid="text-footer-tagline">
              Instant global eSIM data for modern travellers.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Product</p>
            <ul className="space-y-3">
              {[
                { label: "Plans",        action: () => scrollTo("plans"),        testid: "footer-link-plans" },
                { label: "Coverage",     action: () => scrollTo("coverage"),     testid: "footer-link-coverage" },
                { label: "How It Works", action: () => scrollTo("how-it-works"), testid: "footer-link-how" },
              ].map((item) => (
                <li key={item.label}>
                  <button onClick={item.action} className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium" data-testid={item.testid}>
                    {item.label}
                  </button>
                </li>
              ))}
              <li>
                <Link href="/compatibility">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium" data-testid="footer-link-compat">
                    Compatibility
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/orders">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium" data-testid="footer-link-my-esims">
                    My eSIMs
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Support</p>
            <ul className="space-y-3">
              <li>
                <button onClick={() => scrollTo("faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium" data-testid="footer-link-faq">
                  FAQ
                </button>
              </li>
              <li><span className="text-sm text-muted-foreground font-medium" data-testid="footer-link-contact">Contact</span></li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Legal</p>
            <ul className="space-y-3">
              <li><span className="text-sm text-muted-foreground font-medium" data-testid="text-footer-privacy">Privacy Policy</span></li>
              <li><span className="text-sm text-muted-foreground font-medium" data-testid="text-footer-terms">Terms of Service</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
            &copy; 2026 Konex. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/destinations">
              <Button size="sm" className="font-bold" data-testid="button-footer-get-started">Get Started</Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" className="font-bold" data-testid="button-footer-my-esims">My eSIMs</Button>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────
// 15. MOBILE STICKY CTA
// ─────────────────────────────────────────────
function MobileStickyCTA() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/96 backdrop-blur-md border-t shadow-2xl px-3 py-2.5"
      data-testid="mobile-sticky-cta"
    >
      <div className="flex gap-2">
        <Link href="/destinations" className="flex-1">
          <Button className="w-full font-bold text-sm" size="default" data-testid="button-mobile-sticky-esim">
            Get eSIM Now
            <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
          </Button>
        </Link>
        <Link href="/destinations" className="flex-1">
          <Button variant="outline" className="w-full font-bold text-sm" size="default" data-testid="button-mobile-sticky-plans">
            View Plans
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      {/* Primary conversion funnel */}
      <HeroSection />
      <PlanFinder />
      <PopularDestinations />
      <CoverageSection />
      <TestimonialsSection />
      <WhyKonex />
      <BuiltForTravellers />
      <BundlesSection />
      <CompatibilitySection />
      <FinalCTA />
      {/* Secondary / future features */}
      <DataRolloverSection />
      <GiftEsimSection />
      <VoiceCallingSection />
      <HowItWorks />
      <FAQSection />
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
