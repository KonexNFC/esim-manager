import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Signal, Quote, Users, Radio,
  QrCode, MapPin, Banknote, ShieldCheck,
  Package, TrendingUp, Timer
} from "lucide-react";
import { useState } from "react";
import type { Destination } from "@shared/schema";

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

const carriers = [
  "Vodafone", "T-Mobile", "Orange", "Airtel",
  "Etisalat", "SingTel", "NTT Docomo", "Telstra",
];

const mockPlans = [
  { dest: "United Kingdom", flag: "🇬🇧", data: "10 GB", days: 30, price: "$18" },
  { dest: "Europe",         flag: "🇪🇺", data: "5 GB",  days: 15, price: "$14" },
  { dest: "UAE",            flag: "🇦🇪", data: "3 GB",  days:  7, price: "$11" },
  { dest: "Nigeria",        flag: "🇳🇬", data: "5 GB",  days: 30, price: "$16" },
];

const planSizes = ["1 GB", "3 GB", "5 GB", "10 GB", "Unlimited"];
const planDurations = ["7 Days", "15 Days", "30 Days"];

// ─────────────────────────────────────────────
// 1. HERO
// ─────────────────────────────────────────────
function HeroSection() {
  const [, navigate] = useLocation();
  const [heroDestId, setHeroDestId] = useState<string>("");
  const [heroSize, setHeroSize] = useState<string>("");
  const [heroDuration, setHeroDuration] = useState<string>("");

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ["/api/destinations"],
  });

  const handleHeroFind = () => {
    if (heroDestId && heroDestId !== "any") {
      navigate(`/destinations/${heroDestId}`);
    } else {
      navigate("/destinations");
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img src="/images/hero-bg.png" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/65 to-black/80" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-0 sm:pt-32 lg:pt-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center pb-14 sm:pb-20">

          {/* Left: Copy */}
          <div>
            <h1
              className="text-5xl sm:text-6xl lg:text-[3.8rem] font-bold text-white tracking-tight leading-[1.05]"
              data-testid="text-hero-title"
            >
              Land Anywhere.
              <br />
              Get Data in
              <br />
              <span className="text-primary">60 Seconds.</span>
            </h1>

            <p
              className="mt-6 text-lg sm:text-xl text-white/65 max-w-lg leading-relaxed"
              data-testid="text-hero-subtitle"
            >
              No roaming fees. No SIM cards. Instant global connectivity across 190+ countries.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/destinations">
                <Button size="lg" className="px-7 text-base font-semibold shadow-lg" data-testid="button-get-connected">
                  Get Connected Now
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/destinations">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-white/8 backdrop-blur-sm text-white border-white/20 text-base"
                  data-testid="button-view-plans"
                >
                  View Plans
                </Button>
              </Link>
            </div>

            {/* Trust bullets */}
            <ul className="mt-6 space-y-2" data-testid="trust-bullets">
              {[
                "Works instantly on arrival",
                "Keep your number (WhatsApp, calls, texts)",
                "Delivered to your email instantly",
              ].map((b) => (
                <li key={b} className="flex items-center gap-2 text-white/70 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>

            {/* Inline plan selector */}
            <div
              className="mt-8 rounded-xl bg-white/8 backdrop-blur-md border border-white/15 p-4"
              data-testid="hero-plan-selector"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Quick plan finder</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <Select onValueChange={setHeroDestId} data-testid="hero-select-destination">
                  <SelectTrigger className="bg-white/10 border-white/20 text-white h-10 text-sm [&>span]:text-white/60" data-testid="hero-trigger-destination">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">🌍 Any destination</SelectItem>
                    {destinations?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.flagEmoji} {d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                className="w-full font-semibold"
                onClick={handleHeroFind}
                data-testid="button-hero-get-esim"
              >
                Get eSIM
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Right: Plan preview card */}
          <div className="hidden lg:block" data-testid="card-hero-preview">
            <Card className="overflow-hidden shadow-2xl border-white/10 bg-card/95 backdrop-blur-xl">
              <div className="px-5 pt-5 pb-4 border-b border-border/50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Popular Plans</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Starting from <strong className="text-foreground">$9</strong></p>
                </div>
                <Badge variant="secondary" className="text-xs font-medium">
                  <Zap className="w-3 h-3 mr-1" />
                  Instant QR delivery
                </Badge>
              </div>
              <div className="p-3 space-y-1.5">
                {mockPlans.map((p) => (
                  <div
                    key={p.dest}
                    className="flex items-center justify-between py-3 px-3 rounded-md bg-background/70 border border-border/40"
                    data-testid={`mock-plan-${p.dest.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none" role="img" aria-label={p.dest}>{p.flag}</span>
                      <div>
                        <p className="text-sm font-semibold leading-tight">{p.dest}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.data} · {p.days} days</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{p.price}</p>
                      <p className="text-xs text-muted-foreground">one-off</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 pb-4">
                <Link href="/destinations">
                  <Button className="w-full font-semibold" data-testid="button-hero-card-browse">
                    Browse All Plans
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>

        {/* Flag strip */}
        <div className="border-t border-white/10 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="text-white/30 text-xs uppercase tracking-widest font-medium flex-shrink-0 hidden sm:block">
              Destinations
            </span>
            {flagStrip.map((item) => (
              <div key={item.code} className="flex items-center gap-1.5" data-testid={`flag-strip-${item.code.toLowerCase()}`}>
                <span className="text-base leading-none" role="img" aria-label={item.label}>{item.flag}</span>
                <span className="text-white/45 text-xs tracking-wide">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Carrier bar */}
      <div className="relative border-t border-white/8 bg-black/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 text-white/30 flex-shrink-0">
              <Radio className="w-3 h-3" />
              <span className="text-xs uppercase tracking-widest font-semibold">Tier 1 networks</span>
            </div>
            <div className="w-px h-3 bg-white/15 hidden sm:block" />
            {carriers.map((c) => (
              <span key={c} className="text-xs text-white/40 font-medium" data-testid={`carrier-${c.toLowerCase().replace(/\s/g, '-')}`}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Trust bar with payment icons */}
      <div className="relative bg-black/25">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0 justify-between">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 sm:gap-0 sm:divide-x sm:divide-white/15">
              {[
                { icon: Lock,        label: "Secure checkout" },
                { icon: Zap,         label: "Instant delivery" },
                { icon: Users,       label: "5,000+ travellers" },
                { icon: ShieldCheck, label: "24/7 support" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 sm:px-5 first:sm:pl-0 text-white/55" data-testid={`trust-bar-${label.toLowerCase().replace(/[\s+]/g, '-').replace(/[^a-z0-9-]/g, '')}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </div>
            {/* Payment icons */}
            <div className="flex items-center gap-2 flex-shrink-0" data-testid="payment-icons">
              {["VISA", "MC", "Apple Pay", "Stripe"].map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded border border-white/20 text-white/45 text-[10px] font-bold tracking-wide"
                  data-testid={`payment-icon-${m.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 2. PLAN FINDER
// ─────────────────────────────────────────────
function PlanFinder() {
  const [, navigate] = useLocation();
  const [destId, setDestId] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [duration, setDuration] = useState<string>("");

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ["/api/destinations"],
  });

  const handleFind = () => {
    if (destId && destId !== "any") {
      navigate(`/destinations/${destId}`);
    } else {
      navigate("/destinations");
    }
  };

  const selectedDest = destinations?.find(d => d.id === destId);
  const destName   = selectedDest?.name      ?? "Japan";
  const destFlag   = selectedDest?.flagEmoji ?? "🇯🇵";
  const planLabel  = size      || "5 GB";
  const planDur    = duration  || "30 Days";

  const planPrice = () => {
    if (size === "Unlimited") return "£22.99";
    if (size === "10 GB")     return "£16.99";
    if (size === "5 GB")      return "£12.99";
    if (size === "3 GB")      return "£8.99";
    if (size === "1 GB")      return "£5.99";
    return "£12.99"; // default (5 GB)
  };

  const perfectFor = (): string[] => {
    if (size === "1 GB")      return ["Maps & navigation", "WhatsApp calls", "Email & light browsing"];
    if (size === "10 GB")     return ["Video streaming", "Hotspot sharing", "Working remotely"];
    if (size === "Unlimited") return ["Unlimited streaming", "Remote work & hotspot", "No data restrictions"];
    return ["Maps & navigation", "WhatsApp & social", "Daily browsing"];
  };

  return (
    <section id="plans" className="py-20 sm:py-24 border-t">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Plan Finder</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-plan-finder-title">
            Find the Right eSIM in Seconds
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto leading-relaxed">
            Tell us where you're headed and how long you're going. We'll match you to the best plan.
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Where are you going?</p>
                <Select onValueChange={setDestId} data-testid="select-destination">
                  <SelectTrigger className="h-11" data-testid="trigger-destination">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">🌍 Any destination</SelectItem>
                    {destinations?.map((d) => (
                      <SelectItem key={d.id} value={d.id} data-testid={`option-dest-${d.id}`}>
                        {d.flagEmoji} {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">How much data?</p>
                <Select onValueChange={setSize} data-testid="select-data-size">
                  <SelectTrigger className="h-11" data-testid="trigger-data-size">
                    <SelectValue placeholder="Data allowance" />
                  </SelectTrigger>
                  <SelectContent>
                    {planSizes.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`option-size-${s.toLowerCase().replace(/\s/g, '-')}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">How long?</p>
                <Select onValueChange={setDuration} data-testid="select-duration">
                  <SelectTrigger className="h-11" data-testid="trigger-duration">
                    <SelectValue placeholder="Trip length" />
                  </SelectTrigger>
                  <SelectContent>
                    {planDurations.map((d) => (
                      <SelectItem key={d} value={d} data-testid={`option-duration-${d.toLowerCase().replace(/\s/g, '-')}`}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Recommendation card — always visible */}
            <div className="mt-6 rounded-xl border bg-background" data-testid="plan-recommendation-card">
              <div className="px-5 pt-4 pb-2 border-b">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Recommended Plan</p>
              </div>
              <div className="p-5">
                {/* Destination + plan */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl leading-none" role="img" aria-label={destName}>{destFlag}</span>
                  <div>
                    <p className="font-bold text-lg leading-tight" data-testid="rec-dest-name">{destName}</p>
                    <p className="text-sm text-muted-foreground" data-testid="rec-plan-label">{planLabel} · {planDur}</p>
                  </div>
                </div>

                {/* Perfect for */}
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Perfect for:</p>
                  <ul className="space-y-2">
                    {perfectFor().map((b) => (
                      <li key={b} className="flex items-center gap-2.5 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Price + CTA */}
                <div className="flex items-end justify-between gap-4 pt-4 border-t">
                  <div>
                    <p className="text-3xl font-bold tracking-tight" data-testid="rec-plan-price">{planPrice()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">one-off · no subscription</p>
                  </div>
                  <Button
                    size="lg"
                    className="font-semibold flex-shrink-0"
                    onClick={handleFind}
                    data-testid="button-see-plans"
                  >
                    Continue to Checkout
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
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
// 3. HOW IT WORKS
// ─────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      icon: Globe,
      title: "Choose your destination",
      description: "Browse 190+ countries and regions. Pick the data size and validity that suits your trip — from a weekend break to a month abroad.",
    },
    {
      icon: QrCode,
      title: "Receive your eSIM instantly",
      description: "Pay securely online. Your QR code arrives by email within seconds — no waiting, no shipping, no SIM card.",
    },
    {
      icon: Wifi,
      title: "Scan, activate, go online",
      description: "Open your phone settings, scan the QR code, and you're connected. Data activates on arrival — often before you leave the airport.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-24 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-how-it-works-title">
            Three steps. Under 60 seconds.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-sm mx-auto">
            No store visits. No SIM swaps. No roaming queues.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-10">
          {steps.map((step, idx) => (
            <div key={idx} className="relative" data-testid={`card-step-${idx + 1}`}>
              {idx < steps.length - 1 && (
                <div className="hidden sm:block absolute top-8 left-[58%] w-[42%] border-t border-dashed border-border" />
              )}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 relative flex-shrink-0">
                  <step.icon className="w-6 h-6 text-primary" />
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2" data-testid={`text-step-title-${idx + 1}`}>{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 4. WHY GLOBESIM
// ─────────────────────────────────────────────
function WhyGlobeSIM() {
  const benefits = [
    {
      icon: Banknote,
      title: "No roaming fees — ever",
      description: "One fixed price. No per-minute charges, no bill shock when you land. What you pay at checkout is all you pay.",
    },
    {
      icon: Zap,
      title: "Activated in under 60 seconds",
      description: "Your QR code arrives the instant you check out. Scan it from your phone settings and you're online in minutes.",
    },
    {
      icon: Signal,
      title: "Keep your existing number",
      description: "Your regular SIM stays fully active. Calls, texts, and WhatsApp all work on your main number — your eSIM handles data.",
    },
    {
      icon: Globe,
      title: "Regional and global plans",
      description: "One eSIM, multiple countries. Cover all of Europe, the Middle East, or Southeast Asia with a single purchase.",
    },
    {
      icon: Radio,
      title: "Tier 1 global networks",
      description: "Routed through Vodafone, T-Mobile, Orange, and other Tier 1 carriers for strong, reliable signal wherever you go.",
    },
    {
      icon: Smartphone,
      title: "100% digital — no plastic",
      description: "No SIM card. No post. No carrier store. Buy online, install digitally, travel. That's it.",
    },
  ];

  return (
    <section className="py-20 sm:py-24 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why GlobeSIM</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-benefits-title">
            Built for how people actually travel
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto leading-relaxed">
            Fast, transparent, and reliable — with no lock-in, no contracts, and no physical SIM required.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {benefits.map((b, i) => (
            <div
              key={b.title}
              className="p-6 rounded-xl border bg-card border-l-2 border-l-primary"
              data-testid={`card-benefit-${i}`}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-4">
                <b.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2 leading-snug">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 5. TRAVEL BUNDLES
// ─────────────────────────────────────────────
const bundles = [
  {
    id: "europe",
    flag: "🇪🇺",
    label: "Most Popular",
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
    title: "UK ↔ Nigeria Pack",
    subtitle: "Dual-country · Stay connected both ends",
    description: "Built for the UK–Nigeria corridor. Stay connected on both ends without paying roaming rates on either.",
    features: ["UK + Nigeria coverage", "5 GB data", "30-day validity"],
    price: "From $16",
  },
  {
    id: "global",
    flag: "🌍",
    label: "Premium",
    title: "Global Traveller Pack",
    subtitle: "190+ countries · No limits",
    description: "One eSIM that works everywhere. Ideal for frequent travellers, business trips, or multi-stop tours.",
    features: ["190+ countries covered", "Unlimited data option", "Multi-trip ready"],
    price: "From $29",
  },
];

function BundlesSection() {
  return (
    <section className="py-20 sm:py-24 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Travel Bundles</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-bundles-title">
            Bundles built for your route
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto leading-relaxed">
            Pre-configured for the most popular travel corridors — buy once, stay connected throughout.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="flex flex-col rounded-xl border bg-background p-6"
              data-testid={`card-bundle-${bundle.id}`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-3xl leading-none" role="img" aria-label={bundle.title}>{bundle.flag}</span>
                <Badge variant={bundle.label === "Most Popular" ? "default" : "secondary"} className="text-xs font-semibold">
                  {bundle.label}
                </Badge>
              </div>
              <h3 className="font-bold text-xl mb-0.5">{bundle.title}</h3>
              <p className="text-xs text-muted-foreground mb-3 font-medium">{bundle.subtitle}</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">{bundle.description}</p>
              <ul className="space-y-2 mb-6">
                {bundle.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="font-bold text-lg">{bundle.price}</span>
                <Link href="/destinations">
                  <Button size="sm" data-testid={`button-bundle-${bundle.id}`}>
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
// 6. COMPATIBILITY
// ─────────────────────────────────────────────
function CompatibilitySection() {
  const devices = [
    "iPhone XS and newer — including all iPhone 14, 15, and 16 models",
    "Samsung Galaxy S20 series and newer",
    "Google Pixel 3 and newer",
    "Selected OnePlus, Motorola, and Xiaomi devices",
  ];

  return (
    <section className="py-20 sm:py-24 border-t">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Compatibility</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5" data-testid="text-compat-title">
              Works with most modern devices
            </h2>
            <p className="text-muted-foreground mb-7 leading-relaxed">
              Compatible with most eSIM-enabled iPhones and Android devices released since 2018.
              Your device must be carrier-unlocked.
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
              <Button size="lg" data-testid="button-check-compat">
                Check your device
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl bg-primary p-8 text-primary-foreground flex flex-col">
            <Smartphone className="w-12 h-12 mb-6 opacity-70" />
            <h3 className="text-2xl font-bold mb-3">Not sure if your phone is compatible?</h3>
            <p className="text-primary-foreground/70 leading-relaxed mb-8 flex-1">
              Our device checker covers 60+ models across Apple, Samsung, Google, and more.
              Takes under 30 seconds to confirm eSIM support.
            </p>
            <Link href="/compatibility">
              <Button variant="outline" size="lg" className="bg-white/10 border-white/20 text-white w-full sm:w-auto" data-testid="button-device-checker-cta">
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
// 7. BUILT FOR GLOBAL TRAVELLERS
// ─────────────────────────────────────────────
function BuiltForTravellers() {
  const routes = [
    { flag: "🇬🇧🇪🇺", label: "UK → Europe",          desc: "Single eSIM across 28 EU countries. No SIM swaps mid-trip." },
    { flag: "🇬🇧🇳🇬", label: "UK ↔ Nigeria",         desc: "Stay connected in both directions without local SIM hassle." },
    { flag: "🇬🇧🇦🇪", label: "UK → Dubai / UAE",    desc: "Fast 4G/5G coverage across the UAE. Activates before you land." },
    { flag: "🌍",     label: "Multi-stop global",   desc: "One plan, every continent. Built for the modern nomad." },
  ];

  return (
    <section className="py-20 sm:py-24 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Built for real routes</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5" data-testid="text-built-for-title">
              Optimised for the world's most popular travel corridors
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              GlobeSIM isn't a generic eSIM reseller. We've built pricing, coverage, and plans around the routes real travellers take — UK, Europe, Africa, and the Middle East.
            </p>
            <div className="flex flex-wrap gap-3">
              {["No app required", "Works worldwide", "No contracts", "Instant activation"].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-background text-sm font-medium"
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
                className="flex items-start gap-4 p-4 rounded-xl border bg-background"
                data-testid={`route-card-${route.label.toLowerCase().replace(/[\s→↔\/]/g, '-').replace(/-+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
              >
                <span className="text-2xl leading-none mt-0.5" role="img" aria-label={route.label}>{route.flag}</span>
                <div>
                  <p className="font-semibold text-sm mb-0.5">{route.label}</p>
                  <p className="text-sm text-muted-foreground leading-snug">{route.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 8. TESTIMONIALS + TRUST
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
      full: "I travel back to Nigeria four times a year. Switching to GlobeSIM saved me significantly — and the signal is just as reliable as any local SIM.",
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
    <section className="py-20 sm:py-24 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-0.5 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
            ))}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-testimonials-title">
            Trusted by modern travellers
          </h2>
          <p className="mt-3 text-muted-foreground">4.9 / 5 · 5,000+ verified customers</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-14">
          {testimonials.map((t, idx) => (
            <div key={idx} className="flex flex-col p-6 rounded-xl border bg-card" data-testid={`card-testimonial-${idx}`}>
              <Quote className="w-6 h-6 text-primary/20 mb-4 flex-shrink-0" />
              <p className="font-semibold text-base leading-snug mb-3 text-foreground" data-testid={`text-testimonial-headline-${idx}`}>
                "{t.quote}"
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">
                {t.full}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight" data-testid={`text-testimonial-name-${idx}`}>{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-testimonial-context-${idx}`}>{t.context}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust badges strip */}
        <div className="flex flex-wrap sm:flex-nowrap items-stretch rounded-xl border bg-card divide-y sm:divide-y-0 sm:divide-x overflow-hidden">
          {[
            { icon: Lock,        label: "Secure checkout",   sub: "SSL encrypted payments" },
            { icon: Zap,         label: "Instant delivery",  sub: "QR code by email" },
            { icon: Signal,      label: "Reliable coverage", sub: "Tier 1 global carriers" },
            { icon: ShieldCheck, label: "24/7 support",      sub: "Help when you need it" },
          ].map(({ icon: Icon, label, sub }) => (
            <div
              key={label}
              className="flex-1 flex items-center gap-3 px-5 py-4 min-w-[50%] sm:min-w-0"
              data-testid={`trust-badge-${label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <Icon className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold leading-tight">{label}</p>
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
// 9. COVERAGE
// ─────────────────────────────────────────────
const coverageRegions = [
  {
    id: "europe",
    label: "Europe",
    countries: ["United Kingdom", "France", "Germany", "Spain", "Italy", "Portugal", "Netherlands", "Greece", "Poland", "Sweden", "Switzerland", "Austria"],
  },
  {
    id: "north-america",
    label: "North America",
    countries: ["United States", "Canada", "Mexico"],
  },
  {
    id: "africa",
    label: "Africa",
    countries: ["Nigeria", "South Africa", "Kenya", "Ghana", "Egypt", "Ethiopia", "Tanzania", "Uganda"],
  },
  {
    id: "middle-east",
    label: "Middle East",
    countries: ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Jordan", "Lebanon"],
  },
  {
    id: "asia",
    label: "Asia",
    countries: ["Japan", "Singapore", "Thailand", "South Korea", "Malaysia", "Indonesia", "India", "Philippines", "Vietnam", "Hong Kong"],
  },
  {
    id: "global",
    label: "Global",
    countries: ["Multi-country plans covering 190+ destinations worldwide with a single eSIM purchase"],
  },
];

function CoverageSection() {
  return (
    <section id="coverage" className="py-20 sm:py-24 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Coverage</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-coverage-title">
            190+ countries covered
          </h2>
          <p className="mt-4 text-muted-foreground max-w-sm mx-auto">
            From weekend city breaks to month-long adventures — wherever you go, we go with you.
          </p>
        </div>

        <Tabs defaultValue="europe">
          <TabsList className="flex flex-wrap h-auto gap-1.5 mb-8 justify-center bg-transparent p-0">
            {coverageRegions.map((r) => (
              <TabsTrigger
                key={r.id}
                value={r.id}
                className="rounded-full border px-4 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
                data-testid={`tab-region-${r.id}`}
              >
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {coverageRegions.map((r) => (
            <TabsContent key={r.id} value={r.id}>
              <div className="rounded-xl border bg-background p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-7">
                  {r.countries.map((country) => (
                    <div
                      key={country}
                      className="flex items-center gap-2 py-2.5 px-3 rounded-lg border bg-card"
                      data-testid={`coverage-country-${country.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                      <span className="text-sm leading-tight">{country}</span>
                    </div>
                  ))}
                </div>
                <Link href="/destinations">
                  <Button variant="outline" data-testid={`button-region-plans-${r.id}`}>
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
// 10. FAQ
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
      answer: "Yes. Your existing SIM card and phone number remain fully active. The eSIM adds a separate data line — you'll still receive calls and messages on your regular number while using GlobeSIM for data.",
    },
    {
      question: "Does GlobeSIM work on iPhone and Android?",
      answer: "Yes. GlobeSIM works with most eSIM-compatible devices: iPhone XS and newer, Samsung Galaxy S20 and newer, Google Pixel 3 and newer, and many others. Your device must be carrier-unlocked. Use our compatibility checker to confirm before you buy.",
    },
    {
      question: "What happens if I run out of data?",
      answer: "You can purchase a top-up plan for the same destination at any time. Simply find your destination, select a plan, and check out. Your additional data is delivered instantly — no setup needed.",
    },
    {
      question: "Can I use GlobeSIM in multiple countries?",
      answer: "Yes. Our regional plans cover multiple countries in one purchase — ideal for European trips, Middle East travel, or multi-stop tours. Global plans cover 190+ countries with a single eSIM.",
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-24 border-t">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-faq-title">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to know before you buy.
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`} className="border-b">
              <AccordionTrigger className="text-left font-medium py-5 hover:no-underline" data-testid={`button-faq-${idx}`}>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <p className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 11. FINAL CTA
// ─────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-20 sm:py-24 border-t bg-card">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">Get started today</p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5 leading-tight" data-testid="text-final-cta-title">
          Get Connected Before You Land.
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed" data-testid="text-final-cta-subtitle">
          5,000+ travellers use GlobeSIM for fast, flexible data in 190+ countries. No contracts. No physical SIM. No surprises.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <Link href="/destinations">
            <Button size="lg" className="px-8 text-base font-semibold shadow-md" data-testid="button-final-get-started">
              Get Your eSIM Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link href="/destinations">
            <Button size="lg" variant="outline" className="text-base" data-testid="button-final-browse-plans">
              Browse Plans
            </Button>
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-5 text-sm text-muted-foreground">
          {["No app required", "Instant activation", "Works worldwide", "No contracts"].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 12. FOOTER
// ─────────────────────────────────────────────
function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <Wifi className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg" data-testid="text-footer-brand">GlobeSIM</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]" data-testid="text-footer-tagline">
              Instant global eSIM data for modern travellers.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Product</p>
            <ul className="space-y-3">
              {[
                { label: "Plans",        action: () => scrollTo("plans"),        testid: "footer-link-plans" },
                { label: "Coverage",     action: () => scrollTo("coverage"),     testid: "footer-link-coverage" },
                { label: "How It Works", action: () => scrollTo("how-it-works"), testid: "footer-link-how" },
              ].map((item) => (
                <li key={item.label}>
                  <button onClick={item.action} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid={item.testid}>
                    {item.label}
                  </button>
                </li>
              ))}
              <li>
                <Link href="/compatibility">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-compat">
                    Compatibility
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/orders">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-my-esims">
                    My eSIMs
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Support</p>
            <ul className="space-y-3">
              <li>
                <button onClick={() => scrollTo("faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-faq">
                  FAQ
                </button>
              </li>
              <li><span className="text-sm text-muted-foreground" data-testid="footer-link-contact">Contact</span></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Legal</p>
            <ul className="space-y-3">
              <li><span className="text-sm text-muted-foreground" data-testid="text-footer-privacy">Privacy Policy</span></li>
              <li><span className="text-sm text-muted-foreground" data-testid="text-footer-terms">Terms of Service</span></li>
            </ul>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
            &copy; 2026 GlobeSIM. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/destinations">
              <Button size="sm" data-testid="button-footer-get-started">Get Started</Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" data-testid="button-footer-my-esims">My eSIMs</Button>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────
// 13. MOBILE STICKY CTA
// ─────────────────────────────────────────────
function MobileStickyCTA() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/96 backdrop-blur-md border-t shadow-2xl px-3 py-2.5"
      data-testid="mobile-sticky-cta"
    >
      <div className="flex gap-2">
        <Link href="/destinations" className="flex-1">
          <Button className="w-full font-semibold text-sm" size="default" data-testid="button-mobile-sticky-esim">
            Get eSIM
            <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
          </Button>
        </Link>
        <Link href="/destinations" className="flex-1">
          <Button variant="outline" className="w-full font-semibold text-sm" size="default" data-testid="button-mobile-sticky-plans">
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
      <HeroSection />
      <PlanFinder />
      <HowItWorks />
      <WhyGlobeSIM />
      <BundlesSection />
      <CompatibilitySection />
      <BuiltForTravellers />
      <TestimonialsSection />
      <CoverageSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
