import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Wifi, Globe, Clock, Check, Zap, Star, Award,
  TrendingDown, Flame, Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanBadgeVariant = "recommended" | "popular" | "budget" | "premium";

export interface PlanCardProps {
  title: string;
  price: string;
  pricePerDay?: string;
  badge?: string;
  badgeVariant?: PlanBadgeVariant;
  dataAmount: string;
  coverage: string;
  validity: string;
  hotspot?: boolean;
  isRecommended?: boolean;
  savings?: string;
  onSelect?: () => void;
  ctaLabel?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

// ─── Badge config ──────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<
  PlanBadgeVariant,
  { bg: string; text: string; icon: React.ReactNode; bar: string }
> = {
  recommended: {
    bg: "bg-primary",
    text: "text-primary-foreground",
    icon: <Star className="w-3 h-3 fill-current" />,
    bar: "bg-primary",
  },
  popular: {
    bg: "bg-primary",
    text: "text-primary-foreground",
    icon: <Flame className="w-3 h-3" />,
    bar: "bg-primary",
  },
  budget: {
    bg: "bg-secondary",
    text: "text-secondary-foreground",
    icon: <TrendingDown className="w-3 h-3" />,
    bar: "bg-primary",
  },
  premium: {
    bg: "bg-secondary",
    text: "text-secondary-foreground",
    icon: <Award className="w-3 h-3" />,
    bar: "bg-primary",
  },
};

// ─── Feature row ───────────────────────────────────────────────────────────────

function Feature({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between py-1.5 text-sm border-b border-border/60 last:border-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="w-3.5 h-3.5 flex-shrink-0 opacity-70">{icon}</span>
        {label}
      </span>
      <span className="font-semibold text-foreground text-right max-w-[55%] truncate">
        {value}
      </span>
    </li>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

export function PlanCard({
  title,
  price,
  pricePerDay,
  badge,
  badgeVariant = "recommended",
  dataAmount,
  coverage,
  validity,
  hotspot,
  isRecommended = false,
  savings,
  onSelect,
  ctaLabel = "Get This Plan",
  disabled = false,
  className,
  "data-testid": testId,
}: PlanCardProps) {
  const cfg = BADGE_CONFIG[badgeVariant];
  const hasBadge = !!badge;

  return (
    <div
      data-testid={testId}
      className={cn(
        // Base card
        "relative flex flex-col rounded-2xl bg-card border border-border",
        "overflow-visible transition-transform duration-300 ease-out",
        // Recommended: elevated, glowing accent border
        isRecommended
          ? [
              "ring-2 ring-primary",
              "shadow-sm",
              "scale-[1.02]",
              "hover:scale-[1.035]",
            ]
          : [
              "shadow-[var(--shadow-sm)]",
              "hover:shadow-[var(--shadow-md)]",
              "hover:scale-[1.015]",
              "hover:-translate-y-0.5",
              "hover:border-border/80",
            ],
        className,
      )}
    >
      {/* ── Gradient accent bar at top ── */}
      <div className={cn("h-1 w-full rounded-t-2xl flex-shrink-0", cfg.bar)} />

      {/* ── Floating badge ── */}
      {hasBadge && (
        <div className="absolute -top-3.5 left-5 z-10">
          <span
            data-testid="badge-plan"
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide",
              "shadow-md",
              cfg.bg,
              cfg.text,
            )}
          >
            {cfg.icon}
            {badge}
          </span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-5 pt-4 gap-4">
        {/* ── Title ── */}
        <div className={cn("mt-1", hasBadge && "mt-3")}>
          <h3
            data-testid="text-plan-title"
            className="text-sm font-semibold text-muted-foreground uppercase tracking-widest"
          >
            {title}
          </h3>
        </div>

        {/* ── Pricing block ── */}
        <div>
          <div className="flex items-baseline gap-2">
            <span
              data-testid="text-plan-price"
              className={cn(
                "text-4xl font-bold tracking-tight",
                isRecommended
                  ? "text-primary"
                  : "text-foreground",
              )}
            >
              {price}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {pricePerDay && (
              <span
                data-testid="text-plan-per-day"
                className="text-xs font-semibold text-muted-foreground"
              >
                {pricePerDay}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              · one-time payment
            </span>
          </div>

          {/* Savings badge */}
          {savings && (
            <div
              data-testid="badge-plan-savings"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold px-3 py-1"
            >
              <Check className="w-3 h-3" />
              {savings}
            </div>
          )}
        </div>

        {/* ── Features list ── */}
        <ul className="flex-1">
          <Feature
            icon={<Wifi />}
            label="Data"
            value={dataAmount}
          />
          <Feature
            icon={<Globe />}
            label="Coverage"
            value={coverage}
          />
          <Feature
            icon={<Clock />}
            label="Validity"
            value={validity}
          />
          {hotspot && (
            <Feature
              icon={<Radio />}
              label="Hotspot"
              value="Supported"
            />
          )}
        </ul>

        {/* ── CTA button ── */}
        <Button
          data-testid="button-plan-cta"
          className={cn(
            "w-full font-semibold mt-auto",
            isRecommended
              ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              : "bg-background border border-border text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          variant={isRecommended ? "default" : "outline"}
          onClick={onSelect}
          disabled={disabled}
        >
          {isRecommended && <Zap className="w-3.5 h-3.5 mr-1.5" />}
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Plan Card Grid ───────────────────────────────────────────────────────────
// Convenience wrapper that lays out 1–3 cards with the recommended
// one slightly elevated. On mobile the cards stack vertically.

export interface PlanCardGridProps {
  cards: PlanCardProps[];
  className?: string;
}

export function PlanCardGrid({ cards, className }: PlanCardGridProps) {
  const count = cards.length;
  return (
    <div
      className={cn(
        "grid gap-5 items-start",
        count === 1 && "grid-cols-1 max-w-sm mx-auto",
        count === 2 && "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto",
        count >= 3 && "grid-cols-1 sm:grid-cols-3",
        className,
      )}
    >
      {cards.map((card, i) => (
        <PlanCard key={i} {...card} />
      ))}
    </div>
  );
}
