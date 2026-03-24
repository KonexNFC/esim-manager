import { useRoute, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form";
import {
  ArrowLeft, Wifi, Clock, Globe, Lock,
  QrCode, Smartphone, CheckCircle2, RotateCcw,
  ArrowRight, Zap, Plus, TrendingUp, CreditCard, ShieldCheck
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Plan, Destination } from "@shared/schema";

const checkoutSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  confirmEmail: z.string().email("Please enter a valid email address"),
}).refine((data) => data.email === data.confirmEmail, {
  message: "Email addresses must match",
  path: ["confirmEmail"],
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

type CheckoutStep = "details" | "upsell";

const upsellOptions = [
  { id: "1gb",       label: "+1 GB",         desc: "Light top-up",    price: 3,  tag: null },
  { id: "3gb",       label: "+3 GB",         desc: "Extra buffer",    price: 7,  tag: "Popular" },
  { id: "5gb",       label: "+5 GB",         desc: "Heavy use",       price: 11, tag: null },
  { id: "unlimited", label: "Go Unlimited",  desc: "No data limits",  price: 15, tag: "Best value" },
];

const nextSteps = [
  { icon: CreditCard, title: "Order confirmed",    description: "Your purchase is processed instantly." },
  { icon: QrCode,     title: "QR code delivered",  description: "Emailed to you within seconds." },
  { icon: Smartphone, title: "Scan & install",     description: "Settings → Mobile Data → Add eSIM." },
  { icon: Wifi,       title: "You're online",      description: "Data activates on arrival at your destination." },
];

export default function Checkout() {
  const [, params] = useRoute("/checkout/:planId");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const planId = params?.planId;

  const [step, setStep] = useState<CheckoutStep>("details");
  const [formData, setFormData] = useState<CheckoutFormData | null>(null);
  const [selectedUpsell, setSelectedUpsell] = useState<string | null>(null);

  const { data: plan, isLoading: planLoading } = useQuery<Plan>({
    queryKey: ["/api/plans/detail", planId],
    queryFn: async () => {
      const res = await fetch(`/api/plans/${planId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!planId,
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

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: "", email: "", confirmEmail: "" },
  });

  const orderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const upsell = upsellOptions.find(u => u.id === selectedUpsell);
      const totalPrice = (plan!.price) + (upsell ? upsell.price : 0);
      const res = await apiRequest("POST", "/api/orders", {
        planId: planId,
        email: data.email,
        totalPrice,
        currency: plan!.currency,
        status: "completed",
      });
      return res.json();
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      navigate(`/orders/${order.id}`);
    },
    onError: () => {
      toast({
        title: "Order failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onDetailsSubmit = (data: CheckoutFormData) => {
    setFormData(data);
    setStep("upsell");
  };

  const completeOrder = () => {
    if (formData) {
      orderMutation.mutate(formData);
    }
  };

  const upsellPrice = upsellOptions.find(u => u.id === selectedUpsell)?.price ?? 0;
  const totalPrice = plan ? plan.price + upsellPrice : 0;

  if (planLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Card className="p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-10 w-full" />
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card className="p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4 mb-4" />
              <Skeleton className="h-8 w-full" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Wifi className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Plan not found</h2>
        <Link href="/destinations">
          <Button variant="outline">Browse Plans</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href={`/destinations/${plan.destinationId}`}>
        <Button variant="ghost" className="mb-5 -ml-2" data-testid="button-back-plan">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Plans
        </Button>
      </Link>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-7">
        <div className={`flex items-center gap-1.5 text-sm font-medium ${step === "details" ? "text-foreground" : "text-muted-foreground"}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === "details" ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>1</div>
          Your details
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className={`flex items-center gap-1.5 text-sm font-medium ${step === "upsell" ? "text-foreground" : "text-muted-foreground"}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === "upsell" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</div>
          Enhance your plan
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-muted text-muted-foreground">3</div>
          Complete
        </div>
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

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onDetailsSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your name"
                            data-testid="input-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            type="email"
                            data-testid="input-email"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">Your QR code will be delivered here instantly</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            type="email"
                            data-testid="input-confirm-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator className="my-5" />

                  {/* Payment section */}
                  <div>
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Payment Method
                    </h3>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">Powered by Stripe</span>
                        <div className="flex items-center gap-1.5">
                          {["VISA", "MC", "Apple Pay", "Stripe"].map((m) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.5 rounded border text-[10px] font-bold text-muted-foreground bg-background"
                              data-testid={`checkout-payment-icon-${m.toLowerCase().replace(/\s/g, '-')}`}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-md border bg-background px-3 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Card details entered at payment step
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>SSL encrypted · Your information is never stored</span>
                  </div>

                  <Button
                    type="submit"
                    className="w-full font-semibold"
                    size="lg"
                    data-testid="button-continue-to-upsell"
                  >
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
                    <p className="font-semibold text-sm">+${opt.price}</p>
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
                  <span className="text-sm font-bold">+${upsellPrice}</span>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  className="w-full font-semibold"
                  size="lg"
                  onClick={completeOrder}
                  disabled={orderMutation.isPending}
                  data-testid="button-complete-purchase"
                >
                  {orderMutation.isPending
                    ? "Processing..."
                    : selectedUpsell
                      ? `Complete Purchase — $${totalPrice.toFixed(2)}`
                      : `Pay $${totalPrice.toFixed(2)}`
                  }
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
                <button
                  onClick={() => { setSelectedUpsell(null); completeOrder(); }}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  disabled={orderMutation.isPending}
                  data-testid="button-skip-upsell"
                >
                  No thanks, complete my order as is
                </button>
              </div>
            </Card>
          )}

          {/* Trust row */}
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

            {destination && (
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold" data-testid="text-checkout-destination">{destination.name}</span>
              </div>
            )}

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{plan.dataAmount}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{plan.validity}</span>
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
                <span>${plan.price.toFixed(2)}</span>
              </div>
              {selectedUpsell && (
                <div className="flex items-center justify-between text-sm" data-testid="text-upsell-line">
                  <span className="text-muted-foreground">{upsellOptions.find(u => u.id === selectedUpsell)?.label}</span>
                  <span>+${upsellPrice.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-5 pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold" data-testid="text-total-price">
                ${totalPrice.toFixed(2)}
              </span>
            </div>

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
