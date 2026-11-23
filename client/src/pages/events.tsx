import { useState, useMemo, useEffect } from "react";
import { TravelImage } from "@/components/travel-image";
import { getEventPhoto, getTravelPhoto } from "@/lib/travel-imagery";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Calendar, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import events, {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  MONTHS,
  isEventUpcoming,
  type EventCategory,
  type TravellerType,
} from "@/data/events";

// ─── Category chip ────────────────────────────────────────────────────────────
function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5"
      }`}
      data-testid={`chip-category-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {label}
    </button>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ event }: { event: (typeof events)[number] }) {
  const categoryLabel = CATEGORY_LABELS[event.category];
  const photo = getEventPhoto(event);

  return (
    <Link href={`/events/${event.slug}`} data-testid={`card-event-${event.slug}`} className="group travel-photo-surface travel-event-card flex flex-col p-6 sm:p-7">
      <TravelImage photo={photo} className="travel-photo travel-card-photo" sizes="(max-width: 768px) 100vw, 33vw" />
      <Badge variant="outline" className="self-start border-white/40 text-white bg-slate-950/30 mb-20">{categoryLabel}</Badge>
      <div className="mt-auto">
        <div className="flex items-center gap-2 text-xs text-white mb-3"><Calendar className="w-4 h-4" />{event.month}</div>
        <h3 className="font-bold text-2xl leading-tight mb-3" data-testid={`text-event-name-${event.slug}`}>{event.name}</h3>
        <p className="flex items-center gap-2 text-white/90 text-sm mb-3"><MapPin className="w-4 h-4 shrink-0" />{event.city}, {event.country}</p>
        <p className="text-white/85 text-sm line-clamp-2 leading-relaxed mb-4">{event.description}</p>
        <div className="flex flex-wrap gap-2 mb-5">{event.recommendedDurations.slice(0, 3).map(d => <span key={d} className="rounded-full border border-white/30 px-2 py-1 text-xs text-white">{d} day{d !== 1 ? "s" : ""}</span>)}</div>
        <div className="flex items-center justify-between text-sm font-bold text-white border-t border-white/25 pt-4">Get eSIM for this trip<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></div>
        <p className="travel-photo-caption mt-4">{photo.isRegional ? "Regional inspiration" : "Destination inspiration"} · {photo.alt}</p>
      </div>
    </Link>
  );
}

// ─── TRAVELLER TYPE LABELS ─────────────────────────────────────────────────────
const TRAVELLER_LABELS: Record<TravellerType, string> = {
  business: "Business",
  tourist: "Tourist",
  festival: "Festival",
  luxury: "Luxury",
  sports: "Sports",
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const [location] = useLocation();
  useEffect(() => {
    document.title = "Global Travel Events | KONEX eSIM";
  }, []);

  // Parse ?category= from URL
  const urlParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : location.split("?")[1] || ""
  );
  const initialCategory = (urlParams.get("category") as EventCategory) || null;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<EventCategory | null>(initialCategory);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [activeTraveller, setActiveTraveller] = useState<TravellerType | null>(null);

  const [chinaOnly, setChinaOnly] = useState(false);
  const filtered = useMemo(() => {
    let result = events.filter(e => isEventUpcoming(e));
    if (chinaOnly) result = result.filter(e => e.countryCode === "CN");

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        e =>
          e.name.toLowerCase().includes(q) ||
          e.city.toLowerCase().includes(q) ||
          e.country.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    if (activeCategory) {
      result = result.filter(e => e.category === activeCategory);
    }

    if (activeMonth !== null) {
      result = result.filter(e => e.monthIndex.includes(activeMonth));
    }

    if (activeTraveller) {
      result = result.filter(e => e.travellerType.includes(activeTraveller));
    }

    return result.sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  }, [search, activeCategory, activeMonth, activeTraveller, chinaOnly]);

  const hasFilters = chinaOnly || !!activeCategory || activeMonth !== null || !!activeTraveller || !!search.trim();

  function clearFilters() {
    setChinaOnly(false);
    setSearch("");
    setActiveCategory(null);
    setActiveMonth(null);
    setActiveTraveller(null);
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* ── Hero ── */}
      <div className="travel-photo-surface">
        <TravelImage photo={getTravelPhoto("shanghai")} priority className="travel-photo" sizes="100vw" />
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/15 text-white border-white/20 hover:bg-white/20">
               The travel calendar
            </Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              Make the trip.<br />Plan the connection.
            </h1>
            <p className="text-lg text-white/75 mb-8 leading-relaxed">
              From trade fairs to festival weekends. Find your event, explore destination plans, and arrange your data before departure.
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search events, cities or countries…"
                className="pl-10 h-12 bg-card text-card-foreground rounded-xl text-sm shadow-lg"
                data-testid="input-events-search"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="border-b bg-background/95 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          <button type="button" aria-pressed={chinaOnly} onClick={() => setChinaOnly(!chinaOnly)} data-testid="filter-china" className={`rounded-full border px-4 py-2 mt-3 text-sm font-semibold ${chinaOnly ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>China</button>
          {/* Category row */}
          <div className="flex gap-2 py-3 overflow-x-auto scrollbar-hide">
            <CategoryChip
              label="All Events"
              active={activeCategory === null}
              onClick={() => setActiveCategory(null)}
            />
            {ALL_CATEGORIES.map(cat => (
              <CategoryChip
                key={cat}
                label={CATEGORY_LABELS[cat]}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              />
            ))}
          </div>

          {/* Month + Traveller row */}
          <div className="flex gap-2 pb-3 overflow-x-auto scrollbar-hide">
            {MONTHS.map((m, i) => (
              <FilterChip
                key={m}
                label={m.slice(0, 3)}
                active={activeMonth === i + 1}
                onClick={() => setActiveMonth(activeMonth === i + 1 ? null : i + 1)}
              />
            ))}
            <div className="w-px bg-border mx-1 self-stretch" />
            {(Object.keys(TRAVELLER_LABELS) as TravellerType[]).map(t => (
              <FilterChip
                key={t}
                label={TRAVELLER_LABELS[t]}
                active={activeTraveller === t}
                onClick={() => setActiveTraveller(activeTraveller === t ? null : t)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Result count + clear */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground" data-testid="text-results-count">
            {filtered.length === events.length
              ? `${events.length} events worldwide`
              : `${filtered.length} event${filtered.length !== 1 ? "s" : ""} found`}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              data-testid="button-clear-filters"
            >
              <X className="w-3.5 h-3.5" />
              Clear all filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Search aria-hidden className="w-10 h-10 mx-auto mb-4 text-primary" />
            <p className="text-lg font-semibold mb-2">No events found</p>
            <p className="text-muted-foreground mb-6">Try a different search term or clear your filters.</p>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
