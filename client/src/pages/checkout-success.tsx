import { useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Mail, Smartphone, Wifi, ArrowRight,
  Loader2, Clock, AlertCircle, RefreshCcw, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { EsimQrDisplay } from "@/components/EsimQrDisplay";

// ─── Types ────────────────────────────────────────────

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
const POLL_MAX_ATTEMPTS = 20; // ~50 seconds max

// ─── Main component ───────────────────────────────────

export default function CheckoutSuccess() {
  useEffect(() => { document.title = "Order Confirmed | Konex eSIM"; }, []);
  const [location] = useLocation();
  const { user } = useAuth();

  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : location.split("?")[1] || ""
  );
  const orderId   = params.get("orderId");
  const sessionId = params.get("session_id");

  const pollAttempts = useRef(0);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // ── Poll for order by orderId (PayPal / Paddle) ──────
  const { data: orderById } = useQuery<OrderData>({
    queryKey: ["/api/checkout/order", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/order/${orderId}`);
      if (!res.ok) throw new Error("pending");
      return res.json();
    },
    enabled: !!orderId && pollingEnabled,
    refetchInterval: (data) => {
      if (data) {
        const o = data as OrderData;
        if (o.status === "fulfilled" || o.status === "fulfillment_failed") {
          setPollingEnabled(false);
          return false;
        }
        return POLL_INTERVAL_MS;
      }
      pollAttempts.current += 1;
      if (pollAttempts.current >= POLL_MAX_ATTEMPTS) { setPollingEnabled(false); return false; }
      return POLL_INTERVAL_MS;
    },
    retry: false,
  });

  // ── Poll for order by Stripe session_id ─────────────
  const { data: orderBySession } = useQuery<OrderData>({
    queryKey: ["/api/checkout/order-by-session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/order-by-session/${sessionId}`);
      if (!res.ok) throw new Error("pending");
      return res.json();
    },
    enabled: !!sessionId && !orderId && pollingEnabled,
    refetchInterval: (data) => {
      if (data) {
        const o = data as OrderData;
        if (o.status === "fulfilled" || o.status === "fulfillment_failed") {
          setPollingEnabled(false);
          return false;
        }
        return POLL_INTERVAL_MS;
      }
      pollAttempts.current += 1;
      if (pollAttempts.current >= POLL_MAX_ATTEMPTS) { setPollingEnabled(false); return false; }
      return POLL_INTERVAL_MS;
    },
    retry: false,
  });

  const order = orderById ?? orderBySession;

  const isFulfilled = order?.status === "fulfilled";
  const isFulfilling = order?.status === "fulfilling" || order?.status === "paid";
  const isFailed = order?.status === "fulfillment_failed";
  const isTimedOut = !order && !pollingEnabled && pollAttempts.current >= POLL_MAX_ATTEMPTS;

  const email = order?.email;

  // Generic fallback: no order ID or session ID in URL
  if (!orderId && !sessionId) {
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
              ? "Your eSIM is ready!"
              : "Payment received!"}
        </h1>
        <p className="text-muted-foreground text-lg">
          {isFailed
            ? "Payment was successful — your eSIM details will be emailed to you shortly."
            : isFulfilled
              ? "Install it right now — hold down the QR code below."
              : "We're provisioning your eSIM in real time. Usually just a few seconds."}
        </p>
      </div>

      {/* ── Fulfillment spinner ── */}
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
                {isTimedOut ? "Taking longer than expected" : "Generating your eSIM…"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isTimedOut
                  ? "Your eSIM details will be emailed when ready. Check your dashboard too."
                  : "We're provisioning your eSIM instantly. Hang tight for a moment."}
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

      {/* ── QR code — primary install section ── */}
      {isFulfilled && order?.qrCode && (
        <Card className="mb-6 p-6">
          <div className="flex items-center gap-2 mb-5">
            <QrCode className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Install your eSIM</h2>
            <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/5 ml-auto">
              Ready
            </Badge>
          </div>
          <EsimQrDisplay qrCode={order.qrCode} iccid={order.iccid} />
        </Card>
      )}

      {/* ── Email confirmation banner ── */}
      {order && (
        <Card className="mb-6 bg-muted/40 border-border/50">
          <div className="flex items-start gap-4 p-5">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold mb-0.5">
                {isFulfilled ? "QR code also sent to your email" : "Confirmation sent to your email"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isFulfilled
                  ? <>Your eSIM QR code and activation code are in your inbox{email ? ` at ${email}` : ""}. Open the email on your phone to install.</>
                  : <>We sent a payment receipt to {email ? <strong>{email}</strong> : "your email"}. Your eSIM QR code follows once provisioned.</>
                }
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Payment summary ── */}
      {order && (
        <Card className="mb-6 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Payment confirmed</h3>
            <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/5">
              Paid
            </Badge>
          </div>
          {order?.totalPrice && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount charged</span>
              <span className="font-semibold">
                ${order.totalPrice.toFixed(2)} {order.currency}
              </span>
            </div>
          )}
          {order?.id && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs" data-testid="text-order-id">
                  {order.id.slice(0, 8).toUpperCase()}…
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
              View Full Order Details
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
