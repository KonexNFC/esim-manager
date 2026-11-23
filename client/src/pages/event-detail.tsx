import { useEffect } from "react";
import { TravelImage } from "@/components/travel-image";
import { getEventPhoto } from "@/lib/travel-imagery";
import { Link, useParams } from "wouter";
import { ArrowRight, MapPin, Calendar, Plane, Wifi, Smartphone, Globe, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getEventBySlug, CATEGORY_LABELS, type TravelEvent } from "@/data/events";

// ─── Flag ─────────────────────────────────────────────────────────────────────
function Flag({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "w-8 h-5" : size === "sm" ? "w-4 h-2.5" : "w-6 h-4";
  return (
    <img
      src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`}
      alt={code}
      className={`${dims} rounded-[3px] object-cover flex-shrink-0 shadow-sm`}
      loading="lazy"
    />
  );
}

// ─── Duration card ────────────────────────────────────────────────────────────
function DurationCard({
  days,
  event,
  recommended,
}: {
  days: number;
  event: TravelEvent;
  recommended: boolean;
}) {
  const destPath = event.ctaPath ?? (event.countryDestId
    ? `/destinations/${event.countryDestId}`
    : event.countryPlanSlug
    ? `/destinations?country=${event.countryPlanSlug}`
    : "/destinations");

  return (
    <Link href={destPath}>
      <div
        className={`group relative rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${
           recommended ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-primary/3"
        }`}
        data-testid={`card-duration-${days}`}
      >
        {recommended && (
          <span className="absolute -top-2 left-3 text-xs font-bold bg-primary text-white px-2 py-0.5 rounded-full">
            Recommended
          </span>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{days} day{days !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {days <= 3 ? "Short visit" : days <= 7 ? "Full trip" : "Extended stay"}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-primary opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}

// ─── Category colour ──────────────────────────────────────────────────────────

// ─── Why You Need Data section ────────────────────────────────────────────────
const WHY_BULLETS: Record<string, string[]> = {
  "trade-fairs": [
    "Live supplier messaging via WhatsApp & WeChat",
    "Real-time product research and price comparison",
    "Navigation across large multi-hall exhibition venues",
    "Business email, video calls, and document sharing",
    "Booking transport, hotels, and restaurants on the go",
  ],
  "festivals": [
    "Navigation and finding your group in large crowds",
    "Ordering Uber, Lyft, Grab, or local ride-hailing",
    "Sharing moments live on Instagram, TikTok, WhatsApp",
    "Cashless wristband top-ups and payments",
    "Stage schedules, set times, and festival apps",
  ],
  "sports": [
    "Live match scores, race data, and sports apps",
    "Navigation to the venue and back to your hotel",
    "Ordering Uber / Careem from the stadium after the event",
    "Sharing highlights live on social media",
    "Restaurant and hospitality bookings near the venue",
  ],
  "fashion-culture": [
    "Show schedules, venue maps, and invite management",
    "Real-time social media coverage and content uploads",
    "Booking cars between venues and showrooms",
    "Brand research and industry news on the go",
    "Networking apps and messaging with colleagues",
  ],
  "luxury": [
    "Concierge and private car bookings",
    "Fine dining reservations at top restaurants",
    "Real-time event and programme updates",
    "Networking apps and secure communications",
    "Sharing curated moments from exclusive venues",
  ],
  "business": [
    "Business email, calendar, and video conferencing",
    "Real-time navigation and local transport",
    "Supplier and client communications via WhatsApp",
    "Document sharing and cloud access",
    "Airport and hotel connectivity on arrival",
  ],
};

// ─── Not Found ────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <Globe aria-hidden className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Event not found</h1>
        <p className="text-muted-foreground mb-6">
          We couldn't find that event. Browse all global events below.
        </p>
        <Link href="/events">
          <Button>Browse All Events</Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EventDetail() {
  const params = useParams<{ slug: string }>();
  const event = getEventBySlug(params.slug);

  useEffect(() => {
    if (event) {
      document.title = event.seoTitle;
      // Update meta description
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = event.seoDescription;
    } else {
      document.title = "Event Not Found | KONEX eSIM";
    }
    return () => {
      document.title = "KONEX eSIM";
    };
  }, [event]);

  if (!event) return <NotFound />;

  const destPath = event.ctaPath ?? (event.countryDestId
    ? `/destinations/${event.countryDestId}`
    : `/destinations`);

  const whyBullets =
    WHY_BULLETS[event.category] ?? WHY_BULLETS["business"];

  const midDuration =
    event.recommendedDurations[Math.floor(event.recommendedDurations.length / 2)];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* ── Breadcrumb ── */}
      <div className="bg-muted/40 border-b">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/events" className="hover:text-foreground transition-colors">Events</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{event.name}</span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="travel-photo-surface">
        <TravelImage photo={getEventPhoto(event)} priority className="travel-photo" sizes="100vw" />
        <div className="max-w-5xl mx-auto px-4 py-14 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20">
              {CATEGORY_LABELS[event.category]}
            </Badge>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight" data-testid="heading-event-name">
            {event.name}
          </h1>

          <div className="flex flex-wrap gap-4 text-white/80 text-sm mb-8">
            <div className="flex items-center gap-1.5">
              <MapPin aria-hidden className="w-4 h-4" />
              <span>{event.city}, {event.country}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{event.month}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>
                {event.recommendedDurations.length ? `${event.recommendedDurations[0]}–${event.recommendedDurations[event.recommendedDurations.length - 1]} day plans available` : "Check available destination plans"}
              </span>
            </div>
          </div>

          <p className="text-white/85 text-lg leading-relaxed max-w-2xl mb-8">
            {event.description}
          </p>

          {/* Primary CTA */}
          <Link href={destPath}>
            <Button
              size="lg"
              className="bg-slate-950/30 border border-white/60 text-white hover:bg-slate-950/50 font-bold rounded-xl px-6"
              data-testid="button-hero-get-esim"
            >
              Activate your eSIM before you arrive
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <p className="travel-photo-caption mt-7">{getEventPhoto(event).isRegional ? "Regional inspiration" : "Destination inspiration"} · {getEventPhoto(event).alt}</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main content ── */}
          <div className="lg:col-span-2 space-y-10">

            {/* Why you need data */}
            <section data-testid="section-why-data">
              <h2 className="text-xl font-bold mb-3">
                Why you need mobile data at {event.name}
              </h2>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                {event.whyNeedData}
              </p>
              <ul className="space-y-2.5">
                {whyBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Wifi className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            <Separator />

            {/* Best eSIM section */}
            <section data-testid="section-best-esim">
              <h2 className="text-xl font-bold mb-3">
                Best eSIM for {event.name}
              </h2>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                KONEX eSIM gives you instant, reliable data for {event.country}. No SIM swaps,
                no airport queues — activate before you board and be connected the moment you land.
              </p>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-2.5">
                {[
                  { icon: Smartphone, text: "Works on iPhone (iOS 12.1+) and most Android phones" },
                  { icon: Wifi, text: "Connect to premium local networks in " + event.country },
                  { icon: Globe, text: "Activate remotely — no need to be in the country first" },
                  { icon: Clock, text: "Data validity starts when you first use it, not when you install" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* How to activate */}
            <section data-testid="section-how-to-activate">
              <h2 className="text-xl font-bold mb-4">How to activate before arrival</h2>
              <div className="space-y-4">
                {[
                  {
                    step: "1",
                    title: "Choose your plan",
                    desc: `Choose an available plan for ${event.country} based on how long you're travelling.`,
                  },
                  {
                    step: "2",
                    title: "Pay and get your QR code instantly",
                    desc: "Pay by card or PayPal. Your eSIM QR code is emailed to you within seconds.",
                  },
                  {
                    step: "3",
                    title: "Install on your phone before you fly",
                    desc: "Scan the QR code in your phone's Settings. The eSIM installs in under a minute.",
                  },
                  {
                    step: "4",
                    title: "Arrive connected",
                    desc: `Your data activates the moment you land in ${event.city}. No roaming charges. No surprises.`,
                  },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {step}
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-0.5">{title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Airport info */}
            {event.airportHint && (
              <>
                <Separator />
                <section data-testid="section-arrival">
                  <h2 className="text-xl font-bold mb-3">Nearest airport</h2>
                  <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-xl">
                    <Plane className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm mb-0.5">Arriving via</p>
                      <p className="text-sm text-muted-foreground">{event.airportHint}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Install your Konex eSIM before departure so you're connected from the moment you land.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-6">

            {/* Recommended plans card */}
            <Card className="p-5">
              <h3 className="font-bold text-base mb-1">Recommended travel data plans</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Select the duration that matches your trip to {event.name}:
              </p>
              <div className="space-y-2.5">
                {event.recommendedDurations.map(d => (
                  <DurationCard
                    key={d}
                    days={d}
                    event={event}
                    recommended={d === midDuration}
                  />
                ))}
              </div>
              <Separator className="my-4" />
              <Link href={destPath}>
                <Button className="w-full font-bold" data-testid="button-sidebar-all-plans">
                  View all {event.country} plans
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </Card>

            {/* Country link */}
            <Card className="p-5 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Flag code={event.countryCode} size="lg" />
                <div>
                  <p className="font-semibold text-sm">{event.country} eSIM</p>
                  <p className="text-xs text-muted-foreground">All available plans</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Browse all KONEX data plans for {event.country} — including short and long-term options.
              </p>
              <Link href={destPath}>
                <Button variant="outline" className="w-full border-primary/30" data-testid="button-sidebar-country">
                  {event.country} Plans →
                </Button>
              </Link>
            </Card>

            {/* Quick facts */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3">Quick facts</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Location", value: `${event.city}, ${event.country}`, icon: MapPin },
                  { label: "Typical timing", value: event.month, icon: Calendar },
                  {
                    label: "Best for",
                    value: event.travellerType.map(t =>
                      t.charAt(0).toUpperCase() + t.slice(1)
                    ).join(", "),
                    icon: Globe,
                  },
                  {
                    label: "Suggested plans",
                    value: event.recommendedDurations.map(d => `${d}d`).join(", ") || "See destination plans",
                    icon: Clock,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-start gap-2.5">
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium text-xs mt-0.5">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white mt-8">
        <div className="max-w-5xl mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            Ready for {event.name}?
          </h2>
          <p className="text-white/80 mb-6 max-w-md mx-auto">
            Activate your {event.country} eSIM now and arrive connected. Takes less than 2 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={destPath}>
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 font-bold rounded-xl"
                data-testid="button-bottom-get-esim"
              >
                Get {event.country} eSIM
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/events">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 rounded-xl"
                data-testid="button-bottom-browse-events"
              >
                Browse all events
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
