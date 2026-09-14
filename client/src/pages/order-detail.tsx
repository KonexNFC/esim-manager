import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, CheckCircle2, QrCode, Wifi, Clock,
  Globe, Smartphone, LayoutGrid, ShieldCheck, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Copy, Check, Settings, WifiOff,
} from "lucide-react";
import { EsimQrDisplay } from "@/components/EsimQrDisplay";

type EnrichedOrder = {
  id: string;
  status: string;
  esimStatus: string;
  email: string;
  totalPrice: number;
  currency: string;
  createdAt: string | null;
  qrCode?: string | null;
  iccid?: string | null;
  activationDate?: string | null;
  planName?: string;
  destinationName?: string;
  flagEmoji?: string;
  dataAmount?: string;
  dataAmountGb?: number;
  validity?: string;
  validityDays?: number;
  dataTotalMb?: number | null;
  dataUsedMb?: number | null;
  dataRemainingMb?: number | null;
  daysRemaining?: number | null;
  expiresAt?: string | null;
  apn?: string | null;
};

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
        <Skeleton className="h-64 w-64 rounded-2xl mx-auto" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${highlight ? "text-emerald-500" : ""}`} data-testid={`text-plan-${label.toLowerCase()}`}>
        {value}
      </p>
    </div>
  );
}

function CopyField({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex items-center justify-between text-xs mt-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-muted-foreground text-[11px]" data-testid={testId}>{value}</span>
        <button
          onClick={copy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={`Copy ${label}`}
          data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

function InstallGuide({ apn }: { apn?: string | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"iphone" | "android">("iphone");

  return (
    <div className="rounded-2xl border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-install-guide"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">How to install your eSIM</p>
            <p className="text-xs text-muted-foreground mt-0.5">Step-by-step guide for iPhone & Android</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t px-5 pb-5">
          {/* Tab switcher */}
          <div className="flex gap-2 mt-4 mb-4">
            <button
              onClick={() => setTab("iphone")}
              data-testid="button-tab-iphone"
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                tab === "iphone"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              iPhone / iOS
            </button>
            <button
              onClick={() => setTab("android")}
              data-testid="button-tab-android"
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                tab === "android"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              Android
            </button>
          </div>

          {tab === "iphone" && (
            <ol className="space-y-3 text-sm">
              <Step n={1} text="Go to Settings → Cellular → Add eSIM" />
              <Step n={2} text="Tap Use QR Code and scan the QR code on this page, OR tap Enter Details Manually and enter the details from your QR code." />
              <Step n={3} text='Label your eSIM (e.g. "Konex Travel") and set it as your data line when abroad.' />
              <Step n={4} text="Turn on Data Roaming for the eSIM when you arrive at your destination." />
              {apn && (
                <Step n={5} highlight text={`If you have no data, set the APN manually: Settings → Cellular → eSIM → Cellular Data Network → APN → enter "${apn}"`} />
              )}
              {!apn && (
                <Step n={5} text="If you have no data after arriving, try setting a manual APN (see the APN troubleshooting section below)." />
              )}
            </ol>
          )}

          {tab === "android" && (
            <ol className="space-y-3 text-sm">
              <Step n={1} text="Go to Settings → Connections (or Network & Internet) → SIM Manager → Add eSIM." />
              <Step n={2} text="Tap Scan QR code and scan the QR code on this page, OR tap Enter activation code manually." />
              <Step n={3} text="Follow the on-screen prompts to complete installation and activate the eSIM." />
              <Step n={4} text="Set the Konex eSIM as your mobile data SIM when travelling." />
              {apn && (
                <Step n={5} highlight text={`If you have no data, set the APN: Settings → Connections → Mobile Networks → Access Point Names → New APN → Name: "Konex", APN: "${apn}" → Save.`} />
              )}
              {!apn && (
                <Step n={5} text="If you have no data after arriving, try setting a manual APN (see the APN troubleshooting section below)." />
              )}
            </ol>
          )}

          {/* APN box */}
          {apn && (
            <div className="mt-4 rounded-xl border bg-amber-500/5 border-amber-500/20 p-3.5" data-testid="card-apn-info">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">APN Setting</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Enter this if your eSIM has no data</span>
                <CopyApn apn={apn} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyApn({ apn }: { apn: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(apn).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      data-testid="button-copy-apn"
      className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 transition-colors"
    >
      <span className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-300">{apn}</span>
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
    </button>
  );
}

function Step({ n, text, highlight }: { n: number; text: string; highlight?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
        highlight ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"
      }`}>
        {n}
      </span>
      <span className={`text-muted-foreground leading-relaxed ${highlight ? "text-amber-700 dark:text-amber-300" : ""}`}>{text}</span>
    </li>
  );
}

