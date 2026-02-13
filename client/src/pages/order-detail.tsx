import { useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, QrCode, Wifi, Clock,
  Globe, Smartphone, ChevronRight, Copy, Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Order, Plan, Destination } from "@shared/schema";

function InstallGuide() {
  const iosSteps = [
    "Go to Settings on your iPhone",
    "Tap Cellular or Mobile Data",
    "Tap Add eSIM or Add Cellular Plan",
    "Tap Use QR Code",
    "Scan the QR code shown above",
    "Label your new plan (e.g., \"Travel Data\")",
    "Choose it as your data line when prompted",
  ];

  const androidSteps = [
    "Go to Settings on your device",
    "Tap Network & Internet or Connections",
    "Tap SIMs or Mobile Network",
    "Tap Add eSIM or Download SIM",
    "Scan the QR code shown above",
    "Follow the on-screen instructions",
    "Enable mobile data for the new eSIM",
  ];

  return (
    <Tabs defaultValue="ios" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="ios" className="flex-1" data-testid="tab-ios">
          <Smartphone className="w-4 h-4 mr-1.5" />
          iPhone
        </TabsTrigger>
        <TabsTrigger value="android" className="flex-1" data-testid="tab-android">
          <Smartphone className="w-4 h-4 mr-1.5" />
          Android
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ios">
        <ol className="space-y-3 mt-4">
          {iosSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </TabsContent>
      <TabsContent value="android">
        <ol className="space-y-3 mt-4">
          {androidSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </TabsContent>
    </Tabs>
  );
}

export default function OrderDetail() {
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

  const copyIccid = () => {
    if (order?.iccid) {
      navigator.clipboard.writeText(order.iccid);
      toast({ title: "Copied!", description: "ICCID copied to clipboard" });
    }
  };

  if (orderLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-8">
          <div className="text-center">
            <Skeleton className="w-16 h-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-6 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
        </Card>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Order not found</h2>
        <Link href="/orders">
          <Button variant="outline">View My eSIMs</Button>
        </Link>
      </div>
    );
  }

  const statusColor = order.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/orders">
        <Button variant="ghost" className="mb-4" data-testid="button-back-orders">
          <ArrowLeft className="w-4 h-4 mr-2" />
          My eSIMs
        </Button>
      </Link>

      <Card className="p-6 sm:p-8 mb-6">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold mb-1" data-testid="text-order-success">
            eSIM Ready!
          </h1>
          <p className="text-muted-foreground text-sm">
            Your eSIM has been activated and is ready to use
          </p>
        </div>

        {order.qrCode && (
          <div className="flex flex-col items-center mb-6">
            <div className="p-4 bg-white rounded-md border mb-3">
              <img
                src={order.qrCode}
                alt="eSIM QR Code"
                className="w-48 h-48"
                data-testid="img-qr-code"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Scan this QR code with your device to install the eSIM
            </p>
          </div>
        )}

        {order.iccid && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-xs text-muted-foreground">ICCID:</span>
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded-md" data-testid="text-iccid">
              {order.iccid}
            </code>
            <Button size="icon" variant="ghost" onClick={copyIccid} data-testid="button-copy-iccid">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        <Separator className="mb-6" />

        {destination && plan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 mx-auto mb-2">
                <Globe className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm font-medium">{destination.name}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 mx-auto mb-2">
                <Wifi className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="text-sm font-medium">{plan.dataAmount}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 mx-auto mb-2">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Validity</p>
              <p className="text-sm font-medium">{plan.validity}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 mx-auto mb-2">
                <Smartphone className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className={statusColor} data-testid="badge-order-status">
                {order.status === "completed" ? "Active" : "Pending"}
              </Badge>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          Installation Guide
        </h2>
        <InstallGuide />
      </Card>
    </div>
  );
}
