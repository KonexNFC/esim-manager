import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Price } from "@/lib/currency";
import { useChinaPlans } from "@/hooks/use-china-plans";
import { Button } from "@/components/ui/button";
import { KonexLogo } from "@/components/konex-logo";
import { CountryCombobox } from "@/components/country-combobox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, Globe, Smartphone, Search, Lock, CheckCircle2, QrCode, MapPin, Banknote, ShieldCheck, Timer, Mail, FileText } from "lucide-react";
import { SiVisa, SiMastercard, SiApplepay, SiPaypal, SiGooglepay } from "react-icons/si";
import type { Destination } from "@shared/schema";
import { newFeaturedEvents, upcomingEvents } from "@shared/featured-events";
import { TravelImage } from "@/components/travel-image";
import { getDestinationPhoto, getEventPhoto, getTravelPhoto } from "@/lib/travel-imagery";

// The catalogue is the sole source of homepage prices. Missing prices stay absent.
interface HomepageCatalogue {
  destinationCount: number;
  activePlanCount: number;
  popularPrices: Record<string, number>;
  bundlePrices: Record<string, number>;
  updatedAt: string;
}

function useHomepageCatalogue() {
  return useQuery<HomepageCatalogue>({
    queryKey: ["/api/homepage/catalogue"],
    staleTime: 60_000,
  });
}

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const flagStrip = [
  { code: "GB", label: "UK" }, { code: "US", label: "USA" },
  { code: "AE", label: "UAE" }, { code: "NG", label: "Nigeria" },
  { code: "FR", label: "France" }, { code: "DE", label: "Germany" },
  { code: "JP", label: "Japan" }, { code: "SG", label: "Singapore" },
  { code: "ES", label: "Spain" }, { code: "IT", label: "Italy" },
  { code: "TH", label: "Thailand" }, { code: "AU", label: "Australia" },
];

