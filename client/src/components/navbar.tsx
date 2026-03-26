import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Wifi, Package, Search, Smartphone, ArrowRight, LayoutDashboard, LogIn, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Navbar() {
  const [location] = useLocation();
  const isHome = location === "/";
  const { user, isLoading } = useAuth();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

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

        {isHome ? (
          <nav className="flex items-center gap-1">
            <button
              onClick={() => scrollTo("plans")}
              className="hidden sm:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              data-testid="nav-plans"
            >
              Plans
            </button>
            <button
              onClick={() => scrollTo("how-it-works")}
              className="hidden sm:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              data-testid="nav-how-it-works"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo("coverage")}
              className="hidden sm:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              data-testid="nav-coverage"
            >
              Coverage
            </button>
            <button
              onClick={() => scrollTo("faq")}
              className="hidden sm:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              data-testid="nav-faq"
            >
              FAQ
            </button>
            {!isLoading && (
              user ? (
                <Link href="/dashboard">
                  <Button size="sm" variant="outline" className="ml-1" data-testid="nav-dashboard">
                    <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="ml-1" data-testid="nav-login">
                    <LogIn className="w-3.5 h-3.5 mr-1.5" />
                    Log In
                  </Button>
                </Link>
              )
            )}
            <Link href="/destinations">
              <Button size="sm" className="ml-1" data-testid="nav-get-connected">
                Get Connected
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
            <ThemeToggle />
          </nav>
        ) : (
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
            {!isLoading && (
              user ? (
                <Link href="/dashboard">
                  <Button
                    variant={location.startsWith("/dashboard") ? "secondary" : "ghost"}
                    data-testid="link-dashboard"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-1.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button
                    variant={location.startsWith("/login") || location.startsWith("/signup") ? "secondary" : "ghost"}
                    data-testid="link-login"
                  >
                    <LogIn className="w-4 h-4 mr-1.5" />
                    <span className="hidden sm:inline">Log In</span>
                  </Button>
                </Link>
              )
            )}
            <ThemeToggle />
          </nav>
        )}
      </div>
    </header>
  );
}
