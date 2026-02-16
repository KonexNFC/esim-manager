import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight, Globe, Zap, Shield, Smartphone,
  ChevronRight, Wifi, MapPin, Users, Star, Lock, CheckCircle2,
  Signal, CreditCard
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Destination } from "@shared/schema";

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.png"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/75" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-28 sm:py-36 lg:py-48">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="mb-6 bg-white/15 text-white border-white/20">
            <Wifi className="w-3 h-3 mr-1.5" />
            Instant eSIM Technology
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1]" data-testid="text-hero-title">
            Global Data.
            <span className="block text-white/90 mt-1">
              Instantly.
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-white/80 max-w-lg leading-relaxed" data-testid="text-hero-subtitle">
            Buy an eSIM, scan the QR code, and connect in under 60 seconds. No roaming fees. No plastic SIMs.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/destinations">
              <Button size="lg" data-testid="button-get-connected">
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/destinations">
              <Button size="lg" variant="outline" className="bg-white/10 backdrop-blur-sm text-white border-white/20" data-testid="button-view-plans">
                View All Destinations
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-6 text-white/60 text-sm flex-wrap">
            <div className="flex items-center gap-1.5" data-testid="text-hero-stat-countries">
              <Globe className="w-4 h-4" />
              <span>30+ countries</span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="text-hero-stat-speed">
              <Signal className="w-4 h-4" />
              <span>4G/5G speeds</span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="text-hero-stat-secure">
              <Shield className="w-4 h-4" />
              <span>Secure checkout</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const corridors = [
  { id: "uk-eu", label: "UK \u2194 EU", regions: ["Europe"] },
  { id: "uk-nigeria", label: "UK \u2194 Nigeria", regions: ["Africa"] },
  { id: "uk-uae", label: "UK \u2194 UAE", regions: ["Middle East"] },
  { id: "global", label: "Global", regions: [] },
];

