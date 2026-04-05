import { useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Mail, QrCode, Smartphone, Wifi, ArrowRight,
  Loader2, Clock, AlertCircle, RefreshCcw, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────

interface SessionData {
  id: string;
  status: string;
  paymentStatus: string;
  customerEmail: string | null;
  metadata: Record<string, string>;
  amountTotal: number | null;
  currency: string | null;
}

interface OrderData {
  id: string;
  status: string;
  esimStatus: string;
  qrCode: string | null;
  iccid: string | null;
  email: string;
  totalPrice: number;
  currency: string;
  planId: string;
  providerEsimId: string | null;
}

// ─── Constants ────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 16; // ~40 seconds max

const installSteps = [
  { icon: QrCode,     title: "Check your email",     desc: "Your QR code has been sent to your inbox within seconds." },
  { icon: Smartphone, title: "Open device settings", desc: "Go to Settings → Mobile Data → Add eSIM." },
  { icon: QrCode,     title: "Scan the QR code",     desc: "Point your camera at the QR code in the email." },
  { icon: Wifi,       title: "Connect on arrival",   desc: "Your data activates automatically when you land." },
];

// ─── Main component ───────────────────────────────────

export default function CheckoutSuccess() {
  useEffect(() => { document.title = "Order Confirmed | Konex eSIM"; }, []);
  const [location] = useLocation();
  const { user } = useAuth();

  const sessionId = new URLSearchParams(location.split("?")[1] || "").get("session_id");

  const pollAttempts = useRef(0);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // Fetch Stripe session (once, for payment details)
  const { data: session } = useQuery<SessionData>({
    queryKey: ["/api/checkout/session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/session/${sessionId}`);
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: Infinity,
    retry: 3,
  });

  // Poll for the order to appear in our DB (created by webhook)
  const { data: order, isLoading: orderLoading } = useQuery<OrderData>({
    queryKey: ["/api/checkout/order-by-session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/order-by-session/${sessionId}`);
      if (!res.ok) throw new Error("pending");
      return res.json();
    },
    enabled: !!sessionId && pollingEnabled,
    refetchInterval: (data) => {
      if (data) { setPollingEnabled(false); return false; }
      pollAttempts.current += 1;
      if (pollAttempts.current >= POLL_MAX_ATTEMPTS) { setPollingEnabled(false); return false; }
      return POLL_INTERVAL_MS;
    },
    retry: false,
  });

  const isFulfilled = order?.status === "fulfilled";
  const isFulfilling = order?.status === "fulfilling" || order?.status === "paid";
  const isFailed = order?.status === "fulfillment_failed";
  const isTimedOut = !order && !pollingEnabled && pollAttempts.current >= POLL_MAX_ATTEMPTS;

  const email = session?.customerEmail ?? order?.email;

  if (!sessionId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Payment received</h1>
        <p className="text-muted-foreground mb-6">Your eSIM is being prepared and will be emailed shortly.</p>
        <Link href="/dashboard"><Button>Go to Dashboard</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">

      {/* ── Hero ── */}
      <div className="text-center mb-10">
        {isFailed ? (
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mb-5 ring-8 ring-destructive/5">
            <AlertCircle className="w-10 h-10 text-destructive" data-testid="icon-failed" />
          </div>
        ) : isFulfilled ? (
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-5 ring-8 ring-green-500/5">
            <CheckCircle2 className="w-10 h-10 text-green-500" data-testid="icon-success" />
          </div>
        ) : (
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-5 ring-8 ring-primary/5">
            <Loader2 className="w-10 h-10 text-primary animate-spin" data-testid="icon-processing" />
          </div>
        )}

        <h1 className="text-3xl font-bold mb-2" data-testid="heading-success">
          {isFailed
            ? "eSIM setup issue"
            : isFulfilled
              ? "You're all set!"
              : "Payment received!"}
        </h1>
        <p className="text-muted-foreground text-lg">
          {isFailed
            ? "Payment was successful — your eSIM details will be emailed to you shortly."
            : isFulfilled
              ? email
                ? <>Your eSIM QR code is on its way to <span className="font-semibold text-foreground">{email}</span></>
                : "Your eSIM is ready and details have been emailed."
              : "We're preparing your eSIM. This usually takes a few seconds."}
        </p>
      </div>

      {/* ── Fulfillment status ── */}
      {!isFulfilled && !isFailed && (
        <Card className="mb-6 p-5">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              {isTimedOut ? (
                <Clock className="w-6 h-6 text-amber-500" />
              ) : (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm mb-0.5">
                {isTimedOut ? "Taking longer than expected" : "Preparing your eSIM…"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isTimedOut
                  ? "Your eSIM details will be emailed when ready. You can also check your dashboard."
                  : "We're provisioning your eSIM in real time. Hang tight for a moment."}
              </p>
            </div>
            {isTimedOut && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { pollAttempts.current = 0; setPollingEnabled(true); }}
                data-testid="button-refresh-status"
              >
                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                Check again
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── Email banner (always shown once payment confirmed) ── */}
      {(session || order) && (
        <Card className="mb-6 bg-green-500/5 border-green-500/20">
          <div className="flex items-start gap-4 p-5">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 flex-shrink-0">
              <Mail className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="font-semibold mb-0.5">
                {isFulfilled ? "QR code sent to your email" : "Confirmation sent to your email"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isFulfilled
                  ? <>Check your inbox for the eSIM QR code and setup guide{email ? ` — sent to ${email}` : ""}.</>
                  : <>We sent a payment receipt to {email ? <strong>{email}</strong> : "your email"}. Your eSIM QR code follows once ready.</>
                }
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── QR code (shown once fulfilled and qrCode is available) ── */}
      {isFulfilled && order?.qrCode && (
        <Card className="mb-6 p-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Your eSIM QR Code</h2>
            <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 ml-auto">Ready</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Scan this with your phone camera to install your eSIM instantly. A copy has also been sent to your email.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0 p-3 border rounded-xl bg-white shadow-sm">
              <img
                src={order.qrCode}
                alt="eSIM QR Code"
                className="w-44 h-44 object-contain"
                data-testid="img-qr-code"
              />
            </div>
            <div className="flex-1 space-y-3 text-sm">
              {order.iccid && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">ICCID / Manual Code</p>
                  <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all break-all" data-testid="text-iccid">
                    {order.iccid}
                  </code>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="font-medium">Install instructions:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open <strong>Settings → Mobile Data</strong></li>
                  <li>Tap <strong>Add eSIM</strong> or <strong>Add Data Plan</strong></li>
                  <li>Choose <strong>Use QR Code</strong> and scan above</li>
                  <li>Label the plan and set as active when you travel</li>
                </ol>
              </div>
              <a
                href={order.qrCode}
                download="konex-esim-qrcode.png"
                data-testid="link-download-qr"
              >
                <Button variant="outline" size="sm" className="mt-1">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download QR Code
                </Button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* ── Install steps ── */}
      <Card className="mb-6 p-6">
        <h2 className="font-semibold text-base mb-5">How to activate your eSIM</h2>
        <div className="space-y-5">
          {installSteps.map((s, idx) => (
            <div key={idx} className="flex items-start gap-4" data-testid={`install-step-${idx}`}>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
                <span className="text-sm font-bold text-primary">{idx + 1}</span>
              </div>
              <div>
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Payment summary ── */}
      {session && (
        <Card className="mb-6 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Payment confirmed</h3>
            <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5">
              Paid
            </Badge>
          </div>
          {session.amountTotal && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount charged</span>
              <span className="font-semibold">
                {(session.amountTotal / 100).toFixed(2)} {session.currency?.toUpperCase() ?? "USD"}
              </span>
            </div>
          )}
          {order?.id && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs" data-testid="text-order-id">
                  {order.id.slice(0, 8)}…
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">eSIM status</span>
                <span className="font-medium capitalize">
                  {isFulfilled ? "Ready" : isFulfilling ? "Preparing…" : "Processing"}
                </span>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── CTAs ── */}
      <div className="space-y-3">
        {order?.id ? (
          <Link href={`/orders/${order.id}`}>
            <Button className="w-full" size="lg" data-testid="button-view-order">
              View Order Details
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        ) : (
          <Link href="/orders">
            <Button className="w-full" size="lg" data-testid="button-view-orders">
              View My Orders
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        )}

        {user ? (
          <Link href="/dashboard">
            <Button variant="outline" className="w-full" data-testid="button-go-dashboard">
              Go to My Dashboard
            </Button>
          </Link>
        ) : (
          <Link href="/signup">
            <Button variant="outline" className="w-full" data-testid="button-create-account">
              Create an account to manage your eSIMs
            </Button>
          </Link>
        )}

        <Link href="/destinations">
          <button
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            data-testid="link-browse-more"
          >
            Browse more destinations
          </button>
        </Link>
      </div>
    </div>
  );
}
