import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Wifi, LogOut, LayoutDashboard, Package, Settings, ChevronRight,
  QrCode, Zap, Clock, CheckCircle, AlertCircle, CircleDot,
  TrendingUp, ArrowRight, ShoppingBag, Download, RefreshCw,
  Eye, EyeOff, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
};

// ─── Helpers ──────────────────────────────────────────
function statusConfig(status: string) {
  switch (status) {
    case "active":    return { label: "Active",             icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" };
    case "issued":    return { label: "Pending Activation", icon: CircleDot,   color: "text-amber-500",   bg: "bg-amber-500/10"   };
    case "installed": return { label: "Installed",          icon: Wifi,        color: "text-blue-500",    bg: "bg-blue-500/10"    };
    case "expired":   return { label: "Expired",            icon: Clock,       color: "text-muted-foreground", bg: "bg-muted"     };
    case "consumed":  return { label: "Consumed",           icon: TrendingUp,  color: "text-muted-foreground", bg: "bg-muted"     };
    default:          return { label: "Unknown",            icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted"     };
  }
}

function mockDataUsed(order: EnrichedOrder): number {
  const gb = order.dataAmountGb ?? 1;
  if (gb >= 999) return 0;
  const seed = order.id.charCodeAt(0) + order.id.charCodeAt(1);
  return Math.round((seed % 60) / 100 * gb * 10) / 10;
}

function daysRemaining(order: EnrichedOrder): number {
  if (!order.createdAt) return order.validityDays ?? 30;
  const created = new Date(order.createdAt).getTime();
  const validity = (order.validityDays ?? 30) * 24 * 60 * 60 * 1000;
  const remaining = Math.max(0, Math.ceil((created + validity - Date.now()) / (1000 * 60 * 60 * 24)));
  return remaining;
}

// ─── UsageBar ─────────────────────────────────────────
function UsageBar({ used, total, isUnlimited }: { used: number; total: number; isUnlimited: boolean }) {
  if (isUnlimited) {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Unlimited data</span>
          <span>∞</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full w-1/3" />
        </div>
      </div>
    );
  }
  const pct = Math.min(100, (used / Math.max(total, 0.01)) * 100);
  const remaining = Math.max(0, total - used);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used.toFixed(1)} GB used</span>
        <span>{remaining.toFixed(1)} GB left</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? "bg-destructive" : pct > 60 ? "bg-amber-500" : "bg-primary"}`}
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
          <DialogTitle>Install eSIM — {order.destinationName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 pt-2">
          {order.qrCode ? (
            <img src={order.qrCode} alt="eSIM QR Code" className="w-48 h-48 rounded-lg border" data-testid="img-qr-code" />
          ) : (
            <div className="w-48 h-48 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground text-sm">
              QR code unavailable
            </div>
          )}
          {order.iccid && (
            <div className="w-full rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">ICCID</p>
              <p className="text-sm font-mono font-medium tracking-wider" data-testid="text-iccid">{order.iccid}</p>
            </div>
          )}
          <div className="w-full space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Installation steps</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Open Settings → Cellular / Mobile Data</li>
              <li>Tap "Add eSIM" or "Add Data Plan"</li>
              <li>Scan the QR code above</li>
              <li>Follow the on-screen prompts</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── TopUp Modal ──────────────────────────────────────
const topupOptions = [
  { id: "1gb",      label: "+1 GB",       sub: "Add 1 GB data",       price: 4.99  },
  { id: "3gb",      label: "+3 GB",       sub: "Add 3 GB data",       price: 9.99  },
  { id: "5gb",      label: "+5 GB",       sub: "Add 5 GB data",       price: 14.99 },
  { id: "unlimited",label: "Unlimited",   sub: "Upgrade to unlimited", price: 24.99 },
  { id: "7days",    label: "+7 Days",     sub: "Extend validity",      price: 5.99  },
  { id: "30days",   label: "+30 Days",    sub: "Extend validity",      price: 12.99 },
];

function TopupModal({ order, open, onClose }: { order: EnrichedOrder; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const topupMutation = useMutation({
    mutationFn: (topupType: string) =>
      apiRequest("POST", `/api/dashboard/topup/${order.id}`, { topupType }),
    onSuccess: (data: any) => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/orders"] });
    },
    onError: () => {
      toast({ title: "Top-up failed", description: "Please try again.", variant: "destructive" });
    },
  });

  function handleClose() {
    setSelected(null);
    setSuccess(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="topup-modal">
        <DialogHeader>
          <DialogTitle>Top Up — {order.destinationName}</DialogTitle>
        </DialogHeader>
        {success ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center" data-testid="topup-success">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-lg">Top-up successful</p>
              <p className="text-muted-foreground text-sm mt-1">Your eSIM balance has been updated.</p>
            </div>
            <Button onClick={handleClose} className="w-full" data-testid="button-done">Done</Button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">Choose an add-on for your eSIM:</p>
            <div className="grid grid-cols-2 gap-2">
              {topupOptions.map(opt => (
                <button
                  key={opt.id}
                  className={`rounded-lg border p-3 text-left transition-all ${selected === opt.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => setSelected(opt.id)}
                  data-testid={`topup-option-${opt.id}`}
                >
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.sub}</p>
                  <p className="text-sm font-bold mt-1.5">${opt.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
            <Button
              className="w-full mt-2"
              disabled={!selected || topupMutation.isPending}
              onClick={() => selected && topupMutation.mutate(selected)}
              data-testid="button-confirm-topup"
            >
              {topupMutation.isPending ? "Processing…" : "Top Up Now"}
            </Button>
          </div>
        )}
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
  const used = mockDataUsed(order);
  const days = daysRemaining(order);
  const isActive = ["issued", "active", "installed"].includes(order.esimStatus);

  return (
    <>
      <Card className="p-5 space-y-4" data-testid={`card-esim-${order.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">{order.flagEmoji ?? "🌍"}</span>
            <div>
              <p className="font-semibold leading-tight" data-testid={`text-esim-destination-${order.id}`}>{order.destinationName ?? "Unknown"}</p>
              <p className="text-sm text-muted-foreground">{order.dataAmount} · {order.validity}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.color}`} data-testid={`status-esim-${order.id}`}>
            <StatusIcon className="w-3 h-3" />
            {sc.label}
          </div>
        </div>

        <UsageBar used={used} total={order.dataAmountGb ?? 1} isUnlimited={isUnlimited} />

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span data-testid={`text-days-${order.id}`}>{days} day{days !== 1 ? "s" : ""} remaining</span>
          <span>·</span>
          <span className="font-mono">{order.iccid?.slice(-8) ?? "N/A"}</span>
        </div>

        <Separator />

        <div className="flex gap-2 flex-wrap">
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTopupOpen(true)}
              data-testid={`button-topup-${order.id}`}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Top Up
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setQrOpen(true)}
            data-testid={`button-qr-${order.id}`}
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5" /> View QR
          </Button>
          <Link href={`/orders/${order.id}`}>
            <Button size="sm" variant="ghost" data-testid={`button-details-${order.id}`}>
              Details <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>

      <QrModal order={order} open={qrOpen} onClose={() => setQrOpen(false)} />
      <TopupModal order={order} open={topupOpen} onClose={() => setTopupOpen(false)} />
    </>
  );
}

