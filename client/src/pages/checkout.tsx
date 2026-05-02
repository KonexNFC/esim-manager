import { useRoute, Link, useLocation } from "wouter";
import { SiVisa, SiMastercard, SiApplepay, SiGooglepay, SiPaypal } from "react-icons/si";
import { useCurrency } from "@/lib/currency";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form";
import {
  ArrowLeft, Wifi, Clock, Globe, Lock,
  QrCode, Smartphone, CheckCircle2, RotateCcw,
  ArrowRight, Zap, Plus, TrendingUp, CreditCard, ShieldCheck, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanMeta {
  id: string;
  name: string;
  destinationId: string;
  countryCode: string;
  dataLabel: string;
  validityLabel: string;
  dataAmountGb: number;
  validityDays: number;
  priceUsd: number;
  currency: string;
  coverage: string;
  normalizedPlanId: string | null;
}

interface CheckoutConfig {
  paypal: { enabled: boolean; clientId: string; sandbox: boolean };
  paddle: { enabled: boolean; clientToken: string; sandbox: boolean };
  stripe: { enabled: boolean; publishableKey: string };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const checkoutSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  confirmEmail: z.string().email("Please enter a valid email address"),
  addressLine1: z.string().min(1, "Street address is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State / Province is required"),
  zip: z.string().min(1, "ZIP / Postal code is required"),
  country: z.string().min(2, "Country is required"),
}).refine((data) => data.email === data.confirmEmail, {
  message: "Email addresses must match",
  path: ["confirmEmail"],
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;
type CheckoutStep = "details" | "upsell" | "pay";

// ─── Upsell options ───────────────────────────────────────────────────────────

const upsellOptions = [
  { id: "1gb",       label: "+1 GB",        desc: "Light top-up",   price: 3  },
  { id: "3gb",       label: "+3 GB",        desc: "Extra buffer",   price: 7,  tag: "Popular" },
  { id: "5gb",       label: "+5 GB",        desc: "Heavy use",      price: 11 },
  { id: "unlimited", label: "Go Unlimited", desc: "No data limits", price: 15, tag: "Best value" },
];

// ─── PayPal SDK loader ────────────────────────────────────────────────────────

function loadPayPalScript(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).paypal) { resolve(); return; }
    const existing = document.getElementById("paypal-sdk");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&components=buttons`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });
}

// ─── What happens next ────────────────────────────────────────────────────────

const nextSteps = [
  { icon: CreditCard,  title: "Secure payment",    description: "PayPal encrypted — card never leaves PayPal." },
  { icon: QrCode,      title: "QR code delivered", description: "Emailed to you within seconds of payment." },
  { icon: Smartphone,  title: "Scan & install",    description: "Settings → Mobile Data → Add eSIM." },
  { icon: Wifi,        title: "You're online",     description: "Data activates on arrival." },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Checkout() {
  useEffect(() => { document.title = "Checkout | Konex eSIM"; }, []);
  const [, params] = useRoute("/checkout/:planId");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const planId = params?.planId;

  const [step, setStep]                   = useState<CheckoutStep>("details");
  const [formData, setFormData]           = useState<CheckoutFormData | null>(null);
  const [selectedUpsell, setSelectedUpsell] = useState<string | null>(null);
  const [paypalReady, setPaypalReady]     = useState(false);
  const [paypalError, setPaypalError]     = useState("");
  const [paddleLoading, setPaddleLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const paypalContainerRef = useRef<HTMLDivElement>(null);

  // ── Data queries ──────────────────────────────────────────────────────────

  const { data: plan, isLoading: planLoading } = useQuery<PlanMeta>({
    queryKey: ["/api/checkout/plan-meta", planId],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/plan-meta/${planId}`);
      if (!res.ok) throw new Error("Plan not found");
      return res.json();
    },
    enabled: !!planId,
  });

  const { data: checkoutConfig } = useQuery<CheckoutConfig>({
    queryKey: ["/api/checkout/config"],
  });

  // ── Form ──────────────────────────────────────────────────────────────────

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: "", email: "", confirmEmail: "",
      addressLine1: "", addressLine2: "", city: "", state: "", zip: "", country: "US",
    },
  });

  useEffect(() => {
    if (user) {
      form.setValue("email", user.email ?? "");
      form.setValue("confirmEmail", user.email ?? "");
      if (user.name) form.setValue("name", user.name);
    }
  }, [user, form]);

  // ── Derived values ────────────────────────────────────────────────────────

  const { fmt, isApprox, currency } = useCurrency();
  const upsellPrice  = upsellOptions.find(u => u.id === selectedUpsell)?.price ?? 0;
  const totalPriceUsd = plan ? parseFloat((plan.priceUsd + upsellPrice).toFixed(2)) : 0;
  const resolvedEmail = formData?.email ?? "";

  // ── PayPal button mounting ────────────────────────────────────────────────

  useEffect(() => {
    if (step !== "pay" || !checkoutConfig?.paypal.enabled || !plan) return;
    const { clientId } = checkoutConfig.paypal;

    let cancelled = false;

    loadPayPalScript(clientId)
      .then(() => {
        if (cancelled) return;
        const paypal = (window as any).paypal;
        if (!paypal || !paypalContainerRef.current) return;

        paypalContainerRef.current.innerHTML = "";
        setPaypalReady(false);
        setPaypalError("");

        paypal.Buttons({
          fundingSource: paypal.FUNDING?.PAYPAL ?? "paypal",
          style: { layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 44 },
          createOrder: async () => {
            const fd = form.getValues();
            const res = await fetch("/api/checkout/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                normalizedPlanId: plan.normalizedPlanId ?? plan.id,
                countryCode: plan.countryCode,
                dataLabel: plan.dataLabel,
                validityLabel: plan.validityLabel,
                amountUsd: totalPriceUsd,
                email: resolvedEmail,
                payerName: fd.name || undefined,
                billingAddress: fd.addressLine1 ? {
                  addressLine1: fd.addressLine1,
                  addressLine2: fd.addressLine2 || undefined,
                  city: fd.city,
                  state: fd.state,
                  zip: fd.zip,
                  countryCode: fd.country || "US",
                } : undefined,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to create order");
            return data.orderId;
          },
          onApprove: async (paypalData: any) => {
            const res = await fetch("/api/checkout/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paypalOrderId: paypalData.orderID,
                normalizedPlanId: plan.normalizedPlanId ?? plan.id,
                countryCode: plan.countryCode,
                dataLabel: plan.dataLabel,
                validityLabel: plan.validityLabel,
                amountUsd: totalPriceUsd,
                email: resolvedEmail,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Capture failed");
            window.location.href = `/checkout-success?orderId=${data.orderId}&provider=paypal`;
          },
          onError: (err: any) => {
            console.error("[PayPal]", err);
            setPaypalError("Payment failed. Please try again or use Paddle below.");
          },
        })
          .render(paypalContainerRef.current)
          .then(() => { if (!cancelled) setPaypalReady(true); });
      })
      .catch(() => {
        if (!cancelled) setPaypalError("Could not load PayPal. Please use Paddle below.");
      });

    return () => { cancelled = true; };
  }, [step, checkoutConfig?.paypal.enabled, checkoutConfig?.paypal.clientId, plan, totalPriceUsd, resolvedEmail]);

  // ── Paddle handler ────────────────────────────────────────────────────────

  const handlePaddle = async () => {
    if (!plan) return;
    setPaddleLoading(true);
    try {
      const res = await fetch("/api/checkout/paddle/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalizedPlanId: plan.normalizedPlanId ?? plan.id,
          countryCode: plan.countryCode,
          dataLabel: plan.dataLabel,
          validityLabel: plan.validityLabel,
          amountUsd: totalPriceUsd,
          email: resolvedEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Paddle checkout failed");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setPaddleLoading(false);
    }
  };

  // ── Stripe handler ────────────────────────────────────────────────────────

  const handleStripe = async () => {
    if (!plan) return;
    setStripeLoading(true);
    try {
      const res = await fetch("/api/checkout/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalizedPlanId: plan.normalizedPlanId ?? plan.id,
          countryCode: plan.countryCode,
          countryName: plan.coverage || plan.countryCode,
          region: plan.coverage || plan.countryCode,
          dataLabel: plan.dataLabel,
          validityLabel: plan.validityLabel,
          dataAmountGb: plan.dataAmountGb,
          validityDays: plan.validityDays,
          email: resolvedEmail,
          userId: user?.id,
          userName: formData?.name || user?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Stripe checkout failed");
      window.location.href = data.sessionUrl;
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setStripeLoading(false);
    }
  };

  // ── Step handlers ─────────────────────────────────────────────────────────

  const onDetailsSubmit = (data: CheckoutFormData) => {
    setFormData(data);
    setStep("upsell");
  };

  const proceedToPay = () => {
    setStep("pay");
  };

  // ── Early returns ─────────────────────────────────────────────────────────

  if (planLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3"><Card className="p-6"><Skeleton className="h-6 w-32 mb-4" /><Skeleton className="h-10 w-full mb-4" /><Skeleton className="h-10 w-full mb-4" /><Skeleton className="h-10 w-full" /></Card></div>
          <div className="lg:col-span-2"><Card className="p-6"><Skeleton className="h-6 w-32 mb-4" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4 mb-4" /><Skeleton className="h-8 w-full" /></Card></div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Wifi className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Plan not found</h2>
        <Link href="/destinations"><Button variant="outline">Browse Plans</Button></Link>
      </div>
    );
  }

  const noProviders = checkoutConfig &&
    !checkoutConfig.paypal.enabled &&
    !checkoutConfig.paddle.enabled &&
    !checkoutConfig.stripe?.enabled;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href={`/destinations/${plan.destinationId}`}>
        <Button variant="ghost" className="mb-5 -ml-2" data-testid="button-back-plan">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Plans
        </Button>
      </Link>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-7">
        {(["details", "upsell", "pay"] as CheckoutStep[]).map((s, idx) => {
          const labels = ["Your details", "Enhance plan", "Pay securely"];
          const active = s === step;
          const done = (step === "upsell" && idx === 0) || (step === "pay" && idx <= 1);
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-primary/30 text-primary" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {done ? "✓" : idx + 1}
                </div>
                {labels[idx]}
              </div>
              {idx < 2 && <div className="flex-1 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Main column */}
        <div className="lg:col-span-3 space-y-4">

          {/* Step 1: Details */}
          {step === "details" && (
            <Card className="p-6">
              <h2 className="font-semibold text-lg mb-5 flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                Your Details
              </h2>

              {user && (
                <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 mb-5">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-sm">
                    Buying as <span className="font-semibold">{user.name || user.email}</span>
                    <span className="text-muted-foreground ml-1">— your details have been pre-filled</span>
                  </p>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onDetailsSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl><Input placeholder="Your name" data-testid="input-name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl><Input placeholder="you@example.com" type="email" data-testid="input-email" {...field} /></FormControl>
                      <p className="text-xs text-muted-foreground mt-1">Your QR code and receipt will be delivered here</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="confirmEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Email</FormLabel>
                      <FormControl><Input placeholder="you@example.com" type="email" data-testid="input-confirm-email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator className="my-5" />

                  <div>
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Billing Address
                    </h3>
                    <div className="space-y-3">
                      <FormField control={form.control} name="addressLine1" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl><Input placeholder="123 Main Street" data-testid="input-address-line1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="addressLine2" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Apt / Suite / Floor <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="Apt 4B" data-testid="input-address-line2" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="city" render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl><Input placeholder="New York" data-testid="input-city" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="state" render={({ field }) => (
                          <FormItem>
                            <FormLabel>State / Province</FormLabel>
                            <FormControl><Input placeholder="NY" data-testid="input-state" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="zip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP / Postal Code</FormLabel>
                            <FormControl><Input placeholder="10001" data-testid="input-zip" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="country" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl><Input placeholder="US" data-testid="input-country" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>

                  <Separator className="my-5" />

                  <div>
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Payment
                    </h3>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Accepted methods</span>
                        <div className="flex items-center gap-2.5">
                          <SiVisa       className="h-4 w-auto text-muted-foreground" data-testid="checkout-payment-icon-visa" />
                          <SiMastercard className="h-4 w-auto text-muted-foreground" data-testid="checkout-payment-icon-mc" />
                          <SiApplepay   className="h-5 w-auto text-muted-foreground" data-testid="checkout-payment-icon-apple-pay" />
                          <SiGooglepay  className="h-5 w-auto text-muted-foreground" data-testid="checkout-payment-icon-google-pay" />
                          <SiPaypal     className="h-4 w-auto text-muted-foreground" data-testid="checkout-payment-icon-paypal" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Pay securely via PayPal — card, Apple Pay, Google Pay all accepted</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>SSL encrypted · Payments secured by PayPal</span>
                  </div>

                  <Button type="submit" className="w-full font-semibold" size="lg" data-testid="button-continue-to-upsell">
                    Continue
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </form>
              </Form>
            </Card>
          )}

          {/* Step 2: Upsell */}
          {step === "upsell" && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Add More Data?
                </h2>
                <Badge variant="secondary" className="text-xs">Optional</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Top up before you go — cheaper than buying again mid-trip.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {upsellOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedUpsell(selectedUpsell === opt.id ? null : opt.id)}
                    className={`relative p-4 rounded-xl border text-left transition-all ${
                      selectedUpsell === opt.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                    data-testid={`upsell-option-${opt.id}`}
                  >
                    {opt.tag && (
                      <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {opt.tag}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span className="font-bold text-sm">{opt.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{opt.desc}</p>
                    <p className="font-semibold text-sm">+{isApprox ? "≈ " : ""}{fmt(opt.price)}</p>
                  </button>
                ))}
              </div>

              {selectedUpsell && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex items-center justify-between mb-5" data-testid="upsell-selected-summary">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">
                      {upsellOptions.find(u => u.id === selectedUpsell)?.label} added
                    </span>
                  </div>
                  <span className="text-sm font-bold">+{isApprox ? "≈ " : ""}{fmt(upsellPrice)}</span>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  className="w-full font-semibold"
                  size="lg"
                  onClick={proceedToPay}
                  data-testid="button-complete-purchase"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Continue to Payment — {isApprox ? "≈ " : ""}{fmt(totalPriceUsd)}
                </Button>
                <button
                  onClick={() => { setSelectedUpsell(null); proceedToPay(); }}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  data-testid="button-skip-upsell"
                >
                  No thanks, pay {isApprox ? "≈ " : ""}{fmt(plan.priceUsd)} only
                </button>
              </div>
            </Card>
          )}

          {/* Step 3: Pay */}
          {step === "pay" && (
            <Card className="p-6">
              <h2 className="font-semibold text-lg mb-5 flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
                Secure Payment
              </h2>

              {noProviders ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Payment unavailable</p>
                    <p className="text-xs text-muted-foreground mt-1">No payment provider is configured. Please contact support.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stripe — Card / Apple Pay / Google Pay (primary) */}
                  {checkoutConfig?.stripe?.enabled && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pay with Card · Apple Pay · Google Pay</p>
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleStripe}
                        disabled={stripeLoading}
                        data-testid="button-stripe-checkout"
                      >
                        {stripeLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Redirecting…
                          </span>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mr-2">
                              <SiVisa className="h-4 w-auto" />
                              <SiMastercard className="h-4 w-auto" />
                              <SiApplepay className="h-5 w-auto" />
                              <SiGooglepay className="h-5 w-auto" />
                            </div>
                            Pay {isApprox ? "≈ " : ""}{fmt(totalPriceUsd)}
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* PayPal */}
                  {checkoutConfig?.paypal.enabled && (
                    <div>
                      {checkoutConfig.stripe?.enabled && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">or</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pay with PayPal</p>
                      <div ref={paypalContainerRef} data-testid="paypal-buttons-container" />
                      {!paypalReady && !paypalError && (
                        <div className="h-11 rounded bg-muted animate-pulse" />
                      )}
                      {paypalError && (
                        <p className="text-xs text-destructive mt-1" data-testid="paypal-error">{paypalError}</p>
                      )}
                    </div>
                  )}

                  {/* Paddle */}
                  {checkoutConfig?.paddle.enabled && (
                    <div>
                      {(checkoutConfig.paypal.enabled || checkoutConfig.stripe?.enabled) && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">or</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pay with Paddle</p>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="lg"
                        onClick={handlePaddle}
                        disabled={paddleLoading}
                        data-testid="button-paddle-checkout"
                      >
                        {paddleLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Redirecting…
                          </span>
                        ) : (
                          <>
                            <Lock className="w-4 h-4 mr-2" />
                            Pay {isApprox ? "≈ " : ""}{fmt(totalPriceUsd)} via Paddle
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <Lock className="w-3.5 h-3.5" />
                    <span>SSL encrypted · Your card details are never stored by us</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep("upsell")}
                className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors mt-5"
                data-testid="button-back-to-upsell"
              >
                ← Back
              </button>
            </Card>
          )}

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-md border bg-card text-center" data-testid="badge-secure-checkout">
              <Lock className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Secure checkout</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-md border bg-card text-center" data-testid="badge-instant-delivery">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Instant delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-md border bg-card text-center" data-testid="badge-money-back">
              <RotateCcw className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Money-back guarantee</span>
            </div>
          </div>
        </div>

        {/* Sidebar: Order summary */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 sticky top-20">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Order Summary
            </h3>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold" data-testid="text-checkout-destination">{plan.countryCode}</span>
              </div>
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{plan.dataLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{plan.validityLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{plan.coverage}</span>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Base plan</span>
                <span>{isApprox ? "≈ " : ""}{fmt(plan.priceUsd)}</span>
              </div>
              {selectedUpsell && (
                <div className="flex items-center justify-between text-sm" data-testid="text-upsell-line">
                  <span className="text-muted-foreground">{upsellOptions.find(u => u.id === selectedUpsell)?.label}</span>
                  <span>+{isApprox ? "≈ " : ""}{fmt(upsellPrice)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-2 pt-2 border-t">
              <span className="font-semibold">Total</span>
              <div className="text-right">
                <span className="text-xl font-bold" data-testid="text-total-price">{isApprox ? "≈ " : ""}{fmt(totalPriceUsd)}</span>
                {isApprox && (
                  <p className="text-[11px] text-muted-foreground">${totalPriceUsd.toFixed(2)} USD</p>
                )}
              </div>
            </div>
            {isApprox && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-4">
                <Lock className="w-3 h-3 flex-shrink-0" />
                Checkout is processed in USD · {currency.code} shown for reference
              </p>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What happens next</p>
              <div className="space-y-3">
                {nextSteps.map((s, idx) => (
                  <div key={idx} className="flex items-start gap-2.5" data-testid={`step-next-${idx}`}>
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
                      <s.icon className="w-3 h-3 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
