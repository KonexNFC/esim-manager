import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import {
  Search, Smartphone, LayoutDashboard, LogIn, ChevronDown,
  Rocket, Menu, X, ShoppingBag, Globe,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KonexLogo } from "./konex-logo";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

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

function MobileMenu({ isHome, user, isLoading, scrollTo }: {
  isHome: boolean;
  user: any;
  isLoading: boolean;
  scrollTo: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const linkClass =
    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors w-full";
  const sectionLabel = "px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden h-9 w-9"
          data-testid="button-mobile-menu"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/50">
          <KonexLogo size="md" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={close} data-testid="button-close-mobile-menu">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {isHome ? (
            <>
              <p className={sectionLabel}>Explore</p>
              <button className={linkClass} onClick={() => { scrollTo("plans"); close(); }} data-testid="mobile-nav-plans">
                <Globe className="w-4 h-4 text-primary" />
                Plans
              </button>
              <button className={linkClass} onClick={() => { scrollTo("how-it-works"); close(); }} data-testid="mobile-nav-how-it-works">
                <Rocket className="w-4 h-4 text-primary" />
                How It Works
              </button>
              <button className={linkClass} onClick={() => { scrollTo("faq"); close(); }} data-testid="mobile-nav-faq">
                <Search className="w-4 h-4 text-primary" />
                FAQ
              </button>
              <p className={sectionLabel}>Navigation</p>
              <Link href="/find-plan" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-find-plan">
                  <Rocket className="w-4 h-4 text-primary" />
                  Find My Plan
                </span>
              </Link>
              <Link href="/destinations" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-browse">
                  <Search className="w-4 h-4 text-primary" />
                  Browse Destinations
                </span>
              </Link>
              <Link href="/compatibility" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-compatibility">
                  <Smartphone className="w-4 h-4 text-primary" />
                  Check Device
                </span>
              </Link>
              <Link href="/roadmap" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-roadmap">
                  <Rocket className="w-4 h-4 text-primary" />
                  Roadmap
                </span>
              </Link>
            </>
          ) : (
            <>
              <p className={sectionLabel}>Navigation</p>
              <Link href="/find-plan" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-find-plan">
                  <Rocket className="w-4 h-4 text-primary" />
                  Find My Plan
                </span>
              </Link>
              <Link href="/destinations" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-browse">
                  <Search className="w-4 h-4 text-primary" />
                  Browse Destinations
                </span>
              </Link>
              <Link href="/compatibility" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-compatibility">
                  <Smartphone className="w-4 h-4 text-primary" />
                  Check Device
                </span>
              </Link>
              <Link href="/roadmap" onClick={close}>
                <span className={linkClass} data-testid="mobile-link-roadmap">
                  <Rocket className="w-4 h-4 text-primary" />
                  Roadmap
                </span>
              </Link>
            </>
          )}

          <p className={sectionLabel}>Account</p>
          {!isLoading && (
            user ? (
              <>
                <Link href="/dashboard" onClick={close}>
                  <span className={linkClass} data-testid="mobile-link-dashboard">
                    <LayoutDashboard className="w-4 h-4 text-primary" />
                    Dashboard
                  </span>
                </Link>
                <Link href="/orders" onClick={close}>
                  <span className={linkClass} data-testid="mobile-link-orders">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    My eSIMs
                  </span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" onClick={close}>
                  <span className={linkClass} data-testid="mobile-link-login">
                    <LogIn className="w-4 h-4 text-primary" />
                    Log In
                  </span>
                </Link>
                <Link href="/signup" onClick={close}>
                  <span className={linkClass} data-testid="mobile-link-signup">
                    <Rocket className="w-4 h-4 text-primary" />
                    Sign Up
                  </span>
                </Link>
              </>
            )
          )}
        </nav>

        <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between">
          <CurrencySelector />
          <ThemeToggle />
        </div>

        {!user && (
          <div className="px-4 pb-4">
            <Link href="/destinations" onClick={close}>
              <Button className="w-full font-semibold" data-testid="mobile-cta-get-started">
                Get Started
              </Button>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
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

        {/* Home nav — desktop only */}
        {isHome ? (
          <nav className="hidden sm:flex items-center gap-0.5">
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
              <Button size="sm" className="ml-1 font-semibold" data-testid="nav-get-started">
                Get Started
              </Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" className="font-semibold" data-testid="nav-my-esims">
                My eSIMs
              </Button>
            </Link>

            <CurrencySelector />
            <ThemeToggle />
          </nav>
        ) : (
          <nav className="hidden sm:flex items-center gap-0.5">
            <Link href="/find-plan">
              <Button
                variant={location.startsWith("/find-plan") ? "secondary" : "ghost"}
                size="sm"
                data-testid="link-find-plan"
              >
                <Rocket className="w-4 h-4 mr-1.5" />
                Find Plan
              </Button>
            </Link>
            <Link href="/destinations">
              <Button
                variant={location.startsWith("/destinations") ? "secondary" : "ghost"}
                size="sm"
                data-testid="link-destinations"
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
              <Button size="sm" className="font-semibold" data-testid="nav-get-started-other">
                Get Started
              </Button>
            </Link>
            <Link href="/orders">
              <Button size="sm" variant="outline" className="font-semibold" data-testid="nav-my-esims-other">
                My eSIMs
              </Button>
            </Link>
            <CurrencySelector />
            <ThemeToggle />
          </nav>
        )}

        {/* Mobile right-side controls */}
        <div className="flex sm:hidden items-center gap-1">
          <CurrencySelector />
          <ThemeToggle />
          <MobileMenu
            isHome={isHome}
            user={user}
            isLoading={isLoading}
            scrollTo={scrollTo}
          />
        </div>

      </div>
    </header>
  );
}
