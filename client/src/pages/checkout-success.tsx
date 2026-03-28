import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail, QrCode, Smartphone, Wifi, ArrowRight, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface SessionData {
  id: string;
  status: string;
  paymentStatus: string;
  customerEmail: string | null;
  metadata: Record<string, string>;
  amountTotal: number | null;
  currency: string | null;
}

const installSteps = [
  { icon: QrCode,     title: "Check your email",      desc: "Your QR code has been sent to your inbox." },
  { icon: Smartphone, title: "Open device settings",  desc: "Go to Settings → Mobile Data → Add eSIM." },
  { icon: QrCode,     title: "Scan the QR code",      desc: "Point your camera at the QR code in the email." },
  { icon: Wifi,       title: "Connect on arrival",    desc: "Your data activates automatically when you land." },
];

export default function CheckoutSuccess() {
  const [location] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const sessionId = new URLSearchParams(location.split("?")[1] || "").get("session_id");

  const { data: session, isLoading } = useQuery<SessionData>({
    queryKey: ["/api/checkout/session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/session/${sessionId}`);
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  });

  const orderId = session?.metadata?.orderId;
  const email = session?.customerEmail;

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      {isLoading ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Confirming your order…</p>
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-5 ring-8 ring-green-500/5">
              <CheckCircle2 className="w-10 h-10 text-green-500" data-testid="icon-success" />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-success">
              You're all set!
            </h1>
            <p className="text-muted-foreground text-lg">
              {email ? (
                <>Your eSIM is on its way to <span className="font-semibold text-foreground">{email}</span></>
              ) : (
                "Your eSIM has been activated and is ready to use."
              )}
            </p>
          </div>

          {/* Email confirmation banner */}
          <Card className="mb-6 bg-green-500/5 border-green-500/20">
            <div className="flex items-start gap-4 p-5">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 flex-shrink-0">
                <Mail className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-semibold mb-0.5">QR code sent to your email</p>
                <p className="text-sm text-muted-foreground">
                  Check your inbox for your eSIM QR code and setup instructions.
                  {email && ` We sent it to ${email}.`}
                </p>
              </div>
            </div>
          </Card>

          {/* Install steps */}
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

          {/* Order details & CTAs */}
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
              {orderId && (
                <>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Order ID</span>
                    <span className="font-mono text-xs text-muted-foreground" data-testid="text-order-id">
                      {orderId.slice(0, 8)}…
                    </span>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* CTAs */}
          <div className="space-y-3">
            {orderId ? (
              <Link href={`/orders/${orderId}`}>
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
              <button className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2" data-testid="link-browse-more">
                Browse more destinations
              </button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
