import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, XCircle, Smartphone, Search, ArrowRight,
  Wifi, AlertCircle, ChevronDown, ChevronUp
} from "lucide-react";

interface Device {
  brand: string;
  model: string;
  esim: boolean;
  dualSim?: boolean;
  notes?: string;
  released?: string;
}

const devices: Device[] = [
  // Apple
  { brand: "Apple", model: "iPhone 16 Pro Max", esim: true, dualSim: true, released: "2024" },
  { brand: "Apple", model: "iPhone 16 Pro", esim: true, dualSim: true, released: "2024" },
  { brand: "Apple", model: "iPhone 16 Plus", esim: true, dualSim: true, released: "2024" },
  { brand: "Apple", model: "iPhone 16", esim: true, dualSim: true, released: "2024" },
  { brand: "Apple", model: "iPhone 15 Pro Max", esim: true, dualSim: true, released: "2023" },
  { brand: "Apple", model: "iPhone 15 Pro", esim: true, dualSim: true, released: "2023" },
  { brand: "Apple", model: "iPhone 15 Plus", esim: true, dualSim: true, released: "2023" },
  { brand: "Apple", model: "iPhone 15", esim: true, dualSim: true, released: "2023" },
  { brand: "Apple", model: "iPhone 14 Pro Max", esim: true, dualSim: true, released: "2022" },
  { brand: "Apple", model: "iPhone 14 Pro", esim: true, dualSim: true, released: "2022" },
  { brand: "Apple", model: "iPhone 14 Plus", esim: true, dualSim: true, released: "2022" },
  { brand: "Apple", model: "iPhone 14", esim: true, dualSim: true, released: "2022" },
  { brand: "Apple", model: "iPhone 13 Pro Max", esim: true, dualSim: true, released: "2021" },
  { brand: "Apple", model: "iPhone 13 Pro", esim: true, dualSim: true, released: "2021" },
  { brand: "Apple", model: "iPhone 13", esim: true, dualSim: true, released: "2021" },
  { brand: "Apple", model: "iPhone 13 mini", esim: true, dualSim: true, released: "2021" },
  { brand: "Apple", model: "iPhone 12 Pro Max", esim: true, dualSim: true, released: "2020" },
  { brand: "Apple", model: "iPhone 12 Pro", esim: true, dualSim: true, released: "2020" },
  { brand: "Apple", model: "iPhone 12", esim: true, dualSim: true, released: "2020" },
  { brand: "Apple", model: "iPhone 12 mini", esim: true, dualSim: true, released: "2020" },
  { brand: "Apple", model: "iPhone SE (3rd gen)", esim: true, dualSim: true, released: "2022" },
  { brand: "Apple", model: "iPhone SE (2nd gen)", esim: true, dualSim: true, released: "2020" },
  { brand: "Apple", model: "iPhone 11 Pro Max", esim: true, dualSim: true, released: "2019" },
  { brand: "Apple", model: "iPhone 11 Pro", esim: true, dualSim: true, released: "2019" },
  { brand: "Apple", model: "iPhone 11", esim: true, dualSim: true, released: "2019" },
  { brand: "Apple", model: "iPhone XS Max", esim: true, dualSim: true, released: "2018" },
  { brand: "Apple", model: "iPhone XS", esim: true, dualSim: true, released: "2018" },
  { brand: "Apple", model: "iPhone XR", esim: true, dualSim: false, released: "2018" },
  { brand: "Apple", model: "iPhone X", esim: false, notes: "Physical SIM only" },
  { brand: "Apple", model: "iPhone 8 / 8 Plus", esim: false, notes: "Physical SIM only" },
  // Samsung
  { brand: "Samsung", model: "Galaxy S25 Ultra", esim: true, dualSim: true, released: "2025" },
  { brand: "Samsung", model: "Galaxy S25+", esim: true, dualSim: true, released: "2025" },
  { brand: "Samsung", model: "Galaxy S25", esim: true, dualSim: true, released: "2025" },
  { brand: "Samsung", model: "Galaxy S24 Ultra", esim: true, dualSim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy S24+", esim: true, dualSim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy S24", esim: true, dualSim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy S23 Ultra", esim: true, dualSim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy S23+", esim: true, dualSim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy S23", esim: true, dualSim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy S22 Ultra", esim: true, dualSim: true, released: "2022" },
  { brand: "Samsung", model: "Galaxy S22+", esim: true, dualSim: true, released: "2022" },
  { brand: "Samsung", model: "Galaxy S22", esim: true, dualSim: true, released: "2022" },
  { brand: "Samsung", model: "Galaxy Z Fold 6", esim: true, dualSim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy Z Fold 5", esim: true, dualSim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy Z Fold 4", esim: true, dualSim: true, released: "2022" },
  { brand: "Samsung", model: "Galaxy Z Flip 6", esim: true, dualSim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy Z Flip 5", esim: true, dualSim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy Z Flip 4", esim: true, dualSim: true, released: "2022" },
  { brand: "Samsung", model: "Galaxy A55", esim: true, released: "2024" },
  { brand: "Samsung", model: "Galaxy A54", esim: true, released: "2023" },
  { brand: "Samsung", model: "Galaxy S21 series", esim: true, dualSim: true, released: "2021" },
  { brand: "Samsung", model: "Galaxy S20 series", esim: true, dualSim: true, released: "2020", notes: "Region dependent" },
  // Google
  { brand: "Google", model: "Pixel 9 Pro XL", esim: true, dualSim: true, released: "2024" },
  { brand: "Google", model: "Pixel 9 Pro", esim: true, dualSim: true, released: "2024" },
  { brand: "Google", model: "Pixel 9", esim: true, dualSim: true, released: "2024" },
  { brand: "Google", model: "Pixel 9 Pro Fold", esim: true, dualSim: true, released: "2024" },
  { brand: "Google", model: "Pixel 8 Pro", esim: true, dualSim: true, released: "2023" },
  { brand: "Google", model: "Pixel 8", esim: true, dualSim: true, released: "2023" },
  { brand: "Google", model: "Pixel 8a", esim: true, dualSim: true, released: "2024" },
  { brand: "Google", model: "Pixel 7 Pro", esim: true, dualSim: true, released: "2022" },
  { brand: "Google", model: "Pixel 7", esim: true, dualSim: true, released: "2022" },
  { brand: "Google", model: "Pixel 7a", esim: true, dualSim: true, released: "2023" },
  { brand: "Google", model: "Pixel 6 Pro", esim: true, dualSim: true, released: "2021" },
  { brand: "Google", model: "Pixel 6", esim: true, dualSim: true, released: "2021" },
  { brand: "Google", model: "Pixel 6a", esim: true, dualSim: true, released: "2022" },
  { brand: "Google", model: "Pixel 5", esim: true, dualSim: true, released: "2020" },
  { brand: "Google", model: "Pixel 4 / 4 XL", esim: true, released: "2019" },
  { brand: "Google", model: "Pixel 3 / 3 XL", esim: true, released: "2018" },
  // OnePlus
  { brand: "OnePlus", model: "OnePlus 12", esim: true, released: "2024" },
  { brand: "OnePlus", model: "OnePlus 11", esim: true, released: "2023", notes: "Select regions" },
  { brand: "OnePlus", model: "OnePlus Open", esim: true, released: "2023" },
  // Motorola
  { brand: "Motorola", model: "Razr 50 Ultra", esim: true, dualSim: true, released: "2024" },
  { brand: "Motorola", model: "Razr 50", esim: true, dualSim: true, released: "2024" },
  { brand: "Motorola", model: "Razr+ (2023)", esim: true, dualSim: true, released: "2023" },
  { brand: "Motorola", model: "Edge 50 Pro", esim: true, released: "2024" },
  { brand: "Motorola", model: "Edge 40 Pro", esim: true, released: "2023" },
  // Xiaomi / Oppo / Others
  { brand: "Xiaomi", model: "Xiaomi 14 Ultra", esim: true, released: "2024", notes: "Select markets" },
  { brand: "Xiaomi", model: "Xiaomi 13 Pro", esim: true, released: "2023", notes: "Select markets" },
  { brand: "Oppo", model: "Find X8 Pro", esim: true, released: "2024", notes: "Select markets" },
  { brand: "Oppo", model: "Find N3 Flip", esim: true, released: "2023", notes: "Select markets" },
  { brand: "Huawei", model: "Huawei P60 Pro", esim: false, notes: "No eSIM support" },
  { brand: "Huawei", model: "Huawei Mate 60 Pro", esim: false, notes: "No eSIM support" },
];

