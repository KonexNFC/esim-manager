import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Calendar, ArrowRight, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import events, {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  MONTHS,
  type EventCategory,
  type TravellerType,
} from "@/data/events";

// ─── Flag image ───────────────────────────────────────────────────────────────
function Flag({ code }: { code: string }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code}
      className="w-5 h-3.5 rounded-[2px] object-cover flex-shrink-0 shadow-sm"
      loading="lazy"
    />
  );
}

// ─── Category chip ────────────────────────────────────────────────────────────
function CategoryChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji: string;
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
      <span>{emoji}</span>
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
  const categoryEmoji = CATEGORY_EMOJI[event.category];

  return (
    <Link href={`/events/${event.slug}`} data-testid={`card-event-${event.slug}`}>
      <div className="group bg-white border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-200 cursor-pointer h-full flex flex-col">
        {/* Top colour bar by category */}
        <div
          className={`h-1.5 w-full ${
            event.category === "trade-fairs"
              ? "bg-blue-500"
              : event.category === "festivals"
              ? "bg-orange-500"
              : event.category === "sports"
              ? "bg-green-500"
              : event.category === "fashion-culture"
              ? "bg-pink-500"
              : event.category === "luxury"
              ? "bg-purple-500"
              : "bg-gray-400"
          }`}
        />

        <div className="p-5 flex flex-col flex-1 gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl">{event.emoji}</span>
            <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
              {categoryEmoji} {categoryLabel}
            </Badge>
          </div>

          {/* Name */}
          <div>
            <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors mb-1" data-testid={`text-event-name-${event.slug}`}>
              {event.name}
            </h3>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Flag code={event.countryCode} />
              <span>{event.city}, {event.country}</span>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{event.month}</span>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
            {event.description}
          </p>

          {/* Durations */}
          <div className="flex flex-wrap gap-1.5">
            {event.recommendedDurations.slice(0, 3).map(d => (
              <span
                key={d}
                className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-medium"
              >
                {d} day{d !== 1 ? "s" : ""}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center text-sm font-semibold text-primary gap-1 mt-auto pt-1 group-hover:gap-2 transition-all">
            Get eSIM for this trip
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
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

  const filtered = useMemo(() => {
    let result = [...events];

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

    return result;
  }, [search, activeCategory, activeMonth, activeTraveller]);

  const hasFilters = !!activeCategory || activeMonth !== null || !!activeTraveller || !!search.trim();

  function clearFilters() {
    setSearch("");
    setActiveCategory(null);
    setActiveMonth(null);
    setActiveTraveller(null);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-slate-900 via-primary/90 to-slate-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/15 text-white border-white/20 hover:bg-white/20">
              🌍 Global Events Network
            </Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              Stay Connected at the World's Biggest Events
            </h1>
            <p className="text-lg text-white/75 mb-8 leading-relaxed">
              From Canton Fair to Rio Carnival, KONEX gives travellers instant data before they land.
              Find your event, pick your plan, activate instantly.
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search events, cities or countries…"
                className="pl-10 h-12 bg-white text-foreground rounded-xl text-sm shadow-lg"
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
      <div className="border-b bg-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          {/* Category row */}
          <div className="flex gap-2 py-3 overflow-x-auto scrollbar-hide">
            <CategoryChip
              label="All Events"
              emoji="🌍"
              active={activeCategory === null}
              onClick={() => setActiveCategory(null)}
            />
            {ALL_CATEGORIES.map(cat => (
              <CategoryChip
                key={cat}
                label={CATEGORY_LABELS[cat]}
                emoji={CATEGORY_EMOJI[cat]}
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
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-lg font-semibold mb-2">No events found</p>
            <p className="text-muted-foreground mb-6">Try a different search term or clear your filters.</p>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