function FlagImg({ code, name, className = "" }: { code: string; name: string; className?: string }) {
  return <img src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`} alt={name} loading="lazy" className={`object-cover ${className}`} />;
}

function TravelSmarterSection() {
  const [, navigate] = useLocation();
  const [heroCode, setHeroCode] = useState("");
  const [heroDays, setHeroDays] = useState<number | null>(null);
  const handleFind = () => {
    const params = new URLSearchParams();
    if (heroDays) params.set("days", String(heroDays));
    if (heroCode && heroCode !== "any") params.set("country", heroCode);
    navigate(params.toString() ? `/find-plan?${params}` : "/find-plan");
  };

  return (
    <section className="konex-inverse travel-photo-surface relative overflow-hidden" data-testid="section-travel-smarter">
      <TravelImage photo={getTravelPhoto("airport")} priority sizes="100vw" className="travel-photo" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20 items-center py-4 sm:py-8">
          <div>
            <p className="text-primary text-xs font-bold uppercase tracking-[0.2em] mb-6">A little planning. A better arrival.</p>
            <h1 className="font-display text-[2.7rem] sm:text-6xl lg:text-7xl font-bold tracking-[-0.055em] leading-[1.04] mb-6" data-testid="text-hero-title">
              <span data-testid="text-travel-smarter-title">Your travel data.<br /><span className="text-primary">Ready before<br className="hidden lg:block" /> you land.</span></span>
            </h1>
            <p className="text-white/85 leading-relaxed text-base sm:text-lg max-w-lg mb-8" data-testid="text-hero-subtitle">
              Choose your destination and trip length, then get your eSIM QR code by email after payment.
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 mb-5" data-testid="trust-bullets">
              {[
                { icon: Mail, text: "Instant QR by email*" },
                { icon: CheckCircle2, text: "No contracts" },
                { icon: Banknote, text: "No roaming fees" },
                { icon: Smartphone, text: "No physical SIM" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-white/90">
                  <Icon aria-hidden className="w-4 h-4 text-primary shrink-0" />{text}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/70 leading-relaxed max-w-md">
              *Typically within minutes. Rare cases can take up to 24 hours. <Link href="/terms" className="underline underline-offset-4">Delivery terms</Link>
            </p>
            <Link href="/find-plan" className="inline-flex items-center gap-2 mt-5 text-sm font-semibold text-primary" data-testid="button-travel-smarter-find">Explore the plan finder<ArrowRight aria-hidden className="w-4 h-4" /></Link>
          </div>
          <div data-testid="section-plan-finder">
          <div className="rounded-3xl border border-border bg-card text-card-foreground [--primary-text:202_90%_30%] dark:[--primary-text:199_93%_72%] shadow-xl p-6 sm:p-8 lg:p-9" data-testid="hero-plan-selector">
            <div className="flex items-center justify-between pb-5 mb-6 border-b">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Your next connection</p>
              <Globe aria-hidden className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-plan-finder-title">Where are you heading?</h2>
            <p className="text-sm text-muted-foreground mb-7">Find data that fits your destination and your stay.</p>
            <label className="block text-sm font-semibold mb-2" id="hero-destination-label">Destination</label>
            <CountryCombobox value={heroCode} onSelect={code => setHeroCode(code ?? "")} placeholder="Search destination…" allowAny className="h-12 w-full text-sm" data-testid="hero-select-destination" />
            <fieldset className="mt-6 mb-7">
              <legend className="text-sm font-semibold mb-3">How long are you away?</legend>
              <div className="flex flex-wrap gap-2" data-testid="hero-duration-buttons">
                {[1, 3, 5, 7, 30].map(d => (
                  <button key={d} type="button" aria-pressed={heroDays === d} onClick={() => setHeroDays(heroDays === d ? null : d)}
                    className={`flex-1 min-w-[52px] rounded-lg border px-2 py-3 text-sm font-semibold ${heroDays === d ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                    data-testid={`hero-duration-${d}`}>{d} {d === 1 ? "day" : "days"}</button>
                ))}
              </div>
            </fieldset>
            <button type="button" onClick={handleFind} className="group flex items-center justify-center gap-2 h-12 rounded-xl w-full bg-primary text-primary-foreground font-bold transition-transform duration-200 active:scale-[0.99]" data-testid="button-hero-find-plan">
              <Search aria-hidden className="w-4 h-4" />Find My Plan<ArrowRight aria-hidden className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </button>
            <div className="mt-5 flex items-center justify-between gap-3 text-xs">
              <Link href="/compatibility" className="text-muted-foreground underline underline-offset-4">Check your device first</Link>
              <Link href="/destinations" className="font-semibold text-primary" data-testid="button-travel-smarter-browse">View Plans <ArrowRight aria-hidden className="inline w-3 h-3" /></Link>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsStrip() {
  const { data, isLoading, isError, refetch, isFetching } = useHomepageCatalogue();
  return (
    <div className="border-b bg-secondary/45" data-testid="section-stats-strip">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6" aria-live="polite">
        {isLoading ? (
          <div role="status" className="flex flex-wrap gap-8 sm:gap-16">
            <span className="text-sm text-muted-foreground">Checking the live catalogue…</span>
            {[1, 2].map(n => <div key={n} aria-hidden className="h-7 w-28 rounded bg-muted motion-safe:animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
            <span>Live catalogue details are temporarily unavailable. You can still browse destinations.</span>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()} data-testid="button-catalogue-retry">{isFetching ? "Trying again…" : "Retry"}</Button>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-10">
            <div className="flex items-baseline gap-3"><strong className="text-2xl font-display tracking-tight">{data.destinationCount.toLocaleString()}</strong><span className="text-sm text-muted-foreground">destinations in the catalogue</span></div>
            <div className="flex items-baseline gap-3 md:border-l md:pl-8"><strong className="text-2xl font-display tracking-tight">{data.activePlanCount.toLocaleString()}</strong><span className="text-sm text-muted-foreground">active data plans</span></div>
            <Link href="/terms" className="md:border-l md:pl-8">
              <strong className="block font-display text-lg">Typically minutes</strong>
              <span className="text-xs text-muted-foreground underline underline-offset-4">QR delivery · rare cases up to 24 hours</span>
            </Link>
          </div>
        ) : <p className="text-sm text-muted-foreground">No catalogue details available yet.</p>}
      </div>
    </div>
  );
}

function NigeriaCampaignCard() {
  const [, navigate] = useLocation();
  return (
    <section className="px-4 sm:px-6 py-6" data-testid="section-nigeria-campaign">
      <div className="max-w-7xl mx-auto">
        <div className="konex-inverse travel-photo-surface rounded-2xl border border-primary/25 cursor-pointer group px-6 py-10 sm:px-10 sm:py-14 flex flex-col md:flex-row md:items-center justify-between gap-5"
          onClick={() => navigate("/nigeria-esim")} data-testid="card-nigeria-campaign" role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/nigeria-esim"); } }}>
          <TravelImage photo={getTravelPhoto("lagos")} className="travel-photo travel-card-photo" />
          <div className="flex items-center gap-4">
            <div><p className="font-bold text-base sm:text-lg">Flying to Nigeria? Get connected before landing.</p>
              <p className="text-white/85 text-sm mt-1">Skip the airport SIM queue. Buy before you fly and follow your QR installation guide.</p></div>
          </div>
          <Button className="font-bold shrink-0" onClick={e => { e.stopPropagation(); navigate("/nigeria-esim"); }} data-testid="button-nigeria-campaign-cta">Get Nigeria eSIM<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Button>
        </div>
      </div>
    </section>
  );
}

function ChinaCampaignCard() {
  const { fromPrice, isLoading, isError, isFetching, refetch } = useChinaPlans();
  return (
    <section className="px-4 sm:px-6 !py-6" data-testid="section-china-campaign">
      <div className="travel-photo-surface max-w-7xl mx-auto rounded-2xl border border-primary/30 px-6 py-10 sm:px-10 sm:py-14 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <TravelImage photo={getTravelPhoto("china")} className="travel-photo" />
        <div className="flex gap-4 items-start">
          <Smartphone aria-hidden className="w-6 h-6 text-primary shrink-0 mt-1" />
          <div>
            <h2 className="font-bold text-base sm:text-lg">Heading to China? Get your eSIM before you fly</h2>
            <p className="text-muted-foreground text-sm mt-1">Check your phone, choose your data, and install on Wi-Fi before departure.</p>
            <div className="text-sm mt-3" aria-live="polite">
              {isLoading ? <span role="status" className="inline-block h-5 w-32 rounded bg-muted motion-safe:animate-pulse"><span className="sr-only">Checking China prices</span></span>
                : isError ? <span className="text-muted-foreground">Live prices unavailable. <button type="button" className="underline underline-offset-4 font-semibold" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Checking…" : "Retry"}</button></span>
                : fromPrice !== undefined ? <span className="font-bold">From <Price amount={fromPrice} /><span className="font-normal text-muted-foreground"> · live quoted plans</span></span>
                : <span className="text-muted-foreground">Check the guide for current plan availability.</span>}
            </div>
          </div>
        </div>
        <Button asChild className="font-bold shrink-0 self-start md:self-auto"><Link href="/china-esim" data-testid="button-china-campaign-cta">China eSIM guide<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
      </div>
    </section>
  );
}

function PopularDestinations() {
  const { data: destinations, isLoading, isError, refetch } = useQuery<Destination[]>({ queryKey: ["/api/destinations"] });
  const { data: catalogue } = useHomepageCatalogue();
  const popular = destinations?.filter(d => d.popular).slice(0, 8) ?? [];
  return (
    <section id="plans" className="border-t scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-9">
          <div><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Popular destinations</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold mb-3">Next stop?<br />Already connected.</h2>
            <p className="text-muted-foreground text-sm">Explore data plans for the places on your itinerary.</p></div>
          <Button asChild variant="outline" className="font-bold self-start"><Link href="/destinations" data-testid="button-popular-browse-all">Browse all destinations<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
        </div>
        {isLoading ? <div role="status"><span className="sr-only">Loading destinations</span><div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">{[1, 2, 3, 4].map(n => <div key={n} className="aspect-[3/4] bg-muted rounded-2xl motion-safe:animate-pulse" />)}</div></div>
          : isError ? <div role="alert" className="p-8 rounded-2xl border bg-card"><p className="mb-4">We couldn't load destinations.</p><Button onClick={() => void refetch()} variant="outline">Try again</Button></div>
          : !popular.length ? <div className="rounded-2xl border bg-card p-8"><Globe aria-hidden className="w-8 h-8 text-primary mb-4" /><h3 className="text-xl font-bold mb-2">Find your own favourite.</h3><p className="text-muted-foreground mb-4">Browse the destination catalogue to plan your connection.</p><Link href="/destinations" className="underline">Explore destinations</Link></div>
          : <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {popular.map(dest => {
              const price = catalogue?.popularPrices?.[dest.id];
              return (
                <Link key={dest.id} href={`/destinations/${dest.countryCode}`} data-testid={`card-popular-dest-${dest.id}`} className="group relative block overflow-hidden rounded-2xl aspect-[3/4] bg-muted">
                  <TravelImage photo={getDestinationPhoto(dest.countryCode, dest.region ?? "")} className="w-full h-full object-cover travel-card-photo" sizes="(max-width: 640px) 50vw, 25vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--inverse))] via-[hsl(var(--inverse)/.15)] to-transparent" />
                  {validPrice(price) && <div className="absolute top-3 right-3 rounded-lg bg-[hsl(var(--inverse)/.85)] text-[hsl(var(--inverse-foreground))] px-3 py-2 text-xs"><span className="block text-[10px] mb-0.5">From</span><strong><Price amount={price} /></strong></div>}
                  <div className="absolute bottom-0 inset-x-0 p-3 sm:p-5 text-[hsl(var(--inverse-foreground))]">
                    {getDestinationPhoto(dest.countryCode, dest.region ?? "").isRegional && <p className="travel-photo-caption mb-2">Regional inspiration · {getDestinationPhoto(dest.countryCode, dest.region ?? "").alt}</p>}
                    <p className="font-bold text-sm sm:text-lg pr-3">{dest.name}</p><p className="text-xs opacity-85 mt-1">{dest.region}</p>
                    <ArrowRight aria-hidden className="absolute bottom-6 right-3 sm:right-5 w-3 h-3 sm:w-4 sm:h-4" />
                  </div>
                </Link>
              );
            })}
          </div>}
      </div>
    </section>
  );
}

export const FESTIVAL_EVENTS: Array<{ id: string; name: string; subtitle: string; location: string; dates: string; countryCode: string; bgFrom: string; bgTo: string; accent: string; photo: string; cta: string; startDate: string; endDate: string; href?: string }> = [
  ...newFeaturedEvents,
  {
    id: "notting-hill-2026",
    startDate: "2026-08-30", endDate: "2026-08-31",
    name: "Notting Hill Carnival",
    subtitle: "Europe's biggest street festival",
    location: "London, United Kingdom",
    dates: "Aug 30 – 31, 2026",
    countryCode: "GB",
    bgFrom: "#2e1065", bgTo: "#5b21b6", accent: "#f0abfc",
    photo: "",
    cta: "Get UK eSIM",
  },
  {
    id: "oktoberfest",
    startDate: "2026-09-19", endDate: "2026-10-04",
    name: "Oktoberfest 2026",
    subtitle: "Six million visitors, 16 days of Bavarian tradition. Munich's legendary celebration returns.",
    location: "Munich, Germany",
    dates: "Sep 19 – Oct 4, 2026",
    countryCode: "DE",
    bgFrom: "#0c1f3c", bgTo: "#1e3a5f", accent: "#60a5fa",
    photo: "",
    cta: "Get Germany eSIM",
  },
  {
    id: "singapore-gp-2026",
    startDate: "2026-10-01", endDate: "2026-10-31",
    name: "Singapore Grand Prix",
    subtitle: "F1 night race under the lights",
    location: "Marina Bay, Singapore",
    dates: "October 2026",
    countryCode: "SG",
    bgFrom: "#2d0a0a", bgTo: "#4a1010", accent: "#f87171",
    photo: "",
    cta: "Get Singapore eSIM",
  },
  {
    id: "canton-fair-2026",
    startDate: "2026-10-15", endDate: "2026-11-04",
    name: "Canton Fair Autumn",
    subtitle: "The world's largest trade fair",
    location: "Guangzhou, China",
    dates: "Oct 15 – Nov 4, 2026",
    countryCode: "CN",
    bgFrom: "#450a0a", bgTo: "#7f1d1d", accent: "#fbbf24",
    photo: "",
    cta: "Get China eSIM",
  },
  {
    id: "art-basel-2026",
    startDate: "2026-12-01", endDate: "2026-12-31",
    name: "Art Basel Miami Beach",
    subtitle: "The world's premier art fair",
    location: "Miami Beach, USA",
    dates: "December 2026",
    countryCode: "US",
    bgFrom: "#083344", bgTo: "#155e75", accent: "#f472b6",
    photo: "",
    cta: "Get USA eSIM",
  },
  {
    id: "dsf-2026",
    startDate: "2026-12-01", endDate: "2027-01-31",
    name: "Dubai Shopping Festival",
    subtitle: "A month of shopping, shows & fireworks",
    location: "Dubai, UAE",
    dates: "Dec 2026 – Jan 2027",
    countryCode: "AE",
    bgFrom: "#1c1917", bgTo: "#44403c", accent: "#facc15",
    photo: "",
    cta: "Get UAE eSIM",
  },
];

function EventsCarousel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const events = upcomingEvents(FESTIVAL_EVENTS, now, 8);
  if (!events.length) return null;
  // Reset the active index only when the visible event set changes.
  return <EventsSlides key={events.map(event => event.id).join(",")} events={events} />;
}

