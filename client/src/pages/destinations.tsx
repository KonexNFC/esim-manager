import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Search, Globe, SlidersHorizontal, X, Star } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

interface AvailableCountry {
  countryCode: string;
  name: string;
  flagEmoji: string;
  region: string;
  planCount: number;
  type?: "country" | "region" | "global";
}

interface CountriesResponse {
  countries: AvailableCountry[];
  grouped: Record<string, AvailableCountry[]>;
  regions: string[];
  total: number;
  multiCountryPlans?: AvailableCountry[];
}

const POPULAR_CODES = [
  "US", "GB", "FR", "DE", "JP", "TH", "AU", "ES", "IT", "AE",
  "SG", "KR", "MX", "BR", "IN", "TR", "GR", "PT", "NL", "CA",
];

function flagSrc(code: string) {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

/** Card for a single country */
function CountryCard({ country }: { country: AvailableCountry }) {
  return (
    <Link
      href={`/destinations/${country.countryCode}`}
      data-testid={`card-destination-${country.countryCode}`}
    >
      <div className="group relative overflow-hidden rounded-2xl cursor-pointer aspect-[4/5] bg-muted shadow-md hover:shadow-xl transition-shadow duration-300">
        <img
          src={flagSrc(country.countryCode)}
          alt={country.name}
          className="w-full h-full object-cover scale-110 transition-transform duration-700 group-hover:scale-125"
          onError={e => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/60 -z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute top-3 left-3">
          <div className="w-8 h-5 rounded-sm overflow-hidden shadow-md border border-white/25">
            <img
              src={flagSrc(country.countryCode)}
              alt={country.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {country.planCount > 0 && (
          <div className="absolute top-3 right-3">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0.5 bg-black/40 text-white border-white/20 backdrop-blur-sm"
              data-testid={`badge-plan-count-${country.countryCode}`}
            >
              {country.planCount} plan{country.planCount === 1 ? "" : "s"}
            </Badge>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3
            className="font-bold text-white text-sm leading-tight"
            data-testid={`text-destination-name-${country.countryCode}`}
          >
            {country.name}
          </h3>
          <p
            className="text-white/60 text-xs mt-0.5"
            data-testid={`text-destination-region-${country.countryCode}`}
          >
            {country.region}
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Landmark/region imagery for each canonical region slug */
const REGION_IMAGES: Record<string, { url: string; credit: string }> = {
  EUROPE:    { url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=80", credit: "Paris, France" },
  LATAM:     { url: "https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=600&q=80", credit: "Machu Picchu, Peru" },
  CARIBBEAN: { url: "https://images.unsplash.com/photo-1548574505-5e239809ee19?auto=format&fit=crop&w=600&q=80", credit: "Caribbean Sea" },
  APAC:      { url: "https://images.unsplash.com/photo-1480796927426-f609979314bd?auto=format&fit=crop&w=600&q=80", credit: "Mount Fuji, Japan" },
  SOUTHASIA: { url: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=600&q=80", credit: "Taj Mahal, India" },
  MENA:      { url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=80", credit: "Dubai, UAE" },
  AFRICA:    { url: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=600&q=80", credit: "Serengeti, Tanzania" },
  NORTHAM:   { url: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=600&q=80", credit: "New York City, USA" },
  SEASIA:    { url: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80", credit: "Angkor Wat, Cambodia" },
  GLOBAL:    { url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80", credit: "Planet Earth" },
};

/** Card for a region or global plan — uses landmark photography */
function RegionCard({ entry }: { entry: AvailableCountry }) {
  const isGlobal = entry.type === "global";
  const img = REGION_IMAGES[entry.countryCode.toUpperCase()];

  return (
    <Link
      href={`/destinations/${entry.countryCode}`}
      data-testid={`card-destination-${entry.countryCode}`}
    >
      <div className="group relative overflow-hidden rounded-2xl cursor-pointer aspect-[4/5] bg-muted shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
        {/* Landmark photo */}
        {img ? (
          <img
            src={img.url}
            alt={img.credit}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className={`absolute inset-0 ${isGlobal ? "bg-gradient-to-br from-violet-600/60 via-blue-600/40 to-indigo-700/60" : "bg-gradient-to-br from-primary/60 via-primary/30 to-primary/70"}`} />
        )}

        {/* Dark overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

        {entry.planCount > 0 && (
          <div className="absolute top-3 right-3">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0.5 bg-black/50 text-white border-white/20 backdrop-blur-sm"
              data-testid={`badge-plan-count-${entry.countryCode}`}
            >
              {entry.planCount} plan{entry.planCount === 1 ? "" : "s"}
            </Badge>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3
            className="font-bold text-white text-sm leading-tight drop-shadow-md"
            data-testid={`text-destination-name-${entry.countryCode}`}
          >
            {entry.name}
          </h3>
          <p className="text-white/70 text-xs mt-0.5 drop-shadow-sm">
            {isGlobal ? "Worldwide coverage" : "Multi-country plan"}
          </p>
          {img && (
            <p className="text-white/40 text-[9px] mt-1">{img.credit}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function CountryGrid({ countries }: { countries: AvailableCountry[] }) {
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return countries.filter(c => {
      const key = `${c.type}-${c.countryCode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [countries]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {deduped.map(c => (
        c.type === "region" || c.type === "global"
          ? <RegionCard key={`${c.type}-${c.countryCode}`} entry={c} />
          : <CountryCard key={`country-${c.countryCode}`} country={c} />
      ))}
    </div>
  );
}

export default function Destinations() {
  useEffect(() => { document.title = "Browse eSIM Plans by Country | Konex eSIM"; }, []);
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("All");

  const { data, isLoading, isError, refetch } = useQuery<CountriesResponse>({
    queryKey: ["/api/countries"],
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const regionButtons = useMemo(() => {
    if (!data?.regions) return ["All"];
    return ["All", ...data.regions];
  }, [data?.regions]);

  const multiCountryPlans = useMemo(() => data?.multiCountryPlans ?? [], [data]);

  // Countries that match search + region filter
  const filtered = useMemo(() => {
    if (!data?.countries) return [];
    const q = search.toLowerCase();
    return data.countries.filter(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q);
      const matchesRegion = selectedRegion === "All" || c.region === selectedRegion;
      return matchesSearch && matchesRegion;
    });
  }, [data?.countries, search, selectedRegion]);

  // Regions that match search
  const filteredMultiCountry = useMemo(() => {
    if (!search) return multiCountryPlans;
    const q = search.toLowerCase();
    return multiCountryPlans.filter(r =>
      r.name.toLowerCase().includes(q) || r.countryCode.toLowerCase().includes(q),
    );
  }, [multiCountryPlans, search]);

  // Grouped view
  const groupedSections = useMemo(() => {
    if (!data?.regions || !data?.grouped) return [];
    return data.regions.map(r => ({ region: r, countries: data.grouped[r] ?? [] }));
  }, [data?.regions, data?.grouped]);

  // Popular countries
  const popularCountries = useMemo(() => {
    if (!data?.countries) return [];
    const byCode = new Map(data.countries.map(c => [c.countryCode, c]));
    return POPULAR_CODES.map(code => byCode.get(code)).filter((c): c is AvailableCountry => !!c);
  }, [data?.countries]);

  const hasFilter = search !== "" || selectedRegion !== "All";

  // Combined filtered results (countries + matching regions) shown in filter view
  const filteredAll = useMemo(() => {
    if (!hasFilter) return [];
    const combined: AvailableCountry[] = [...filtered];
    if (search) combined.unshift(...filteredMultiCountry);
    return combined;
  }, [hasFilter, filtered, filteredMultiCountry, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-destinations-title">
          Browse Destinations
        </h1>
        <p className="text-muted-foreground mt-2">
          {isLoading
            ? "Loading available destinations…"
            : isError
            ? "Unable to load destinations — please try again."
            : `eSIM plans available in ${data?.total ?? 0} countries plus regional & global packs`}
        </p>
        {isError && (
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
            data-testid="button-retry-countries"
          >
            Retry
          </button>
        )}
      </div>

      {/* Search + region filters */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search countries or regions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-destinations"
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

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setSelectedRegion("All"); }}
              className="text-muted-foreground"
              data-testid="button-clear-filters"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Region pills */}
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))
            : regionButtons.map(region => (
                <Button
                  key={region}
                  variant={selectedRegion === region ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedRegion(region)}
                  className="rounded-full text-xs h-8"
                  data-testid={`button-region-${region.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {region}
                  {region !== "All" && data?.grouped[region] && (
                    <span className="ml-1.5 opacity-60 text-[10px]">
                      {selectedRegion === region
                        ? filtered.length
                        : data.grouped[region].length}
                    </span>
                  )}
                </Button>
              ))}
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
          ))}
        </div>

      ) : /* ── Filtered view ── */
      hasFilter ? (
        filteredAll.length === 0 ? (
          <div className="text-center py-24">
            <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No destinations found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Try adjusting your search or region filter
            </p>
            <Button
              variant="outline"
              onClick={() => { setSearch(""); setSelectedRegion("All"); }}
            >
              Show all destinations
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-result-count">
              {filteredAll.length} {filteredAll.length === 1 ? "destination" : "destinations"}
              {selectedRegion !== "All" ? ` in ${selectedRegion}` : ""}
              {search ? ` matching "${search}"` : ""}
            </p>
            <CountryGrid countries={filteredAll} />
          </>
        )

      ) : /* ── Default view: Regional/Global + Popular + grouped by region ── */
      (
        <div className="space-y-12">
          {/* Regional & Global Plans */}
          {multiCountryPlans.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-base" data-testid="text-section-multi-country">
                  Regional & Global Plans
                </h2>
                <span className="text-xs text-muted-foreground">
                  {multiCountryPlans.length} multi-country pack{multiCountryPlans.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {multiCountryPlans.map(entry => (
                  <RegionCard key={entry.countryCode} entry={entry} />
                ))}
              </div>
            </section>
          )}

          {/* Popular countries */}
          {popularCountries.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <h2 className="font-semibold text-base" data-testid="text-section-popular">
                  Popular Destinations
                </h2>
              </div>
              <CountryGrid countries={popularCountries} />
            </section>
          )}

          {/* Countries grouped by region */}
          {groupedSections.map(({ region, countries }) =>
            countries.length === 0 ? null : (
              <section key={region}>
                <div className="flex items-center gap-3 mb-4">
                  <h2
                    className="font-semibold text-base"
                    data-testid={`text-section-region-${region.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {region}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {countries.length} {countries.length === 1 ? "country" : "countries"}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedRegion(region)}
                    data-testid={`button-view-region-${region.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    View all
                  </Button>
                </div>
                <CountryGrid countries={countries} />
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}
