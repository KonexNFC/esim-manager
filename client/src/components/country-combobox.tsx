import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search, Star, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  "SG", "KR", "TR", "GR", "PT", "NL", "CA", "IN", "MX", "BR",
];

export interface CountryComboboxProps {
  value?: string;
  onSelect: (code: string | undefined, country?: AvailableCountry) => void;
  placeholder?: string;
  className?: string;
  allowAny?: boolean;
  "data-testid"?: string;
}

export function CountryCombobox({
  value,
  onSelect,
  placeholder = "Select destination",
  className,
  allowAny = false,
  "data-testid": testId,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery<CountriesResponse>({
    queryKey: ["/api/countries"],
  });

  // Unified code → entry lookup (countries + regions + global)
  const byCode = useMemo(() => {
    const map = new Map<string, AvailableCountry>();
    for (const c of data?.countries ?? []) map.set(c.countryCode, c);
    for (const r of data?.multiCountryPlans ?? []) map.set(r.countryCode, r);
    return map;
  }, [data]);

  const selected = value ? byCode.get(value) : undefined;
  const label = value === "any"
    ? "🌍 Any destination"
    : selected
      ? `${selected.flagEmoji} ${selected.name}`
      : undefined;

  // Popular countries
  const popularCountries = useMemo(
    () => POPULAR_CODES.map(code => byCode.get(code)).filter((c): c is AvailableCountry => !!c && c.type !== "region" && c.type !== "global"),
    [byCode],
  );

  // Region + global entries
  const multiCountryEntries = useMemo(
    () => data?.multiCountryPlans ?? [],
    [data],
  );

  // Per-region country sections (for non-search default view)
  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data) return [];
    return data.regions.map(region => ({
      region,
      countries: (data.grouped[region] ?? []).filter(
        c => !q || c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q),
      ),
    })).filter(s => s.countries.length > 0);
  }, [data, search]);

  const filteredPopular = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return popularCountries;
    return popularCountries.filter(
      c => c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q),
    );
  }, [popularCountries, search]);

  // Regions/global filtered by search
  const filteredMultiCountry = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return multiCountryEntries;
    return multiCountryEntries.filter(
      r => r.name.toLowerCase().includes(q) || r.countryCode.toLowerCase().includes(q),
    );
  }, [multiCountryEntries, search]);

  const hasSearch = search.trim().length > 0;
  const noResults = hasSearch && filteredSections.length === 0 && filteredMultiCountry.length === 0;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  function pick(code: string | undefined, country?: AvailableCountry) {
    onSelect(code, country);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
          data-testid={testId}
        >
          <span className={cn("truncate", !label && "text-muted-foreground")}>
            {label ?? placeholder}
          </span>
          <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-72"
        align="start"
        sideOffset={4}
      >
        {/* Search */}
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search countries or regions…"
            className="h-8 border-0 p-0 focus-visible:ring-0 text-sm"
            data-testid="input-country-search"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="max-h-72 overflow-y-auto py-1">
          {/* Any destination option */}
          {allowAny && !hasSearch && (
            <button
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                value === "any" && "bg-accent/50",
              )}
              onClick={() => pick("any")}
              data-testid="option-any-destination"
            >
              <span className="text-base leading-none">🌍</span>
              <span>Any destination</span>
              {value === "any" && <Check className="ml-auto h-3.5 w-3.5" />}
            </button>
          )}

          {noResults ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No destinations found</p>
          ) : hasSearch ? (
            /* Flat search results — countries first, then regions */
            <>
              {filteredSections.flatMap(s => s.countries).map(country => (
                <CountryOption key={country.countryCode} country={country} selected={value} onPick={pick} />
              ))}
              {filteredMultiCountry.length > 0 && filteredSections.flatMap(s => s.countries).length > 0 && (
                <div className="mx-3 my-1 border-t" />
              )}
              {filteredMultiCountry.map(r => (
                <CountryOption key={r.countryCode} country={r} selected={value} onPick={pick} />
              ))}
            </>
          ) : (
            /* Default view: multi-country plans at top, then popular, then regions */
            <>
              {/* Global & Regional Plans section */}
              {multiCountryEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 py-1 mt-1">
                    <Globe className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Multi-Country Plans</span>
                  </div>
                  {multiCountryEntries.map(r => (
                    <CountryOption key={r.countryCode} country={r} selected={value} onPick={pick} />
                  ))}
                  <div className="mx-3 my-1 border-t" />
                </div>
              )}

              {/* Popular countries */}
              {filteredPopular.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 py-1 mt-1">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Popular</span>
                  </div>
                  {filteredPopular.map(country => (
                    <CountryOption key={`popular-${country.countryCode}`} country={country} selected={value} onPick={pick} />
                  ))}
                </div>
              )}

              {/* Country sections grouped by region */}
              {filteredSections.map(({ region, countries }) => (
                <div key={region}>
                  <div className="px-3 py-1 mt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{region}</span>
                  </div>
                  {countries.map(country => (
                    <CountryOption key={country.countryCode} country={country} selected={value} onPick={pick} />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CountryOption({
  country,
  selected,
  onPick,
}: {
  country: AvailableCountry;
  selected: string | undefined;
  onPick: (code: string, country: AvailableCountry) => void;
}) {
  const isSelected = selected === country.countryCode;
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-accent/50",
      )}
      onClick={() => onPick(country.countryCode, country)}
      data-testid={`option-country-${country.countryCode}`}
    >
      <span className="text-base leading-none w-5 text-center">{country.flagEmoji}</span>
      <span className="truncate">{country.name}</span>
      {country.planCount > 0 && (
        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{country.planCount}p</span>
      )}
      {isSelected && <Check className="ml-1 h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}