function TroubleshootingGuide({ apn }: { apn?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-troubleshoot"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <WifiOff className="w-4.5 h-4.5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm">eSIM not connecting?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Common fixes for data and connectivity issues</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-3 text-sm">
          <TroubleshootItem
            title="No data after activation"
            steps={[
              "Make sure the Konex eSIM is set as your mobile data line.",
              "Enable Data Roaming for the eSIM in your settings.",
              apn ? `Set the APN manually to: ${apn}` : "Try setting a manual APN — check the installation guide above or contact support for the correct APN.",
              "Restart your device.",
            ]}
          />
          <TroubleshootItem
            title="APN setting is greyed out"
            steps={[
              "This happens on some devices when roaming is disabled. Enable Data Roaming first.",
              "On iPhone, go to Settings → Cellular → eSIM → Cellular Data Network.",
              "If still greyed out, contact us at support@konexesim.com and we'll unlock it.",
            ]}
          />
          <TroubleshootItem
            title="QR code won't scan"
            steps={[
              "Ensure good lighting and hold the camera steady.",
              "Try zooming in slightly on the QR code before scanning.",
              "Alternatively, use the ICCID shown in this page to activate manually.",
            ]}
          />
          <TroubleshootItem
            title="eSIM not showing after installation"
            steps={[
              "Restart your device — the eSIM profile may need a reboot to appear.",
              "Check Settings → Cellular / SIM Manager to confirm it was added.",
              "If missing, re-scan the QR code or contact support with your Order ID.",
            ]}
          />
          <div className="pt-2 border-t text-xs text-muted-foreground">
            Still having trouble?{" "}
            <a href="mailto:support@konexesim.com" className="text-primary underline underline-offset-2" data-testid="link-support-email">
              Email support@konexesim.com
            </a>{" "}
            with your Order ID and we'll get you sorted.
          </div>
        </div>
      )}
    </div>
  );
}