const brands = ["All", ...Array.from(new Set(devices.map(d => d.brand))).sort()];

const requirements = [
  { text: "Device must support eSIM (check below)", icon: Smartphone },
  { text: "Phone must be carrier-unlocked", icon: CheckCircle2 },
  { text: "iOS 12.1+ or Android 9+ required", icon: Wifi },
];

export default function Compatibility() {
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    return devices.filter(d => {
      const matchesBrand = selectedBrand === "All" || d.brand === selectedBrand;
      const matchesSearch = search === "" ||
        d.model.toLowerCase().includes(search.toLowerCase()) ||
        d.brand.toLowerCase().includes(search.toLowerCase());
      return matchesBrand && matchesSearch;
    });
  }, [search, selectedBrand]);

  const displayed = showAll ? filtered : filtered.slice(0, 18);
  const compatibleCount = devices.filter(d => d.esim).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-10">
        <Badge variant="secondary" className="mb-4" data-testid="badge-compatibility">
          <Smartphone className="w-3 h-3 mr-1.5" />
          Device Checker
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" data-testid="text-compatibility-title">
          Is your device eSIM compatible?
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
          Check if your phone supports eSIM before purchasing a plan. Most modern smartphones from 2018 onwards are compatible.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {requirements.map((req) => (
          <Card key={req.text} className="p-4 flex items-start gap-3" data-testid={`card-requirement-${req.text.slice(0, 10).toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 flex-shrink-0">
              <req.icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm leading-snug">{req.text}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search your phone model..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-device-search"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {brands.map((brand) => (
              <Button
                key={brand}
                variant={selectedBrand === brand ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBrand(brand)}
                data-testid={`button-brand-${brand.toLowerCase()}`}
              >
                {brand}
              </Button>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Showing {displayed.length} of {filtered.length} devices — {compatibleCount} models confirmed compatible
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayed.map((device) => (
            <div
              key={`${device.brand}-${device.model}`}
              className={`flex items-start gap-3 p-3 rounded-md border ${device.esim ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-70"}`}
              data-testid={`card-device-${device.brand.toLowerCase()}-${device.model.toLowerCase().replace(/\s/g, '-')}`}
            >
              {device.esim ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight" data-testid={`text-device-model-${device.brand.toLowerCase()}`}>
                  {device.brand} {device.model}
                </p>
                {device.esim && device.dualSim && (
                  <Badge variant="secondary" className="mt-1 text-xs">Dual SIM</Badge>
                )}
                {device.notes && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {device.notes}
                  </p>
                )}
                {!device.esim && (
                  <p className="text-xs text-destructive mt-0.5">Not compatible</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length > 18 && (
          <div className="text-center mt-6">
            <Button
              variant="outline"
              onClick={() => setShowAll(!showAll)}
              data-testid="button-toggle-devices"
            >
              {showAll ? (
                <>Show less <ChevronUp className="w-4 h-4 ml-1" /></>
              ) : (
                <>Show all {filtered.length} devices <ChevronDown className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-primary text-primary-foreground">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg mb-1" data-testid="text-compatibility-cta-title">
              Your device is ready — find your plan
            </h3>
            <p className="text-primary-foreground/80 text-sm">
              Browse destinations and get connected in under 60 seconds.
            </p>
          </div>
          <Link href="/destinations">
            <Button
              variant="outline"
              className="bg-white/10 backdrop-blur-sm text-white border-white/30 flex-shrink-0"
              data-testid="button-compatibility-browse"
            >
              Browse Plans
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </Card>

      <div className="mt-8 p-4 rounded-md border border-border bg-muted/30">
        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-compatibility-disclaimer">
          <strong className="text-foreground">Important:</strong> eSIM availability may vary by country and carrier. Some devices sold in certain regions may have eSIM disabled by the manufacturer. If your device is not listed, check your phone settings under Cellular or Mobile Data for an "Add eSIM" or "Add Data Plan" option.
        </p>
      </div>
    </div>
  );
}