function CorridorSelector() {
  const [activeCorridor, setActiveCorridor] = useState("uk-eu");

  const { data: destinations } = useQuery<Destination[]>({
    queryKey: ["/api/destinations"],
  });

  const filtered = useMemo(() => {
    if (!destinations) return [];
    const c = corridors.find(c => c.id === activeCorridor);
    if (!c) return destinations;
    if (c.regions.length === 0) return destinations;
    return destinations.filter(d =>
      c.regions.some(r => d.region === r) ||
      (d.corridor && d.corridor === c.label)
    );
  }, [destinations, activeCorridor]);

  return (
    <section className="py-16 sm:py-20 bg-card border-y">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-popular-routes">
            Popular Routes
          </h2>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            Optimised plans for the most popular travel corridors
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {corridors.map((c) => (
            <Button
              key={c.id}
              variant={activeCorridor === c.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCorridor(c.id)}
              data-testid={`button-corridor-${c.id}`}
            >
              {c.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No destinations in this corridor yet</p>
            </div>
          ) : (
            filtered.slice(0, 8).map((dest) => (
              <Link key={dest.id} href={`/destinations/${dest.id}`}>
                <Card className="overflow-visible hover-elevate cursor-pointer" data-testid={`card-corridor-dest-${dest.id}`}>
                  <div className="aspect-[16/10] overflow-hidden rounded-t-md">
                    <img
                      src={dest.imageUrl}
                      alt={dest.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                      <h3 className="font-semibold text-sm" data-testid={`text-corridor-dest-name-${dest.id}`}>{dest.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground" data-testid={`text-corridor-dest-region-${dest.id}`}>{dest.region}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div className="text-center mt-10">
          <Link href="/destinations">
            <Button variant="outline" data-testid="link-view-all-destinations">
              View All Destinations
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ValueBlocks() {
  const blocks = [
    {
      icon: Zap,
      title: "Instant Activation",
      description: "Buy before you land. Scan the QR code. You're online in seconds.",
    },
    {
      icon: CreditCard,
      title: "Transparent Pricing",
      description: "Fixed pricing with no roaming charges. Know what you pay upfront.",
    },
    {
      icon: Globe,
      title: "Global Coverage",
      description: "Reliable data across Europe, Africa, the Middle East and beyond.",
    },
    {
      icon: Smartphone,
      title: "Device Ready",
      description: "Works with iPhone, Samsung, Pixel and all eSIM-compatible devices.",
    },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-features-title">
            Why Choose GlobeSIM?
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            The smarter way to stay connected while travelling
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {blocks.map((block) => (
            <Card key={block.title} className="p-6 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10 mx-auto mb-4">
                <block.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2" data-testid={`text-feature-${block.title.toLowerCase().replace(/\s/g, '-')}`}>
                {block.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {block.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { step: "1", title: "Choose Destination", description: "Select your country or region from 30+ supported destinations." },
    { step: "2", title: "Pick a Plan", description: "Choose from day passes, travel packs, or regional bundles." },
    { step: "3", title: "Scan & Connect", description: "Receive your QR code instantly. Scan, install, and get online." },
  ];

  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-how-it-works-title">
            How It Works
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Get online in three simple steps
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {steps.map((item, idx) => (
            <div key={item.step} className="text-center relative">
              {idx < steps.length - 1 && (
                <div className="hidden sm:block absolute top-6 left-[60%] w-[80%] border-t-2 border-dashed border-border" />
              )}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mx-auto mb-4 relative">
                {item.step}
              </div>
              <h3 className="font-semibold mb-2" data-testid={`text-step-${item.step}`}>{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="py-12 border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <div className="flex items-center justify-center gap-1 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
          ))}
        </div>
        <h3 className="font-semibold text-lg mb-2" data-testid="text-trust-headline">
          Trusted by frequent travellers and remote teams
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground mt-4">
          <div className="flex items-center gap-1.5" data-testid="text-trust-secure">
            <Lock className="w-3.5 h-3.5" />
            <span>Secure payments</span>
          </div>
          <div className="flex items-center gap-1.5" data-testid="text-trust-gdpr">
            <Shield className="w-3.5 h-3.5" />
            <span>GDPR compliant</span>
          </div>
          <div className="flex items-center gap-1.5" data-testid="text-trust-uptime">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>99.9% uptime</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      question: "Do I need to change my SIM?",
      answer: "No. Your physical SIM stays active. The eSIM works alongside your existing SIM card as a separate data line.",
    },
    {
      question: "When does my data plan start?",
      answer: "Your plan validity countdown begins when you first connect to a network at your destination. Buy it in advance without worry.",
    },
    {
      question: "Can I top up my data?",
      answer: "Yes. You can top up anytime from your dashboard. Simply purchase an additional plan for the same destination.",
    },
    {
      question: "Which devices support eSIM?",
      answer: "Most modern smartphones support eSIM, including iPhone XR and newer, Samsung Galaxy S20 and newer, Google Pixel 3 and newer, and many others.",
    },
    {
      question: "How do I install the eSIM?",
      answer: "After purchase, you'll receive a QR code. Simply scan it with your phone's camera from Settings > Cellular/Mobile Data > Add eSIM. It takes under a minute.",
    },
  ];

  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-faq-title">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know about eSIMs
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`}>
              <AccordionTrigger className="text-left" data-testid={`button-faq-${idx}`}>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function CTABanner() {
  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-7xl mx-auto px-4">
        <Card className="p-8 sm:p-12 text-center bg-primary text-primary-foreground border-primary-border">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" data-testid="text-cta-title">
            Ready to travel with data?
          </h2>
          <p className="text-primary-foreground/80 max-w-md mx-auto mb-8" data-testid="text-cta-subtitle">
            Browse destinations, pick a plan, and get your eSIM QR code in under 60 seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/destinations">
              <Button size="lg" variant="outline" className="bg-white/10 backdrop-blur-sm text-white border-white/30" data-testid="button-cta-browse">
                Browse Destinations
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10 bg-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Wifi className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">GlobeSIM</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/destinations">
              <Button data-testid="button-footer-get-started">Get Started</Button>
            </Link>
            <Link href="/orders">
              <Button variant="outline" data-testid="button-footer-my-esims">
                My eSIMs
              </Button>
            </Link>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
            2026 GlobeSIM. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span data-testid="text-footer-privacy">Privacy Policy</span>
            <span data-testid="text-footer-terms">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <CorridorSelector />
      <ValueBlocks />
      <HowItWorks />
      <TrustSection />
      <FAQSection />
      <CTABanner />
      <Footer />
    </div>
  );
}