// ─── Order Row ────────────────────────────────────────
function OrderRow({ order }: { order: EnrichedOrder }) {
  const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0" data-testid={`row-order-${order.id}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none">{order.flagEmoji ?? "🌍"}</span>
        <div>
          <p className="text-sm font-medium">{order.destinationName ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground">{order.dataAmount} · {order.validity}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="font-semibold text-sm" data-testid={`text-order-price-${order.id}`}>${order.totalPrice.toFixed(2)}</p>
        <Link href={`/orders/${order.id}`}>
          <Button size="sm" variant="outline" data-testid={`button-view-order-${order.id}`}>
            View <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Settings Form ────────────────────────────────────
const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min. 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

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
      toast({ title: "Profile updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-8 max-w-lg">
      {/* Profile */}
      <div>
        <h3 className="font-semibold mb-1">Profile</h3>
        <p className="text-sm text-muted-foreground mb-4">Update your display name.</p>
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(d => updateMutation.mutate({ name: d.name }))} className="space-y-4">
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
              <p className="text-xs text-muted-foreground mt-1.5">Email cannot be changed.</p>
            </div>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile">
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Form>
      </div>

      <Separator />

      {/* Password */}
      <div>
        <h3 className="font-semibold mb-1">Change password</h3>
        <p className="text-sm text-muted-foreground mb-4">Choose a strong password of at least 8 characters.</p>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(d => updateMutation.mutate({ currentPassword: d.currentPassword, newPassword: d.newPassword }))} className="space-y-4">
            <FormField control={passwordForm.control} name="currentPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input {...field} type={showCurrent ? "text" : "password"} data-testid="input-current-password" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(v => !v)}>
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
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(v => !v)}>
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

      <Separator />

      <div>
        <h3 className="font-semibold mb-1">Communication</h3>
        <p className="text-sm text-muted-foreground">You'll receive order confirmations and eSIM delivery notifications to <span className="text-foreground">{user.email}</span>.</p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────
type Tab = "esims" | "orders" | "settings";

export default function Dashboard() {
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
    toast({ title: "Signed out successfully" });
  }

  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <User className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Sign in to your account</h2>
            <p className="text-muted-foreground text-sm">Manage your eSIMs, top up data, and view your order history.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/login"><Button className="w-full" data-testid="button-go-login">Sign in <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link href="/signup"><Button variant="outline" className="w-full" data-testid="button-go-signup">Create account</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const activeEsims = (dashOrders ?? []).filter(o => ["issued", "active", "installed"].includes(o.esimStatus));
  const allOrders = dashOrders ?? [];

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "esims",    label: "My eSIMs",      icon: Wifi },
    { id: "orders",   label: "Order History",  icon: ShoppingBag },
    { id: "settings", label: "Settings",       icon: Settings },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">My GlobeSIM</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-dashboard-greeting">
            Welcome, {user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
          <LogOut className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: "Active eSIMs",   value: activeEsims.length.toString(),  icon: Wifi },
          { label: "Total orders",   value: allOrders.length.toString(),     icon: Package },
          { label: "Total spent",    value: `$${allOrders.reduce((s, o) => s + o.totalPrice, 0).toFixed(2)}`, icon: TrendingUp },
        ].map(stat => (
          <Card key={stat.label} className="p-4 flex items-center gap-3" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <stat.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="font-bold">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-full sm:w-auto sm:inline-flex">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 sm:flex-initial justify-center ${tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-${t.id}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "esims" && (
        <div data-testid="panel-esims">
          {ordersLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : activeEsims.length === 0 ? (
            <div className="text-center py-20 border rounded-xl border-dashed" data-testid="empty-esims">
              <Wifi className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No active eSIMs yet</h3>
              <p className="text-muted-foreground text-sm mb-6">Browse plans and get connected in minutes.</p>
              <Link href="/destinations">
                <Button data-testid="button-browse-plans">Browse plans <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeEsims.map(order => <EsimCard key={order.id} order={order} />)}
            </div>
          )}

          {allOrders.length > activeEsims.length && (
            <div className="mt-6">
              <p className="text-sm text-muted-foreground mb-3">Expired / Consumed</p>
              <div className="grid gap-4 sm:grid-cols-2 opacity-60">
                {allOrders
                  .filter(o => !["issued", "active", "installed"].includes(o.esimStatus))
                  .map(order => <EsimCard key={order.id} order={order} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div data-testid="panel-orders">
          {ordersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : allOrders.length === 0 ? (
            <div className="text-center py-20 border rounded-xl border-dashed" data-testid="empty-orders">
              <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground text-sm mb-6">Your purchase history will appear here.</p>
              <Link href="/destinations">
                <Button data-testid="button-browse-plans-orders">Browse plans <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </Link>
            </div>
          ) : (
            <Card className="divide-y">
              {allOrders.map(order => <OrderRow key={order.id} order={order} />)}
            </Card>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div data-testid="panel-settings">
          <SettingsPanel user={user} />
        </div>
      )}
    </div>
  );
}
