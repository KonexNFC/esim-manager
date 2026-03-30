import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Search, Globe, SlidersHorizontal, X, Star } from "lucide-react";
import { useState, useMemo } from "react";

interface AvailableCountry {
  countryCode: string;
  name: string;
  flagEmoji: string;
  region: string;
  planCount: number;
}

interface CountriesResponse {
  countries: AvailableCountry[];
  grouped: Record<string, AvailableCountry[]>;
  regions: string[];
  total: number;
}

// Popular country codes (top travel/data destinations globally)
const POPULAR_CODES = [
  "US", "GB", "FR", "DE", "JP", "TH", "AU", "ES", "IT", "AE",
  "SG", "KR", "MX", "BR", "IN", "TR", "GR", "PT", "NL", "CA",
];

function flagSrc(code: string) {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

/** A single destination card — shared between all sections */
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
          <span className="text-2xl drop-shadow-lg leading-none">{country.flagEmoji}</span>
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

/** Responsive grid for a section of country cards */
function CountryGrid({ countries }: { countries: AvailableCountry[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {countries.map(c => (
        <CountryCard key={c.countryCode} country={c} />
      ))}
    </div>
  );
}

export default function Destinations() {
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("All");

  const { data, isLoading } = useQuery<CountriesResponse>({
    queryKey: ["/api/countries"],
  });

  const regionButtons = useMemo(() => {
    if (!data?.regions) return ["All"];
    return ["All", ...data.regions];
  }, [data?.regions]);

  // Countries that match search + region filter
  const filtered = useMemo(() => {
    if (!data?.countries) return [];
    return data.countries.filter(c => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q || c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q);
      const matchesRegion = selectedRegion === "All" || c.region === selectedRegion;
      return matchesSearch && matchesRegion;
    });
  }, [data?.countries, search, selectedRegion]);

  // Grouped view: section per region (used when no filter active)
  const groupedSections = useMemo(() => {
    if (!data?.regions || !data?.grouped) return [];
    return data.regions.map(r => ({ region: r, countries: data.grouped[r] ?? [] }));
  }, [data?.regions, data?.grouped]);

  // Popular countries (only those that exist in the loaded catalogue)
  const popularCountries = useMemo(() => {
    if (!data?.countries) return [];
    const byCode = new Map(data.countries.map(c => [c.countryCode, c]));
    return POPULAR_CODES.map(code => byCode.get(code)).filter((c): c is AvailableCountry => !!c);
  }, [data?.countries]);

  const hasFilter = search !== "" || selectedRegion !== "All";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-destinations-title">
          Browse Destinations
        </h1>
        <p className="text-muted-foreground mt-2">
          {isLoading
            ? "Loading available countries…"
            : `eSIM plans available in ${data?.total ?? 0} countries`}
        </p>
      </div>

      {/* Search + region filters */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search countries…"
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

      ) : /* ── Filtered view (search or region active) ── */
      hasFilter ? (
        filtered.length === 0 ? (
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
              Show all countries
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-result-count">
              {filtered.length} {filtered.length === 1 ? "country" : "countries"}
              {selectedRegion !== "All" ? ` in ${selectedRegion}` : ""}
              {search ? ` matching "${search}"` : ""}
            </p>
            <CountryGrid countries={filtered} />
          </>
        )

      ) : /* ── Default view: Popular + grouped by region ── */
      (
        <div className="space-y-12">
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