function EventsSlides({ events }: { events: typeof FESTIVAL_EVENTS }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => setActive(n => (n + 1) % events.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, events.length]);
  useEffect(() => () => { if (resumeRef.current) clearTimeout(resumeRef.current); }, []);
  const ev = events[active];
  return (
    <section className="konex-inverse relative overflow-hidden" data-testid="section-events-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-label="Travel for an event">
      {events.map((event, i) => (
        <div key={event.id} aria-hidden className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${i === active ? "opacity-100 z-10" : "opacity-0 z-0"}`} style={{ background: "hsl(var(--inverse))" }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${event.bgFrom}, ${event.bgTo})` }} />
          <TravelImage photo={getEventPhoto(event)} className="absolute inset-0 w-full h-full object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[hsl(var(--inverse)/.78)]" />
        </div>
      ))}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] gap-10 lg:gap-20 items-center">
          <div>
            <p className="text-xs text-primary font-bold uppercase tracking-widest mb-5">Worth the journey</p>
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight mb-5">Big plans.<br />One less thing<br className="hidden md:block" /> to organise.</h2>
            <p className="text-white/85 text-sm leading-relaxed max-w-sm">Heading to a festival, a race or a trade fair? Arrange your travel data before the trip begins.</p>
            <Link href="/events" className="inline-flex items-center gap-2 text-sm text-primary font-semibold mt-6">Explore events<ArrowRight aria-hidden className="w-4 h-4" /></Link>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/[.04] p-6 sm:p-9">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/20 mb-7">
              {events.map((event, i) => <div key={event.id} aria-hidden={i !== active} className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 motion-reduce:transition-none ${i === active ? "opacity-100" : "opacity-0"}`} style={{ background: `linear-gradient(135deg, ${event.bgFrom}, ${event.bgTo})`, borderBottom: `3px solid ${event.accent}` }}>
                <span className="absolute bottom-12 left-4 right-4 z-10 text-white font-bold drop-shadow-md">{event.name}</span>
                <TravelImage photo={getEventPhoto(event)} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-4 right-4 travel-photo-caption">{getEventPhoto(event).isRegional ? "Regional inspiration" : "Destination inspiration"} · {getEventPhoto(event).alt}</span>
              </div>)}
            </div>
            <div className="flex justify-between items-center mb-7"><span className="text-xs font-semibold uppercase tracking-widest text-white">Upcoming event</span><span className="text-xs text-white/85">{ev.countryCode}</span></div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-3" data-testid="text-event-title">{ev.name}</h3>
            <p className="text-white/85 text-sm leading-relaxed mb-6">{ev.subtitle}</p>
            <div className="flex flex-wrap gap-4 text-xs text-white/90 mb-7">
              <span className="flex items-center gap-2"><MapPin aria-hidden className="w-4 h-4 text-primary" />{ev.location}</span>
              <span className="flex items-center gap-2"><Timer aria-hidden className="w-4 h-4 text-primary" />{ev.dates}</span>
            </div>
            <Button onClick={() => navigate(ev.href ?? `/destinations/${ev.countryCode}`)} className="font-bold bg-white/10 text-white border-white/50 border hover:bg-white/20" data-testid={`button-event-cta-${ev.id}`}>{ev.cta}<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Button>
            <p className="text-xs text-white/70 mt-4">QR by email · No physical SIM needed</p>
          </div>
        </div>
        <div className="flex items-center justify-center md:justify-end gap-3 pt-8">
          {events.map((event, i) => <button key={event.id} type="button" onClick={() => { setActive(i); setPaused(true); if (resumeRef.current) clearTimeout(resumeRef.current); resumeRef.current = setTimeout(() => setPaused(false), 8000); }}
            className="p-2" data-testid={`dot-event-${i}`} aria-label={event.name} aria-current={i === active ? "true" : undefined}><span className={`block h-2 rounded-full ${i === active ? "w-6 bg-primary" : "w-2 bg-white/35"}`} /></button>)}
          <span className="text-xs text-white/70 ml-2">{active + 1} / {events.length}</span>
        </div>
      </div>
    </section>
  );
}

function AlternativesSection() {
  const rows = [
    ["Setup", "Buy online, install with a QR code", "Automatic on arrival", "Find a shop"],
    ["Contract", "None", "Tied to your home plan", "None"],
    ["Roaming fees", "None", "Often charged; varies by carrier", "None"],
    ["Physical SIM", "Not needed", "Your existing SIM", "Required"],
    ["Your main number", "Stays active alongside your eSIM", "Unchanged", "Often swapped out"],
    ["Price", "Fixed, shown at checkout", "Varies by carrier", "Varies by seller"],
  ];
  return (
    <section className="border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mb-9"><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Know your options</p><h2 className="text-4xl sm:text-5xl font-bold mb-4">Konex vs the alternatives.</h2><p className="text-sm text-muted-foreground leading-relaxed">Choose how you connect, without the guesswork.</p></div>
        <p id="comparison-scroll-help" className="md:hidden text-xs text-muted-foreground mb-3">Scroll horizontally to compare all options.</p>
        <div className="overflow-x-auto rounded-2xl border focus-visible:outline-offset-4" tabIndex={0} role="region" aria-label="Travel SIM options comparison" aria-describedby="comparison-note">
          <table className="w-full min-w-[720px] text-left text-sm border-collapse">
            <caption className="sr-only">Compare Konex eSIM, carrier roaming and airport or physical travel SIMs</caption>
            <thead><tr className="bg-muted/60"><th scope="col" className="p-5 font-medium text-muted-foreground w-[18%]">The essentials</th><th scope="col" className="p-5 bg-primary/15 text-primary font-bold w-[29%]">Konex eSIM</th><th scope="col" className="p-5 font-semibold w-[25%]">Carrier roaming</th><th scope="col" className="p-5 font-semibold">Airport or physical travel SIM</th></tr></thead>
            <tbody>{rows.map(([label, ...cells]) => <tr key={label} className="border-t"><th scope="row" className="p-5 font-semibold bg-card">{label}</th>{cells.map((cell, i) => <td key={i} className={`p-5 leading-relaxed ${i === 0 ? "bg-primary/[.07] font-medium" : "bg-card text-muted-foreground"}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-5 mt-5">
          <p id="comparison-note" className="text-xs leading-relaxed text-muted-foreground max-w-2xl">General descriptions only; terms, availability and fees vary by provider and device. Your phone must support eSIM and be carrier-unlocked. Home-carrier charges for calls and texts may still apply.</p>
          <Button asChild className="self-start font-bold shrink-0"><Link href="/find-plan">Find a plan<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
        </div>
      </div>
    </section>
  );
}

