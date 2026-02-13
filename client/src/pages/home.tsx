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
  ChevronRight, Wifi, MapPin, Users, Star, Lock, CheckCircle2
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-24 sm:py-32 lg:py-44">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="mb-6 bg-white/15 text-white border-white/20">
            <Wifi className="w-3 h-3 mr-1.5" />
            eSIM Technology
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1]" data-testid="text-hero-title">
            One Card. Tap.
            <span className="block text-cyan-400 mt-1">
              Connect.
            </span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-lg leading-relaxed" data-testid="text-hero-subtitle">
            Instant eSIM data in 60 seconds. No roaming fees. No plastic SIMs.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/destinations">
              <Button size="lg" data-testid="button-get-connected">
                Get Connected
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/destinations">
              <Button size="lg" variant="outline" className="bg-white/10 backdrop-blur-sm text-white border-white/20" data-testid="button-view-plans">
                View Plans
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-4 text-white/60 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Frequent travellers</span>
            </div>
            <span className="hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              <span>30+ countries</span>
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
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-popular-routes">
            Popular Routes
          </h2>
          <p className="mt-2 text-muted-foreground">
            Optimised plans for high-traffic travel corridors.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
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
            filtered.map((dest) => (
              <Link key={dest.id} href={`/destinations/${dest.id}`}>
                <Card className="overflow-visible hover-elevate cursor-pointer group" data-testid={`card-corridor-dest-${dest.id}`}>
                  <div className="aspect-[16/10] overflow-hidden rounded-t-md">
                    <img
                      src={dest.imageUrl}
                      alt={dest.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{dest.flagEmoji}</span>
                      <h3 className="font-semibold text-sm">{dest.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{dest.region}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div className="text-center mt-8">
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
      description: "Buy before you land. Scan the QR. You're online.",
    },
    {
      icon: Shield,
      title: "Transparent Pricing",
      description: "Fixed pricing. No roaming shock. Top up anytime.",
    },
    {
      icon: Globe,
      title: "Global Coverage",
      description: "Reliable data across EU, Africa, and the Middle East.",
    },
    {
      icon: Smartphone,
      title: "Device Ready",
      description: "Works with iPhone, Samsung, and Pixel eSIM devices.",
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
            <Card key={block.title} className="p-5 text-center">
              <div className="flex items-center justify-center w-11 h-11 rounded-md bg-primary/10 mx-auto mb-4">
                <block.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-1.5" data-testid={`text-feature-${block.title.toLowerCase().replace(/\s/g, '-')}`}>
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
    { step: "1", title: "Choose Destination", description: "Select your country or region." },
    { step: "2", title: "Pick a Plan", description: "Day pass, travel pack, or regional bundle." },
    { step: "3", title: "Scan & Connect", description: "Install instantly via QR code." },
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
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
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground mt-3">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>Secure payments</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>GDPR compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
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
      question: "When does my data start?",
      answer: "On first connection in destination. Your plan validity countdown begins when you first connect to a network at your destination.",
    },
    {
      question: "Can I top up?",
      answer: "Yes. Top up anytime from your dashboard. Simply purchase an additional plan for the same destination.",
    },
  ];

  return (
    <section className="py-16 sm:py-20 border-t">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-faq-title">
            Frequently Asked Questions
          </h2>
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
            <Link href="/admin">
              <Button variant="outline" data-testid="button-footer-business">
                Business & API
              </Button>
            </Link>
          </div>
        </div>
        <div className="mt-6 text-center sm:text-left">
          <p className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
            2026 GlobeSIM. All rights reserved.
          </p>
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
      <Footer />
    </div>
  );
}
