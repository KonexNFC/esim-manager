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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowRight, Globe, Zap, Smartphone, Search,
  Wifi, Star, Lock, CheckCircle2,
  Signal, Quote, Radio,
  QrCode, MapPin, Banknote, ShieldCheck,
  Package, Timer, ChevronRight,
  Network, Activity, TrendingUp, Shield, X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SiVisa, SiMastercard, SiApplepay, SiPaypal, SiGooglepay, SiVodafone, SiTmobile, SiOrange } from "react-icons/si";
import type { Destination, Plan } from "@shared/schema";
import { CountryCombobox } from "@/components/country-combobox";
import { useInView } from "@/hooks/use-in-view";
import { GlobeVisualization } from "@/components/globe-visualization";
import wimbledonImg from "@assets/wimbledon_2026.png";
import travelLandmarksImg from "@assets/Travel_Image__1776723002223.jpeg";

// ─── Reveal wrapper ──────────────────────────────────────────────────────────
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "in-view" : ""} ${delay ? `reveal-delay-${delay}` : ""} ${className}`}
    >
      {children}
    </div>
  );
}

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


// ─── Festival events data ──────────────────────────────────────────────────────
interface FestivalEvent {
  id: string;
  name: string;
  subtitle: string;
  location: string;
  dates: string;
  flags: string[];
  countryCode: string;
  bgFrom: string;
  bgTo: string;
  accent: string;
  photo: string;
  cta: string;
}

const FESTIVAL_EVENTS: FestivalEvent[] = [
  {
    id: "glastonbury",
    name: "Glastonbury 2026",
    subtitle: "200,000 music lovers, 100+ stages, and one legendary Somerset farm. Don't lose your crew.",
    location: "Somerset, United Kingdom",
    dates: "Jun 25 – Jun 29, 2026",
    flags: ["🇬🇧", "🎸"],
    countryCode: "GB",
    bgFrom: "#0d1f0a",
    bgTo: "#1a3d12",
    accent: "#4ade80",
    photo: "https://images.unsplash.com/photo-1474899310722-cb9b0f84bb91?auto=format&fit=crop&w=700&q=80",
    cta: "Get UK eSIM",
  },
  {
    id: "wimbledon",
    name: "Wimbledon 2026",
    subtitle: "Strawberries, rain delays, and Centre Court glory. The UK's greatest summer sporting event.",
    location: "London, United Kingdom",
    dates: "Jun 29 – Jul 12, 2026",
    flags: ["🇬🇧", "🎾"],
    countryCode: "GB",
    bgFrom: "#0a1a0a",
    bgTo: "#1a4f1a",
    accent: "#86efac",
    photo: wimbledonImg,
    cta: "Get UK eSIM",
  },
  {
    id: "afronation",
    name: "Afronation 2026",
    subtitle: "The world's biggest Afrobeats festival. Algarve sun, global sounds, and a million live stories to share.",
    location: "Portimão, Portugal",
    dates: "Jul 2–5, 2026",
    flags: ["🇵🇹", "🇳🇬"],
    countryCode: "PT",
    bgFrom: "#3b1f0a",
    bgTo: "#7c2d12",
    accent: "#f97316",
    photo: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=700&q=80",
    cta: "Get Portugal eSIM",
  },
  {
    id: "tomorrowland",
    name: "Tomorrowland 2026",
    subtitle: "400,000 festival-goers from 200 countries, Belgium's greatest spectacle of sound and light.",
    location: "Boom, Belgium",
    dates: "Jul 17–19 & Jul 24–26, 2026",
    flags: ["🇧🇪", "🎧"],
    countryCode: "BE",
    bgFrom: "#0f0a2e",
    bgTo: "#2a1a5e",
    accent: "#a78bfa",
    photo: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=700&q=80",
    cta: "Get Belgium eSIM",
  },
  {
    id: "oktoberfest",
    name: "Oktoberfest 2026",
    subtitle: "Six million visitors, 16 days of Bavarian tradition. Munich's legendary celebration returns.",
    location: "Munich, Germany",
    dates: "Sep 19 – Oct 4, 2026",
    flags: ["🇩🇪", "🍺"],
    countryCode: "DE",
    bgFrom: "#0c1f3c",
    bgTo: "#1e3a5f",
    accent: "#60a5fa",
    photo: "https://images.unsplash.com/photo-1567327613485-fbd5f472a1c0?auto=format&fit=crop&w=700&q=80",
    cta: "Get Germany eSIM",
  },
];

// ─── Flag helpers ─────────────────────────────────────────────────────────────
function flagUrl(code: string) {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function FlagImg({ code, name, className = "" }: { code: string; name: string; className?: string }) {
  return (
    <img
      src={flagUrl(code)}
      alt={name}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  );
}

// ─── Quick countries data ──────────────────────────────────────────────────────
const QUICK_COUNTRIES = [
  { code: "GB", flag: "🇬🇧", name: "United Kingdom",  from: "$11" },
  { code: "US", flag: "🇺🇸", name: "United States",   from: "$9"  },
  { code: "AE", flag: "🇦🇪", name: "UAE / Dubai",     from: "$12" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria",         from: "$13" },
  { code: "FR", flag: "🇫🇷", name: "France",          from: "$10" },
  { code: "DE", flag: "🇩🇪", name: "Germany",         from: "$10" },
  { code: "JP", flag: "🇯🇵", name: "Japan",           from: "$11" },
  { code: "SG", flag: "🇸🇬", name: "Singapore",      from: "$9"  },
  { code: "ES", flag: "🇪🇸", name: "Spain",           from: "$9"  },
  { code: "IT", flag: "🇮🇹", name: "Italy",           from: "$10" },
  { code: "TH", flag: "🇹🇭", name: "Thailand",        from: "$8"  },
  { code: "AU", flag: "🇦🇺", name: "Australia",       from: "$14" },
  { code: "TR", flag: "🇹🇷", name: "Turkey",          from: "$7"  },
  { code: "GH", flag: "🇬🇭", name: "Ghana",           from: "$12" },
  { code: "IN", flag: "🇮🇳", name: "India",           from: "$9"  },
  { code: "CA", flag: "🇨🇦", name: "Canada",          from: "$13" },
  { code: "MX", flag: "🇲🇽", name: "Mexico",          from: "$8"  },
  { code: "ZA", flag: "🇿🇦", name: "South Africa",   from: "$11" },
  { code: "KE", flag: "🇰🇪", name: "Kenya",           from: "$10" },
  { code: "GR", flag: "🇬🇷", name: "Greece",          from: "$9"  },
];

// ─────────────────────────────────────────────
// STATS STRIP
// ─────────────────────────────────────────────
const STATS = [
  { value: "205+",   label: "Countries covered",   accent: "text-blue-500 dark:text-blue-400" },
  { value: "5,000+", label: "Happy travellers",     accent: "text-emerald-500 dark:text-emerald-400" },
  { value: "800+",   label: "Networks",             accent: "text-amber-500 dark:text-amber-400" },
  { value: "Instant", label: "Activation",          accent: "text-sky-500 dark:text-sky-400" },
];

function StatsStrip() {
  const { ref, inView } = useInView(0.2);
  return (
    <div className="border-b bg-muted/25 dark:bg-white/[0.02]" data-testid="section-stats-strip">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5" ref={ref}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4 divide-x-0 sm:divide-x divide-border/50">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`text-center sm:text-left sm:pl-6 first:pl-0 reveal ${inView ? "in-view" : ""} reveal-delay-${i + 1}`}
            >
              <div className={`font-display text-3xl sm:text-4xl font-bold tracking-tight leading-none mb-1 ${s.accent}`}>
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FESTIVAL EVENTS CAROUSEL  (primary hero)
// ─────────────────────────────────────────────
function EventsCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setActive(n => (n + 1) % FESTIVAL_EVENTS.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused]);

  const ev = FESTIVAL_EVENTS[active];

  return (
    <section
      className="relative overflow-hidden min-h-[70vh] flex flex-col"
      data-testid="section-events-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background slides */}
      {FESTIVAL_EVENTS.map((event, i) => (
        <div
          key={event.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === active ? "opacity-100 z-10" : "opacity-0 z-0"}`}
          style={{ background: `linear-gradient(135deg, ${event.bgFrom} 0%, ${event.bgTo} 100%)` }}
        >
          <img
            src={event.photo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            loading="lazy"
          />
          {/* Stronger overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        </div>
      ))}

      {/* Content layer */}
      <div className="relative z-20 flex-1 max-w-7xl mx-auto px-4 sm:px-6 w-full flex flex-col">

        {/* ── Static hero headline ── */}
        <div className="pt-12 sm:pt-20 lg:pt-24 pb-8 sm:pb-10">
          <h1
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.05] tracking-tight mb-4"
            data-testid="text-hero-title"
          >
            Stay connected at the
            <br className="hidden sm:block" /> world's biggest events.
          </h1>
          <p className="text-white/55 text-base sm:text-xl max-w-2xl leading-relaxed">
            From Monaco to Tomorrowland, activate instant eSIM data in 205+ countries before you land.
          </p>
        </div>

        {/* ── Event-specific content ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-8 pb-4">

          {/* Left: event detail */}
          <div className="text-white">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4 text-white"
              style={{ backgroundColor: ev.accent + "33", border: `1px solid ${ev.accent}55` }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: ev.accent }} />
              Upcoming Event
            </div>

            <h2
              className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-3 text-white"
              data-testid="text-event-title"
            >
              {ev.name}
            </h2>

            <p className="text-white/65 text-sm sm:text-base max-w-md leading-relaxed mb-5">
              {ev.subtitle}
            </p>

            {/* Location + Date + flag chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium border border-white/15">
                <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: ev.accent }} />
                {ev.location}
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium border border-white/15">
                <Timer className="w-3 h-3 flex-shrink-0" style={{ color: ev.accent }} />
                {ev.dates}
              </div>
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 border border-white/15">
                {ev.flags.map(f => <span key={f} className="text-base leading-none">{f}</span>)}
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => navigate(`/destinations/${ev.countryCode}`)}
                className="font-bold h-11 px-6 text-sm"
                style={{ backgroundColor: ev.accent, color: "#fff", border: "none" }}
                data-testid={`button-event-cta-${ev.id}`}
              >
                {ev.cta}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <span className="text-white/40 text-xs">eSIM ready in seconds · No SIM card needed</span>
            </div>
          </div>

          {/* Right: 16:9 event image */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative w-full max-w-lg">
              <div
                className="absolute -inset-4 rounded-2xl blur-3xl opacity-30"
                style={{ backgroundColor: ev.accent }}
              />
              <div
                className="relative w-full rounded-2xl overflow-hidden border-2 shadow-2xl"
                style={{ borderColor: ev.accent + "60", aspectRatio: "16/9" }}
              >
                <img
                  src={ev.photo}
                  alt={ev.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-3 right-3 px-3 py-2 rounded-xl bg-black/80 backdrop-blur border border-white/15 shadow-xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 leading-none mb-0.5">When</p>
                  <p className="text-xs font-bold text-white">{ev.dates}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dots navigation — pushed to bottom */}
        <div className="flex items-center gap-2 py-5 mt-auto">
          {FESTIVAL_EVENTS.map((e, i) => (
            <button
              key={e.id}
              onClick={() => { setActive(i); setPaused(true); setTimeout(() => setPaused(false), 8000); }}
              className={`rounded-full transition-all duration-300 ${i === active ? "w-6 h-2" : "w-2 h-2 bg-white/25 hover:bg-white/50"}`}
              style={i === active ? { backgroundColor: ev.accent, width: "24px" } : {}}
              data-testid={`dot-event-${i}`}
              aria-label={e.name}
            />
          ))}
          <span className="ml-3 text-white/30 text-[11px] font-medium">
            {active + 1} / {FESTIVAL_EVENTS.length}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// PLAN FINDER SECTION
// ─────────────────────────────────────────────
function PlanFinderSection() {
  const [, navigate] = useLocation();
  const [heroCode, setHeroCode] = useState<string>("");
  const [heroDays, setHeroDays] = useState<number | null>(null);
  const DURATION_OPTIONS = [1, 3, 5, 7, 30];

  const handleFind = () => {
    const params = new URLSearchParams();
    if (heroDays) params.set("days", String(heroDays));
    if (heroCode && heroCode !== "any") params.set("country", heroCode);
    navigate(params.toString() ? `/find-plan?${params}` : "/find-plan");
  };

  return (
    <section className="py-12 sm:py-16 border-b" data-testid="section-plan-finder">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Left: copy */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Instant eSIM · 205+ countries</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4" data-testid="text-plan-finder-title">
              Find your destination plan
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-7 max-w-md">
              Search any destination and get a QR code delivered to your inbox in seconds. No SIM swap, no queues, no contracts.
            </p>
          </div>

          {/* Right: plan finder card */}
          <div className="rounded-2xl border bg-card shadow-xl p-6 sm:p-7" data-testid="hero-plan-selector">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Find your plan</p>

            {/* Destination */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Where are you travelling?
              </label>
              <CountryCombobox
                value={heroCode}
                onSelect={code => setHeroCode(code ?? "")}
                placeholder="Search destination…"
                allowAny
                className="h-11 text-sm w-full"
                data-testid="hero-select-destination"
              />
            </div>

            {/* Duration */}
            <div className="mb-5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                How long?
              </label>
              <div className="flex gap-2 flex-wrap" data-testid="hero-duration-buttons">
                {DURATION_OPTIONS.map((d) => {
                  const isActive = heroDays === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setHeroDays(isActive ? null : d)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 cursor-pointer select-none ${
                        isActive
                          ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-[1.04]"
                          : "bg-muted border-border text-foreground hover:bg-muted/70 hover:border-border/80"
                      }`}
                      data-testid={`hero-duration-${d}`}
                    >
                      {d === 30 ? "30 days" : `${d} ${d === 1 ? "day" : "days"}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleFind}
              className="group w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-primary font-bold text-white text-base shadow-xl shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
              data-testid="button-hero-find-plan"
            >
              <Search className="w-4 h-4" />
              Find My Plan
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// K. TRAVEL SMARTER (secondary explainer — moved lower)
// ─────────────────────────────────────────────
function TravelSmarterSection() {
  const [, navigate] = useLocation();

  return (
    <section className="relative overflow-hidden" data-testid="section-travel-smarter">
      {/* Dark background */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: "brightness(0.25) saturate(1.2)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A0A0A]/97 via-black/88 to-blue-950/90" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-8 pointer-events-none"
          style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left: copy */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary/80 mb-4">Your global connectivity</p>
            <h2
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight tracking-tight mb-5"
              data-testid="text-travel-smarter-title"
            >
              Travel smarter<br />with KONEX.
            </h2>
            <p className="text-white/55 text-base sm:text-lg leading-relaxed mb-8 max-w-lg" data-testid="text-hero-subtitle">
              Choose your destination, activate in minutes, and stay connected in 205+ countries with instant eSIM data.
            </p>

            {/* 2×2 trust grid */}
            <div className="grid grid-cols-2 gap-3 mb-10">
              {[
                { icon: Zap,          text: "Instant delivery" },
                { icon: Banknote,     text: "No roaming fees" },
                { icon: CheckCircle2, text: "No contracts" },
                { icon: Smartphone,   text: "No physical SIM" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2.5 text-white/70 text-sm">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  {text}
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3" data-testid="trust-bullets">
              <Button
                onClick={() => navigate("/find-plan")}
                className="font-bold h-12 px-7"
                data-testid="button-travel-smarter-find"
              >
                <Search className="w-4 h-4 mr-2" />
                Find My Plan
              </Button>
              <Link href="/destinations">
                <Button
                  variant="outline"
                  className="font-bold h-12 px-7 border-white/20 text-white hover:bg-white/10 hover:text-white"
                  data-testid="button-travel-smarter-browse"
                >
                  View Plans
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: 2×2 feature tiles */}
          <div className="hidden lg:grid grid-cols-2 gap-4">
            {[
              { emoji: "⚡", title: "Instant activation", desc: "QR delivered to your inbox in seconds after payment" },
              { emoji: "🌍", title: "205+ countries", desc: "From major cities to remote destinations worldwide" },
              { emoji: "💳", title: "Flat pricing", desc: "One price, no daily fees, no bill shock" },
              { emoji: "📱", title: "Dual SIM", desc: "Your regular number stays fully active alongside your eSIM" },
            ].map(f => (
              <div key={f.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5">
                <span className="text-3xl mb-3 block">{f.emoji}</span>
                <p className="text-white font-semibold text-sm mb-1">{f.title}</p>
                <p className="text-white/40 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 2. HOW IT WORKS
// ─────────────────────────────────────────────

function PhoneMockup({ children, accent = "primary" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative w-32 h-60 mx-auto flex-shrink-0">
      {/* Outer glow */}
      {accent === "primary" && (
        <div className="absolute inset-0 rounded-[28px] bg-primary/5 blur-xl scale-105 -z-10" />
      )}
      {/* Phone shell */}
      <div className={`absolute inset-0 rounded-[28px] border-2 shadow-2xl ${accent === "primary" ? "border-primary/35 shadow-primary/15" : "border-white/10"} bg-[#0d0d12]`} />
      {/* Side buttons */}
      <div className="absolute right-[-1px] top-16 w-[3px] h-8 rounded-l-full bg-white/10" />
      <div className="absolute left-[-1px] top-11 w-[3px] h-5 rounded-r-full bg-white/10" />
      <div className="absolute left-[-1px] top-20 w-[3px] h-5 rounded-r-full bg-white/10" />
      {/* Dynamic island */}
      <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-11 h-[7px] rounded-full bg-black" />
      {/* Home indicator */}
      <div className="absolute bottom-[7px] left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-white/15" />
      {/* Screen */}
      <div className="absolute inset-x-[4px] top-[5px] bottom-[4px] rounded-[24px] overflow-hidden bg-[#080810] flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
          <span className="text-[6px] font-semibold text-white/50 tracking-wide">9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-[2px] items-end">
              {[3,4,5,6].map((h,i) => (
                <div key={i} className="w-[2px] rounded-sm bg-white/50" style={{ height: `${h}px` }} />
              ))}
            </div>
            <div className="w-3 h-1.5 rounded-[2px] border border-white/40 ml-0.5 flex items-center px-[1px]">
              <div className="h-[4px] w-2/3 bg-white/50 rounded-[1px]" />
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center pb-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: "01",
      icon: Smartphone,
      title: "Check compatibility",
      description: "Make sure your device supports eSIM and is carrier-unlocked. Most modern phones do.",
      phone: (
        <div className="flex flex-col items-center gap-3 w-full px-3">
          {/* eSIM chip card */}
          <div className="w-full rounded-xl bg-gradient-to-br from-primary/30 to-blue-600/20 border border-primary/25 p-2.5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[8px] font-bold text-white leading-tight">eSIM Profile</p>
              <p className="text-[7px] text-white/50 mt-0.5">Carrier unlocked</p>
            </div>
            <div className="ml-auto w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </div>
          </div>
          {/* Status text */}
          <div className="text-center">
            <p className="text-[9px] font-bold text-white">eSIM Ready</p>
            <p className="text-[7px] text-white/40 mt-0.5">Compatible device detected</p>
          </div>
          {/* Animated signal bars */}
          <div className="flex gap-[3px] items-end">
            {[5, 7, 9, 11, 13].map((h, i) => (
              <div
                key={i}
                className="w-[5px] rounded-t-[2px] bg-emerald-400"
                style={{ height: `${h}px`, opacity: i < 4 ? 1 : 0.3, animation: `pulse 2s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        </div>
      ),
    },
    {
      num: "02",
      icon: Globe,
      title: "Choose your plan",
      description: "Pick your destination and data size. Available for 205+ countries with instant pricing.",
      phone: (
        <div className="flex flex-col gap-2 w-full px-2.5">
          {/* Flag row */}
          <div className="flex flex-wrap gap-[3px] justify-center">
            {["🇬🇧","🇺🇸","🇦🇪","🇳🇬","🇫🇷","🇩🇪","🇯🇵","🇪🇸"].map(f => (
              <span key={f} className="text-[11px]">{f}</span>
            ))}
          </div>
          <p className="text-[7px] text-center text-white/30 font-bold uppercase tracking-widest">205+ Countries</p>
          {/* Plan cards */}
          {[
            { label: "5 GB · 7 days", price: "$9.99", highlight: true },
            { label: "10 GB · 30 days", price: "$16.99", highlight: false },
          ].map(p => (
            <div
              key={p.label}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-[7px] transition-all ${
                p.highlight
                  ? "bg-primary text-white shadow-lg shadow-primary/30"
                  : "bg-white/5 border border-white/10 text-white/60"
              }`}
            >
              <span className="font-semibold">{p.label}</span>
              <span className={`font-bold ${p.highlight ? "text-white" : "text-white/50"}`}>{p.price}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      num: "03",
      icon: QrCode,
      title: "Get your QR instantly",
      description: "Your QR code lands in your inbox seconds after payment. No waiting, no shipping.",
      phone: (
        <div className="flex flex-col items-center gap-2.5 w-full px-3">
          <p className="text-[7px] font-bold text-primary uppercase tracking-widest">Your eSIM</p>
          {/* QR code */}
          <div className="w-16 h-16 rounded-xl bg-white p-1.5 shadow-lg shadow-primary/20 flex items-center justify-center">
            <QrCode className="w-12 h-12 text-black" />
          </div>
          {/* Delivered pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[7px] font-bold text-emerald-400">Delivered to inbox</span>
          </div>
        </div>
      ),
    },
    {
      num: "04",
      icon: Wifi,
      title: "Scan and connect",
      description: "Open Settings → Cellular → Add eSIM, scan the code, and you're online instantly on landing.",
      phone: (
        <div className="flex flex-col items-center gap-2.5 w-full px-3">
          {/* Pulsing wifi icon */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="absolute w-9 h-9 rounded-full bg-emerald-500/15" />
            <div className="relative w-7 h-7 rounded-full bg-emerald-500/25 border border-emerald-500/40 flex items-center justify-center">
              <Wifi className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-white">Connected</p>
            <p className="text-[7px] text-white/40 mt-0.5">Full speed · 5G</p>
          </div>
          {/* Full signal bars */}
          <div className="flex gap-[3px] items-end">
            {[5, 7, 9, 11, 13].map((h, i) => (
              <div key={i} className="w-[5px] rounded-t-[2px] bg-emerald-400" style={{ height: `${h}px` }} />
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal className="mb-8 sm:mb-14 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">How it works</p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.0]" data-testid="text-how-it-works-title">
            Online in<br /><span className="text-gradient">60 seconds.</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-sm max-w-sm leading-relaxed">
            Four simple steps from purchase to full-speed data — no store visit, no SIM card, no waiting.
          </p>
        </Reveal>

        {/* Steps grid with connecting line */}
        <div className="relative">
          {/* Desktop connector line */}
          <div className="hidden lg:block absolute top-[6.5rem] left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-border to-transparent z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step, idx) => (
              <Reveal key={idx} delay={(idx + 1) as 1 | 2 | 3 | 4}>
                <div
                  className="bg-card border rounded-2xl p-6 sm:p-7 flex flex-col gap-5 card-gradient-hover relative z-10 h-full"
                  data-testid={`card-step-${idx + 1}`}
                >
                  {/* Phone mockup illustration */}
                  <div className="flex justify-center">
                    <PhoneMockup accent={idx === 0 ? "default" : "primary"}>
                      {step.phone}
                    </PhoneMockup>
                  </div>

                  {/* Step number badge */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0 shadow-md shadow-primary/25">
                      {step.num}
                    </div>
                    <div className="w-px h-4 bg-border" />
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                      <step.icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-lg mb-1.5" data-testid={`text-step-title-${idx + 1}`}>{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ── Smart Routing sub-section ─────────────────────────────── */}
        <Reveal>
          <div className="mt-16 sm:mt-20 pt-10 border-t">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Powered by Smart Routing</p>
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1">
              The best price, every time.
            </h3>
            <p className="text-muted-foreground text-sm max-w-xl leading-relaxed mb-8">
              Konex doesn't rely on a single network. Our routing engine continuously weighs cost, reliability,
              and destination performance across every provider — so you always get the optimal plan.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Network,
                  title: "Multi-Provider Routing",
                  description: "Every order is scored across multiple global eSIM networks simultaneously. The engine picks the best combination of price, reliability, and destination coverage — in milliseconds.",
                  stat: "3+ providers",
                  statLabel: "evaluated per order",
                  color: "from-violet-500 to-purple-600",
                },
                {
                  icon: Activity,
                  title: "Live Health Monitoring",
                  description: "Providers are continuously monitored with rolling success-rate metrics. If a network degrades, it's automatically deprioritised or paused before it can affect your purchase.",
                  stat: "< 100 ms",
                  statLabel: "routing decision time",
                  color: "from-blue-500 to-cyan-500",
                },
                {
                  icon: Shield,
                  title: "Automatic Failover",
                  description: "If a provider fails at the moment of provisioning, the system silently retries the next-best option — so you always receive a working eSIM without ever knowing there was a hiccup.",
                  stat: "99.9%",
                  statLabel: "fulfilment success rate",
                  color: "from-emerald-500 to-teal-500",
                },
              ].map((pillar) => (
                <div
                  key={pillar.title}
                  className="bg-card border rounded-2xl p-6 flex flex-col gap-4 card-gradient-hover"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pillar.color} flex items-center justify-center shadow-md`}>
                    <pillar.icon className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base mb-1.5">{pillar.title}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{pillar.description}</p>
                  </div>
                  <div className="flex items-baseline gap-2 mt-auto pt-2 border-t">
                    <span className={`text-xl font-black bg-gradient-to-r ${pillar.color} bg-clip-text text-transparent`}>
                      {pillar.stat}
                    </span>
                    <span className="text-muted-foreground text-xs">{pillar.statLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
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
    <section className="py-12 sm:py-20 lg:py-28 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-10">
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
              <div className="group relative overflow-hidden rounded-2xl cursor-pointer aspect-[3/4] bg-muted shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20 transition-shadow duration-300">
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
                  <div className="w-7 h-5 rounded-sm overflow-hidden mb-1.5 shadow-md border border-white/20">
                    <FlagImg code={dest.countryCode} name={dest.name} className="w-full h-full" />
                  </div>
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
      accent: "text-blue-400",
      bg: "bg-blue-400/10",
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
    <section className="py-12 sm:py-20 lg:py-28 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-8 sm:mb-14 max-w-2xl">
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
            <Reveal key={b.title} delay={((i % 3) + 1) as 1 | 2 | 3 | 4}>
              <div
                className="p-7 rounded-2xl border bg-background card-gradient-hover h-full"
                data-testid={`card-benefit-${i}`}
              >
                <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ${b.bg} mb-5`}>
                  <b.icon className={`w-5 h-5 ${b.accent}`} />
                </div>
                <h3 className="font-bold text-base mb-2 leading-snug">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
              </div>
            </Reveal>
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
    subtitle: "205+ countries · No limits",
    description: "One eSIM that works everywhere. Ideal for frequent travellers, business trips, or multi-stop tours.",
    features: ["205+ countries covered", "Unlimited data option", "Multi-trip ready"],
    price: "From $29",
  },
];

// ─────────────────────────────────────────────
// WORLD COVERAGE MAP
// ─────────────────────────────────────────────
function WorldCoverageSection() {
  const { ref, inView } = useInView(0.15);
  return (
    <section
      className="py-14 sm:py-20 lg:py-28 border-t overflow-hidden"
      data-testid="section-world-coverage"
      ref={ref}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className={`text-center mb-8 sm:mb-12 reveal ${inView ? "in-view" : ""}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Globe className="w-3.5 h-3.5" />
            Worldwide Coverage
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3">
            Stay connected in <span className="text-blue-500">205+ countries</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            From downtown Tokyo to a Moroccan riad — if you're travelling there, we've got you covered.
          </p>
        </div>

        {/* Globe card */}
        <div
          className={`relative rounded-2xl sm:rounded-3xl overflow-hidden border border-blue-500/20 shadow-2xl reveal reveal-delay-1 ${inView ? "in-view" : ""}`}
          style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(30,40,80,0.85) 0%, rgba(8,12,28,0.97) 100%)" }}
          data-testid="img-world-coverage-map"
        >
          {/* Subtle top edge glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />

          {/* Globe canvas */}
          <div className="w-full" style={{ height: "480px" }}>
            <GlobeVisualization />
          </div>

          {/* Floating city labels */}
          <div className="absolute inset-0 pointer-events-none select-none">
            {[
              { label: "London",      top: "22%", left: "44%" },
              { label: "New York",    top: "28%", left: "22%" },
              { label: "Dubai",       top: "38%", right: "28%" },
              { label: "Tokyo",       top: "26%", right: "14%" },
              { label: "Singapore",   top: "54%", right: "19%" },
              { label: "São Paulo",   top: "65%", left: "24%" },
            ].map(({ label, top, left, right }) => (
              <div
                key={label}
                className="absolute flex items-center gap-1.5"
                style={{ top, left, right }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.7)] flex-shrink-0" />
                <span className="text-[10px] sm:text-xs font-semibold text-blue-200/80 tracking-wide whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom gradient fade */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(8,12,28,0.7)] to-transparent" />

          {/* Bottom badge */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase text-blue-300/80 border border-blue-500/25 bg-blue-950/40 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live network · 205+ countries
            </span>
          </div>
        </div>

        {/* Stats row under map */}
        <div className={`mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 reveal reveal-delay-2 ${inView ? "in-view" : ""}`}>
          {[
            { label: "Countries", value: "205+", icon: <MapPin className="w-4 h-4" /> },
            { label: "Networks", value: "800+", icon: <Signal className="w-4 h-4" /> },
            { label: "Activates instantly", value: "< 60s", icon: <Zap className="w-4 h-4" /> },
            { label: "No roaming fees", value: "Ever", icon: <ShieldCheck className="w-4 h-4" /> },
          ].map(stat => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border bg-muted/30 text-center"
            >
              <span className="text-blue-500">{stat.icon}</span>
              <span className="font-bold text-xl sm:text-2xl tracking-tight">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BundlesSection() {
  return (
    <section className="py-12 sm:py-20 lg:py-28 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-8 sm:mb-14 max-w-xl">
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
    <section className="py-12 sm:py-20 lg:py-28 border-t bg-card">
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

          {/* Travel photo card */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/30 aspect-[4/3] lg:aspect-auto lg:min-h-[360px]">
            <img
              src="https://images.unsplash.com/photo-1512428813834-c702c7702b78?w=900&q=80"
              alt="Traveller using phone at airport"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover img-travel-hover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-950/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-7 text-white">
              <Smartphone className="w-9 h-9 mb-4 opacity-80" />
              <h3 className="font-display text-xl font-bold mb-2 leading-snug">Not sure if your phone is compatible?</h3>
              <p className="text-white/65 text-sm leading-relaxed mb-5">
                Our device checker covers 60+ models. Takes under 30 seconds.
              </p>
              <Link href="/compatibility">
                <Button variant="outline" size="sm" className="bg-white/10 border-white/25 text-white hover:bg-white/20 font-bold" data-testid="button-device-checker-cta">
                  Open Device Checker
                  <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 10. GLOBAL EVENTS SECTION
// ─────────────────────────────────────────────
const EVENT_CATEGORIES = [
  { slug: "trade-fairs",     emoji: "🏭", label: "Trade Fairs",        desc: "Canton Fair, GITEX, CES & more" },
  { slug: "festivals",       emoji: "🎉", label: "Festivals & Carnivals", desc: "Rio, Oktoberfest, Glastonbury" },
  { slug: "sports",          emoji: "🏆", label: "Sports Events",       desc: "F1, Wimbledon, Grand Prix" },
  { slug: "fashion-culture", emoji: "👗", label: "Fashion & Culture",   desc: "Milan, Paris, London Fashion Week" },
  { slug: "luxury",          emoji: "💎", label: "Luxury Events",       desc: "Art Basel, Monaco, Cannes" },
  { slug: "business",        emoji: "💼", label: "Business Travel",     desc: "Hannover Messe, Maison & Objet" },
];

function GlobalEventsSection() {
  return (
    <section className="py-16 sm:py-20 bg-background border-t border-border/50">
      <div className="max-w-6xl mx-auto px-4">
        <Reveal>
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
              🌍 Travel by Event
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-3">
              Stay Connected at the World's Biggest Events
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              From Canton Fair to Rio Carnival, KONEX gives travellers instant data before they land.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {EVENT_CATEGORIES.map((cat, i) => (
            <Reveal key={cat.slug} delay={Math.min(i + 1, 4) as 1 | 2 | 3 | 4}>
              <Link href={`/events?category=${cat.slug}`} data-testid={`event-category-${cat.slug}`}>
                <div className="group flex flex-col gap-2 p-4 sm:p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-md transition-all cursor-pointer h-full">
                  <span className="text-2xl sm:text-3xl">{cat.emoji}</span>
                  <p className="font-semibold text-sm sm:text-base leading-tight text-card-foreground group-hover:text-primary transition-colors">
                    {cat.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed hidden sm:block">
                    {cat.desc}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-primary font-medium mt-auto pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Browse <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="text-center">
            <Link href="/events">
              <Button size="lg" className="rounded-xl font-semibold px-8" data-testid="button-browse-all-events">
                Browse All Events
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              40+ global events · trade fairs · festivals · sports · luxury travel
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// 11. TESTIMONIALS
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
    <section className="py-12 sm:py-20 lg:py-28 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-8 sm:mb-14 max-w-xl">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8 sm:mb-14">
          {testimonials.map((t, idx) => (
            <Reveal key={idx} delay={(idx + 1) as 1 | 2 | 3}>
              <div className="flex flex-col p-7 rounded-2xl border bg-card card-gradient-hover h-full" data-testid={`card-testimonial-${idx}`}>
                <div className="flex items-center gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <Quote className="w-6 h-6 text-primary/25 mb-4 flex-shrink-0" />
                <p className="font-display font-bold text-lg leading-snug mb-3" data-testid={`text-testimonial-headline-${idx}`}>
                  "{t.quote}"
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">
                  {t.full}
                </p>
                <div className="flex items-center gap-3 pt-4 border-t">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-primary to-blue-700 text-primary-foreground font-bold text-sm flex-shrink-0 shadow-md shadow-primary/20">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-tight" data-testid={`text-testimonial-name-${idx}`}>{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-testimonial-context-${idx}`}>{t.context}</p>
                  </div>
                </div>
              </div>
            </Reveal>
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
              className="flex flex-col items-center text-center p-5 rounded-2xl border bg-card gap-3 card-gradient-hover"
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
      answer: "Yes. Our regional plans cover multiple countries in one purchase — ideal for European trips, Middle East travel, or multi-stop tours. Global plans cover 205+ countries with a single eSIM.",
    },
  ];

  return (
    <section id="faq" className="py-12 sm:py-20 lg:py-28 border-t">
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
  const { ref, inView } = useInView(0.15);
  return (
    <section className="relative overflow-hidden border-t" ref={ref}>
      {/* Full-bleed background image */}
      <img
        src={travelLandmarksImg}
        alt=""
        aria-hidden
        loading="lazy"
        className={`absolute inset-0 w-full h-full object-cover reveal-img ${inView ? "in-view" : ""}`}
      />
      {/* Dark overlay for text contrast */}
      <div className="absolute inset-0 bg-black/55 pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-36 text-center">
        <div className={`reveal ${inView ? "in-view" : ""}`}>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/30 text-white text-xs font-bold px-4 py-1.5 mb-6 uppercase tracking-widest">
            <Zap className="w-3 h-3" />
            Instant Activation
          </div>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.05] text-white drop-shadow-lg" data-testid="text-final-cta-title">
            Get travel data<br />before you land.
          </h2>
          <p className="text-white/85 text-base sm:text-lg max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed drop-shadow" data-testid="text-final-cta-subtitle">
            Choose your destination, activate in minutes, and stay connected in 205+ countries with KONEX eSIM.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link href="/destinations">
              <Button size="lg" className="h-13 px-8 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-900/50" data-testid="button-final-get-started">
                Get eSIM Now
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/destinations">
              <Button size="lg" variant="outline" className="h-13 px-8 text-base font-bold border-white/40 text-white bg-white/15 hover:bg-white/25" data-testid="button-final-browse-plans">
                View Plans
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/60 drop-shadow" data-testid="text-final-microcopy">
            Instant delivery &nbsp;·&nbsp; No roaming fees &nbsp;·&nbsp; No contracts
          </p>
        </div>
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
              <li>
                <a
                  href="mailto:support@konexesim.com"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                  data-testid="footer-link-contact"
                >
                  support@konexesim.com
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Legal</p>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer" data-testid="text-footer-privacy">Privacy Policy</span>
                </Link>
              </li>
              <li>
                <Link href="/terms">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer" data-testid="text-footer-terms">Terms of Service</span>
                </Link>
              </li>
              <li>
                <Link href="/refund-policy">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer" data-testid="text-footer-refund">Refund Policy</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Flag strip */}
        <div className="border-t pt-8 pb-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex-shrink-0 hidden sm:block">Popular</span>
            {flagStrip.map((item) => (
              <Link key={item.code} href={`/destinations/${item.code}`} data-testid={`flag-strip-${item.code.toLowerCase()}`}>
                <div className="flex items-center gap-1.5 hover:opacity-75 transition-opacity cursor-pointer">
                  <div className="w-5 h-3.5 rounded-[2px] overflow-hidden flex-shrink-0 shadow-sm">
                    <FlagImg code={item.code} name={item.label} className="w-full h-full" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Trust & payment bar */}
        <div className="border-t pt-6 pb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 justify-between">
            <div className="flex items-center gap-2.5" data-testid="trust-bar-networks">
              <SiVodafone className="h-3.5 w-auto" style={{ color: "#E60000" }} title="Vodafone" />
              <SiTmobile  className="h-3.5 w-auto" style={{ color: "#E20074" }} title="T-Mobile" />
              <SiOrange   className="h-3.5 w-auto" style={{ color: "#FF7900" }} title="Orange" />
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="trust-bar-support">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">24/7 support</span>
            </div>
            <div className="flex items-center gap-3" data-testid="payment-icons">
              <SiVisa       className="h-4 w-auto text-muted-foreground" data-testid="payment-icon-visa" />
              <SiMastercard className="h-4 w-auto" style={{ color: "#EB001B" }} data-testid="payment-icon-mc" />
              <SiApplepay   className="h-5 w-auto text-foreground" data-testid="payment-icon-apple-pay" />
              <SiGooglepay  className="h-5 w-auto" style={{ color: "#4285F4" }} data-testid="payment-icon-google-pay" />
              <SiPaypal     className="h-4 w-auto" style={{ color: "#003087" }} data-testid="payment-icon-paypal" />
            </div>
          </div>
        </div>

        <div className="border-t pt-8">
          <p className="text-xs text-muted-foreground text-center sm:text-left" data-testid="text-footer-copyright">
            &copy; 2026 Konex. All rights reserved.
          </p>
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
// WORLD CUP 2026 ANNOUNCEMENT BAR
// ─────────────────────────────────────────────
function WorldCupAnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  const [, navigate] = useLocation();
  if (dismissed) return null;
  return (
    <div
      className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-xs sm:text-sm font-medium py-2.5 px-10"
      data-testid="announcement-bar-worldcup"
    >
      <span className="text-base leading-none">⚽</span>
      <span className="text-white/90">
        World Cup 2026 travel data now available —
        <span className="font-bold text-white"> USA, Canada &amp; Mexico</span> coverage.
      </span>
      <button
        onClick={() => navigate("/find-plan?country=US")}
        className="ml-2 underline underline-offset-2 font-bold text-white hover:text-blue-200 transition-colors whitespace-nowrap"
        data-testid="button-announcement-get-plan"
      >
        Get your plan →
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white rounded transition-colors"
        aria-label="Dismiss announcement"
        data-testid="button-announcement-dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// WORLD CUP 2026 CAMPAIGN SECTION
// ─────────────────────────────────────────────
const WC_PACKAGES = [
  {
    id: "match-day",
    name: "Match Day",
    data: "3GB",
    days: 7,
    badge: null as string | null,
    desc: "Best for short trips and one-city visits",
    icon: "⚽",
    accentFrom: "#2563eb",
    accentTo: "#3b82f6",
  },
  {
    id: "group-stage",
    name: "Group Stage",
    data: "10GB",
    days: 15,
    badge: "Popular",
    desc: "Best for fans attending multiple matches",
    icon: "🏟️",
    accentFrom: "#4f46e5",
    accentTo: "#6366f1",
  },
  {
    id: "full-tournament",
    name: "Full Tournament",
    data: "20GB",
    days: 30,
    badge: null,
    desc: "Best for multi-city travel across host countries",
    icon: "✈️",
    accentFrom: "#7c3aed",
    accentTo: "#8b5cf6",
  },
  {
    id: "ultimate-fan",
    name: "Ultimate Fan",
    data: "50GB",
    days: 30,
    badge: "Creator",
    desc: "Best for content creators, vloggers and heavy data users",
    icon: "📲",
    accentFrom: "#0891b2",
    accentTo: "#06b6d4",
  },
] as const;

const WC_HOST_COUNTRIES = [
  { code: "US", name: "USA",    flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
] as const;

const WC_HIGHLIGHTS = [
  "Coverage across USA, Canada & Mexico",
  "Install before departure",
  "Activate when you land",
  "No physical SIM required",
  "Instant QR code delivery",
  "Works on all eSIM-compatible phones",
] as const;

function WorldCup2026Section() {
  const [, navigate] = useLocation();
  const { ref, inView } = useInView(0.1);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-16 sm:py-24"
      data-testid="section-worldcup-2026"
    >
      {/* ── Background ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[#05101f]">
        {/* Stadium light sweep — left */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 10% -5%, #1e3a8a55 0%, transparent 65%), " +
              "radial-gradient(ellipse 60% 70% at 90% -5%, #312e8155 0%, transparent 65%)",
          }}
        />
        {/* Pitch green glow at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-56 opacity-15"
          style={{
            background:
              "radial-gradient(ellipse 110% 100% at 50% 120%, #166534 0%, transparent 70%)",
          }}
        />
        {/* Subtle animated ring */}
        <div
          className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full border border-blue-600/10"
          style={{ animation: "spin 40s linear infinite" }}
        />
        <div
          className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full border border-indigo-500/10"
          style={{ animation: "spin 28s linear infinite reverse" }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">

        {/* ── Section label + headline ──────────────────────────────── */}
        <div className={`text-center mb-10 reveal ${inView ? "in-view" : ""}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-5 text-blue-300 border border-blue-500/30 bg-blue-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            World Cup 2026 · Travel Data Bundles
          </div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4 leading-tight" data-testid="text-worldcup-headline">
            Stay connected from<br className="hidden sm:block" /> kick-off to final whistle
          </h2>

          <p className="text-white/50 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Travelling to the USA, Canada, or Mexico for the World Cup?{" "}
            <span className="text-white/75 font-medium">Get instant eSIM data before you fly.</span>{" "}
            No roaming shocks. No airport SIM queues. Just scan, install, and connect.
          </p>
        </div>

        {/* ── Host country route visual ─────────────────────────────── */}
        <div className={`flex items-center justify-center gap-3 sm:gap-5 mb-12 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {WC_HOST_COUNTRIES.map((c, i) => (
            <div key={c.code} className="flex items-center gap-3 sm:gap-5">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-blue-500/40 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/10">
                  <img
                    src={flagUrl(c.code)}
                    alt={c.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className="text-white/65 text-xs font-semibold tracking-wide">{c.name}</span>
              </div>
              {i < WC_HOST_COUNTRIES.length - 1 && (
                <div className="flex items-center gap-1 pb-4">
                  <div className="w-6 sm:w-10 h-px bg-gradient-to-r from-blue-500/60 to-blue-400/20" />
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-pulse" />
                  <div className="w-6 sm:w-10 h-px bg-gradient-to-r from-blue-400/20 to-blue-500/60" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Package cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {WC_PACKAGES.map((pkg, i) => (
            <div
              key={pkg.id}
              className={`relative rounded-2xl border bg-white/[0.04] backdrop-blur-sm p-5 hover:bg-white/[0.07] hover:-translate-y-1 transition-all duration-200 cursor-pointer group reveal reveal-delay-${i + 1} ${inView ? "in-view" : ""}`}
              style={{ borderColor: pkg.accentTo + "45" }}
              onClick={() => navigate(`/find-plan?country=US`)}
              data-testid={`card-worldcup-${pkg.id}`}
            >
              {/* Badge */}
              {pkg.badge && (
                <div
                  className="absolute -top-2.5 right-4 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white"
                  style={{ background: `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentTo})` }}
                >
                  {pkg.badge}
                </div>
              )}

              {/* Icon */}
              <div className="text-2xl mb-3 leading-none">{pkg.icon}</div>

              {/* Data + days */}
              <div className="mb-1 flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-bold"
                  style={{ background: `linear-gradient(135deg, #fff 30%, ${pkg.accentTo})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  {pkg.data}
                </span>
                <span className="text-white/35 text-xs">/ {pkg.days} days</span>
              </div>

              {/* Name */}
              <p className="font-bold text-white text-sm mb-2">{pkg.name}</p>
              <p className="text-white/40 text-xs leading-relaxed">{pkg.desc}</p>

              {/* Footer row */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-0.5">
                  {(["🇺🇸", "🇨🇦", "🇲🇽"] as const).map(f => (
                    <span key={f} className="text-sm leading-none">{f}</span>
                  ))}
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                  style={{ background: `linear-gradient(135deg, ${pkg.accentFrom}30, ${pkg.accentTo}30)`, border: `1px solid ${pkg.accentTo}50` }}
                >
                  <ChevronRight className="w-3 h-3" style={{ color: pkg.accentTo }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Feature highlights ────────────────────────────────────── */}
        <div className={`flex flex-wrap justify-center gap-x-5 gap-y-2.5 mb-10 reveal reveal-delay-2 ${inView ? "in-view" : ""}`}>
          {WC_HIGHLIGHTS.map(item => (
            <div key={item} className="flex items-center gap-1.5 text-white/50 text-xs sm:text-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* ── CTAs ─────────────────────────────────────────────────── */}
        <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 mb-8 reveal reveal-delay-3 ${inView ? "in-view" : ""}`}>
          <Button
            onClick={() => navigate("/find-plan?country=US")}
            className="font-bold h-12 px-8 text-sm text-white border-0 shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all duration-200"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #4f46e5)" }}
            data-testid="button-worldcup-view-plans"
          >
            View World Cup Plans
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/compatibility")}
            className="font-bold h-12 px-8 text-sm border-white/15 text-white/75 bg-transparent hover:bg-white/8 hover:text-white hover:border-white/30 transition-all duration-200"
            data-testid="button-worldcup-compatibility"
          >
            <Smartphone className="mr-2 w-4 h-4" />
            Check Phone Compatibility
          </Button>
        </div>

        {/* ── Legal disclaimer ─────────────────────────────────────── */}
        <p className="text-center text-white/25 text-[11px] max-w-lg mx-auto leading-relaxed">
          KONEX is not affiliated with or endorsed by FIFA. Packages are travel connectivity products for fans attending World Cup 2026 events.
        </p>

      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function Home() {
  useEffect(() => { document.title = "Konex eSIM – Instant Data Plans for 205+ Countries"; }, []);

  return (
    <div className="min-h-screen pb-20 sm:pb-0 overflow-x-hidden">
      {/* Announcement: World Cup 2026 */}
      <WorldCupAnnouncementBar />
      {/* A: Primary hero — Travel smarter */}
      <TravelSmarterSection />
      {/* B: Trust stats strip */}
      <StatsStrip />
      {/* C: Plan finder */}
      <Reveal><PlanFinderSection /></Reveal>
      {/* C2: World Cup 2026 campaign — after hero, before generic destinations */}
      <WorldCup2026Section />
      {/* D: Popular destinations */}
      <Reveal><PopularDestinations /></Reveal>
      {/* E: Events carousel — mid-page feature */}
      <Reveal><EventsCarousel /></Reveal>
      {/* F: Travel bundles */}
      <Reveal><BundlesSection /></Reveal>
      {/* G: How it works */}
      <Reveal><HowItWorks /></Reveal>
      {/* H: Device compatibility */}
      <Reveal><CompatibilitySection /></Reveal>
      {/* I: Testimonials */}
      <Reveal><TestimonialsSection /></Reveal>
      {/* J: FAQ */}
      <Reveal><FAQSection /></Reveal>
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
