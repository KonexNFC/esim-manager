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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SiVisa, SiMastercard, SiApplepay, SiStripe, SiGooglepay, SiVodafone, SiTmobile, SiOrange } from "react-icons/si";
import type { Destination, Plan } from "@shared/schema";
import { CountryCombobox } from "@/components/country-combobox";
import { useInView } from "@/hooks/use-in-view";

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
    id: "afronation",
    name: "Afronation 2026",
    subtitle: "The world's biggest Afrobeats festival — come for the music, stay connected with Konex.",
    location: "Portimão, Portugal",
    dates: "Jul 2–5, 2026",
    flags: ["🇵🇹", "🇬🇧", "🇳🇬"],
    countryCode: "PT",
    bgFrom: "#3b1f0a",
    bgTo: "#7c2d12",
    accent: "#f97316",
    photo: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=700&q=80",
    cta: "Get Portugal eSIM",
  },
  {
    id: "oktoberfest",
    name: "Oktoberfest 2026",
    subtitle: "Munich's legendary festival of culture, beer, and tradition. Stay connected all week.",
    location: "Munich, Germany",
    dates: "Sep 19 – Oct 4, 2026",
    flags: ["🇩🇪"],
    countryCode: "DE",
    bgFrom: "#0c1f3c",
    bgTo: "#1e3a5f",
    accent: "#3b82f6",
    photo: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=700&q=80",
    cta: "Get Germany eSIM",
  },
  {
    id: "cherry-blossom",
    name: "Cherry Blossom Season",
    subtitle: "Japan's iconic sakura season draws millions — don't miss the moment, share it live.",
    location: "Kyoto & Tokyo, Japan",
    dates: "Mar 20 – Apr 15, 2026",
    flags: ["🇯🇵"],
    countryCode: "JP",
    bgFrom: "#2d0a1a",
    bgTo: "#6b1d3c",
    accent: "#ec4899",
    photo: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=700&q=80",
    cta: "Get Japan eSIM",
  },
  {
    id: "dubai-expo",
    name: "Dubai World Expo",
    subtitle: "Business, leisure, or the world's best shopping — Konex keeps you online in Dubai.",
    location: "Dubai, UAE",
    dates: "Year-round 2026",
    flags: ["🇦🇪"],
    countryCode: "AE",
    bgFrom: "#0f1a0a",
    bgTo: "#1a3a0f",
    accent: "#22c55e",
    photo: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=700&q=80",
    cta: "Get UAE eSIM",
  },
  {
    id: "rio-carnival",
    name: "Rio Carnival 2027",
    subtitle: "The greatest show on Earth. Get data-ready before the samba takes over your senses.",
    location: "Rio de Janeiro, Brazil",
    dates: "Feb 7–12, 2027",
    flags: ["🇧🇷"],
    countryCode: "BR",
    bgFrom: "#1a0a2e",
    bgTo: "#3b1f6b",
    accent: "#a855f7",
    photo: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=700&q=80",
    cta: "Get Brazil eSIM",
  },
  {
    id: "wimbledon",
    name: "Wimbledon 2026",
    subtitle: "Strawberries, rain delays, and Centre Court glory. The UK's biggest summer event.",
    location: "London, United Kingdom",
    dates: "Jun 29 – Jul 12, 2026",
    flags: ["🇬🇧"],
    countryCode: "GB",
    bgFrom: "#0a1a0a",
    bgTo: "#1a4f1a",
    accent: "#86efac",
    photo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=700&q=80",
    cta: "Get UK eSIM",
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
  { value: "190+",   label: "Countries covered",   accent: "text-blue-500 dark:text-blue-400" },
  { value: "5,000+", label: "Happy travellers",     accent: "text-emerald-500 dark:text-emerald-400" },
  { value: "4.9/5",  label: "Customer rating",      accent: "text-amber-500 dark:text-amber-400" },
  { value: "<60s",   label: "Average setup time",   accent: "text-sky-500 dark:text-sky-400" },
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
// FESTIVAL EVENTS CAROUSEL
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
      className="relative overflow-hidden"
      data-testid="section-events-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      {FESTIVAL_EVENTS.map((event, i) => (
        <div
          key={event.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === active ? "opacity-100 z-10" : "opacity-0 z-0"}`}
          style={{ background: `linear-gradient(135deg, ${event.bgFrom} 0%, ${event.bgTo} 100%)` }}
        >
          {/* Background photo overlay */}
          <img
            src={event.photo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-35"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        </div>
      ))}

      {/* Content layer */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-8 py-12 sm:py-16">

          {/* Left: text */}
          <div className="text-white">
            {/* Event type pill */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4 text-white"
              style={{ backgroundColor: ev.accent + "33", border: `1px solid ${ev.accent}55` }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: ev.accent }} />
              Upcoming Event
            </div>

            {/* Title */}
            <h2
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-3 text-white"
              data-testid="text-event-title"
            >
              {ev.name}
            </h2>

            <p className="text-white/70 text-sm sm:text-base max-w-md leading-relaxed mb-5">
              {ev.subtitle}
            </p>

            {/* Location + Date chips */}
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
              <span className="text-white/40 text-xs">
                eSIM ready in seconds · No SIM card needed
              </span>
            </div>
          </div>

          {/* Right: full image */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative w-full max-w-lg">
              {/* Subtle glow behind image */}
              <div
                className="absolute -inset-4 rounded-2xl blur-3xl opacity-30"
                style={{ backgroundColor: ev.accent }}
              />
              {/* Full rectangular image */}
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
                {/* Floating date badge */}
                <div className="absolute bottom-3 right-3 px-3 py-2 rounded-xl bg-black/80 backdrop-blur border border-white/15 shadow-xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 leading-none mb-0.5">When</p>
                  <p className="text-xs font-bold text-white">{ev.dates}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dots navigation */}
        <div className="relative z-20 flex items-center gap-2 pb-5">
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
// QUICK COUNTRIES GRID

// ─────────────────────────────────────────────
// 1. HERO
// ─────────────────────────────────────────────
function HeroSection() {
  useEffect(() => { document.title = "Konex eSIM – Instant Data Plans for 190+ Countries"; }, []);
  const [, navigate] = useLocation();
  const [heroCode, setHeroCode] = useState<string>("");
  const [heroDays, setHeroDays] = useState<number | null>(null);

  const DURATION_OPTIONS = [1, 3, 5, 7];

  const handleHeroFind = () => {
    const params = new URLSearchParams();
    if (heroDays) params.set("days", String(heroDays));
    if (heroCode && heroCode !== "any") params.set("country", heroCode);
    const qs = params.toString();
    navigate(qs ? `/find-plan?${qs}` : "/find-plan");
  };

  return (
    <section className="relative overflow-hidden sm:min-h-[90vh] flex flex-col" data-testid="hero-section">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: "brightness(0.35) saturate(1.2)", transform: "scale(1.04)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A0A0A]/95 via-black/75 to-blue-950/80" />
        {/* Glow blobs */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }} />
      </div>

      <div className="relative flex-1 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-0 sm:pt-24 lg:pt-32 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center pb-10 sm:pb-20">

          {/* ── Left: Copy + Search form ─────────────────── */}
          <div>
            <h1
              className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] xl:text-[3.25rem] font-bold text-white leading-[1.1] tracking-tight mb-5"
              data-testid="text-hero-title"
            >
              Land anywhere.
              <br />
              <span className="text-gradient-bright">Stay connected</span>
              <br />
              in 60 Seconds.
            </h1>

            <p
              className="text-white/55 text-sm sm:text-lg max-w-lg leading-relaxed mb-5"
              data-testid="text-hero-subtitle"
            >
              Your eSIM is ready the instant you check out. Scan the QR, skip the airport queues, and land with data already working.
            </p>

            {/* Trust bullets */}
            <div className="flex flex-col gap-1.5 mb-5 sm:mb-8" data-testid="trust-bullets">
              {[
                "QR code delivered to your inbox in seconds",
                "Your regular number stays fully active",
                "One flat price — no daily fees, no bill shock",
              ].map((b) => (
                <div key={b} className="flex items-center gap-2.5 text-white/55 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  {b}
                </div>
              ))}
            </div>

            {/* ── Plan finder card ── */}
            <div
              className="rounded-2xl border border-white/12 bg-white/[0.06] backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/40"
              data-testid="hero-plan-selector"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-4">Find your plan</p>

              {/* Destination input */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">
                  Where are you travelling?
                </label>
                <CountryCombobox
                  value={heroCode}
                  onSelect={code => setHeroCode(code ?? "")}
                  placeholder="Search destination…"
                  allowAny
                  className="bg-white/10 border-white/15 text-white h-11 text-sm hover:bg-white/15 hover:text-white transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/50 w-full"
                  data-testid="hero-select-destination"
                />
              </div>

              {/* Duration pill buttons */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-2">
                  How long?
                </label>
                <div className="flex gap-2 flex-wrap" data-testid="hero-duration-buttons">
                  {DURATION_OPTIONS.map((d) => {
                    const active = heroDays === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setHeroDays(active ? null : d)}
                        className={`
                          px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 cursor-pointer select-none
                          ${active
                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-[1.04]"
                            : "bg-white/8 border-white/15 text-white/65 hover:bg-white/14 hover:border-white/30 hover:text-white hover:shadow-md hover:shadow-primary/10 hover:scale-[1.02]"
                          }
                        `}
                        data-testid={`hero-duration-${d}`}
                      >
                        {d} {d === 1 ? "day" : "days"}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setHeroDays(heroDays && heroDays > 7 ? null : 30)}
                    className={`
                      px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 cursor-pointer select-none
                      ${heroDays === 30
                        ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-[1.04]"
                        : "bg-white/8 border-white/15 text-white/65 hover:bg-white/14 hover:border-white/30 hover:text-white hover:shadow-md hover:shadow-primary/10 hover:scale-[1.02]"
                      }
                    `}
                    data-testid="hero-duration-30"
                  >
                    30 days
                  </button>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={handleHeroFind}
                className="group w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-primary font-bold text-white text-base shadow-xl shadow-primary/30 hover:bg-primary/90 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
                data-testid="button-hero-find-plan"
              >
                <Search className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-px" />
                Find My Plan
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* ── Right: Floating plan preview ─────────────── */}
          <div className="hidden lg:block" data-testid="card-hero-preview">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl opacity-25 pointer-events-none"
                style={{ background: "radial-gradient(ellipse, #2563eb 0%, transparent 70%)", filter: "blur(48px)" }} />
              <div className="relative rounded-3xl border border-white/10 bg-black/55 backdrop-blur-2xl overflow-hidden shadow-2xl">
                <div className="px-6 pt-6 pb-4 border-b border-white/[0.07] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-0.5">Popular Plans</p>
                    <p className="text-sm text-white/50">Starting from <strong className="text-white/90">$9</strong></p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold">
                    <Zap className="w-3 h-3" />
                    Instant QR
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {mockPlans.map((p) => (
                    <div
                      key={p.dest}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] hover:border-white/15 transition-all duration-200 cursor-pointer group"
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
                        <p className="text-[10px] text-white/40 group-hover:text-primary/70 transition-colors duration-200">one-off</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-5">
                  <Link href="/destinations">
                    <button
                      className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary font-bold text-white text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
                      data-testid="button-hero-card-browse"
                    >
                      Browse All Plans
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>
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
      description: "Pick your destination and data size. Available for 190+ countries with instant pricing.",
      phone: (
        <div className="flex flex-col gap-2 w-full px-2.5">
          {/* Flag row */}
          <div className="flex flex-wrap gap-[3px] justify-center">
            {["🇬🇧","🇺🇸","🇦🇪","🇳🇬","🇫🇷","🇩🇪","🇯🇵","🇪🇸"].map(f => (
              <span key={f} className="text-[11px]">{f}</span>
            ))}
          </div>
          <p className="text-[7px] text-center text-white/30 font-bold uppercase tracking-widest">190+ Countries</p>
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
    subtitle: "190+ countries · No limits",
    description: "One eSIM that works everywhere. Ideal for frequent travellers, business trips, or multi-stop tours.",
    features: ["190+ countries covered", "Unlimited data option", "Multi-trip ready"],
    price: "From $29",
  },
];

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
      answer: "Yes. Our regional plans cover multiple countries in one purchase — ideal for European trips, Middle East travel, or multi-stop tours. Global plans cover 190+ countries with a single eSIM.",
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
      {/* Travel background image */}
      <img
        src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=80"
        alt=""
        loading="lazy"
        className={`absolute inset-0 w-full h-full object-cover reveal-img ${inView ? "in-view" : ""}`}
        style={{ filter: "brightness(0.28) saturate(1.3)" }}
        aria-hidden
      />
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-blue-950/50 via-transparent to-transparent pointer-events-none" />
      {/* Blue glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] opacity-15 pointer-events-none blob-drift"
        style={{ background: "radial-gradient(ellipse, #2563eb 0%, transparent 70%)" }} />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-36 text-center">
        <div className={`reveal ${inView ? "in-view" : ""}`}>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold px-4 py-1.5 mb-6 uppercase tracking-widest">
            <Zap className="w-3 h-3" />
            Instant Activation
          </div>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.0] text-white" data-testid="text-final-cta-title">
            Get travel data<br />before you land.
          </h2>
          <p className="text-white/60 text-sm sm:text-lg max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed" data-testid="text-final-cta-subtitle">
            Choose your destination, activate in minutes, and stay connected in 190+ countries with KONEX eSIM.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link href="/destinations">
              <Button size="lg" className="h-13 px-8 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/30" data-testid="button-final-get-started">
                Get eSIM Now
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/destinations">
              <Button size="lg" variant="outline" className="h-13 px-8 text-base font-bold border-white/25 text-white bg-white/10 hover:bg-white/20" data-testid="button-final-browse-plans">
                View Plans
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/35" data-testid="text-final-microcopy">
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
              <SiStripe     className="h-4 w-auto" style={{ color: "#635BFF" }} data-testid="payment-icon-stripe" />
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
// PAGE
// ─────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen pb-20 sm:pb-0 overflow-x-hidden">
      <EventsCarousel />
      <StatsStrip />
      <HeroSection />
      <Reveal><HowItWorks /></Reveal>
      <Reveal><PopularDestinations /></Reveal>
      <Reveal><TestimonialsSection /></Reveal>
      <Reveal><WhyKonex /></Reveal>
      <Reveal><BundlesSection /></Reveal>
      <Reveal><CompatibilitySection /></Reveal>
      <Reveal><FinalCTA /></Reveal>
      <Reveal><FAQSection /></Reveal>
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
