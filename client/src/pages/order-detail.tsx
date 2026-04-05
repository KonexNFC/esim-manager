import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, CheckCircle2, QrCode, Wifi, Clock,
  Globe, Smartphone, Copy, LayoutGrid, ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Order, Plan, Destination } from "@shared/schema";

// ─── Install Guide ────────────────────────────────────
function InstallGuide() {
  const iosSteps = [
    "Open Settings on your iPhone",
    "Tap Cellular or Mobile Data",
    "Tap Add eSIM or Add Cellular Plan",
    "Select Use QR Code",
    "Scan the QR code above",
    "Label your plan — e.g. \"Travel Data\"",
    "Choose it as your data line when prompted",
  ];
  const androidSteps = [
    "Open Settings on your device",
    "Tap Network & Internet or Connections",
    "Tap SIMs or Mobile Network",
    "Tap Add eSIM or Download SIM",
    "Scan the QR code above",
    "Follow the on-screen steps",
    "Enable mobile data for the new eSIM",
  ];

  return (
    <Tabs defaultValue="ios" className="w-full">
      <TabsList className="w-full rounded-xl h-10">
        <TabsTrigger value="ios" className="flex-1" data-testid="tab-ios">
          <Smartphone className="w-3.5 h-3.5 mr-1.5" />
          iPhone
        </TabsTrigger>
        <TabsTrigger value="android" className="flex-1" data-testid="tab-android">
          <Smartphone className="w-3.5 h-3.5 mr-1.5" />
          Android
        </TabsTrigger>
      </TabsList>
      {[{ id: "ios", steps: iosSteps }, { id: "android", steps: androidSteps }].map(({ id, steps }) => (
        <TabsContent key={id} value={id}>
          <ol className="space-y-3 mt-5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ─── Plan Summary ─────────────────────────────────────
function PlanSummary({ plan, destination, order }: { plan: Plan; destination: Destination; order: Order }) {
  const isActive = order.status === "completed";
  const stats = [
    { icon: Globe,      label: "Destination", value: `${destination.flagEmoji ?? ""} ${destination.name}` },
    { icon: Wifi,       label: "Data",         value: plan.dataAmount },
    { icon: Clock,      label: "Validity",     value: plan.validity   },
    { icon: ShieldCheck, label: "Status",      value: isActive ? "Active" : "Pending", highlight: isActive },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map(s => (
        <div key={s.label} className="rounded-xl border bg-muted/20 p-3.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
            <s.icon className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wide font-medium">{s.label}</span>
          </div>
          <p className={`text-sm font-semibold ${s.highlight ? "text-emerald-500" : ""}`} data-testid={`text-plan-${s.label.toLowerCase()}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────
function OrderDetailSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Skeleton className="h-9 w-28 rounded-xl" />
      <div className="rounded-2xl border p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="w-16 h-16 rounded-full" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-56 w-56 rounded-xl mx-auto" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────
export default function OrderDetail() {
  useEffect(() => { document.title = "Order Details | Konex eSIM"; }, []);
  const [, params] = useRoute("/orders/:id");
  const { toast } = useToast();
  const orderId = params?.id;

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!orderId,
  });

  const { data: plan } = useQuery<Plan>({
    queryKey: ["/api/plans/detail", order?.planId],
    queryFn: async () => {
      const res = await fetch(`/api/plans/${order!.planId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!order?.planId,
  });

  const { data: destination } = useQuery<Destination>({
    queryKey: ["/api/destinations", plan?.destinationId],
    queryFn: async () => {
      const res = await fetch(`/api/destinations/${plan!.destinationId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!plan?.destinationId,
  });

  function copyIccid() {
    if (order?.iccid) {
      navigator.clipboard.writeText(order.iccid);
      toast({ title: "Copied", description: "ICCID copied to clipboard" });
    }
  }

  if (orderLoading) return <OrderDetailSkeleton />;

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
          <QrCode className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Order not found</h2>
        <p className="text-muted-foreground text-sm mb-6">This order may have been removed or the link is incorrect.</p>
        <Link href="/dashboard">
          <Button variant="outline" data-testid="button-back-dashboard">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* Back */}
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="-ml-2" data-testid="button-back-orders">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Dashboard
        </Button>
      </Link>

      {/* ── Main card ── */}
      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">

        {/* Success banner */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-b px-6 py-7 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold mb-1" data-testid="text-order-success">
            {order.status === "completed" ? "Your eSIM is ready" : "eSIM order received"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {order.status === "completed"
              ? "Scan the QR code below to install it on your device."
              : "We're preparing your eSIM. You'll receive it shortly."}
          </p>
        </div>

        {/* QR code */}
        {order.qrCode ? (
          <div className="flex flex-col items-center py-8 px-6 border-b">
            <div className="p-3.5 bg-white rounded-2xl border-2 border-border shadow-sm mb-4">
              <img
                src={order.qrCode}
                alt="eSIM QR Code"
                className="w-52 h-52 rounded-lg"
                data-testid="img-qr-code"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Scan with your device camera · or use the install steps below
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 border-b">
            <div className="w-52 h-52 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center mb-4">
              <div className="text-center">
                <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">QR code being generated</p>
              </div>
            </div>
          </div>
        )}

        {/* ICCID */}
        {order.iccid && (
          <div className="px-6 py-4 border-b bg-muted/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">ICCID</p>
                <p className="text-sm font-mono font-semibold tracking-wider" data-testid="text-iccid">{order.iccid}</p>
              </div>
              <Button size="sm" variant="outline" onClick={copyIccid} className="gap-1.5 flex-shrink-0" data-testid="button-copy-iccid">
                <Copy className="w-3.5 h-3.5" />
                Copy
              </Button>
            </div>
          </div>
        )}

        {/* Plan summary */}
        {plan && destination && (
          <div className="px-6 py-5 border-b">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3.5">Plan details</p>
            <PlanSummary plan={plan} destination={destination} order={order} />
          </div>
        )}

        {/* Price & order ID */}
        <div className="px-6 py-4 bg-muted/10">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Order total</span>
            <span className="font-bold text-base">${order.totalPrice.toFixed(2)} {order.currency}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="text-muted-foreground">Order ID</span>
            <span className="font-mono text-muted-foreground">{order.id.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* ── Installation guide ── */}
      <div className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          Installation guide
        </h2>
        <p className="text-xs text-muted-foreground mb-5">Follow these steps to install your eSIM on your device.</p>
        <Separator className="mb-5" />
        <InstallGuide />
      </div>

      {/* ── Dashboard CTA ── */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Manage in your dashboard</p>
              <p className="text-sm text-muted-foreground mt-0.5">Top up data, view QR codes, track usage and validity from one place.</p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button className="flex-shrink-0 w-full sm:w-auto" data-testid="button-go-dashboard">
              Go to Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

    </div>
  );
}
