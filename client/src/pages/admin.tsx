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
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, Package, ShoppingCart, Wifi, TrendingUp,
  DollarSign, Globe, BarChart3, Pause, Play, HelpCircle,
  Send, RotateCcw, Download, ChevronRight, ArrowLeft, Smartphone, LogOut,
  Zap, Wrench, Settings, Target, TrendingDown, RefreshCw,
  Network, CheckCircle2, XCircle, AlertCircle, Clock, GitBranch, Server
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
  livePlans: number;
  totalDestinations: number;
  avgMargin: number;
  weightedMargin: number;
  totalProfit: number;
  totalCost: number;
  avgProfitPerOrder: number;
  activeEsims: number;
  providerBreakdown: ProviderBreakdownEntry[];
  topPerformingPlans: TopPlanEntry[];
};

type AdminSettings = {
  targetMarginPercent: string;
  profitMode?: string;
};

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

function StatCard({ title, value, icon: Icon, suffix }: { title: string; value: string | number; icon: any; suffix?: string }) {
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
    </Card>
  );
}

function DashboardTab() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
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
        <StatCard title="Revenue" value={`$${(stats?.totalRevenue || 0).toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Net Profit" value={`$${(stats?.totalProfit || 0).toFixed(2)}`} icon={TrendingUp} />
        <StatCard title="Margin %" value={`${(stats?.weightedMargin || 0).toFixed(1)}`} icon={BarChart3} suffix="%" />
        <StatCard title="Total Cost" value={`$${(stats?.totalCost || 0).toFixed(2)}`} icon={TrendingDown} />
      </div>
      {/* ── Operational metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Orders" value={stats?.totalOrders || 0} icon={ShoppingCart} />
        <StatCard title="Avg Profit / Order" value={`$${(stats?.avgProfitPerOrder || 0).toFixed(2)}`} icon={Target} />
        <StatCard title="Live Plans" value={stats?.livePlans || 0} icon={Package} />
        <StatCard title="Active eSIMs" value={stats?.activeEsims || 0} icon={Wifi} />
      </div>

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

  const [refulfillPending, setRefulfillPending] = useState<Record<string, boolean>>({});
  const refulfillOrder = async (orderId: string) => {
    setRefulfillPending(p => ({ ...p, [orderId]: true }));
    try {
      const res = await apiRequest("POST", `/api/admin/orders/${orderId}/refulfill`, {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({ title: "Re-fulfillment triggered", description: "The order will be provisioned again shortly." });
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
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  onClick={() => refulfillOrder(order.id)}
                  disabled={refulfillPending[order.id]}
                  data-testid={`button-refulfill-${order.id}`}
                >
                  {refulfillPending[order.id]
                    ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />Retrying…</>
                    : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Re-fulfill</>}
                </Button>
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
    },
    onError: () => toast({ title: "Provider sync failed", variant: "destructive" }),
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

  return (
    <div className="space-y-6">

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
                    {p.enabled ? <><Pause className="w-3 h-3 mr-1" />Enabled</> : <><Play className="w-3 h-3 mr-1" />Disabled</>}
                  </Button>
                </div>
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
          Fetches live plan catalogues from eSIMGo and eSIM Access, normalises offers into the routing engine, and auto-updates wholesale costs on matching internal plans. Runs automatically every 6 hours.
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
      </Tabs>
    </div>
  );
}
