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
  QrCode, MapPin, Banknote
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
  { dest: "Europe",          flag: "🇪🇺", data: "5 GB",  days: 15, price: "$14" },
  { dest: "UAE",             flag: "🇦🇪", data: "3 GB",  days: 7,  price: "$11" },
  { dest: "Nigeria",         flag: "🇳🇬", data: "5 GB",  days: 30, price: "$16" },
];

// ─────────────────────────────────────────────
// 1. HERO
// ─────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img src="/images/hero-bg.png" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/80" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 pt-20 pb-0 sm:pt-28 lg:pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center pb-12 sm:pb-16 lg:pb-20">

          {/* Left: Copy */}
          <div className="max-w-xl">
            <div className="flex flex-wrap gap-2 mb-6">
              {["Instant activation", "190+ countries", "iPhone & Android", "Keep your WhatsApp number"].map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-white/85 text-xs font-medium"
                  data-testid={`badge-hero-${b.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9-]/g, '')}`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {b}
                </span>
              ))}
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white tracking-tight leading-[1.1]"
              data-testid="text-hero-title"
            >
              Global Data in Seconds —
              <span className="block text-white/85 mt-1">
                No Roaming, No Contracts
              </span>
            </h1>

            <p
              className="mt-5 text-lg sm:text-xl text-white/75 max-w-lg leading-relaxed"
              data-testid="text-hero-subtitle"
            >
              Stay connected in 190+ countries with instant eSIM activation.
              No physical SIM. No queues. No surprise roaming charges.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/destinations">
                <Button size="lg" data-testid="button-get-connected">
                  Get Connected Now
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/destinations">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-white/10 backdrop-blur-sm text-white border-white/25"
                  data-testid="button-view-plans"
                >
                  View Plans
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-5 text-white/65 text-sm">
              <div className="flex items-center gap-1.5" data-testid="text-hero-stat-travellers">
                <Users className="w-4 h-4" />
                <span>Trusted by <strong className="text-white font-semibold">5,000+</strong> travellers</span>
              </div>
              <div className="flex items-center gap-1.5" data-testid="text-hero-stat-countries">
                <Globe className="w-4 h-4" />
                <span>190+ countries</span>
              </div>
              <div className="flex items-center gap-1.5" data-testid="text-hero-stat-speed">
                <Signal className="w-4 h-4" />
                <span>4G / 5G speeds</span>
              </div>
            </div>
          </div>

          {/* Right: Mock plan preview card */}
          <div className="hidden lg:block" data-testid="card-hero-preview">
            <Card className="p-5 bg-card/90 backdrop-blur-md border-border/60 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Popular Plans</p>
                <Badge variant="secondary" className="text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  Instant
                </Badge>
              </div>
              <div className="space-y-3">
                {mockPlans.map((p) => (
                  <div
                    key={p.dest}
                    className="flex items-center justify-between py-2.5 px-3 rounded-md bg-background/60 border border-border/40"
                    data-testid={`mock-plan-${p.dest.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none" role="img" aria-label={p.dest}>{p.flag}</span>
                      <div>
                        <p className="text-sm font-medium leading-tight">{p.dest}</p>
                        <p className="text-xs text-muted-foreground">{p.data} · {p.days} days</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold">{p.price}</span>
                  </div>
                ))}
              </div>
              <Link href="/destinations">
                <Button className="w-full mt-4" size="sm" data-testid="button-hero-card-browse">
                  Browse All Plans
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </Card>
          </div>
        </div>

        {/* Trust strip */}
        <div className="border-t border-white/10 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
            <span className="text-white/35 text-xs uppercase tracking-widest font-medium flex-shrink-0 hidden sm:block">
              Popular destinations
            </span>
            {flagStrip.map((item) => (
              <div key={item.code} className="flex items-center gap-1.5" data-testid={`flag-strip-${item.code.toLowerCase()}`}>
                <span className="text-base leading-none" role="img" aria-label={item.label}>{item.flag}</span>
                <span className="text-white/55 text-xs">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Carrier bar */}
      <div className="relative border-t border-white/10 bg-black/35 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5 text-white/35 flex-shrink-0">
              <Radio className="w-3.5 h-3.5" />
              <span className="text-xs uppercase tracking-widest font-medium">Powered by Tier 1 global carriers</span>
            </div>
            {carriers.map((c) => (
              <span key={c} className="text-xs text-white/45 font-medium" data-testid={`carrier-${c.toLowerCase().replace(/\s/g, '-')}`}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom trust bar */}
      <div className="relative bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-8 gap-y-2 text-white/60 text-sm">
            {[
              { icon: Lock,          label: "Secure checkout" },
              { icon: Zap,           label: "Instant delivery" },
              { icon: Globe,         label: "Global coverage" },
              { icon: Signal,        label: "Reliable networks" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5" data-testid={`trust-bar-${label.toLowerCase().replace(/\s/g, '-')}`}>
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 2. PLAN FINDER
// ─────────────────────────────────────────────
const planSizes = ["1 GB", "3 GB", "5 GB", "10 GB", "Unlimited"];
const planDurations = ["7 Days", "15 Days", "30 Days"];

function PlanFinder() {
  const [, navigate] = useLocation();
  const [destId, setDestId] = useState<string>("");
  const [, setSize] = useState<string>("");
  const [, setDuration] = useState<string>("");

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ["/api/destinations"],
  });

  const handleFind = () => {
    if (destId) {
      navigate(`/destinations/${destId}`);
    } else {
      navigate("/destinations");
    }
  };

  return (
    <section id="plans" className="py-16 sm:py-20 border-t bg-card">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-4">
            <Wifi className="w-3 h-3 mr-1.5" />
            Plan Finder
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-plan-finder-title">
            Find the Right eSIM in Seconds
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Select your destination, choose a plan size and trip length — we'll show you the best options.
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Destination
              </label>
              <Select onValueChange={setDestId} data-testid="select-destination">
                <SelectTrigger data-testid="trigger-destination">
                  <SelectValue placeholder="Select country or region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any destination</SelectItem>
                  {destinations?.map((d) => (
                    <SelectItem key={d.id} value={d.id} data-testid={`option-dest-${d.id}`}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Data allowance
              </label>
              <Select onValueChange={setSize} data-testid="select-data-size">
                <SelectTrigger data-testid="trigger-data-size">
                  <SelectValue placeholder="How much data?" />
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
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Trip length
              </label>
              <Select onValueChange={setDuration} data-testid="select-duration">
                <SelectTrigger data-testid="trigger-duration">
                  <SelectValue placeholder="How many days?" />
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

          <Button size="lg" className="w-full sm:w-auto" onClick={handleFind} data-testid="button-see-plans">
            See Available Plans
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Not sure? Browse all destinations and compare plans side-by-side.
            <Link href="/destinations">
              <span className="ml-1 text-primary underline underline-offset-2 cursor-pointer" data-testid="link-browse-all-inline">Browse all</span>
            </Link>
          </p>
        </Card>
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
      num: "1",
      icon: Globe,
      title: "Choose your destination and plan",
      description: "Browse 190+ countries. Pick the data size and validity that fits your trip — from a weekend getaway to a month-long stay.",
    },
    {
      num: "2",
      icon: QrCode,
      title: "Buy and receive your eSIM instantly",
      description: "Pay securely and get your QR code by email within seconds. No waiting. No shipping. No physical SIM required.",
    },
    {
      num: "3",
      icon: Wifi,
      title: "Activate in minutes and go online",
      description: "Scan the QR code in your phone settings. Your data activates the moment you land — ready before you leave the airport.",
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-20 border-t">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <Badge variant="secondary" className="mb-4">Simple process</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-how-it-works-title">
            How GlobeSIM Works
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Get connected in three steps — start to finish in under 60 seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {steps.map((step, idx) => (
            <div key={step.num} className="relative flex flex-col items-center text-center sm:items-start sm:text-left" data-testid={`card-step-${idx + 1}`}>
              {idx < steps.length - 1 && (
                <div className="hidden sm:block absolute top-6 left-[52%] w-[48%] border-t-2 border-dashed border-border" />
              )}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-5 flex-shrink-0 relative">
                {step.num}
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 mb-4">
                <step.icon className="w-5 h-5 text-primary" />
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
// 4. WHY GLOBESIM / BENEFITS
// ─────────────────────────────────────────────
function WhyGlobeSIM() {
  const benefits = [
    {
      icon: Banknote,
      title: "No roaming fees",
      description: "Pay once at a fixed, transparent price. Zero surprise charges when you land — ever.",
    },
    {
      icon: Zap,
      title: "Instant activation",
      description: "From purchase to connected in under 60 seconds. Your QR code arrives the moment you check out.",
    },
    {
      icon: Signal,
      title: "Keep your number",
      description: "Your regular SIM stays active alongside your eSIM data plan. WhatsApp, calls, and texts uninterrupted.",
    },
    {
      icon: Globe,
      title: "Multi-country coverage",
      description: "One plan, multiple countries. Regional plans cover Europe, the Middle East, Southeast Asia, and beyond.",
    },
    {
      icon: Radio,
      title: "Reliable partner networks",
      description: "Routed through Tier 1 global carriers — Vodafone, T-Mobile, Orange, and more — for strong, reliable signal.",
    },
    {
      icon: Smartphone,
      title: "No physical SIM needed",
      description: "100% digital. No post. No plastic. No carrier store visit. Just scan, install, connect.",
    },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Why us</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-benefits-title">
            Why Travellers Choose GlobeSIM
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Built for modern travellers who expect instant, reliable connectivity without the hassle.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {benefits.map((b) => (
            <Card key={b.title} className="p-6" data-testid={`card-benefit-${b.title.toLowerCase().replace(/\s/g, '-')}`}>
              <div className="flex items-center justify-center w-11 h-11 rounded-md bg-primary/10 mb-4">
                <b.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2" data-testid={`text-benefit-title-${b.title.toLowerCase().replace(/\s/g, '-')}`}>{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 5. COMPATIBILITY
// ─────────────────────────────────────────────
function CompatibilitySection() {
  const devices = [
    "iPhone XS and newer (including all iPhone 14, 15, and 16 models)",
    "Samsung Galaxy S20 series and newer",
    "Google Pixel 3 and newer",
    "Selected OnePlus, Motorola, and Xiaomi devices",
  ];

  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="secondary" className="mb-4">Compatibility</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-compat-title">
              Works with Most Modern Devices
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Compatible with most eSIM-enabled iPhone and Android devices released since 2018.
              Your device must be carrier-unlocked to use a GlobeSIM plan.
            </p>
            <ul className="space-y-3 mb-8">
              {devices.map((d, i) => (
                <li key={i} className="flex items-start gap-2.5" data-testid={`compat-device-${i}`}>
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
            <Link href="/compatibility">
              <Button data-testid="button-check-compat">
                Check Compatibility
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <Card className="p-6 bg-primary text-primary-foreground">
            <Smartphone className="w-10 h-10 mb-4 opacity-80" />
            <h3 className="text-xl font-bold mb-2">Not sure about your device?</h3>
            <p className="text-primary-foreground/75 text-sm leading-relaxed mb-6">
              Use our device checker to confirm eSIM support and dual SIM capability before you buy. It takes under 30 seconds.
            </p>
            <Link href="/compatibility">
              <Button variant="outline" className="bg-white/10 border-white/25 text-white" data-testid="button-device-checker-cta">
                Open Device Checker
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 6. TESTIMONIALS + TRUST BADGES
// ─────────────────────────────────────────────
function TestimonialsSection() {
  const testimonials = [
    {
      name: "Sarah K.",
      context: "London → Lisbon, Porto & Seville",
      quote: "Activation was seamless. I landed, scanned the QR on the plane, and had working data before I'd even collected my luggage. Much better than queuing at an airport kiosk.",
      initials: "SK",
    },
    {
      name: "James O.",
      context: "Manchester → Lagos",
      quote: "Much better than paying roaming charges. I travel back to Nigeria four times a year — switching to GlobeSIM cut my connectivity costs by more than half.",
      initials: "JO",
    },
    {
      name: "Priya M.",
      context: "Birmingham → Dubai & Abu Dhabi",
      quote: "Perfect for frequent international travel. The data was fast, the QR code worked first time, and the installation guide is clear. Recommended it to my whole team.",
      initials: "PM",
    },
  ];

  const trustBadges = [
    { icon: Lock,         label: "Secure checkout" },
    { icon: Zap,          label: "Instant delivery" },
    { icon: Signal,       label: "Reliable coverage" },
    { icon: CheckCircle2, label: "Support available" },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-1 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            ))}
            <span className="ml-2 text-sm text-muted-foreground font-medium">4.9 / 5 from verified customers</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-testimonials-title">
            Trusted by Modern Travellers
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
          {testimonials.map((t, idx) => (
            <Card key={idx} className="p-6 flex flex-col" data-testid={`card-testimonial-${idx}`}>
              <Quote className="w-6 h-6 text-primary/30 mb-4 flex-shrink-0" />
              <p className="text-sm leading-relaxed flex-1 mb-5" data-testid={`text-testimonial-quote-${idx}`}>
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold text-sm flex-shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold" data-testid={`text-testimonial-name-${idx}`}>{t.name}</p>
                  <p className="text-xs text-muted-foreground" data-testid={`text-testimonial-context-${idx}`}>{t.context}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {trustBadges.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 py-5 rounded-md border bg-background text-center"
              data-testid={`trust-badge-${label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 7. COVERAGE
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
    countries: ["Multi-country plans covering 190+ destinations worldwide with a single purchase"],
  },
];

function CoverageSection() {
  return (
    <section id="coverage" className="py-16 sm:py-20 border-t">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Globe className="w-3 h-3 mr-1.5" />
            Coverage
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-coverage-title">
            Coverage Across 190+ Countries
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            From weekend breaks to month-long adventures — wherever you're headed, we've got you covered.
          </p>
        </div>

        <Tabs defaultValue="europe">
          <TabsList className="flex flex-wrap h-auto gap-1 mb-8 justify-center bg-transparent p-0">
            {coverageRegions.map((r) => (
              <TabsTrigger
                key={r.id}
                value={r.id}
                className="rounded-full"
                data-testid={`tab-region-${r.id}`}
              >
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {coverageRegions.map((r) => (
            <TabsContent key={r.id} value={r.id}>
              <Card className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  {r.countries.map((country) => (
                    <div
                      key={country}
                      className="flex items-center gap-2 py-2 px-3 rounded-md border bg-background/50"
                      data-testid={`coverage-country-${country.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-sm">{country}</span>
                    </div>
                  ))}
                </div>
                <Link href="/destinations">
                  <Button variant="outline" data-testid={`button-region-plans-${r.id}`}>
                    Browse {r.label} Plans
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 8. FAQ
// ─────────────────────────────────────────────
function FAQSection() {
  const faqs = [
    {
      question: "What is an eSIM?",
      answer: "An eSIM (embedded SIM) is a digital SIM built into your phone. Instead of inserting a physical SIM card, you scan a QR code to download your data plan directly onto your device. No hardware needed — setup takes under a minute.",
    },
    {
      question: "How quickly do I receive my eSIM?",
      answer: "Instantly. Your QR code is delivered to your email address within seconds of completing your purchase. You can install it before you even leave for the airport.",
    },
    {
      question: "Can I keep my regular number?",
      answer: "Yes. Your existing SIM card and phone number remain completely active. The eSIM adds a separate data line alongside it — you'll still receive calls and messages on your regular number while using GlobeSIM for data.",
    },
    {
      question: "Does GlobeSIM work on iPhone and Android?",
      answer: "Yes. GlobeSIM is compatible with most eSIM-enabled devices including iPhone XS and newer, Samsung Galaxy S20 and newer, Google Pixel 3 and newer, and many other modern smartphones. Your device must be carrier-unlocked.",
    },
    {
      question: "What happens if I run out of data?",
      answer: "You can purchase an additional plan for the same destination at any time. Simply visit your destination page, select a top-up plan, and check out. Your new data is delivered instantly and you're back online.",
    },
    {
      question: "Can I use GlobeSIM in multiple countries?",
      answer: "Yes. We offer regional plans that cover multiple countries in a single purchase — perfect for European trips, Middle East business travel, or backpacking across Southeast Asia. Global plans cover 190+ countries with one eSIM.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-20 border-t bg-card">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-4">FAQ</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-faq-title">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know before you buy.
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`}>
              <AccordionTrigger className="text-left font-medium" data-testid={`button-faq-${idx}`}>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent>
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
// 9. FINAL CTA
// ─────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" data-testid="text-final-cta-title">
          Stay Connected Anywhere
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed" data-testid="text-final-cta-subtitle">
          Get fast, flexible mobile data wherever you travel — without roaming fees, contracts, or physical SIM cards.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <Link href="/destinations">
            <Button size="lg" data-testid="button-final-get-started">
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link href="/destinations">
            <Button size="lg" variant="outline" data-testid="button-final-browse-plans">
              Browse Plans
            </Button>
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
          {["No contracts", "Cancel anytime", "Instant delivery", "190+ countries"].map((item) => (
            <div key={item} className="flex items-center gap-1.5" data-testid={`text-final-point-${item.toLowerCase().replace(/\s/g, '-')}`}>
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
// 10. FOOTER
// ─────────────────────────────────────────────
function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t py-12 bg-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <Wifi className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg" data-testid="text-footer-brand">GlobeSIM</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-footer-tagline">
              Instant global eSIM data for modern travellers.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Product</p>
            <ul className="space-y-2">
              <li>
                <button onClick={() => scrollTo("plans")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-plans">
                  Plans
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("coverage")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-coverage">
                  Coverage
                </button>
              </li>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Support</p>
            <ul className="space-y-2">
              <li>
                <button onClick={() => scrollTo("faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-faq">
                  FAQ
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("how-it-works")} className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-how">
                  How It Works
                </button>
              </li>
              <li>
                <span className="text-sm text-muted-foreground cursor-default" data-testid="footer-link-contact">
                  Contact
                </span>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Legal</p>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-muted-foreground cursor-default" data-testid="text-footer-privacy">Privacy Policy</span>
              </li>
              <li>
                <span className="text-sm text-muted-foreground cursor-default" data-testid="text-footer-terms">Terms of Service</span>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
            2026 GlobeSIM. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
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
// 11. MOBILE STICKY CTA
// ─────────────────────────────────────────────
function MobileStickyCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden border-t bg-background/90 backdrop-blur-md px-4 py-3 safe-area-inset-bottom" data-testid="mobile-sticky-cta">
      <Link href="/destinations">
        <Button className="w-full" size="lg" data-testid="button-mobile-sticky-cta">
          Browse Plans
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <HeroSection />
      <PlanFinder />
      <HowItWorks />
      <WhyGlobeSIM />
      <CompatibilitySection />
      <TestimonialsSection />
      <CoverageSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