const bundles = [
  { id: "europe", title: "Europe Pack", label: "Regional travel", icon: Globe, description: "Taking the scenic route? Explore regional plans and check the included destinations before you buy.", href: "/destinations/EUROPE" },
  { id: "nigeria-arrival", title: "Nigeria Arrival eSIM", label: "Before you fly", icon: QrCode, description: "Arrange your Nigeria data before departure, with digital installation instead of an airport SIM queue.", href: "/nigeria-esim" },
  { id: "nigeria", title: "UK ↔ Nigeria Frequent Traveller", label: "A familiar journey", icon: Smartphone, description: "Going back and forth? Explore the available Nigeria plans and choose the right fit for your next visit.", href: "/nigeria-esim" },
  { id: "global", title: "Global Traveller Pack", label: "Further afield", icon: MapPin, description: "Build a connection into your multi-stop itinerary. Check each plan's destinations, data and validity.", href: "/destinations" },
];

function BundlesSection() {
  const { data } = useHomepageCatalogue();
  return (
    <section className="border-t bg-secondary/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-xl mb-9"><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Travel bundles</p><h2 className="text-4xl sm:text-5xl font-bold mb-4" data-testid="text-bundles-title">Built around<br />your route.</h2><p className="text-sm text-muted-foreground">Start with your journey. Check the plan details before checkout.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {bundles.map((bundle, index) => {
            const price = data?.bundlePrices?.[bundle.id];
            return <article key={bundle.id} className={`rounded-2xl border flex flex-col p-6 ${index === 0 ? "border-primary/40 bg-primary/10" : "bg-card"}`} data-testid={`card-bundle-${bundle.id}`}>
              <bundle.icon aria-hidden className="w-7 h-7 text-primary mb-7" /><p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-3">{bundle.label}</p>
              <h3 className="text-xl font-bold leading-tight mb-4">{bundle.title}</h3><p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">{bundle.description}</p>
              {validPrice(price) && <p className="font-bold text-lg mb-4">From <Price amount={price} /></p>}
              <Button asChild variant="outline" className="font-semibold w-full"><Link href={bundle.href} data-testid={`button-bundle-${bundle.id}`}>View Bundle<ArrowRight aria-hidden className="ml-auto w-4 h-4" /></Link></Button>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Smartphone, title: "Check compatibility", description: "Confirm your phone supports eSIM and is carrier-unlocked.", href: "/compatibility", link: "Check your device" },
    { icon: Globe, title: "Choose your plan", description: "Match your destination, trip length and data needs. Review the plan details.", href: "/find-plan", link: "Find a plan" },
    { icon: Mail, title: "Get your QR code", description: "Your QR is emailed after payment, typically within minutes. Rare cases take up to 24 hours.", href: "/terms", link: "Delivery terms" },
    { icon: QrCode, title: "Scan and connect", description: "Follow your emailed installation guide. Set Konex as your data line when you're ready to use it.", href: "/orders", link: "Find your eSIM" },
  ];
  return (
    <section id="how-it-works" className="border-t scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-2 gap-8 items-center mb-10"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">How it works</p><h2 className="text-4xl sm:text-5xl font-bold mb-4" data-testid="text-how-it-works-title">A few steps now.<br />An easier arrival.</h2><p className="text-sm text-muted-foreground">No store visit. No physical SIM. Just a little pre-trip preparation.</p></div><figure><TravelImage photo={getTravelPhoto("airport")} className="w-full h-64 object-cover rounded-2xl" /><figcaption className="text-xs text-muted-foreground mt-2">{getTravelPhoto("airport").alt}</figcaption></figure></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, i) => <article key={step.title} className="border rounded-2xl p-6 bg-card flex flex-col" data-testid={`card-step-${i + 1}`}>
            <div className="flex justify-between items-center mb-8"><step.icon aria-hidden className="w-7 h-7 text-primary" /><span className="font-mono text-sm text-muted-foreground">0{i + 1}</span></div>
            <h3 className="text-lg font-bold mb-3" data-testid={`text-step-title-${i + 1}`}>{step.title}</h3><p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">{step.description}</p>
            <Link href={step.href} className="text-sm font-semibold text-primary inline-flex gap-2 items-center">{step.link}<ArrowRight aria-hidden className="w-3 h-3" /></Link>
          </article>)}
        </div>
      </div>
    </section>
  );
}

