import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Mail, AlertCircle } from "lucide-react";

const EFFECTIVE_DATE = "1 April 2025";
const SUPPORT_EMAIL = "support@konexesim.com";
const COMPANY = "KONEX eSIM";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold mb-3 text-foreground">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 ml-2">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export default function RefundPolicy() {
  useEffect(() => {
    document.title = "Refund & Return Policy | KONEX eSIM";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", "Learn about KONEX eSIM's refund and return policy for digital prepaid eSIM data plans.");
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = "Learn about KONEX eSIM's refund and return policy for digital prepaid eSIM data plans.";
      document.head.appendChild(m);
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <RotateCcw className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Refund & Return Policy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Effective date: {EFFECTIVE_DATE}</p>
        </div>
      </div>

      {/* Intro block */}
      <div className="mt-6 mb-10 p-4 rounded-xl bg-muted/40 border border-border/60">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">{COMPANY}</span> provides digital, prepaid
          eSIM data plans for international travel, delivered electronically upon successful purchase.
          Our eSIMs give you instant connectivity in 205+ countries — no physical SIM required.
          Because our products are digital services fulfilled instantly, refund eligibility is limited.
          Please read this policy carefully before purchasing.
        </p>
      </div>

      <Section title="Non-Refundable Situations">
        <P>Refunds will not be provided in the following cases:</P>
        <Ul items={[
          "The eSIM has been activated, installed, or scanned",
          "Any data usage has occurred, whether partial or full",
          "The customer selected the wrong destination, duration, or plan",
          "The customer's device is not eSIM-compatible",
          "The purchase was made by mistake or the customer changed their mind after delivery",
        ]} />
      </Section>

      <Section title="Eligible Refund Situations">
        <P>A refund may be considered only if:</P>
        <Ul items={[
          "The eSIM has not been activated, installed, or used",
          "The QR code or activation details were not successfully delivered",
          "There is a verified technical issue that prevents activation or normal use",
          "The service delivered was materially different from what was purchased",
        ]} />
      </Section>

      <Section title="Technical Support Before Refund">
        <P>
          If a customer experiences an activation or connectivity issue, {COMPANY} support will first
          investigate and attempt to resolve the issue. Customers should contact support as soon as
          possible with their order details and device information. If the issue cannot be resolved
          and the service was not successfully delivered, a partial or full refund may be issued at
          our discretion.
        </P>
      </Section>

      <Section title="Refund Request Window">
        <P>
          All refund requests must be submitted within 7 days of purchase. Requests made after this
          period may not be eligible for review.
        </P>
      </Section>

      <Section title="How Refunds Are Processed">
        <P>
          Approved refunds will be issued to the original payment method only. Refund processing
          times may vary depending on the payment provider and bank, but typically take 5 to 10
          business days.
        </P>
      </Section>

      <Section title="Fraud, Abuse, and Misuse">
        <P>
          {COMPANY} reserves the right to refuse refunds where there is evidence of misuse, repeated
          abuse of the refund process, or fraudulent activity.
        </P>
      </Section>

      {/* Support callout */}
      <div className="mt-2 mb-10 rounded-xl border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Need help?</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            For support or refund enquiries, our team is here to help.
          </p>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-sm font-semibold text-primary hover:underline flex-shrink-0"
          data-testid="link-refund-support-email"
        >
          {SUPPORT_EMAIL}
        </a>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 mb-10">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          eSIM plans are digital products delivered instantly. Once activated or scanned, they cannot
          be returned or refunded. Please ensure your device is eSIM-compatible before purchasing.
        </p>
      </div>

      <div className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
