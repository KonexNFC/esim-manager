import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Wifi, Package, Search, Smartphone } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" data-testid="link-home">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
              <Wifi className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight hidden sm:inline" data-testid="text-brand-name">
              GlobeSIM
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/destinations">
            <Button
              variant={location.startsWith("/destinations") ? "secondary" : "ghost"}
              data-testid="link-destinations"
            >
              <Search className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Browse</span>
            </Button>
          </Link>
          <Link href="/compatibility">
            <Button
              variant={location.startsWith("/compatibility") ? "secondary" : "ghost"}
              data-testid="link-compatibility"
            >
              <Smartphone className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Check Device</span>
            </Button>
          </Link>
          <Link href="/orders">
            <Button
              variant={location.startsWith("/orders") ? "secondary" : "ghost"}
              data-testid="link-orders"
            >
              <Package className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">My eSIMs</span>
            </Button>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
