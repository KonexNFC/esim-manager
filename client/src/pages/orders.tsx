import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Package, ChevronRight, Wifi, Search, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import type { Order } from "@shared/schema";

function OrderCard({ order }: { order: Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string } }) {
  const statusColor = order.status === "completed"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  return (
    <Link href={`/orders/${order.id}`}>
      <Card className="p-4 hover-elevate cursor-pointer" data-testid={`card-order-${order.id}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 flex-shrink-0">
              <Wifi className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate" data-testid={`text-order-destination-${order.id}`}>
                  {order.destinationName || "eSIM Plan"}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {order.dataAmount && <span>{order.dataAmount}</span>}
                {order.dataAmount && order.validity && <span>|</span>}
                {order.validity && <span>{order.validity}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="font-semibold text-sm" data-testid={`text-order-price-${order.id}`}>
                ${order.totalPrice.toFixed(2)}
              </p>
              <Badge variant="outline" className={`text-xs ${statusColor}`}>
                {order.status === "completed" ? "Active" : "Pending"}
              </Badge>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function Orders() {
  useEffect(() => { document.title = "My Orders | Konex eSIM"; }, []);
  const [emailSearch, setEmailSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");

  const { data: orders, isLoading } = useQuery<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string })[]>({
    queryKey: ["/api/orders", searchSubmitted],
    queryFn: async () => {
      if (!searchSubmitted) return [];
      const res = await fetch(`/api/orders?email=${encodeURIComponent(searchSubmitted)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!searchSubmitted,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchSubmitted(emailSearch.trim());
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-orders-title">
          My eSIMs
        </h1>
        <p className="text-muted-foreground mt-2">
          View and manage your purchased eSIMs
        </p>
      </div>

      <Card className="p-5 mb-8">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Enter your email to find orders..."
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              className="pl-10"
              type="email"
              data-testid="input-search-orders"
            />
          </div>
          <Button type="submit" data-testid="button-search-orders">
            Search
          </Button>
        </form>
      </Card>

      {!searchSubmitted ? (
        <div className="text-center py-16">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted mx-auto mb-4">
            <Package className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Find Your eSIMs</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Enter the email address you used during purchase to view your eSIMs
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-md" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No eSIMs Found</h3>
          <p className="text-muted-foreground text-sm mb-4">
            No orders found for this email address
          </p>
          <Link href="/destinations">
            <Button data-testid="button-browse-plans-empty">Browse Plans</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
