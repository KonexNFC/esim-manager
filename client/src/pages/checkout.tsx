import { useRoute, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form";
import { ArrowLeft, Wifi, Clock, Globe, Shield, CreditCard, Lock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Plan, Destination } from "@shared/schema";

const checkoutSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  confirmEmail: z.string().email("Please enter a valid email address"),
}).refine((data) => data.email === data.confirmEmail, {
  message: "Email addresses must match",
  path: ["confirmEmail"],
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const [, params] = useRoute("/checkout/:planId");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const planId = params?.planId;

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
    defaultValues: { email: "", confirmEmail: "" },
  });

  const orderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const res = await apiRequest("POST", "/api/orders", {
        planId: planId,
        email: data.email,
        totalPrice: plan!.price,
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

  const onSubmit = (data: CheckoutFormData) => {
    orderMutation.mutate(data);
  };

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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/destinations/${plan.destinationId}`}>
        <Button variant="ghost" className="mb-4" data-testid="button-back-plan">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Plans
        </Button>
      </Link>

      <h1 className="text-2xl font-bold mb-6" data-testid="text-checkout-title">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Your Details
            </h2>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                <Separator className="my-4" />

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Your information is secure and encrypted</span>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={orderMutation.isPending}
                  data-testid="button-complete-purchase"
                >
                  {orderMutation.isPending ? "Processing..." : `Pay $${plan.price.toFixed(2)}`}
                </Button>
              </form>
            </Form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5 sticky top-20">
            <h3 className="font-semibold mb-4">Order Summary</h3>

            {destination && (
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium" data-testid="text-checkout-destination">{destination.name}</span>
              </div>
            )}

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{plan.dataAmount}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{plan.validity}</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{plan.coverage}</span>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="text-xl font-bold" data-testid="text-total-price">
                ${plan.price.toFixed(2)}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