function CompatibilitySection() {
  const devices = [
    "eSIM-enabled iPhone models, including supported iPhone XS and newer models",
    "Supported Samsung Galaxy devices",
    "Supported Google Pixel devices",
    "Selected OnePlus, Motorola and Xiaomi devices",
  ];
  return (
    <section className="border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20 items-center">
        <div><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Compatibility</p><h2 className="text-4xl sm:text-5xl font-bold mb-5" data-testid="text-compat-title">Your phone.<br />Ready to travel?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">Konex works with supported eSIM-enabled iPhone and Android devices. Compatibility can vary by model and country of purchase, and your device must be carrier-unlocked.</p>
          <ul className="space-y-4 mb-7">{devices.map((device, i) => <li key={device} className="flex items-start gap-3 text-sm" data-testid={`compat-device-${i}`}><CheckCircle2 aria-hidden className="w-4 h-4 text-primary shrink-0 mt-0.5" />{device}</li>)}</ul>
          <Button asChild className="font-bold"><Link href="/compatibility" data-testid="button-check-compat">Check your device<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Link></Button>
        </div>
        <div className="rounded-3xl bg-secondary/50 border p-8 sm:p-12">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/15 border border-primary/25 mb-8"><Smartphone aria-hidden className="w-10 h-10 text-primary" /></div>
          <h3 className="text-2xl font-bold mb-4">Check before you check out.</h3><p className="text-sm text-muted-foreground leading-relaxed mb-7">Our device checker lists supported models and helps you know what to look for in your phone's settings.</p>
          <Button asChild variant="outline" className="font-semibold"><Link href="/compatibility" data-testid="button-device-checker-cta">Open Device Checker<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Link></Button>
        </div>
      </div>
    </section>
  );
}

