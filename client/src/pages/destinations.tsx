import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Search, Globe, MapPin } from "lucide-react";
import { useState, useMemo } from "react";
import type { Destination } from "@shared/schema";

const regions = ["All", "Asia", "Europe", "Middle East", "North America", "Southeast Asia"];

export default function Destinations() {
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("All");

  const { data: destinations, isLoading } = useQuery<Destination[]>({
    queryKey: ["/api/destinations"],
  });

  const filtered = useMemo(() => {
    if (!destinations) return [];
    return destinations.filter((d) => {
      const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.countryCode.toLowerCase().includes(search.toLowerCase());
      const matchesRegion = selectedRegion === "All" || d.region === selectedRegion;
      return matchesSearch && matchesRegion;
    });
  }, [destinations, search, selectedRegion]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-destinations-title">
          Browse Destinations
        </h1>
        <p className="text-muted-foreground mt-2">
          Find eSIM plans for your next destination
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search countries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-destinations"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {regions.map((region) => (
            <Button
              key={region}
              variant={selectedRegion === region ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRegion(region)}
              data-testid={`button-region-${region.toLowerCase().replace(/\s/g, '-')}`}
            >
              {region}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-visible">
              <Skeleton className="aspect-[16/10] rounded-t-md" />
              <div className="p-3">
                <Skeleton className="h-5 w-24 mb-2" />
                <Skeleton className="h-4 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No destinations found</h3>
          <p className="text-muted-foreground text-sm">
            Try adjusting your search or filter criteria
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((dest) => (
            <Link key={dest.id} href={`/destinations/${dest.id}`}>
              <Card className="overflow-visible hover-elevate cursor-pointer group" data-testid={`card-destination-${dest.id}`}>
                <div className="aspect-[16/10] overflow-hidden rounded-t-md">
                  <img
                    src={dest.imageUrl}
                    alt={dest.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{dest.flagEmoji}</span>
                    <h3 className="font-semibold text-sm" data-testid={`text-destination-name-${dest.id}`}>
                      {dest.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{dest.region}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
