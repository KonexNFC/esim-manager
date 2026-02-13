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
  LayoutDashboard, Package, ShoppingCart, Wifi, TrendingUp,
  DollarSign, Globe, BarChart3, Pause, Play, HelpCircle,
  Send, RotateCcw, Download, ChevronRight, ArrowLeft, Smartphone
} from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Plan, Order } from "@shared/schema";

type AdminStats = {
  totalRevenue: number;
  totalOrders: number;
  livePlans: number;
  totalDestinations: number;
  avgMargin: number;
  activeEsims: number;
};

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
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <StatCard title="Total Revenue" value={`$${(stats?.totalRevenue || 0).toFixed(2)}`} icon={DollarSign} />
      <StatCard title="Total Orders" value={stats?.totalOrders || 0} icon={ShoppingCart} />
      <StatCard title="Live Plans" value={stats?.livePlans || 0} icon={Package} />
      <StatCard title="Destinations" value={stats?.totalDestinations || 0} icon={Globe} />
      <StatCard title="Avg Margin" value={stats?.avgMargin || 0} icon={TrendingUp} suffix="%" />
      <StatCard title="Active eSIMs" value={stats?.activeEsims || 0} icon={Wifi} />
    </div>
  );
}

function PlansTab() {
  const { toast } = useToast();

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/plans/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan updated" });
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
          ? Math.round(((plan.price - plan.wholesaleCost) / plan.price) * 100)
          : null;

        return (
          <Card key={plan.id} className="p-4" data-testid={`card-admin-plan-${plan.id}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{plan.name}</h3>
                  {getStatusBadge(plan.planStatus)}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                  <span>{plan.dataAmount}</span>
                  <span>|</span>
                  <span>{plan.validity}</span>
                  <span>|</span>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-help">
                          Retail: ${plan.price.toFixed(2)}
                          <HelpCircle className="w-3 h-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Customer-facing price</TooltipContent>
                    </Tooltip>
                  </div>
                  {plan.wholesaleCost != null && (
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 cursor-help">
                            Cost: ${plan.wholesaleCost.toFixed(2)}
                            <HelpCircle className="w-3 h-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Partner data cost per GB</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  {margin !== null && (
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 cursor-help text-emerald-600 dark:text-emerald-400">
                            Margin: {margin}%
                            <HelpCircle className="w-3 h-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Auto-calculated gross margin</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Paid</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Pending</Badge>;
      case "fulfilled": return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400">Fulfilled</Badge>;
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
      {allOrders?.map((order) => (
        <Card key={order.id} className="p-4" data-testid={`card-admin-order-${order.id}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {order.flagEmoji && <span>{order.flagEmoji}</span>}
                <h3 className="font-semibold text-sm">{order.destinationName || "Unknown"} - {order.planName || "Plan"}</h3>
                {getOrderStatusBadge(order.status)}
                {getEsimStatusBadge(order.esimStatus)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                <span>{order.email}</span>
                <span>|</span>
                <span>${order.totalPrice.toFixed(2)}</span>
                {order.iccid && (
                  <>
                    <span>|</span>
                    <span className="font-mono">{order.iccid.slice(0, 10)}...</span>
                  </>
                )}
                {order.createdAt && (
                  <>
                    <span>|</span>
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
      ))}
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
                <p className="text-sm font-medium truncate">{plan.name}</p>
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

export default function Admin() {
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
      </Tabs>
    </div>
  );
}