function ConfidenceRow() {
  return (
    <section className="border-t" aria-labelledby="confidence-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <h2 id="confidence-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-9">Why customers can book with confidence</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-7">
        <div className="flex gap-3" data-testid="trust-badge-secure-checkout"><Lock aria-hidden className="w-5 h-5 text-primary shrink-0" /><div><h3 className="font-bold text-sm">Secure checkout</h3><p className="text-xs text-muted-foreground mt-2">Review your plan before payment.</p></div></div>
        <div className="flex gap-3" data-testid="trust-badge-instant-delivery"><Mail aria-hidden className="w-5 h-5 text-primary shrink-0" /><div><h3 className="font-bold text-sm">QR emailed after payment</h3><p className="text-xs text-muted-foreground mt-2">Installation details in your inbox.</p></div></div>
        <div className="flex gap-3"><ShieldCheck aria-hidden className="w-5 h-5 text-primary shrink-0" /><div><h3 className="font-bold text-sm">Need a hand?</h3><a href="mailto:support@konexesim.com" className="block text-xs text-primary underline underline-offset-4 mt-2 break-all">support@konexesim.com</a></div></div>
        <div className="flex gap-3"><FileText aria-hidden className="w-5 h-5 text-primary shrink-0" /><div><h3 className="font-bold text-sm">Clear refund terms</h3><Link href="/refund-policy" className="block text-xs text-primary underline underline-offset-4 mt-2">Read our refund policy</Link></div></div>
      </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    { question: "What is an eSIM?", answer: "An eSIM is a digital SIM built into a compatible phone. Instead of inserting a physical card, you install a data plan using the QR code and instructions we email you." },
    { question: "How quickly do I receive my eSIM?", answer: "Your QR code is emailed after payment, typically within minutes. In rare cases delivery can take up to 24 hours. Check our terms for delivery details and contact support if you need help." },
    { question: "Can I keep my regular number?", answer: "On a supported dual-SIM device, your main number can stay active alongside your Konex eSIM. Select Konex for mobile data. Your home carrier may still charge for calls, texts or roaming on your main line, so check your settings and home plan." },
    { question: "Does Konex work on iPhone and Android?", answer: "Konex works with supported eSIM-enabled iPhone and Android models. Availability varies by model and country of purchase. Your phone must be carrier-unlocked. Use our compatibility checker before buying." },
    { question: "What happens if I run out of data?", answer: "Browse the available plans for your destination and purchase more data if you need it. Check the plan details and installation instructions: a new purchase may require a new eSIM installation." },
    { question: "Can I use Konex in multiple countries?", answer: "Regional and global plans may cover multiple destinations. Coverage depends on the individual plan, so check its included destinations, data allowance and validity before checkout." },
  ];
  return (
    <section id="faq" className="border-t scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20">
        <div><p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">FAQ</p><h2 className="text-4xl sm:text-5xl font-bold mb-6" data-testid="text-faq-title">Good questions.<br />Straight answers.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-7">A few things worth knowing before you buy. For anything else, email <a href="mailto:support@konexesim.com" className="text-primary underline underline-offset-4">support@konexesim.com</a>.</p>
          <Button asChild className="font-bold"><Link href="/destinations" data-testid="button-faq-cta">Browse Plans<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Link></Button>
        </div>
        <Accordion type="single" collapsible>{faqs.map((faq, i) => <AccordionItem key={faq.question} value={`faq-${i}`}><AccordionTrigger className="text-left font-semibold py-5 hover:no-underline" data-testid={`button-faq-${i}`}>{faq.question}</AccordionTrigger><AccordionContent><p className="text-sm text-muted-foreground leading-relaxed pb-2">{faq.answer}</p></AccordionContent></AccordionItem>)}</Accordion>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="konex-inverse relative overflow-hidden border-t">
      <TravelImage photo={getTravelPhoto("airport")} className="absolute inset-0 w-full h-full object-cover opacity-40" sizes="100vw" />
      <div className="absolute inset-0 bg-[hsl(var(--inverse)/.65)]" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-5">One less thing on arrival</p>
        <h2 className="text-4xl sm:text-6xl font-bold leading-[1.06] mb-6" data-testid="text-final-cta-title">Get travel data<br />before you land.</h2>
        <p className="text-white/85 max-w-lg mx-auto text-base leading-relaxed mb-8" data-testid="text-final-cta-subtitle">The maps, the messages, the journey ahead. Find the right data plan before you set off.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="font-bold"><Link href="/destinations" data-testid="button-final-get-started">Get eSIM Now<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
          <Button asChild size="lg" variant="outline" className="font-bold bg-transparent text-inherit border-white/40 hover:bg-white/10 hover:text-inherit"><Link href="/destinations" data-testid="button-final-browse-plans">View Plans</Link></Button>
        </div>
        <p className="text-xs text-white/85 mt-7" data-testid="text-final-microcopy">QR by email · No roaming fees · No contracts</p>
      </div>
    </section>
  );
}

