import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LayoutDashboard, Package, ShoppingCart, Wifi, TrendingUp,
  DollarSign, Globe, BarChart3, Pause, Play, HelpCircle,
  Send, RotateCcw, Download, ChevronRight, ArrowLeft, Smartphone, LogOut,
  Zap, Wrench, Settings, Target, TrendingDown, RefreshCw,
  Network, CheckCircle2, XCircle, AlertCircle, Clock, GitBranch, Server, ChevronDown,
  Wand2
} from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Plan, Order } from "@shared/schema";

type ProviderBreakdownEntry = {
  provider: string;
  orderCount: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
};

type TopPlanEntry = {
  planId: string;
  planName: string;
  destinationName: string;
  orderCount: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
};

type AdminStats = {
  totalRevenue: number;
  totalOrders: number;
  totalOrdersAll: number;
  pendingOrders: number;
  livePlans: number;
  totalDestinations: number;
  avgMargin: number;
  weightedMargin: number;
  totalProfit: number;
  totalCost: number;
  avgProfitPerOrder: number;
  activeEsims: number;
  esimsReady: number;
  esimsActive: number;
  providerBreakdown: ProviderBreakdownEntry[];
  topPerformingPlans: TopPlanEntry[];
};

type AdminSettings = {
  targetMarginPercent: string;
  profitMode?: string;
  routingMode?: string;
};

type CatalogHealth = {
  countryCount: number;
  regionCount: number;
  activeOffers: number;
  activeProviders: number;
  providerBreakdown: { providerKey: string; offerCount: number; countryCount: number }[];
  singleProviderCountries: string[];
  priorityCoverage: { code: string; covered: boolean }[];
  lastSync: {
    id: string;
    status: string;
    offersUpserted: number;
    startedAt: string;
    completedAt: string | null;
    failedProviders: string[];
  } | null;
};

const ROUTING_MODES = [
  {
    key: "profit_first",
    label: "Profit First",
    description: "Maximise margin per sale",
    weights: "Margin 50% · Success 20% · Health 10%",
    color: "text-emerald-600 dark:text-emerald-400",
    borderActive: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
    borderInactive: "border-border hover:border-emerald-300",
    dotColor: "bg-emerald-500",
  },
  {
    key: "balanced",
    label: "Balanced",
    description: "Good margin and reliability",
    weights: "Margin 35% · Success 25% · Health 15%",
    color: "text-violet-600 dark:text-violet-400",
    borderActive: "border-violet-500 bg-violet-50 dark:bg-violet-950/40",
    borderInactive: "border-border hover:border-violet-300",
    dotColor: "bg-violet-500",
  },
  {
    key: "reliability_first",
    label: "Reliability First",
    description: "Minimise fulfilment failures",
    weights: "Success 35% · Health 20% · Margin 20%",
    color: "text-blue-600 dark:text-blue-400",
    borderActive: "border-blue-500 bg-blue-50 dark:bg-blue-950/40",
    borderInactive: "border-border hover:border-blue-300",
    dotColor: "bg-blue-500",
  },
];

const PROFIT_MODES = [
  {
    key: 'growth',
    label: 'Growth',
    description: 'Lower prices, higher volume',
    margin: 30,
    color: 'text-blue-600 dark:text-blue-400',
    borderActive: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
    borderInactive: 'border-border hover:border-blue-300',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Competitive and profitable',
    margin: 50,
    color: 'text-violet-600 dark:text-violet-400',
    borderActive: 'border-violet-500 bg-violet-50 dark:bg-violet-950/40',
    borderInactive: 'border-border hover:border-violet-300',
    dotColor: 'bg-violet-500',
  },
  {
    key: 'profit',
    label: 'Profit',
    description: 'Maximum margin per sale',
    margin: 70,
    color: 'text-emerald-600 dark:text-emerald-400',
    borderActive: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    borderInactive: 'border-border hover:border-emerald-300',
    dotColor: 'bg-emerald-500',
  },
] as const;

function StatCard({ title, value, icon: Icon, suffix, subtitle }: { title: string; value: string | number; icon: any; suffix?: string; subtitle?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-bold" data-testid={`text-stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
        {value}{suffix || ""}
      </p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </Card>
  );
}