function TroubleshootItem({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <p className="font-medium mb-1.5">{title}</p>
      <ol className="space-y-1 pl-1">
        {steps.map((s, i) => (
          <li key={i} className="text-muted-foreground flex gap-2">
            <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function statusBannerConfig(order: EnrichedOrder) {
  const s = order.status;
  const es = order.esimStatus;

  if (s === "fulfillment_failed") {
    return {
      bg: "from-red-500/10 via-red-500/5 to-transparent border-red-500/20",
      iconBg: "bg-red-500/15 border-red-500/25",
      icon: AlertCircle,
      iconColor: "text-red-500",
      title: "eSIM activation issue",
      subtitle: "We couldn't issue your eSIM. Our team has been notified — please reply to the confirmation email or contact support with your Order ID for a full refund or re-attempt.",
    };
  }
  if (s === "fulfilling" || s === "fulfillment_pending" || s === "reconciling") {
    return {
      bg: "from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20",
      iconBg: "bg-blue-500/15 border-blue-500/25",
      icon: Loader2,
      iconColor: "text-blue-500 animate-spin",
      title: "Activating your eSIM…",
      subtitle: s === "fulfilling"
        ? "Your payment was received and your eSIM is being set up. This usually takes under 2 minutes."
        : "Your provider is still allocating the eSIM. We are checking automatically and will email the QR code as soon as it is ready.",
    };
  }
  if (s === "paid") {
    return {
      bg: "from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20",
      iconBg: "bg-amber-500/15 border-amber-500/25",
      icon: Clock,
      iconColor: "text-amber-500",
      title: "Payment received",
      subtitle: "Your eSIM is being prepared. Check back shortly or look out for your delivery email.",
    };
  }
  if (s === "fulfilled" || s === "completed") {
    if (es === "active") {
      return {
        bg: "from-emerald-500/10 via-emerald-500/5 to-transparent",
        iconBg: "bg-emerald-500/15 border-emerald-500/25",
        icon: Wifi,
        iconColor: "text-emerald-500",
        title: "eSIM is active",
        subtitle: "Your eSIM is live and connected. Monitor usage in your dashboard.",
      };
    }
    return {
      bg: "from-emerald-500/10 via-emerald-500/5 to-transparent",
      iconBg: "bg-emerald-500/15 border-emerald-500/25",
      icon: CheckCircle2,
      iconColor: "text-emerald-500",
      title: "Your eSIM is ready",
      subtitle: order.qrCode
        ? "Scan or hold down the QR code to install it directly on this device."
        : "Your QR code is on its way to your email.",
    };
  }
  return {
    bg: "from-muted/40 to-transparent",
    iconBg: "bg-muted/60 border-border",
    icon: QrCode,
    iconColor: "text-muted-foreground",
    title: "Order received",
    subtitle: "We're preparing your eSIM. You'll receive it shortly.",
  };
}

export default function OrderDetail() {
  useEffect(() => { document.title = "Order Details | Konex eSIM"; }, []);
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id;

  const { data: order, isLoading } = useQuery<EnrichedOrder>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!orderId,
    refetchInterval: (query) => {
      const o = query.state.data;
      if (!o) return false;
      if (
        o.status === "fulfilling" ||
        o.status === "paid" ||
        o.status === "fulfillment_pending" ||
        o.status === "reconciling"
      ) return 10_000;
      return false;
    },
  });

  if (isLoading) return <OrderDetailSkeleton />;

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
          <QrCode className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Order not found</h2>
        <p className="text-muted-foreground text-sm mb-6">This order may have been removed or the link is incorrect.</p>
        <Link href="/orders">
          <Button variant="outline" data-testid="button-back-orders">Find my eSIMs</Button>
        </Link>
      </div>
    );
  }

  const banner = statusBannerConfig(order);
  const BannerIcon = banner.icon;
  const isReady = order.status === "fulfilled" || order.status === "completed";
  const isFailed = order.status === "fulfillment_failed";
  const dataLabel = order.dataAmount ?? (order.dataAmountGb ? `${order.dataAmountGb} GB` : "—");
  const validityLabel = order.validity ?? (order.validityDays ? `${order.validityDays} Day${order.validityDays !== 1 ? "s" : ""}` : "—");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      <Link href="/orders">
        <Button variant="ghost" size="sm" className="-ml-2" data-testid="button-back-orders">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          My eSIMs
        </Button>
      </Link>

      {/* ── Main card ── */}
      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">

        {/* Status banner */}
        <div className={`bg-gradient-to-br ${banner.bg} border-b px-6 py-7 text-center`}>
          <div className={`w-14 h-14 rounded-full ${banner.iconBg} border flex items-center justify-center mx-auto mb-4`}>
            <BannerIcon className={`w-7 h-7 ${banner.iconColor}`} />
          </div>
          <h1 className="text-xl font-bold mb-1" data-testid="text-order-status-title">
            {banner.title}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {banner.subtitle}
          </p>
        </div>

        {/* QR / state section */}
        {isReady && order.qrCode ? (
          <div className="px-6 py-8 border-b">
            <EsimQrDisplay qrCode={order.qrCode} iccid={order.iccid} />
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center py-10 border-b gap-3">
            <div className="w-full max-w-xs rounded-xl border bg-muted/30 p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Your Order ID</p>
              <p className="text-lg font-mono font-bold" data-testid="text-order-id-failed">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Quote this when contacting support</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 border-b">
            <div className="w-56 h-56 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center mb-4">
              <div className="text-center">
                <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-muted-foreground">QR code being prepared…</p>
              </div>
            </div>
          </div>
        )}

        {/* Plan summary */}
        <div className="px-6 py-5 border-b">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3.5">Plan details</p>
          <div className="grid grid-cols-2 gap-3">
            <StatBox icon={Globe} label="Destination" value={`${order.flagEmoji ?? ""} ${order.destinationName ?? "—"}`.trim()} />
            <StatBox icon={Wifi} label="Data" value={dataLabel} />
            <StatBox icon={Clock} label="Validity" value={validityLabel} />
            <StatBox icon={ShieldCheck} label="Status" value={isReady ? "Ready" : isFailed ? "Issue" : "Pending"} highlight={isReady} />
          </div>
        </div>

        {/* Price, order ID, ICCID, APN */}
        <div className="px-6 py-4 bg-muted/10">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Order total</span>
            <span className="font-bold text-base">${order.totalPrice.toFixed(2)} {order.currency}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="text-muted-foreground">Order ID</span>
            <span className="font-mono text-muted-foreground" data-testid="text-order-id">#{order.id.slice(0, 8).toUpperCase()}</span>
          </div>
          {order.iccid && (
            <CopyField label="ICCID" value={order.iccid} testId="text-order-iccid" />
          )}
          {order.apn && (
            <CopyField label="APN" value={order.apn} testId="text-order-apn" />
          )}
        </div>
      </div>

      {/* ── Installation guide ── */}
      {isReady && <InstallGuide apn={order.apn} />}

      {/* ── Troubleshooting ── */}
      {isReady && <TroubleshootingGuide apn={order.apn} />}

      {/* ── Dashboard CTA ── */}
      {!isFailed && (
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
      )}

    </div>
  );
}