function Footer() {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const linkClass = "text-sm text-muted-foreground hover:text-foreground";
  return (
    <footer className="border-t bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-9 mb-12">
          <div><div className="mb-4" data-testid="text-footer-brand"><KonexLogo size="md" /></div><p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]" data-testid="text-footer-tagline">Travel data, arranged before arrival.</p></div>
          <div><h3 className="text-xs uppercase tracking-widest font-bold mb-5">Product</h3><ul className="space-y-3">
            <li><button className={linkClass} onClick={() => scrollTo("plans")} data-testid="footer-link-plans">Plans</button></li>
            <li><button className={linkClass} onClick={() => scrollTo("how-it-works")} data-testid="footer-link-how">How It Works</button></li>
            <li><Link href="/compatibility" className={linkClass} data-testid="footer-link-compat">Compatibility</Link></li>
            <li><Link href="/orders" className={linkClass} data-testid="footer-link-my-esims">My eSIMs</Link></li>
          </ul></div>
          <div><h3 className="text-xs uppercase tracking-widest font-bold mb-5">Support</h3><ul className="space-y-3">
            <li><button className={linkClass} onClick={() => scrollTo("faq")} data-testid="footer-link-faq">FAQ</button></li>
            <li><a href="mailto:support@konexesim.com" className={`${linkClass} break-all`} data-testid="footer-link-contact">support@konexesim.com</a></li>
          </ul></div>
          <div><h3 className="text-xs uppercase tracking-widest font-bold mb-5">Legal</h3><ul className="space-y-3">
            <li><Link href="/privacy" className={linkClass} data-testid="text-footer-privacy">Privacy Policy</Link></li>
            <li><Link href="/terms" className={linkClass} data-testid="text-footer-terms">Terms of Service</Link></li>
            <li><Link href="/refund-policy" className={linkClass} data-testid="text-footer-refund">Refund Policy</Link></li>
          </ul></div>
        </div>
        <div className="border-t py-7 flex flex-wrap gap-x-5 gap-y-4">
          {flagStrip.map(item => <Link key={item.code} href={`/destinations/${item.code}`} className="flex items-center gap-2 hover:opacity-75" data-testid={`flag-strip-${item.code.toLowerCase()}`}><FlagImg code={item.code} name={item.label} className="w-5 h-3.5 rounded-sm" /><span className="text-xs text-muted-foreground">{item.label}</span></Link>)}
        </div>
        <div className="border-t py-6 flex flex-wrap justify-between gap-5">
          <a href="mailto:support@konexesim.com" className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="trust-bar-support"><ShieldCheck aria-hidden className="w-4 h-4" />Email support</a>
          <div className="flex items-center gap-4 text-muted-foreground" data-testid="payment-icons">
            <SiVisa className="h-4 w-auto" title="Visa" data-testid="payment-icon-visa" /><SiMastercard className="h-4 w-auto" title="Mastercard" data-testid="payment-icon-mc" />
            <SiApplepay className="h-5 w-auto" title="Apple Pay" data-testid="payment-icon-apple-pay" /><SiGooglepay className="h-5 w-auto" title="Google Pay" data-testid="payment-icon-google-pay" /><SiPaypal className="h-4 w-auto" title="PayPal" data-testid="payment-icon-paypal" />
          </div>
        </div>
        <p className="border-t pt-7 text-xs text-muted-foreground" data-testid="text-footer-copyright">&copy; {new Date().getFullYear()} Konex. All rights reserved.</p>
      </div>
    </footer>
  );
}

function MobileStickyCTA() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden bg-background/95 backdrop-blur-md border-t px-3 pt-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))]" data-testid="mobile-sticky-cta">
      <div className="flex gap-2">
        <Button asChild className="flex-1 font-bold text-sm"><Link href="/destinations" data-testid="button-mobile-sticky-esim">Get eSIM Now<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
        <Button asChild variant="outline" className="flex-1 font-bold text-sm"><Link href="/destinations" data-testid="button-mobile-sticky-plans">View Plans</Link></Button>
      </div>
    </div>
  );
}

export default function Home() {
  useEffect(() => { document.title = "Konex eSIM – Travel Data Before You Land"; }, []);
  return (
    <div className="konex-home min-h-[100dvh] pb-24 sm:pb-0">
      <TravelSmarterSection />
      <StatsStrip />
      <NigeriaCampaignCard />
      <ChinaCampaignCard />
      <PopularDestinations />
      <EventsCarousel />
      <AlternativesSection />
      <BundlesSection />
      <HowItWorks />
      <CompatibilitySection />
      <ConfidenceRow />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <MobileStickyCTA />
    </div>
  );
}
