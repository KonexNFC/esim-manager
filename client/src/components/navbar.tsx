import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Search, Smartphone, LayoutDashboard, LogIn, ChevronDown, Rocket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KonexLogo } from "./konex-logo";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function CurrencySelector() {
  const { currency, setCurrencyCode } = useCurrency();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1"
          data-testid="button-currency-selector"
        >
          {currency.code}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
        {CURRENCIES.map(c => (
          <DropdownMenuItem
            key={c.code}
            onClick={() => setCurrencyCode(c.code)}
            className={`flex items-center justify-between text-sm cursor-pointer ${c.code === currency.code ? "text-primary font-semibold" : ""}`}
            data-testid={`currency-option-${c.code}`}
          >
            <span>{c.symbol} {c.name}</span>
            <span className="text-xs text-muted-foreground ml-2">{c.code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const isHome = location === "/";
  const { user, isLoading } = useAuth();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className={isHome ? "relative border-b border-white/[0.06] bg-background" : "sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl"}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3">

        {/* Logo */}
        <Link href="/" data-testid="link-home">
          <KonexLogo size="md" data-testid="text-brand-name" className="cursor-pointer" />
        </Link>

        {/* Home nav */}
        {isHome ? (
          <nav className="flex items-center gap-0.5">
            {[
              { label: "Plans",        id: "plans"        },
              { label: "How It Works", id: "how-it-works" },
              { label: "FAQ",          id: "faq"          },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="hidden lg:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-lg hover:bg-white/5 hover:text-foreground transition-colors"
                data-testid={`nav-${item.id}`}
              >
                {item.label}
              </button>
            ))}

            <Link href="/roadmap">
              <button
                className="hidden lg:flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-lg hover:bg-white/5 hover:text-foreground transition-colors gap-1.5"
                data-testid="nav-roadmap"
              >
                <Rocket className="w-3.5 h-3.5" />
                Roadmap
              </button>
            </Link>

            {!isLoading && (
              user ? (
                <Link href="/dashboard">
                  <Button size="sm" variant="ghost" className="ml-1" data-testid="nav-dashboard">
                    <LayoutDashboard className="w-3.5 h-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="ml-1" data-testid="nav-login">
                    <LogIn className="w-3.5 h-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Log In</span>
                  </Button>
                </Link>
              )
            )}

            <Link href="/destinations">
              <Button size="sm" className="ml-1 font-semibold hidden sm:inline-flex" data-testid="nav-get-started">
                Get Started
              </Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" className="font-semibold hidden sm:inline-flex" data-testid="nav-my-esims">
                My eSIMs
              </Button>
            </Link>

            <CurrencySelector />
            <ThemeToggle />
          </nav>
        ) : (
          <nav className="flex items-center gap-0.5">
            <Link href="/destinations">
              <Button
                variant={location.startsWith("/destinations") ? "secondary" : "ghost"}
                size="sm"
                data-testid="link-destinations"
                className="hidden sm:flex"
              >
                <Search className="w-4 h-4 mr-1.5" />
                Browse
              </Button>
            </Link>
            <Link href="/compatibility">
              <Button
                variant={location.startsWith("/compatibility") ? "secondary" : "ghost"}
                size="sm"
                data-testid="link-compatibility"
                className="hidden sm:flex"
              >
                <Smartphone className="w-4 h-4 mr-1.5" />
                Check Device
              </Button>
            </Link>
            <Link href="/roadmap">
              <Button
                variant={location.startsWith("/roadmap") ? "secondary" : "ghost"}
                size="sm"
                data-testid="link-roadmap"
                className="hidden sm:flex"
              >
                <Rocket className="w-4 h-4 mr-1.5" />
                Roadmap
              </Button>
            </Link>

            {!isLoading && (
              user ? (
                <Link href="/dashboard">
                  <Button
                    variant={location.startsWith("/dashboard") ? "secondary" : "ghost"}
                    size="sm"
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
                    size="sm"
                    data-testid="link-login"
                  >
                    <LogIn className="w-4 h-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Log In</span>
                  </Button>
                </Link>
              )
            )}
            <Link href="/destinations">
              <Button size="sm" className="font-semibold hidden sm:inline-flex" data-testid="nav-get-started-other">
                Get Started
              </Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" className="font-semibold hidden sm:inline-flex" data-testid="nav-my-esims-other">
                My eSIMs
              </Button>
            </Link>
            <CurrencySelector />
            <ThemeToggle />
          </nav>
        )}
      </div>
    </header>
  );
}
