import { Link, useLocation } from "wouter";
import { XCircle, ArrowLeft, RotateCcw, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const reasons = [
  "Your card was not charged.",
  "Your selected plan is still available.",
  "You can return and try again at any time.",
];

export default function CheckoutCancel() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const planId = params.get("planId");

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6 ring-8 ring-muted/50">
        <XCircle className="w-10 h-10 text-muted-foreground" data-testid="icon-cancel" />
      </div>

      <h1 className="text-3xl font-bold mb-3" data-testid="heading-cancel">Payment cancelled</h1>
      <p className="text-muted-foreground text-lg mb-8">
        No worries — nothing was charged to your card.
      </p>

      <Card className="p-6 mb-8 text-left">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-primary" />
          Good to know
        </h2>
        <ul className="space-y-3">
          {reasons.map((r, idx) => (
            <li key={idx} className="flex items-center gap-3 text-sm" data-testid={`reason-${idx}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-3">
        {planId ? (
          <Link href={`/checkout/${planId}`}>
            <Button className="w-full" size="lg" data-testid="button-retry-checkout">
              <RotateCcw className="mr-2 w-4 h-4" />
              Try again
            </Button>
          </Link>
        ) : null}

        <Link href="/destinations">
          <Button variant="outline" className="w-full" data-testid="button-browse-plans">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Browse plans
          </Button>
        </Link>
      </div>
    </div>
  );
}