function CatalogHealthCard({ health, isLoading }: { health?: CatalogHealth; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="grid grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
    );
  }
  if (!health) return null;

  const allPriorityCovered = health.priorityCoverage.every(p => p.covered);
  const uncoveredPriority = health.priorityCoverage.filter(p => !p.covered);
  const syncStatus = health.lastSync?.status;
  const syncBadgeColor = syncStatus === "success" ? "text-emerald-600 dark:text-emerald-400"
    : syncStatus === "partial" ? "text-yellow-600 dark:text-yellow-400"
    : syncStatus === "running" ? "text-blue-600 dark:text-blue-400"
    : "text-muted-foreground";

  const formatRelativeTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Live Catalog Engine
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last sync:</span>
          <span className={`font-medium ${syncBadgeColor}`}>
            {health.lastSync ? formatRelativeTime(health.lastSync.startedAt) : "never"}
          </span>
          {health.lastSync?.status && (
            <Badge variant="outline" className={`text-[10px] py-0 ${syncBadgeColor}`}>
              {health.lastSync.status}
            </Badge>
          )}
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Countries", value: health.countryCount, icon: Globe, color: "text-blue-500" },
          { label: "Regions/Global", value: health.regionCount, icon: Network, color: "text-violet-500" },
          { label: "Active Offers", value: health.activeOffers.toLocaleString(), icon: Package, color: "text-emerald-500" },
          { label: "Live Providers", value: health.activeProviders, icon: Server, color: "text-orange-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
            <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
            <p className="text-xl font-bold">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Provider breakdown */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Offer distribution by provider</p>
        <div className="space-y-1.5">
          {health.providerBreakdown.map(p => {
            const pct = health.activeOffers > 0 ? (p.offerCount / health.activeOffers) * 100 : 0;
            return (
              <div key={p.providerKey} className="flex items-center gap-2" data-testid={`row-catalog-provider-${p.providerKey}`}>
                <span className="text-xs font-mono w-24 text-foreground truncate">{p.providerKey}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  {p.offerCount.toLocaleString()} ({Math.round(pct)}%)
                </span>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  {p.countryCount} destinations
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority country coverage */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-medium text-muted-foreground">Priority market coverage</p>
          {allPriorityCovered
            ? <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 py-0">All 20 covered</Badge>
            : <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300 py-0">{uncoveredPriority.length} missing</Badge>
          }
        </div>
        <div className="flex flex-wrap gap-1">
          {health.priorityCoverage.map(({ code, covered }) => (
            <span
              key={code}
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${covered
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
              }`}
              data-testid={`badge-priority-${code}`}
              title={covered ? `${code}: covered` : `${code}: no active offers`}
            >
              {code}
            </span>
          ))}
        </div>
      </div>

      {/* Single-provider risk */}
      {health.singleProviderCountries.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
            Single-provider destinations ({health.singleProviderCountries.length}) — no failover
          </p>
          <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
            {health.singleProviderCountries.slice(0, 30).join(" · ")}
            {health.singleProviderCountries.length > 30 && ` … +${health.singleProviderCountries.length - 30} more`}
          </p>
        </div>
      )}
    </Card>
  );
}

function DashboardTab() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: catalogHealth, isLoading: catalogLoading } = useQuery<CatalogHealth>({
    queryKey: ["/api/admin/catalog-health"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const [targetMarginInput, setTargetMarginInput] = useState<string>("");

  const saveSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AdminSettings>) => {
      const res = await apiRequest("PUT", "/api/admin/settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Settings saved" });
    },
  });

  const applyAutoPricingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/settings/apply-auto-pricing", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: `Auto-pricing applied`, description: `${data.updatedCount} plan(s) repriced` });
    },
  });

  const backfillProfitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/orders/backfill-profit", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: `Profit backfill complete`, description: `${data.updatedCount} order(s) updated` });
    },
    onError: () => {
      toast({ title: "Backfill failed", variant: "destructive" });
    },
  });

  const currentMarginPct = adminSettings?.targetMarginPercent
    ? Math.round(parseFloat(adminSettings.targetMarginPercent) * 100)
    : 60;

  function handleSaveMargin() {
    const val = parseFloat(targetMarginInput);
    if (isNaN(val) || val <= 0 || val >= 100) {
      toast({ title: "Invalid margin", description: "Enter a value between 1 and 99", variant: "destructive" });
      return;
    }
    saveSettingsMutation.mutate({ targetMarginPercent: String(val / 100) });
    setTargetMarginInput("");
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Primary profit metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Revenue" value={`$${(stats?.totalRevenue || 0).toFixed(2)}`} icon={DollarSign} subtitle="Fulfilled orders only" />
        <StatCard title="Net Profit" value={`$${(stats?.totalProfit || 0).toFixed(2)}`} icon={TrendingUp} subtitle="After wholesale costs" />
        <StatCard title="Margin %" value={`${(stats?.weightedMargin || 0).toFixed(1)}`} icon={BarChart3} suffix="%" subtitle="Weighted across all orders" />
        <StatCard title="Total Cost" value={`$${(stats?.totalCost || 0).toFixed(2)}`} icon={TrendingDown} subtitle="Wholesale cost of goods" />
      </div>
      {/* ── Operational metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Completed Orders"
          value={stats?.totalOrders || 0}
          icon={ShoppingCart}
          subtitle={stats?.pendingOrders ? `${stats.pendingOrders} pending · ${stats.totalOrdersAll} total` : `${stats?.totalOrdersAll || 0} total`}
        />
        <StatCard title="Avg Profit / Order" value={`$${(stats?.avgProfitPerOrder || 0).toFixed(2)}`} icon={Target} subtitle="Across fulfilled orders" />
        <StatCard title="Live Plans" value={stats?.livePlans || 0} icon={Package} />
        <StatCard
          title="eSIMs Issued"
          value={(stats?.esimsReady || 0) + (stats?.esimsActive || 0)}
          icon={Wifi}
          subtitle={stats?.esimsActive ? `${stats.esimsActive} active · ${stats.esimsReady || 0} ready` : "Provisioned to customers"}
        />
      </div>

      {/* ── Live Catalog Engine ── */}
      <CatalogHealthCard health={catalogHealth} isLoading={catalogLoading} />

      {/* ── Provider Performance ── */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Provider Performance
        </h3>
        {!stats?.providerBreakdown || stats.providerBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No provider data yet — orders with cost tracking will appear here.</p>
        ) : (
          <>
            <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground mb-1 px-2">
              <span className="col-span-2">Provider</span>
              <span className="text-right">Orders</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Profit</span>
              <span className="text-right">Avg Margin</span>
            </div>
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {stats.providerBreakdown.map((row) => {
                const marginColor =
                  row.marginPct >= 50 ? "text-emerald-600 dark:text-emerald-400"
                  : row.marginPct >= 30 ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400";
                const profitColor = row.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
                return (
                  <div
                    key={row.provider}
                    className="grid grid-cols-6 gap-2 text-sm items-center px-2 py-2.5 hover:bg-muted/40 transition-colors"
                    data-testid={`row-perf-${row.provider}`}
                  >
                    <div className="col-span-2 min-w-0">
                      <p className="font-medium text-xs truncate">{row.provider}</p>
                      <p className="text-[10px] text-muted-foreground">cost ${row.cost.toFixed(2)}</p>
                    </div>
                    <span className="text-right text-muted-foreground text-xs">{row.orderCount}</span>
                    <span className="text-right text-xs">${row.revenue.toFixed(2)}</span>
                    <span className={`text-right text-xs font-semibold ${profitColor}`}>
                      ${row.profit.toFixed(2)}
                    </span>
                    <span className={`text-right text-xs font-bold ${marginColor}`}>
                      {row.marginPct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── Top Performing Plans ── */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Top Performing Plans
        </h3>
        {!stats?.topPerformingPlans || stats.topPerformingPlans.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No order data yet — plan performance will appear after purchases.</p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground mb-1 px-2">
              <span className="col-span-2">Plan</span>
              <span className="text-right">Orders</span>
              <span className="text-right">Net Profit</span>
              <span className="text-right">Margin</span>
            </div>
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {stats.topPerformingPlans.map((row, idx) => {
                const marginColor =
                  row.marginPct >= 50 ? "text-emerald-600 dark:text-emerald-400"
                  : row.marginPct >= 30 ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400";
                return (
                  <div
                    key={row.planId}
                    className="grid grid-cols-5 gap-2 items-center px-2 py-2.5 hover:bg-muted/40 transition-colors"
                    data-testid={`row-top-plan-${row.planId}`}
                  >
                    <div className="col-span-2 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-4 flex-shrink-0">#{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{row.planName}</p>
                        {row.destinationName && (
                          <p className="text-[10px] text-muted-foreground truncate">{row.destinationName}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-right text-xs text-muted-foreground">{row.orderCount}</span>
                    <span className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ${row.profit.toFixed(2)}
                    </span>
                    <span className={`text-right text-xs font-bold ${marginColor}`}>
                      {row.marginPct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── Profit Optimisation Mode ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Profit Optimisation Mode
          </h3>
          {settingsLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <span className="text-xs text-muted-foreground">
              Active margin: <span className="font-semibold text-foreground" data-testid="text-current-margin">{currentMarginPct}%</span>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Sets the global target margin for all auto-priced plans. Retail = cost ÷ (1 − margin). Per-plan overrides take precedence.
        </p>

        {/* Mode cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {PROFIT_MODES.map((mode) => {
            const isActive = adminSettings?.profitMode === mode.key;
            return (
              <button
                key={mode.key}
                onClick={() => {
                  saveSettingsMutation.mutate({ profitMode: mode.key });
                  setTargetMarginInput("");
                }}
                disabled={saveSettingsMutation.isPending}
                className={`rounded-lg border-2 p-3 text-left transition-all focus:outline-none ${
                  isActive ? mode.borderActive : mode.borderInactive
                }`}
                data-testid={`button-mode-${mode.key}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${isActive ? mode.color : "text-foreground"}`}>
                    {mode.label}
                  </span>
                  <span className={`text-xs font-mono font-bold ${isActive ? mode.color : "text-muted-foreground"}`}>
                    {mode.margin}%
                  </span>
                </div>
                <p className={`text-[11px] leading-tight ${isActive ? "text-foreground/70" : "text-muted-foreground"}`}>
                  {mode.description}
                </p>
                {isActive && (
                  <div className={`mt-2 flex items-center gap-1 text-[10px] font-medium ${mode.color}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${mode.dotColor}`} />
                    Active
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom margin input */}
        <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground font-medium">
            {adminSettings?.profitMode === 'custom' ? '⚙️ Custom margin active:' : 'Or set a custom margin:'}
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={99}
              step={1}
              placeholder={`${currentMarginPct}`}
              value={targetMarginInput}
              onChange={(e) => setTargetMarginInput(e.target.value)}
              className="w-20 h-8 text-sm"
              data-testid="input-target-margin"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveMargin}
              disabled={saveSettingsMutation.isPending || !targetMarginInput}
              data-testid="button-save-margin"
            >
              Apply
            </Button>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="default"
              onClick={() => applyAutoPricingMutation.mutate()}
              disabled={applyAutoPricingMutation.isPending}
              data-testid="button-apply-auto-pricing"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${applyAutoPricingMutation.isPending ? "animate-spin" : ""}`} />
              Reprice Auto Plans
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => backfillProfitMutation.mutate()}
                  disabled={backfillProfitMutation.isPending}
                  data-testid="button-backfill-profit"
                >
                  <TrendingUp className={`w-3.5 h-3.5 mr-1.5 ${backfillProfitMutation.isPending ? "animate-spin" : ""}`} />
                  Backfill Profit
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Retroactively compute and store profit/margin on existing orders that are missing this data.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Inline edit panel for a single plan ─────────────────────────────────────
function PlanEditPanel({
  plan,
  globalMarginPct,
  onSave,
  onClose,
  isSaving,
}: {
  plan: Plan;
  globalMarginPct: number;
  onSave: (updates: Record<string, any>) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [cost, setCost] = useState(plan.wholesaleCost != null ? String(plan.wholesaleCost) : "");
  const [manualPrice, setManualPrice] = useState(String(plan.price));
  const [marginOverride, setMarginOverride] = useState(
    plan.targetMargin != null ? String(Math.round(plan.targetMargin * 100)) : ""
  );
  const isAuto = plan.pricingMode === 'auto';

  // Effective margin for preview (per-plan override or global)
  const effectiveMarginPct = marginOverride !== "" && !isNaN(parseFloat(marginOverride))
    ? parseFloat(marginOverride)
    : globalMarginPct;
  const costNum = parseFloat(cost);
  const computedAutoPrice = !isNaN(costNum) && costNum > 0 && effectiveMarginPct > 0 && effectiveMarginPct < 100
    ? Math.ceil(costNum / (1 - effectiveMarginPct / 100) * 100) / 100
    : null;

  const manualPriceNum = parseFloat(manualPrice);
  const priceValidationError: string | null = (() => {
    if (!isAuto && !isNaN(costNum) && costNum > 0 && !isNaN(manualPriceNum) && manualPriceNum > 0) {
      if (manualPriceNum < costNum) return `Price must be ≥ cost ($${costNum.toFixed(2)})`;
    }
    return null;
  })();

  function handleSave() {
    const updates: Record<string, any> = {};
    if (cost !== "" && !isNaN(parseFloat(cost))) updates.wholesaleCost = parseFloat(cost);
    if (!isAuto && manualPrice !== "" && !isNaN(parseFloat(manualPrice))) {
      updates.price = parseFloat(manualPrice);
    }
    if (marginOverride !== "") {
      const m = parseFloat(marginOverride);
      updates.targetMargin = (!isNaN(m) && m > 0 && m < 100) ? m / 100 : null;
    } else {
      updates.targetMargin = null;
    }
    onSave(updates);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border" data-testid={`edit-panel-${plan.id}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Provider cost */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            Provider Cost (USD)
          </label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={cost}
            onChange={e => setCost(e.target.value)}
            placeholder="e.g. 1.20"
            className="h-8 text-sm"
            data-testid={`input-cost-${plan.id}`}
          />
        </div>

        {/* Retail price — read-only when auto */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            Retail Price (USD)
            {isAuto && <Badge variant="outline" className="text-[9px] py-0 px-1 border-violet-300 text-violet-600 dark:text-violet-300"><Zap className="w-2 h-2 mr-0.5" />Auto</Badge>}
          </label>
          {isAuto ? (
            <div className="relative">
              <Input
                readOnly
                value={computedAutoPrice != null ? `$${computedAutoPrice.toFixed(2)}` : "—"}
                className="h-8 text-sm bg-muted/60 cursor-default text-muted-foreground"
                data-testid={`input-price-auto-${plan.id}`}
              />
              {computedAutoPrice != null && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-violet-500">
                  computed
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={manualPrice}
                onChange={e => setManualPrice(e.target.value)}
                placeholder="e.g. 9.99"
                className={`h-8 text-sm ${priceValidationError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                data-testid={`input-price-manual-${plan.id}`}
              />
              {priceValidationError && (
                <p className="text-[11px] text-red-500" data-testid={`error-price-${plan.id}`}>{priceValidationError}</p>
              )}
            </div>
          )}
        </div>

        {/* Per-plan margin override */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3" />
            Margin Override %
          </label>
          {/* Preset quick-picks */}
          <div className="flex gap-1.5 flex-wrap">
            {PROFIT_MODES.map((mode) => {
              const isSelected = marginOverride === String(mode.margin);
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setMarginOverride(isSelected ? "" : String(mode.margin))}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                    isSelected
                      ? `${mode.borderActive} ${mode.color}`
                      : `border-border text-muted-foreground hover:border-primary/40 hover:text-foreground`
                  }`}
                  data-testid={`button-margin-preset-${mode.key}-${plan.id}`}
                >
                  {mode.label} {mode.margin}%
                </button>
              );
            })}
            {marginOverride !== "" && (
              <button
                type="button"
                onClick={() => setMarginOverride("")}
                className="px-2 py-0.5 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`button-margin-clear-${plan.id}`}
              >
                Use global ({globalMarginPct}%)
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type="number"
              min={1}
              max={99}
              step={1}
              value={marginOverride}
              onChange={e => setMarginOverride(e.target.value)}
              placeholder={`Global: ${globalMarginPct}%`}
              className="h-8 text-sm pr-6"
              data-testid={`input-margin-override-${plan.id}`}
            />
            {marginOverride !== "" && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Leave blank to use the global margin ({globalMarginPct}%). Preset shortcuts above match optimisation modes.
          </p>
        </div>
      </div>

      {/* Auto-pricing formula explainer */}
      {isAuto && costNum > 0 && computedAutoPrice != null && (
        <div className="mt-2 text-[11px] text-muted-foreground bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 rounded-md px-3 py-1.5">
          <Zap className="w-3 h-3 inline mr-1 text-violet-500" />
          Formula: ${costNum.toFixed(2)} ÷ (1 − {effectiveMarginPct}%) = <span className="font-semibold text-violet-700 dark:text-violet-300">${computedAutoPrice.toFixed(2)}</span>
          {" "}→ margin = {Math.round(((computedAutoPrice - costNum) / computedAutoPrice) * 100)}%
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || priceValidationError !== null}
          data-testid={`button-save-plan-${plan.id}`}
        >
          {isSaving ? <RotateCcw className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
          Save changes
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid={`button-cancel-edit-${plan.id}`}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PlansTab() {
  const { toast } = useToast();
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });
  const globalMarginPct = adminSettings?.targetMarginPercent
    ? Math.round(parseFloat(adminSettings.targetMarginPercent) * 100)
    : 60;

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/plans/${id}`, updates);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan updated" });
      setExpandedPlanId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live": return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Live</Badge>;
      case "paused": return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Paused</Badge>;
      case "draft": return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-sm text-muted-foreground">{plans?.length || 0} plans total</p>
        <Button variant="outline" size="sm" data-testid="button-export-plans">
          <Download className="w-4 h-4 mr-1.5" />
          Export CSV
        </Button>
      </div>
      {plans?.map((plan) => {
        const margin = plan.wholesaleCost && plan.price > 0
          ? ((plan.price - plan.wholesaleCost) / plan.price) * 100
          : null;
        const isAuto = plan.pricingMode === 'auto';
        const isExpanded = expandedPlanId === plan.id;
        const marginColor = margin === null ? "" : margin >= 50 ? "text-emerald-600 dark:text-emerald-400" : margin >= 30 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

        // Profitability border: green ≥30%, yellow 0–30%, red <0%, neutral = no cost
        const borderClass =
          margin === null ? ""
          : margin >= 30 ? "border-l-4 border-l-emerald-400 dark:border-l-emerald-500"
          : margin >= 0  ? "border-l-4 border-l-yellow-400 dark:border-l-yellow-500"
          : "border-l-4 border-l-red-400 dark:border-l-red-500";

        return (
          <Card key={plan.id} className={`p-4 ${borderClass}`} data-testid={`card-admin-plan-${plan.id}`}>
            {/* ── Top row: name + status badges + actions ── */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Title + status */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h3 className="font-semibold text-sm">{plan.name}</h3>
                  {getStatusBadge(plan.planStatus)}
                  {plan.provider && plan.provider !== 'manual' && (
                    <Badge variant="outline" className="text-[10px] font-mono" data-testid={`badge-provider-${plan.id}`}>
                      {plan.provider}
                    </Badge>
                  )}
                </div>

                {/* Spec line */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <span>{plan.dataAmount}</span>
                  <span className="opacity-40">·</span>
                  <span>{plan.validity}</span>
                </div>

                {/* ── Pricing metrics row ── */}
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Cost */}
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Cost</span>
                    <span className="text-sm font-semibold" data-testid={`text-cost-${plan.id}`}>
                      {plan.wholesaleCost != null && plan.wholesaleCost > 0 ? `$${plan.wholesaleCost.toFixed(2)}` : "—"}
                    </span>
                  </div>

                  <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>

                  {/* Retail */}
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-0.5">
                      Retail {isAuto && <Zap className="w-2.5 h-2.5 text-violet-500" />}
                    </span>
                    <span className="text-sm font-semibold" data-testid={`text-retail-${plan.id}`}>
                      ${plan.price.toFixed(2)}
                    </span>
                  </div>

                  <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>

                  {/* Margin % */}
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Margin</span>
                    <span className={`text-sm font-bold ${marginColor || "text-muted-foreground"}`} data-testid={`text-margin-${plan.id}`}>
                      {margin !== null ? `${Math.round(margin)}%` : "—"}
                    </span>
                  </div>

                  <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>

                  {/* Pricing Mode */}
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Pricing Mode</span>
                    <span
                      className={`text-xs font-semibold flex items-center gap-0.5 ${isAuto ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}
                      data-testid={`badge-pricing-mode-${plan.id}`}
                    >
                      {isAuto ? <><Zap className="w-3 h-3" /> Auto</> : <><Wrench className="w-3 h-3" /> Manual</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-col sm:items-end">
                {/* Auto Pricing toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={isAuto ? "default" : "outline"}
                      onClick={() => updateMutation.mutate({
                        id: plan.id,
                        updates: { pricingMode: isAuto ? "manual" : "auto" },
                      })}
                      disabled={updateMutation.isPending}
                      className={isAuto ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}
                      data-testid={`button-toggle-pricing-mode-${plan.id}`}
                    >
                      {isAuto ? <Zap className="w-3.5 h-3.5 mr-1" /> : <Wrench className="w-3.5 h-3.5 mr-1" />}
                      {isAuto ? "Auto Pricing ON" : "Auto Pricing OFF"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isAuto ? "Click to switch to manual pricing" : "Click to enable auto pricing (cost ÷ (1 − margin))"}
                  </TooltipContent>
                </Tooltip>

                <div className="flex gap-2">
                  {/* Edit pricing button */}
                  <Button
                    size="sm"
                    variant={isExpanded ? "secondary" : "outline"}
                    onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                    data-testid={`button-edit-plan-${plan.id}`}
                  >
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    {isExpanded ? "Close" : "Edit"}
                  </Button>
                  {/* Plan status toggle */}
                  {plan.planStatus === "live" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateMutation.mutate({ id: plan.id, updates: { planStatus: "paused" } })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-pause-plan-${plan.id}`}
                    >
                      <Pause className="w-3.5 h-3.5 mr-1" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => updateMutation.mutate({ id: plan.id, updates: { planStatus: "live" } })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-activate-plan-${plan.id}`}
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Activate
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Inline edit panel ── */}
            {isExpanded && (
              <PlanEditPanel
                plan={plan}
                globalMarginPct={globalMarginPct}
                onSave={(updates) => updateMutation.mutate({ id: plan.id, updates })}
                onClose={() => setExpandedPlanId(null)}
                isSaving={updateMutation.isPending}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}

function OrdersTab() {
  const { toast } = useToast();

  const { data: allOrders, isLoading } = useQuery<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string })[]>({
    queryKey: ["/api/orders", "admin-all"],
    queryFn: async () => {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Order updated" });
    },
  });

  // Routing transparency — lazy fetch per order on expand
  const [routingExpanded, setRoutingExpanded] = useState<Record<string, boolean>>({});
  const [routingData, setRoutingData] = useState<Record<string, any>>({});
  const [routingLoading, setRoutingLoading] = useState<Record<string, boolean>>({});

  const toggleRouting = async (orderId: string) => {
    const next = !routingExpanded[orderId];
    setRoutingExpanded(p => ({ ...p, [orderId]: next }));
    if (next && !routingData[orderId]) {
      setRoutingLoading(p => ({ ...p, [orderId]: true }));
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/routing`);
        if (res.ok) {
          const data = await res.json();
          setRoutingData(p => ({ ...p, [orderId]: data }));
        } else {
          setRoutingData(p => ({ ...p, [orderId]: null }));
        }
      } catch {
        setRoutingData(p => ({ ...p, [orderId]: null }));
      } finally {
        setRoutingLoading(p => ({ ...p, [orderId]: false }));
      }
    }
  };

  const [refulfillPending, setRefulfillPending] = useState<Record<string, boolean>>({});

  // ── Inject eSIM dialog state ───────────────────────────────────────────────
  const [injectDialog, setInjectDialog] = useState<{ orderId: string; email: string } | null>(null);
  const [injectForm, setInjectForm] = useState({ iccid: "", qrCodeUrl: "", lpaUri: "", providerEsimId: "" });
  const [injectPending, setInjectPending] = useState(false);

  const submitInjectEsim = async () => {
    if (!injectDialog) return;
    if (!injectForm.iccid.trim() || !injectForm.qrCodeUrl.trim()) {
      toast({ title: "ICCID and QR Code URL are required", variant: "destructive" });
      return;
    }
    setInjectPending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/orders/${injectDialog.orderId}/inject-esim`, {
        iccid: injectForm.iccid.trim(),
        qrCodeUrl: injectForm.qrCodeUrl.trim(),
        lpaUri: injectForm.lpaUri.trim() || undefined,
        providerEsimId: injectForm.providerEsimId.trim() || undefined,
        providerName: "esimaccess",
      });
      const data = await res.json();
      toast({ title: "eSIM injected", description: `Order fulfilled and email sent to ${injectDialog.email}` });
      setInjectDialog(null);
      setInjectForm({ iccid: "", qrCodeUrl: "", lpaUri: "", providerEsimId: "" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }, 1000);
    } catch (err: any) {
      toast({ title: "Inject failed", description: err.message, variant: "destructive" });
    } finally {
      setInjectPending(false);
    }
  };

  // ── Plan override dialog state ─────────────────────────────────────────────
  const [overrideDialog, setOverrideDialog] = useState<{ orderId: string; email: string } | null>(null);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [availablePlansLoading, setAvailablePlansLoading] = useState(false);
  const [selectedOverridePlan, setSelectedOverridePlan] = useState<{ providerKey: string; planCode: string } | null>(null);

  const openOverrideDialog = async (orderId: string, email: string) => {
    setOverrideDialog({ orderId, email });
    setSelectedOverridePlan(null);
    setAvailablePlans([]);
    setAvailablePlansLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/available-plans`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setAvailablePlans(data.plans || []);
    } catch (err: any) {
      toast({ title: "Failed to load plans", description: err.message, variant: "destructive" });
      setOverrideDialog(null);
    } finally {
      setAvailablePlansLoading(false);
    }
  };

  const refulfillOrder = async (orderId: string, providerKey?: string, planCode?: string) => {
    setRefulfillPending(p => ({ ...p, [orderId]: true }));
    try {
      const body: Record<string, string> = {};
      if (providerKey) body.providerKey = providerKey;
      if (planCode) body.planCode = planCode;
      const res = await apiRequest("POST", `/api/admin/orders/${orderId}/refulfill`, body);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      const via = planCode ? ` via ${providerKey} (${planCode})` : providerKey ? ` via ${providerKey}` : "";
      toast({ title: "Re-fulfillment triggered", description: `The order will be provisioned again shortly${via}.` });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }, 3000);
    } catch (err: any) {
      toast({ title: "Re-fulfillment failed", description: err.message, variant: "destructive" });
    } finally {
      setRefulfillPending(p => ({ ...p, [orderId]: false }));
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Paid</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Pending</Badge>;
      case "paid": return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400">Paid</Badge>;
      case "fulfilling": return <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400">Fulfilling…</Badge>;
      case "fulfilled": return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Fulfilled</Badge>;
      case "fulfillment_failed": return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400">Failed</Badge>;
      case "refunded": return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400">Refunded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEsimStatusBadge = (status: string) => {
    switch (status) {
      case "issued": return <Badge variant="outline">Issued</Badge>;
      case "installed": return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400">Installed</Badge>;
      case "active": return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Active</Badge>;
      case "expired": return <Badge className="bg-muted text-muted-foreground">Expired</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-sm text-muted-foreground">{allOrders?.length || 0} orders total</p>
        <Button variant="outline" size="sm" data-testid="button-export-orders">
          <Download className="w-4 h-4 mr-1.5" />
          Export CSV
        </Button>
      </div>
      {allOrders?.length === 0 && (
        <Card className="p-10 text-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No orders yet</p>
        </Card>
      )}
      {allOrders?.map((order) => {
        const orderProfit = (order as any).profit as number | null | undefined;
        const providerDisplay = (order as any).selectedProviderKey || (order as any).providerName || null;
        const profitColor =
          orderProfit == null ? ""
          : orderProfit > 0 ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-500 dark:text-red-400";
        const marginPct = (order as any).marginPercent as number | null | undefined;

        return (
        <Card key={order.id} className="p-4" data-testid={`card-admin-order-${order.id}`}>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Title row */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <h3 className="font-semibold text-sm">{order.destinationName || "Unknown"} — {order.planName || "Plan"}</h3>
                {getOrderStatusBadge(order.status)}
                {getEsimStatusBadge(order.esimStatus)}
                {providerDisplay && (
                  <Badge variant="outline" className="font-mono text-[10px] border-violet-300 text-violet-700 dark:text-violet-300" data-testid={`badge-provider-${order.id}`}>
                    {providerDisplay}
                  </Badge>
                )}
              </div>

              {/* Metrics row: Revenue | Cost | Profit | Margin */}
              <div className="flex items-center gap-4 flex-wrap mb-2">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Revenue</span>
                  <span className="text-sm font-semibold" data-testid={`text-revenue-${order.id}`}>${order.totalPrice.toFixed(2)}</span>
                </div>
                {(order as any).wholesaleCostUsd != null && (
                  <>
                    <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Cost</span>
                      <span className="text-sm font-semibold text-muted-foreground" data-testid={`text-cost-order-${order.id}`}>
                        ${Number((order as any).wholesaleCostUsd).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                {orderProfit != null && (
                  <>
                    <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Profit</span>
                      <span className={`text-sm font-bold ${profitColor}`} data-testid={`text-profit-${order.id}`}>
                        ${orderProfit.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                {marginPct != null && (
                  <>
                    <span className="text-muted-foreground opacity-30 text-lg font-thin">|</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Margin</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`text-sm font-bold cursor-default ${
                              marginPct >= 40 ? "text-emerald-600 dark:text-emerald-400"
                              : marginPct >= 25 ? "text-yellow-600 dark:text-yellow-400"
                              : "text-red-600 dark:text-red-400"
                            }`}
                            data-testid={`text-margin-${order.id}`}
                          >
                            {marginPct.toFixed(1)}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {(order as any).wholesaleCostUsd != null
                            ? `Cost $${Number((order as any).wholesaleCostUsd).toFixed(2)} → Retail $${order.totalPrice.toFixed(2)}`
                            : "Margin at checkout time"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </>
                )}
              </div>

              {/* Detail line: email | iccid | date */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>{order.email}</span>
                {order.iccid && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{order.iccid.slice(0, 10)}…</span>
                  </>
                )}
                {order.createdAt && (
                  <>
                    <span>·</span>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>

              {/* Routing transparency — only shown for orders processed by the routing engine */}
              {(order as any).routingDecisionId && (
                <div className="mt-2 pt-2 border-t border-dashed border-border">
                  <button
                    onClick={() => toggleRouting(order.id)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`button-routing-toggle-${order.id}`}
                  >
                    <Network className="w-3 h-3" />
                    <span>Routing decision</span>
                    <ChevronRight className={`w-3 h-3 transition-transform ${routingExpanded[order.id] ? "rotate-90" : ""}`} />
                  </button>
                  {routingExpanded[order.id] && (
                    <div className="mt-2">
                      {routingLoading[order.id] ? (
                        <div className="flex gap-3">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      ) : routingData[order.id] === null ? (
                        <p className="text-xs text-muted-foreground">Routing details not available</p>
                      ) : routingData[order.id] ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {routingData[order.id].marginPercent != null && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs" data-testid={`badge-routing-margin-${order.id}`}>
                                <TrendingUp className="w-3 h-3 text-violet-500" />
                                Margin {routingData[order.id].marginPercent}%
                              </span>
                            )}
                            {routingData[order.id].healthScore != null && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs" data-testid={`badge-routing-health-${order.id}`}>
                                <CheckCircle2 className={`w-3 h-3 ${
                                  routingData[order.id].healthScore >= 90 ? "text-emerald-500"
                                  : routingData[order.id].healthScore >= 60 ? "text-yellow-500"
                                  : "text-red-500"
                                }`} />
                                Health {routingData[order.id].healthScore}/100
                              </span>
                            )}
                            {routingData[order.id].destinationSuccessRate != null && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs" data-testid={`badge-routing-dest-${order.id}`}>
                                <Globe className="w-3 h-3 text-blue-500" />
                                Dest. success {routingData[order.id].destinationSuccessRate}%
                              </span>
                            )}
                            {routingData[order.id].confidenceScore != null && (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                                routingData[order.id].confidenceLabel === "high"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : routingData[order.id].confidenceLabel === "medium"
                                    ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                              }`} data-testid={`badge-routing-confidence-${order.id}`}>
                                <HelpCircle className="w-3 h-3" />
                                Confidence {routingData[order.id].confidenceScore} ({routingData[order.id].confidenceLabel})
                              </span>
                            )}
                            {routingData[order.id].fallbackCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                                <GitBranch className="w-3 h-3 text-muted-foreground" />
                                {routingData[order.id].fallbackCount} fallback{routingData[order.id].fallbackCount !== 1 ? "s" : ""}{" "}
                                ({routingData[order.id].fallbackProviders?.map((f: any) => f.providerKey).join(", ")})
                              </span>
                            )}
                          </div>
                          {routingData[order.id].decisionReason && (
                            <p className="text-xs text-muted-foreground italic leading-relaxed" data-testid={`text-routing-reason-${order.id}`}>
                              "{routingData[order.id].decisionReason}"
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Select
                defaultValue={order.status}
                onValueChange={(val) => updateMutation.mutate({ id: order.id, updates: { status: val } })}
              >
                <SelectTrigger className="w-28" data-testid={`select-order-status-${order.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Paid</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              {/* Re-fulfill: show for failed/stuck orders */}
              {(order.status === "fulfillment_failed" || order.status === "paid" || order.status === "fulfilling") && (
                <div className="flex items-center" data-testid={`refulfill-group-${order.id}`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-r-none border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 border-r-0"
                    onClick={() => refulfillOrder(order.id)}
                    disabled={refulfillPending[order.id]}
                    data-testid={`button-refulfill-${order.id}`}
                  >
                    {refulfillPending[order.id]
                      ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />Retrying…</>
                      : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Re-fulfill</>}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-l-none border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 px-1.5"
                        disabled={refulfillPending[order.id]}
                        data-testid={`button-refulfill-dropdown-${order.id}`}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      <DropdownMenuItem onClick={() => refulfillOrder(order.id)}>
                        Auto (smart chain)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openOverrideDialog(order.id, order.email)}
                        className="text-violet-700 dark:text-violet-400 font-medium">
                        <Wand2 className="w-3 h-3 mr-1.5" />
                        Pick alternative plan…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                          setInjectDialog({ orderId: order.id, email: order.email });
                          setInjectForm({ iccid: "", qrCodeUrl: "", lpaUri: "", providerEsimId: "" });
                        }}
                        className="text-blue-700 dark:text-blue-400 font-medium">
                        <Send className="w-3 h-3 mr-1.5" />
                        Inject eSIM credentials…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => refulfillOrder(order.id, "esimgo")}>
                        Force via eSIMGo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refulfillOrder(order.id, "esimaccess")}>
                        Force via eSIM Access
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refulfillOrder(order.id, "airalo")}>
                        Force via Airalo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refulfillOrder(order.id, "zendit")}>
                        Force via Zendit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  toast({ title: "QR Resent", description: `QR code resent to ${order.email}` });
                }}
                data-testid={`button-resend-qr-${order.id}`}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                Resend QR
              </Button>
            </div>
          </div>
        </Card>
        );
      })}

      {/* ── Inject eSIM credentials dialog ───────────────────────────────── */}
      <Dialog open={!!injectDialog} onOpenChange={open => { if (!open) setInjectDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-500" />
              Inject eSIM credentials
            </DialogTitle>
            <DialogDescription>
              The eSIM was provisioned by the provider but our system didn't record it. Paste the credentials from the provider dashboard to mark the order fulfilled and send the customer their QR code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ICCID <span className="text-red-500">*</span></label>
              <Input
                placeholder="894801001010908290"
                value={injectForm.iccid}
                onChange={e => setInjectForm(f => ({ ...f, iccid: e.target.value }))}
                data-testid="input-inject-iccid"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">QR Code URL <span className="text-red-500">*</span></label>
              <Input
                placeholder="https://p.qrsim.net/..."
                value={injectForm.qrCodeUrl}
                onChange={e => setInjectForm(f => ({ ...f, qrCodeUrl: e.target.value }))}
                data-testid="input-inject-qr-url"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">LPA URI / Activation Code <span className="text-muted-foreground font-normal">(optional but recommended)</span></label>
              <Input
                placeholder="LPA:1$rsp-eu.simlessly.com$55C585E0E667..."
                value={injectForm.lpaUri}
                onChange={e => setInjectForm(f => ({ ...f, lpaUri: e.target.value }))}
                data-testid="input-inject-lpa"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Provider eSIM Transaction No <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="26051906480018"
                value={injectForm.providerEsimId}
                onChange={e => setInjectForm(f => ({ ...f, providerEsimId: e.target.value }))}
                data-testid="input-inject-provider-id"
                className="font-mono text-sm"
              />
            </div>
          </div>
          {injectDialog && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-3">
                This will mark the order as fulfilled and send the eSIM QR code to <span className="font-medium">{injectDialog.email}</span>.
              </p>
              <Button
                className="w-full"
                data-testid="button-confirm-inject-esim"
                disabled={injectPending || !injectForm.iccid.trim() || !injectForm.qrCodeUrl.trim()}
                onClick={submitInjectEsim}
              >
                {injectPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Injecting…</>
                ) : (
                  <><Send className="w-3.5 h-3.5 mr-1.5" />Inject & send QR to customer</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Plan override dialog ─────────────────────────────────────────── */}
      <Dialog open={!!overrideDialog} onOpenChange={open => { if (!open) setOverrideDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-violet-500" />
              Pick alternative plan
            </DialogTitle>
            <DialogDescription>
              Choose a replacement plan from an active provider. The original order's amount is unchanged — you may need to contact the customer if value differs significantly.
            </DialogDescription>
          </DialogHeader>

          {availablePlansLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : availablePlans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No active plans found for this country in Airalo, Zendit, or eSIMGo.
            </div>
          ) : (
            <div className="space-y-1.5 py-1">
              {availablePlans.map((plan, i) => {
                const key = `${plan.providerKey}::${plan.planCode}`;
                const isSelected = selectedOverridePlan?.planCode === plan.planCode && selectedOverridePlan?.providerKey === plan.providerKey;
                return (
                  <button
                    key={i}
                    data-testid={`plan-override-option-${i}`}
                    onClick={() => setSelectedOverridePlan({ providerKey: plan.providerKey, planCode: plan.planCode })}
                    className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors text-sm ${
                      isSelected
                        ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{plan.dataLabel}</span>
                        <span className="text-muted-foreground mx-1.5">·</span>
                        <span className="text-muted-foreground">{plan.validityDays}d</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {plan.providerKey}
                        </Badge>
                        <span className="text-xs text-muted-foreground">${plan.wholesaleUsd.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{plan.planCode}</div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedOverridePlan && overrideDialog && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Will fulfill order for <span className="font-medium">{overrideDialog.email}</span> using{" "}
                <span className="font-medium">{selectedOverridePlan.providerKey}</span> plan code{" "}
                <code className="text-[10px] bg-muted px-1 rounded">{selectedOverridePlan.planCode}</code>
              </p>
              <Button
                className="w-full"
                data-testid="button-confirm-override-fulfill"
                disabled={refulfillPending[overrideDialog.orderId]}
                onClick={async () => {
                  const { orderId } = overrideDialog;
                  setOverrideDialog(null);
                  await refulfillOrder(orderId, selectedOverridePlan.providerKey, selectedOverridePlan.planCode);
                }}
              >
                {refulfillPending[overrideDialog?.orderId] ? (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Fulfilling…</>
                ) : (
                  <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Fulfill with this plan</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InventoryTab() {
  const { data: allOrders, isLoading } = useQuery<(Order & { planName?: string; destinationName?: string; flagEmoji?: string })[]>({
    queryKey: ["/api/orders", "admin-all"],
    queryFn: async () => {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const statusCounts = {
    issued: allOrders?.filter(o => o.esimStatus === "issued").length || 0,
    installed: allOrders?.filter(o => o.esimStatus === "installed").length || 0,
    active: allOrders?.filter(o => o.esimStatus === "active").length || 0,
    expired: allOrders?.filter(o => o.esimStatus === "expired").length || 0,
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Issued" value={statusCounts.issued} icon={Package} />
        <StatCard title="Installed" value={statusCounts.installed} icon={Smartphone} />
        <StatCard title="Active" value={statusCounts.active} icon={Wifi} />
        <StatCard title="Expired" value={statusCounts.expired} icon={RotateCcw} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">eSIM Inventory Summary</h3>
        <p className="text-sm text-muted-foreground">
          Total eSIMs tracked: {allOrders?.length || 0}
        </p>
        <Separator className="my-3" />
        <div className="space-y-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between">
              <span className="text-sm capitalize">{status}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${allOrders?.length ? (count / allOrders.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-8 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MarginsTab() {
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
        ))}
      </div>
    );
  }

  const sorted = [...(plans || [])].sort((a, b) => {
    const mA = a.wholesaleCost && a.price > 0 ? ((a.price - a.wholesaleCost) / a.price) * 100 : 0;
    const mB = b.wholesaleCost && b.price > 0 ? ((b.price - b.wholesaleCost) / b.price) * 100 : 0;
    return mB - mA;
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4 text-xs font-medium text-muted-foreground px-4 mb-1">
        <span>Plan</span>
        <span className="text-center">Cost / Retail</span>
        <span className="text-right">Margin</span>
      </div>
      {sorted.map((plan) => {
        const margin = plan.wholesaleCost && plan.price > 0
          ? ((plan.price - plan.wholesaleCost) / plan.price) * 100
          : 0;
        const marginColor = margin >= 50 ? "text-emerald-600 dark:text-emerald-400" : margin >= 30 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

        return (
          <Card key={plan.id} className="p-4" data-testid={`card-margin-${plan.id}`}>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{plan.name}</p>
                  <Badge variant="outline" className="text-[10px] font-mono flex-shrink-0">
                    {plan.provider || "manual"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{plan.dataAmount} | {plan.validity}</p>
              </div>
              <div className="text-center text-sm">
                <span className="text-muted-foreground">${(plan.wholesaleCost || 0).toFixed(2)}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="font-medium">${plan.price.toFixed(2)}</span>
              </div>
              <p className={`text-right text-sm font-bold ${marginColor}`}>
                {Math.round(margin)}%
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Health badge helper ───────────────────────────────────────────────────

function HealthBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; Icon: any }> = {
    healthy:  { label: "Healthy",  className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", Icon: CheckCircle2 },
    degraded: { label: "Degraded", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", Icon: AlertCircle },
    down:     { label: "Down",     className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", Icon: XCircle },
    unknown:  { label: "Unknown",  className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", Icon: HelpCircle },
  };
  const { label, className, Icon } = map[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function AttemptStatusBadge({ status }: { status: string }) {
  if (status === 'ok')      return <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 className="w-3 h-3" />ok</span>;
  if (status === 'error')   return <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium"><XCircle className="w-3 h-3" />error</span>;
  if (status === 'skipped') return <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 font-medium"><AlertCircle className="w-3 h-3" />skipped</span>;
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

// ─── Routing Tab ───────────────────────────────────────────────────────────

function RoutingTab() {
  const { toast } = useToast();

  const { data: providers, isLoading: providersLoading, refetch: refetchProviders } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const { data: decisions, isLoading: decisionsLoading, refetch: refetchDecisions } = useQuery<any[]>({
    queryKey: ["/api/admin/routing-decisions"],
  });

  const { data: attempts, isLoading: attemptsLoading, refetch: refetchAttempts } = useQuery<any[]>({
    queryKey: ["/api/admin/routing/attempts"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/providers/seed", {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: "Providers seeded", description: `${data.providers?.length ?? 0} provider(s) upserted.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    },
    onError: () => toast({ title: "Seed failed", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/routing/sync-plans", {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({
        title: "Plans synced to routing",
        description: `${data.createdPlans} normalized plan(s) created, ${data.createdOffers} offer(s) upserted, ${data.skipped} plan(s) skipped (no code/cost).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing-decisions"] });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const { data: syncRuns, refetch: refetchSyncRuns } = useQuery<any[]>({
    queryKey: ["/api/admin/sync/runs"],
  });

  const { data: normStats, refetch: refetchNormStats } = useQuery<any>({
    queryKey: ["/api/admin/normalize-plans/stats"],
  });

  const normalizeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/normalize-plans/run", {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({
        title: "Plan mapping normalised",
        description: [
          data.orphansDeleted ? `${data.orphansDeleted} orphan plans deleted` : null,
          data.offersRelinked ? `${data.offersRelinked} offers re-linked` : null,
          data.plansMergedAndDeleted ? `${data.plansMergedAndDeleted} duplicate plans merged` : null,
          data.plansRenamedInPlace ? `${data.plansRenamedInPlace} plans renamed` : null,
          data.namesUpdated ? `${data.namesUpdated} names standardised` : null,
        ].filter(Boolean).join(" · ") || "Nothing to change.",
      });
      refetchNormStats();
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
    },
    onError: () => toast({ title: "Normalisation failed", variant: "destructive" }),
  });

  const catalogueSyncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/providers/sync", {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      const succeeded = data.results?.filter((r: any) => r.success).length ?? 0;
      toast({
        title: data.status === "success" ? "Provider sync complete" : data.status === "partial" ? "Sync partially complete" : "Sync failed",
        description: `${data.totalOffersUpserted ?? 0} offers upserted · ${data.internalPlansUpdated ?? 0} plans updated · ${data.priceChanges ?? 0} price changes · ${succeeded}/${data.results?.length ?? 0} providers`,
        variant: data.status === "failed" ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sync/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/catalog-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
    },
    onError: () => toast({ title: "Provider sync failed", variant: "destructive" }),
  });

  const [testProvider, setTestProvider]   = useState("airalo");
  const [testCountry,  setTestCountry]    = useState("US");
  const [testResult,   setTestResult]     = useState<any>(null);

  const testOrderMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/providers/test-order", {
        provider:    testProvider,
        countryCode: testCountry,
      }).then((r: any) => r.json()),
    onSuccess: (data: any) => {
      setTestResult(data);
      toast({ title: data.ok ? "Test order placed ✓" : "Test failed", description: data.iccid ?? data.message });
    },
    onError: (err: any) => {
      setTestResult({ error: err.message });
      toast({ title: "Test order failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleProvider = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/providers/${key}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const resumeProvider = useMutation({
    mutationFn: (key: string) => apiRequest("POST", `/api/admin/providers/${key}/resume`, {}),
    onSuccess: async (res: any, key) => {
      const data = await res.json();
      toast({ title: `Provider "${key}" resumed`, description: "It will now receive traffic again." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    },
    onError: () => toast({ title: "Resume failed", variant: "destructive" }),
  });

  const { data: routingSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const saveRoutingMode = useMutation({
    mutationFn: (mode: string) => apiRequest("PUT", "/api/admin/settings", { routingMode: mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Routing mode updated" });
    },
    onError: () => toast({ title: "Failed to update routing mode", variant: "destructive" }),
  });

  const activeRoutingMode = routingSettings?.routingMode ?? "balanced";

  return (
    <div className="space-y-6">

      {/* ── Routing Mode ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Routing Mode</h3>
            <Badge variant="outline" className="capitalize text-xs">
              {ROUTING_MODES.find(m => m.key === activeRoutingMode)?.label ?? activeRoutingMode}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Controls how the engine weights margin, reliability, and health when selecting a provider at checkout. Only affects plans that go through the blended-score routing path.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ROUTING_MODES.map((mode) => {
            const isActive = activeRoutingMode === mode.key;
            return (
              <button
                key={mode.key}
                onClick={() => saveRoutingMode.mutate(mode.key)}
                disabled={saveRoutingMode.isPending}
                className={`rounded-lg border-2 p-3 text-left transition-all focus:outline-none ${isActive ? mode.borderActive : mode.borderInactive}`}
                data-testid={`button-routing-mode-${mode.key}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${isActive ? mode.color : "text-foreground"}`}>{mode.label}</span>
                  {isActive && <div className={`w-2 h-2 rounded-full ${mode.dotColor}`} />}
                </div>
                <p className={`text-[11px] leading-tight mb-1.5 ${isActive ? "text-foreground/70" : "text-muted-foreground"}`}>
                  {mode.description}
                </p>
                <p className={`text-[10px] font-mono leading-tight ${isActive ? mode.color : "text-muted-foreground/60"}`}>
                  {mode.weights}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Provider Management ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Provider Management</h3>
            {providers && providers.filter((p: any) => p.autoPaused).length > 0 ? (
              <Badge variant="outline" className="border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30 gap-1">
                <AlertCircle className="w-3 h-3" />
                {providers.filter((p: any) => p.autoPaused).length} auto-paused
              </Badge>
            ) : providers && providers.length > 0 ? (
              <Badge variant="outline" className="border-green-400 text-green-600 bg-green-50 dark:bg-green-950/30 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                All active
              </Badge>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-providers"
            >
              {seedMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Server className="w-3 h-3 mr-1.5" />}
              Seed Providers
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-plans"
            >
              {syncMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <GitBranch className="w-3 h-3 mr-1.5" />}
              Sync Plans → Routing
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Seed registers the known providers (eSIMGo, eSIM Access, Mock). Sync reads all active plans and creates routing data so the engine can pick the cheapest provider at checkout.
          The system automatically pauses any provider that drops below 80% success rate or fails 3 times in a row — you'll see an orange row and a <strong>Resume</strong> button here when that happens.
        </p>
        {providersLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !providers || providers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No providers found. Click "Seed Providers" to register them.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border overflow-hidden">
            <div className="grid grid-cols-5 gap-3 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span>Provider</span>
              <span className="text-center">Priority</span>
              <span className="text-center">Health</span>
              <span className="text-center">Last Check</span>
              <span className="text-center">Action</span>
            </div>
            {providers.map((p) => (
              <div
                key={p.key}
                className={`grid grid-cols-5 gap-3 px-4 py-3 items-center ${p.autoPaused ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}
                data-testid={`row-provider-${p.key}`}
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.key}</p>
                  {p.autoPaused && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 mt-1 cursor-help w-fit">
                          <AlertCircle className="w-3 h-3 text-orange-500 shrink-0" />
                          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Auto-Paused</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">Paused by system</p>
                        <p className="text-xs text-muted-foreground">{p.autoPauseReason ?? "Performance threshold exceeded"}</p>
                        {p.autoPausedAt && (
                          <p className="text-xs text-muted-foreground mt-1">{new Date(p.autoPausedAt).toLocaleString()}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <p className="text-sm text-center font-mono">#{p.priority}</p>
                <div className="flex justify-center"><HealthBadge status={p.healthStatus} /></div>
                <p className="text-xs text-center text-muted-foreground">
                  {p.lastHealthCheck ? new Date(p.lastHealthCheck).toLocaleDateString() : "Never"}
                </p>
                <div className="flex flex-col gap-1.5 items-center">
                  {p.autoPaused && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 w-full"
                      onClick={() => resumeProvider.mutate(p.key)}
                      disabled={resumeProvider.isPending}
                      data-testid={`button-resume-provider-${p.key}`}
                    >
                      {resumeProvider.isPending ? (
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      Resume
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={p.enabled ? "default" : "outline"}
                    className="h-7 text-xs w-full"
                    onClick={() => toggleProvider.mutate({ key: p.key, enabled: !p.enabled })}
                    data-testid={`button-toggle-provider-${p.key}`}
                  >
                    {p.enabled ? <><Pause className="w-3 h-3 mr-1" />Disable</> : <><Play className="w-3 h-3 mr-1" />Enable</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Normalize Plan Mapping ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Normalize Plan Mapping</h3>
          </div>
          <Button
            size="sm"
            onClick={() => normalizeMutation.mutate()}
            disabled={normalizeMutation.isPending}
            data-testid="button-normalize-plans"
          >
            {normalizeMutation.isPending
              ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
              : <GitBranch className="w-3 h-3 mr-1.5" />}
            {normalizeMutation.isPending ? "Running…" : "Run Normalizer"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Merges duplicate normalized plans created by providers using different unit conventions (e.g. eSIMGo stores 1 GB as 1000 MB; Zendit uses 1024 MB).
          Multiple providers will share the same normalized plan, enabling multi-provider routing. Also standardises all plan names to "Country X GB / Y Days" format and removes orphan plans.
        </p>
        {normStats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center text-xs">
            {[
              { label: "Orphan plans", value: normStats.orphanPlansFound, color: normStats.orphanPlansFound > 0 ? "text-orange-500" : "text-muted-foreground" },
              { label: "SI duplicates", value: normStats.siPlansFound, color: normStats.siPlansFound > 0 ? "text-amber-500" : "text-muted-foreground" },
              { label: "Merges needed", value: normStats.mergesNeeded, color: normStats.mergesNeeded > 0 ? "text-amber-500" : "text-muted-foreground" },
              { label: "Renames needed", value: normStats.renames, color: normStats.renames > 0 ? "text-blue-500" : "text-muted-foreground" },
              { label: "Offers affected", value: normStats.offersAffected, color: "text-muted-foreground" },
              { label: "Plans to remove", value: normStats.plansToDelete, color: normStats.plansToDelete > 0 ? "text-red-500" : "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-md bg-muted/40 p-2">
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Live Provider Catalogue Sync ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Live Catalogue Sync</h3>
          </div>
          <Button
            size="sm"
            onClick={() => catalogueSyncMutation.mutate()}
            disabled={catalogueSyncMutation.isPending}
            data-testid="button-catalogue-sync"
          >
            {catalogueSyncMutation.isPending
              ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Syncing…</>
              : <><RefreshCw className="w-3 h-3 mr-1.5" />Sync Providers Now</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Fetches live plan catalogues from all providers (eSIMGo, eSIM Access, Zendit, Airalo), normalises offers into the routing engine, and auto-updates wholesale costs on matching internal plans. Runs automatically every hour.
        </p>
        {!syncRuns || syncRuns.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <RefreshCw className="w-7 h-7 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No sync runs yet. Click "Sync Providers Now" to run the first sync.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border overflow-hidden">
            <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span className="col-span-2">Started</span>
              <span className="text-center">Status</span>
              <span className="text-center">Offers</span>
              <span className="text-center">Plans Updated</span>
              <span className="text-center">Price Changes</span>
              <span className="text-center">Duration</span>
            </div>
            {[...syncRuns].reverse().map((run) => {
              const durationMs = run.completedAt
                ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                : null;
              const statusColor =
                run.status === "success" ? "text-green-600 dark:text-green-400"
                : run.status === "partial" ? "text-yellow-600 dark:text-yellow-400"
                : run.status === "running" ? "text-blue-600 dark:text-blue-400"
                : "text-red-600 dark:text-red-400";
              return (
                <div key={run.id} className="grid grid-cols-7 gap-2 px-4 py-2.5 items-center text-sm" data-testid={`row-sync-run-${run.id}`}>
                  <span className="col-span-2 text-xs text-muted-foreground">
                    {new Date(run.startedAt).toLocaleString()}
                    <span className="ml-2 opacity-60">{run.triggeredBy}</span>
                  </span>
                  <span className={`text-center text-xs font-medium capitalize ${statusColor}`}>{run.status}</span>
                  <span className="text-center text-xs font-mono">{run.offersUpserted ?? 0}</span>
                  <span className="text-center text-xs font-mono">{run.plansUpdated ?? 0}</span>
                  <span className="text-center text-xs font-mono">{run.priceChanges ?? 0}</span>
                  <span className="text-center text-xs text-muted-foreground font-mono">
                    {durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Sandbox Test Order ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-base">Provider Sandbox Test Order</h3>
          <Badge variant="outline" className="text-xs">Airalo checklist item 4</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Places a real test purchase through a provider's sandbox to validate the full browse → order → install flow.
          Use this to tick off item 4 on Airalo's production readiness checklist.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={testProvider} onValueChange={setTestProvider}>
            <SelectTrigger className="w-36" data-testid="select-test-provider">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="airalo">Airalo</SelectItem>
              <SelectItem value="zendit">Zendit</SelectItem>
              <SelectItem value="esimAccess">eSIM Access</SelectItem>
              <SelectItem value="esimgo">eSIMGo</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Country code (e.g. US)"
            value={testCountry}
            onChange={e => setTestCountry(e.target.value.toUpperCase().slice(0, 2))}
            className="w-44 uppercase"
            maxLength={2}
            data-testid="input-test-country"
          />
          <Button
            size="sm"
            onClick={() => testOrderMutation.mutate()}
            disabled={testOrderMutation.isPending || !testProvider || testCountry.length !== 2}
            data-testid="button-test-order"
          >
            {testOrderMutation.isPending
              ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Placing…</>
              : <><Play className="w-3 h-3 mr-1.5" />Place Test Order</>}
          </Button>
        </div>

        {testResult && (
          <div className={`mt-4 rounded-lg border p-4 text-sm font-mono break-all ${testResult.error || !testResult.ok ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-green-500/40 bg-green-500/5"}`}
            data-testid="test-order-result"
          >
            {testResult.error ? (
              <p><span className="font-semibold">Error:</span> {testResult.error}</p>
            ) : testResult.ok ? (
              <div className="space-y-1">
                <p><span className="font-semibold text-green-700 dark:text-green-400">✓ Order placed via {testResult.provider}</span></p>
                <p><span className="text-muted-foreground">Package:</span> {testResult.packageId}</p>
                <p><span className="text-muted-foreground">ICCID:</span> {testResult.iccid}</p>
                <p><span className="text-muted-foreground">Activation:</span> {testResult.activationUrl || "—"}</p>
                {testResult.qrCodeUrl && (
                  <div className="pt-2">
                    <p className="text-muted-foreground mb-1">QR Code:</p>
                    <img src={testResult.qrCodeUrl} alt="QR Code" className="w-32 h-32 rounded border" />
                  </div>
                )}
              </div>
            ) : (
              <pre>{JSON.stringify(testResult, null, 2)}</pre>
            )}
          </div>
        )}
      </Card>

      {/* ── Routing Decisions ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Routing Decisions</h3>
            {decisions && <Badge variant="secondary" className="text-xs">{decisions.length}</Badge>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetchDecisions()} data-testid="button-refresh-decisions">
            <RefreshCw className="w-3 h-3 mr-1.5" />Refresh
          </Button>
        </div>
        {decisionsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : !decisions || decisions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No routing decisions yet. Decisions are logged when a purchase triggers the routing engine.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border overflow-hidden">
            <div className="grid grid-cols-4 gap-3 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span>Winner</span>
              <span>Strategy</span>
              <span>Scores</span>
              <span className="text-right">Time</span>
            </div>
            {decisions.slice(0, 50).map((d) => {
              const winnerScores = d.scores?.[d.selectedProviderKey];
              return (
                <div key={d.id} className="grid grid-cols-4 gap-3 px-4 py-3 items-start" data-testid={`row-decision-${d.id}`}>
                  <div>
                    <p className="text-sm font-medium font-mono">{d.selectedProviderKey}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{d.selectedProviderPlanCode}</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="text-xs">{d.strategy}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {winnerScores ? (
                      <>
                        <p>cost: <span className="font-medium text-foreground">{winnerScores.cost_score}</span></p>
                        <p>health: <span className="font-medium text-foreground">{winnerScores.health_score}</span></p>
                      </>
                    ) : (
                      <p className="italic">—</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {new Date(d.createdAt).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Provider Attempts ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-base">Provider Attempts</h3>
            {attempts && <Badge variant="secondary" className="text-xs">{attempts.length}</Badge>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetchAttempts()} data-testid="button-refresh-attempts">
            <RefreshCw className="w-3 h-3 mr-1.5" />Refresh
          </Button>
        </div>
        {attemptsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !attempts || attempts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No provider attempts yet. Attempts are logged during eSIM provisioning after payment.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border overflow-hidden">
            <div className="grid grid-cols-5 gap-3 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span>Order</span>
              <span>Provider</span>
              <span className="text-center">Attempt</span>
              <span className="text-center">Result</span>
              <span className="text-right">Duration</span>
            </div>
            {attempts.slice(0, 100).map((a, i) => (
              <div key={`${a.orderId}-${a.attemptNumber}-${i}`} className="grid grid-cols-5 gap-3 px-4 py-2.5 items-center" data-testid={`row-attempt-${a.orderId}-${i}`}>
                <p className="text-xs font-mono truncate text-muted-foreground" title={a.orderId}>
                  {a.orderId.slice(0, 8)}…
                </p>
                <div>
                  <p className="text-xs font-medium">{a.providerKey}</p>
                  {a.providerPlanCode && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{a.providerPlanCode}</p>
                  )}
                </div>
                <p className="text-xs text-center">#{a.attemptNumber}</p>
                <div className="flex justify-center">
                  <AttemptStatusBadge status={a.status} />
                </div>
                <div className="text-right">
                  {a.durationMs != null ? (
                    <span className="text-xs text-muted-foreground">{a.durationMs}ms</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                  {a.errorMessage && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 truncate mt-0.5" title={a.errorMessage}>{a.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Catalogue Tab ─────────────────────────────────────────────────────────

interface CataloguePlan {
  id: string;
  region_code: string;
  name: string;
  data_mb: number;
  validity_days: number;
  is_unlimited: boolean;
  plan_type: string;
  retail_price_usd: number;
  is_active: boolean;
  offer_count: number;
  min_wholesale: number | null;
  providers: string | null;
}

function CatalogueTab() {
  const { toast } = useToast();
  const [country,  setCountry]  = useState("");
  const [provider, setProvider] = useState("all");
  const [validity, setValidity] = useState("all");
  const [type,     setType]     = useState("all");
  const [page,     setPage]     = useState(1);
  const limit = 50;

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (country.trim())    params.set("country",  country.trim().toUpperCase());
  if (provider !== "all") params.set("provider", provider);
  if (validity !== "all") params.set("validity", validity);
  if (type     !== "all") params.set("type",     type);

  const { data, isLoading } = useQuery<{ plans: CataloguePlan[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/admin/catalogue", country, provider, validity, type, page],
    queryFn: () => fetch(`/api/admin/catalogue?${params}`).then(r => r.json()),
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/catalogue/backfill"),
    onSuccess: async (res: any) => {
      const json = await res.json();
      toast({
        title: "Backfill complete",
        description: `Created ${json.result?.plansCreated ?? 0} new plans, ${json.result?.plansAlreadyExist ?? 0} already existed, ${json.result?.countriesSkipped ?? 0} countries skipped.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/catalogue"] });
    },
    onError: (err: any) => {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  function fmtData(mb: number, unlimited: boolean) {
    if (unlimited) return "Unlimited";
    if (mb >= 1024) return `${mb / 1024} GB`;
    return `${mb} MB`;
  }

  function fmtPrice(usd: number | null) {
    if (usd == null) return "—";
    return `$${Number(usd).toFixed(2)}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Plan Catalogue</h2>
        <Button
          size="sm"
          onClick={() => backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
          data-testid="button-backfill-matrix"
        >
          {backfillMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-1.5" />
          )}
          Generate missing plans
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Country code (e.g. GB)"
            value={country}
            onChange={e => { setCountry(e.target.value.toUpperCase().slice(0, 2)); setPage(1); }}
            className="w-40 uppercase"
            maxLength={2}
            data-testid="input-catalogue-country"
          />
          <Select value={provider} onValueChange={v => { setProvider(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="select-catalogue-provider">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="esimgo">eSIMGo</SelectItem>
              <SelectItem value="esimaccess">eSIM Access</SelectItem>
              <SelectItem value="zendit">Zendit</SelectItem>
              <SelectItem value="airalo">Airalo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={validity} onValueChange={v => { setValidity(v); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-catalogue-validity">
              <SelectValue placeholder="Validity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All durations</SelectItem>
              <SelectItem value="1">1 day</SelectItem>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="5">5 days</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={v => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-catalogue-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="fixed">Fixed data</SelectItem>
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
          {data && (
            <span className="text-sm text-muted-foreground self-center">
              {data.total.toLocaleString()} plans
            </span>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Country</th>
              <th className="text-left px-4 py-3 font-medium">Data</th>
              <th className="text-left px-4 py-3 font-medium">Days</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Retail</th>
              <th className="text-right px-4 py-3 font-medium">Wholesale</th>
              <th className="text-left px-4 py-3 font-medium">Providers</th>
              <th className="text-center px-4 py-3 font-medium">Offers</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (data?.plans ?? []).length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No plans found
                </td>
              </tr>
            ) : (
              (data?.plans ?? []).map(plan => (
                <tr key={plan.id} className="border-b hover:bg-muted/30" data-testid={`row-catalogue-${plan.id}`}>
                  <td className="px-4 py-3 font-mono font-semibold">{plan.region_code}</td>
                  <td className="px-4 py-3">{fmtData(plan.data_mb, plan.is_unlimited)}</td>
                  <td className="px-4 py-3">{plan.validity_days}d</td>
                  <td className="px-4 py-3 capitalize">{plan.plan_type}</td>
                  <td className="px-4 py-3 text-right">{fmtPrice(plan.retail_price_usd)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtPrice(plan.min_wholesale)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{plan.providers ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={plan.offer_count > 0 ? "default" : "outline"}>
                      {plan.offer_count}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={plan.is_active ? "default" : "secondary"}>
                      {plan.is_active ? "Active" : "Shell"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-catalogue-prev"
              >
                Previous
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-catalogue-next"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Admin() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/");
    toast({ title: "Signed out" });
  }

  // ── Auth gate ──────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-5">
            <LayoutDashboard className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2" data-testid="text-admin-denied">Access denied</h2>
          <p className="text-muted-foreground text-sm mb-6">
            {user
              ? "Your account does not have admin privileges."
              : "You must be signed in with an admin account to access this page."}
          </p>
          <Link href={user ? "/" : "/login"}>
            <Button data-testid="button-admin-back">
              {user ? "Back to site" : "Sign in"}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Site
            </Button>
          </Link>
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage plans, orders, and eSIM inventory
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Sign out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 mb-6">
          <TabsTrigger value="dashboard" className="flex-1" data-testid="tab-dashboard">
            <LayoutDashboard className="w-4 h-4 mr-1.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex-1" data-testid="tab-plans">
            <Package className="w-4 h-4 mr-1.5" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1" data-testid="tab-orders">
            <ShoppingCart className="w-4 h-4 mr-1.5" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex-1" data-testid="tab-inventory">
            <Wifi className="w-4 h-4 mr-1.5" />
            eSIM Inventory
          </TabsTrigger>
          <TabsTrigger value="margins" className="flex-1" data-testid="tab-margins">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Margins
          </TabsTrigger>
          <TabsTrigger value="routing" className="flex-1" data-testid="tab-routing">
            <Network className="w-4 h-4 mr-1.5" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="catalogue" className="flex-1" data-testid="tab-catalogue">
            <Globe className="w-4 h-4 mr-1.5" />
            Catalogue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryTab />
        </TabsContent>
        <TabsContent value="margins">
          <MarginsTab />
        </TabsContent>
        <TabsContent value="routing">
          <RoutingTab />
        </TabsContent>
        <TabsContent value="catalogue">
          <CatalogueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
