import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Wifi, LogOut, Settings, ChevronRight,
  QrCode, Zap, Clock, CheckCircle, AlertCircle, CircleDot,
  TrendingUp, ArrowRight, ShoppingBag,
  Eye, EyeOff, User, Gauge, Shield, LayoutGrid
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────
type EnrichedOrder = {
  id: string;
  planId: string;
  userId?: string | null;
  email: string;
  status: string;
  totalPrice: number;
  currency: string;
  createdAt: string | null;
  qrCode?: string | null;
  iccid?: string | null;
  activationDate?: string | null;
  esimStatus: string;
  planName?: string;
  destinationName?: string;
  flagEmoji?: string;
  dataAmount?: string;
  dataAmountGb?: number;
  validity?: string;
  validityDays?: number;
  // Backend usage fields (populated by provider sync)
  providerEsimId?: string | null;
  dataTotalMb?: number | null;
  dataUsedMb?: number | null;
  dataRemainingMb?: number | null;
  daysRemaining?: number | null;
  expiresAt?: string | null;
  lastSyncedAt?: string | null;
};

// ─── Helpers ──────────────────────────────────────────
function statusConfig(status: string) {
  switch (status) {
    case "active":    return { label: "Active",             icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/15 border-emerald-500/25", dot: "bg-emerald-500" };
    case "issued":    return { label: "Ready to activate",  icon: CircleDot,   color: "text-amber-500",   bg: "bg-amber-500/15 border-amber-500/25",     dot: "bg-amber-500"   };
    case "installed": return { label: "Installed",          icon: Wifi,        color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25",        dot: "bg-blue-400"    };
    case "expired":   return { label: "Expired",            icon: Clock,       color: "text-muted-foreground", bg: "bg-muted/60 border-border",           dot: "bg-muted-foreground" };
    case "consumed":  return { label: "Data used up",       icon: TrendingUp,  color: "text-muted-foreground", bg: "bg-muted/60 border-border",           dot: "bg-muted-foreground" };
    default:          return { label: "Unknown",            icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted/60 border-border",           dot: "bg-muted-foreground" };
  }
}

/** Resolve GB used from backend MB fields, falling back to 0 */
function resolveUsedGb(order: EnrichedOrder): number {
  if (order.dataUsedMb != null) return order.dataUsedMb / 1024;
  return 0;
}

/** Resolve total GB from backend MB field, falling back to dataAmountGb */
function resolveTotalGb(order: EnrichedOrder): number {
  if (order.dataTotalMb != null) return order.dataTotalMb / 1024;
  return order.dataAmountGb ?? 1;
}

/** Resolve days remaining from backend field, falling back to validityDays */
function resolveDaysRemaining(order: EnrichedOrder): number {
  if (order.daysRemaining != null) return Math.max(0, order.daysRemaining);
  // Best-effort fallback from plan validity
  if (!order.createdAt) return order.validityDays ?? 30;
  const created = new Date(order.createdAt).getTime();
  const validity = (order.validityDays ?? 30) * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((created + validity - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── UsageBar ─────────────────────────────────────────
function UsageBar({ used, total, isUnlimited }: { used: number; total: number; isUnlimited: boolean }) {
  if (isUnlimited) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tracking-tight">∞</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Unlimited</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full" style={{ width: "100%" }} />
        </div>
      </div>
    );
  }
  const pct = Math.min(100, (used / Math.max(total, 0.01)) * 100);
  const remaining = Math.max(0, total - used);
  const barColor = pct > 80 ? "from-red-500 to-destructive" : pct > 60 ? "from-amber-400 to-orange-500" : "from-primary to-blue-400";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-bold tracking-tight">{remaining.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground ml-1">GB left</span>
        </div>
        <span className="text-xs text-muted-foreground">{used.toFixed(1)} / {total} GB used</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── QR Modal ─────────────────────────────────────────
function QrModal({ order, open, onClose }: { order: EnrichedOrder; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="qr-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{order.flagEmoji}</span>
            Install eSIM — {order.destinationName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 pt-2">
          {order.qrCode ? (
            <div className="p-3 bg-white rounded-xl border-2 border-border">
              <img src={order.qrCode} alt="eSIM QR Code" className="w-44 h-44 rounded-lg" data-testid="img-qr-code" />
            </div>
          ) : (
            <div className="w-44 h-44 rounded-xl border bg-muted flex items-center justify-center text-muted-foreground text-sm">
              QR code unavailable
            </div>
          )}
          {order.iccid && (
            <div className="w-full rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">ICCID</p>
              <p className="text-sm font-mono font-semibold tracking-wider" data-testid="text-iccid">{order.iccid}</p>
            </div>
          )}
          <div className="w-full rounded-xl border bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Installation steps</p>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              <li>Open <strong>Settings → Cellular / Mobile Data</strong></li>
              <li>Tap <strong>"Add eSIM"</strong> or <strong>"Add Data Plan"</strong></li>
              <li>Scan the QR code above</li>
              <li>Follow the on-screen prompts</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── TopUp Modal (Stripe-backed) ──────────────────────
type TopupOption = {
  optionCode: string;
  name: string;
  dataAddedMb?: number | null;
  validityAddedDays?: number | null;
  price: number;
  currency: string;
  tag?: string | null;
};

function TopupModal({ order, open, onClose }: { order: EnrichedOrder; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Load real topup options from provider via backend
  const { data: options, isLoading: optionsLoading, isError: optionsError } = useQuery<TopupOption[]>({
    queryKey: ["/api/esims", order.id, "topups/options"],
    queryFn: async () => {
      const res = await fetch(`/api/esims/${order.id}/topups/options`);
      if (!res.ok) throw new Error("Failed to load options");
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  function handleClose() {
    setSelected(null);
    setRedirecting(false);
    onClose();
  }

  async function handleCheckout() {
    if (!selected) return;
    setRedirecting(true);
    try {
      const res = await apiRequest("POST", `/api/esims/${order.id}/topups/checkout`, { optionCode: selected });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      setRedirecting(false);
      toast({ title: "Top-up failed", description: err.message ?? "Please try again.", variant: "destructive" });
    }
  }

  const selectedOption = options?.find(o => o.optionCode === selected);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="topup-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{order.flagEmoji}</span>
            Top Up — {order.destinationName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">Select an add-on to apply to your eSIM:</p>

          {optionsLoading ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : optionsError ? (
            <p className="text-sm text-destructive py-4 text-center">Failed to load options. Please try again.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {(options ?? []).map(opt => (
                <button
                  key={opt.optionCode}
                  className={`relative rounded-xl border p-3.5 text-left transition-all ${selected === opt.optionCode ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                  onClick={() => setSelected(opt.optionCode)}
                  data-testid={`topup-option-${opt.optionCode}`}
                >
                  {opt.tag && (
                    <span className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wide">
                      {opt.tag}
                    </span>
                  )}
                  <p className="font-bold text-sm">{opt.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {opt.dataAddedMb ? `+${(opt.dataAddedMb / 1024).toFixed(0)} GB` : opt.validityAddedDays ? `+${opt.validityAddedDays} days` : "Unlimited"}
                  </p>
                  <p className="text-base font-bold mt-2">${opt.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          )}

          {selectedOption && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">
                <span className="text-muted-foreground">Adding</span> {selectedOption.name}
              </span>
              <span className="font-bold">${selectedOption.price.toFixed(2)}</span>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!selected || redirecting || optionsLoading}
            onClick={handleCheckout}
            data-testid="button-confirm-topup"
          >
            {redirecting
              ? "Redirecting to payment…"
              : selectedOption
                ? `Pay ${selectedOption.name} — $${selectedOption.price.toFixed(2)}`
                : "Select an option"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Secure checkout via Stripe. You'll be redirected to complete payment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── eSIM Card ────────────────────────────────────────
function EsimCard({ order }: { order: EnrichedOrder }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const sc = statusConfig(order.esimStatus);
  const StatusIcon = sc.icon;
  const isUnlimited = (order.dataAmountGb ?? 0) >= 999;
  const used = resolveUsedGb(order);
  const total = resolveTotalGb(order);
  const days = resolveDaysRemaining(order);
  const isActive = ["issued", "active", "installed"].includes(order.esimStatus);
  const daysLow = days <= 5 && days > 0;

  return (
    <>
      <div
        className="rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
        data-testid={`card-esim-${order.id}`}
      >
        {/* Card header — destination + status */}
        <div className="px-5 pt-5 pb-4 border-b bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none">{order.flagEmoji ?? "🌍"}</span>
              <div>
                <p className="font-bold text-base leading-tight" data-testid={`text-esim-destination-${order.id}`}>
                  {order.destinationName ?? "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{order.planName ?? `${order.dataAmount} · ${order.validity}`}</p>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${sc.bg} ${sc.color}`} data-testid={`status-esim-${order.id}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {sc.label}
            </div>
          </div>
        </div>

        {/* Usage section */}
        <div className="px-5 py-4 border-b">
          <UsageBar used={used} total={total} isUnlimited={isUnlimited} />
        </div>

        {/* Meta row */}
        <div className="px-5 py-3 border-b flex items-center gap-4 text-xs text-muted-foreground">
          <div className={`flex items-center gap-1.5 font-medium ${daysLow ? "text-amber-500" : ""}`} data-testid={`text-days-${order.id}`}>
            <Clock className="w-3.5 h-3.5" />
            {days === 0 ? "Expires today" : `${days} day${days !== 1 ? "s" : ""} left`}
          </div>
          <span className="text-border">·</span>
          <span className="font-mono">{order.iccid ? `···${order.iccid.slice(-6)}` : "N/A"}</span>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex items-center gap-2">
          {isActive && (
            <Button
              size="sm"
              className="flex-1 font-semibold"
              onClick={() => setTopupOpen(true)}
              data-testid={`button-topup-${order.id}`}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Top Up
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={isActive ? "" : "flex-1"}
            onClick={() => setQrOpen(true)}
            data-testid={`button-qr-${order.id}`}
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5" />
            View QR
          </Button>
          <Link href={`/orders/${order.id}`}>
            <Button size="sm" variant="ghost" className="px-2.5" data-testid={`button-details-${order.id}`}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <QrModal order={order} open={qrOpen} onClose={() => setQrOpen(false)} />
      <TopupModal order={order} open={topupOpen} onClose={() => setTopupOpen(false)} />
    </>
  );
}

// ─── Order Row ────────────────────────────────────────
function OrderRow({ order }: { order: EnrichedOrder }) {
  const date = formatDate(order.createdAt);
  const sc = statusConfig(order.esimStatus);
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-order-${order.id}`}>
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="text-2xl leading-none flex-shrink-0">{order.flagEmoji ?? "🌍"}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{order.destinationName ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground">{order.dataAmount} · {order.validity}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <div className="text-right hidden sm:block">
          <p className="font-bold text-sm" data-testid={`text-order-price-${order.id}`}>${order.totalPrice.toFixed(2)}</p>
          <p className={`text-xs ${sc.color}`}>{sc.label}</p>
        </div>
        <Link href={`/orders/${order.id}`}>
          <Button size="sm" variant="outline" className="gap-1" data-testid={`button-view-order-${order.id}`}>
            View <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Settings ────────────────────────────────────────
const profileSchema = z.object({ name: z.string().min(1, "Name is required") });
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min. 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

function SettingsPanel({ user }: { user: { id: string; name: string; email: string } }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const profileForm = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name } });
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/auth/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Saved successfully" });
    },
    onError: (err: any) => {
      const raw = err?.message ?? "";
      let msg = "Could not save changes.";
      try { const m = raw.match(/^\d+:\s*(\{.+\})/); if (m) { const p = JSON.parse(m[1]); if (p.message) msg = p.message; } } catch {}
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-8">
      {/* Profile */}
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-semibold mb-0.5">Profile</h3>
        <p className="text-sm text-muted-foreground mb-5">Update your display name.</p>
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(d => updateMutation.mutate({ name: d.name }))} className="space-y-4 max-w-md">
            <FormField control={profileForm.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl><Input {...field} data-testid="input-settings-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div>
              <FormLabel>Email address</FormLabel>
              <Input value={user.email} disabled className="mt-2" data-testid="input-settings-email" />
              <p className="text-xs text-muted-foreground mt-1.5">Your email address cannot be changed.</p>
            </div>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile">
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Form>
      </div>

      {/* Password */}
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-semibold mb-0.5">Change password</h3>
        <p className="text-sm text-muted-foreground mb-5">Choose a strong password with at least 8 characters.</p>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(d => updateMutation.mutate({ currentPassword: d.currentPassword, newPassword: d.newPassword }))} className="space-y-4 max-w-md">
            <FormField control={passwordForm.control} name="currentPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input {...field} type={showCurrent ? "text" : "password"} data-testid="input-current-password" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(v => !v)}>
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={passwordForm.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input {...field} type={showNew ? "text" : "password"} data-testid="input-new-password" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(v => !v)}>
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl><Input {...field} type="password" data-testid="input-confirm-new-password" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" variant="outline" disabled={updateMutation.isPending} data-testid="button-change-password">
              {updateMutation.isPending ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Form>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-semibold mb-0.5">Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Order confirmations and eSIM delivery notices go to{" "}
          <span className="font-medium text-foreground">{user.email}</span>.
          Low data alerts and expiry reminders are coming soon.
        </p>
      </div>
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────
function EsimCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b bg-muted/20">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div className="px-5 py-4 border-b space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="px-5 py-3 border-b">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="px-5 py-4 flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-10 rounded-md" />
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────
type Tab = "esims" | "orders" | "settings";

export default function Dashboard() {
  useEffect(() => { document.title = "My eSIMs | Konex eSIM"; }, []);
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("esims");

  const { data: dashOrders, isLoading: ordersLoading } = useQuery<EnrichedOrder[]>({
    queryKey: ["/api/dashboard/orders"],
    enabled: !!user,
  });

  async function handleLogout() {
    await logout();
    navigate("/");
    toast({ title: "Signed out" });
  }

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading your account…</p>
        </div>
      </div>
    );
  }

  // Unauthenticated
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Wifi className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Your eSIM dashboard</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Sign in to manage your eSIMs, top up data, track validity, and view your purchase history.
            </p>
          </div>
          <div className="space-y-2.5">
            <Link href="/login">
              <Button className="w-full" size="lg" data-testid="button-go-login">
                Sign in <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="outline" className="w-full" size="lg" data-testid="button-go-signup">
                Create account
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> SSL secured</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> 5,000+ customers</span>
          </div>
        </div>
      </div>
    );
  }

  const activeEsims = (dashOrders ?? []).filter(o => ["issued", "active", "installed"].includes(o.esimStatus));
  const expiredEsims = (dashOrders ?? []).filter(o => !["issued", "active", "installed"].includes(o.esimStatus));
  const allOrders = dashOrders ?? [];
  const totalSpent = allOrders.reduce((s, o) => s + o.totalPrice, 0);

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "esims",    label: "My eSIMs",      icon: LayoutGrid,  count: activeEsims.length },
    { id: "orders",   label: "Order history",  icon: ShoppingBag, count: allOrders.length   },
    { id: "settings", label: "Settings",       icon: Settings                               },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1.5">My Konex</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-dashboard-greeting">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="flex-shrink-0 mt-1" data-testid="button-logout">
          <LogOut className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Active eSIMs",  value: ordersLoading ? "—" : activeEsims.length.toString(), icon: Wifi,        color: "text-primary"       },
          { label: "Total orders",  value: ordersLoading ? "—" : allOrders.length.toString(),   icon: ShoppingBag, color: "text-blue-500"      },
          { label: "Total spent",   value: ordersLoading ? "—" : `$${totalSpent.toFixed(2)}`,   icon: Gauge,       color: "text-violet-500"    },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-2xl border bg-card p-4 flex flex-col gap-3"
            data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
          >
            <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${stat.color}`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold tracking-tight">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-${t.id}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── My eSIMs ── */}
      {tab === "esims" && (
        <div data-testid="panel-esims">
          {ordersLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <EsimCardSkeleton />
              <EsimCardSkeleton />
            </div>
          ) : activeEsims.length === 0 && expiredEsims.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center" data-testid="empty-esims">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
                <Wifi className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-2">No eSIMs yet</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                Browse plans, pick your destination, and get connected in under 60 seconds.
              </p>
              <Link href="/destinations">
                <Button data-testid="button-browse-plans">
                  Browse plans <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {activeEsims.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {activeEsims.map(order => <EsimCard key={order.id} order={order} />)}
                </div>
              )}

              {expiredEsims.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Expired / Used</p>
                  <div className="grid gap-3 sm:grid-cols-2 opacity-50">
                    {expiredEsims.map(order => <EsimCard key={order.id} order={order} />)}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Top up prompt when active eSIMs exist */}
          {activeEsims.length > 0 && (
            <div className="mt-6 rounded-2xl border border-dashed p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Need more data?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Top up any of your active eSIMs from the cards above.</p>
              </div>
              <Link href="/destinations">
                <Button variant="outline" size="sm" data-testid="button-browse-more">
                  Browse more plans
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Orders ── */}
      {tab === "orders" && (
        <div data-testid="panel-orders">
          {ordersLoading ? (
            <div className="rounded-2xl border overflow-hidden divide-y">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-5 py-4 flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : allOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center" data-testid="empty-orders">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
                <ShoppingBag className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-2">No orders yet</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                Your purchase history will appear here once you buy your first eSIM.
              </p>
              <Link href="/destinations">
                <Button data-testid="button-browse-plans-orders">
                  Browse plans <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden divide-y">
              {allOrders.map(order => <OrderRow key={order.id} order={order} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Settings ── */}
      {tab === "settings" && (
        <div data-testid="panel-settings">
          <SettingsPanel user={user} />
        </div>
      )}
    </div>
  );
}
