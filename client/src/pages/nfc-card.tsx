import { Price } from "@/lib/currency";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import cardImage from "@assets/ChatGPT_Image_Apr_12,_2026,_10_12_36_PM_1776028769201.png";
import {
  Wifi, QrCode, Smartphone, Zap, CheckCircle2,
  ArrowRight, Star, Globe, Package, CreditCard,
  Users, Share2, Layers,
} from "lucide-react";

// ─── 3-D flip card ───────────────────────────────────────────────────────────
function FlipCard() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative w-[340px] h-[214px] cursor-pointer mx-auto select-none"
      style={{ perspective: "1200px" }}
      onClick={() => setFlipped(f => !f)}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      data-testid="card-flip-interactive"
      aria-label="Click to flip card"
    >
      <div
        className="relative w-full h-full transition-transform duration-700"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ── FRONT ── */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Matte black card surface */}
          <div className="absolute inset-0 bg-[#1a1a1a] rounded-2xl">
            {/* Subtle grain texture */}
            <div className="absolute inset-0 opacity-[0.06] rounded-2xl"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
            {/* Subtle specular sheen */}
            <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)" }} />
          </div>

          {/* KONEX logo top-left */}
          <div className="absolute top-5 left-5 flex items-center gap-2">
            {/* Network icon */}
            <svg viewBox="0 0 32 32" className="w-7 h-7 flex-shrink-0" fill="none">
              <circle cx="16" cy="8" r="3" fill="#3b82f6" />
              <circle cx="6" cy="24" r="3" fill="#3b82f6" />
              <circle cx="26" cy="24" r="3" fill="#3b82f6" />
              <line x1="16" y1="11" x2="6" y2="21" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="16" y1="11" x2="26" y2="21" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="8.5" y1="24" x2="23.5" y2="24" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-white font-bold text-[15px] leading-none tracking-wider">KONEX</p>
              <p className="text-white/40 text-[8px] tracking-widest mt-0.5">Connecting people</p>
            </div>
          </div>

          {/* NFC tap icon bottom-right */}
          <div className="absolute bottom-5 right-5 text-white/35">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 19a7 7 0 0 0 0-14" strokeLinecap="round" />
              <path d="M12 15a3 3 0 0 0 0-6" strokeLinecap="round" />
              <path d="M12 23A11 11 0 0 0 12 1" strokeLinecap="round" />
            </svg>
          </div>

          {/* Flip hint */}
          <p className="absolute bottom-5 left-5 text-white/20 text-[9px] tracking-widest uppercase font-medium">Hover to flip</p>
        </div>

        {/* ── BACK ── */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="absolute inset-0 bg-[#1c1c1e] rounded-2xl">
            <div className="absolute inset-0 opacity-[0.06] rounded-2xl"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
            <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)" }} />
          </div>

          {/* Top: Tap to connect */}
          <div className="absolute top-5 left-5">
            <p className="text-white font-bold text-[17px] leading-tight tracking-tight">Tap to connect</p>
            <p className="text-white/45 text-[10px] mt-0.5 tracking-wide">No app needed</p>
          </div>

          {/* Top-right NFC icon */}
          <div className="absolute top-5 right-5 text-white/40">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 19a7 7 0 0 0 0-14" strokeLinecap="round" />
              <path d="M12 15a3 3 0 0 0 0-6" strokeLinecap="round" />
              <path d="M12 23A11 11 0 0 0 12 1" strokeLinecap="round" />
            </svg>
          </div>

          {/* QR Code (center-right) */}
          <div className="absolute right-5 top-1/2 -translate-y-[45%]">
            <div className="w-[72px] h-[72px] bg-white rounded-md flex items-center justify-center shadow-lg">
              <QrCode className="w-14 h-14 text-black" />
            </div>
            <p className="text-white/30 text-[8px] text-center mt-1.5 tracking-wider">Scan if tap doesn't work</p>
          </div>

          {/* Bottom-left URL */}
          <div className="absolute bottom-5 left-5">
            <p className="text-white/40 text-[10px] tracking-wider font-medium">konexnfc.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, accent }: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="p-7 rounded-2xl border border-border bg-card card-gradient-hover h-full" data-testid={`feature-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-bold text-base mb-2 leading-snug">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Pricing tier ─────────────────────────────────────────────────────────────
const tiers = [
  {
    id: "basic",
    name: "Basic",
    tagline: "The classic black card",
    price: 19.99,
    label: null,
    highlighted: false,
    features: [
      "Matte black PVC card",
      "NFC chip (tap to share)",
      "QR code fallback",
      "1 digital profile",
      "Unlimited taps",
      "konexnfc.com subdomain",
    ],
    cta: "Order Basic Card",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Custom brand, premium feel",
    price: 39.99,
    label: "Most Popular",
    highlighted: true,
    features: [
      "Everything in Basic",
      "Custom logo & branding",
      "Premium matte finish",
      "3 digital profiles",
      "Analytics dashboard",
      "Priority support",
    ],
    cta: "Order Pro Card",
  },
  {
    id: "metal",
    name: "Metal",
    tagline: "Heavyweight impression",
    price: 79.99,
    label: "Premium",
    highlighted: false,
    features: [
      "Everything in Pro",
      "Stainless steel card",
      "Laser-engraved design",
      "Unlimited profiles",
      "Team management",
      "White-label domain",
    ],
    cta: "Order Metal Card",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NfcCard() {
  return (
    <main className="min-h-screen bg-background">
      <title>KONEX NFC Card — Tap to Share, No App Needed</title>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0a0e1a] via-background to-background border-b">
        {/* Background glow */}
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-20 pointer-events-none blur-3xl"
          style={{ background: "radial-gradient(ellipse, #2563eb 0%, transparent 65%)" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

            {/* Left: text */}
            <div>
              <Badge className="mb-5 bg-blue-600/15 text-blue-400 border border-blue-500/30 hover:bg-blue-600/20" data-testid="badge-nfc-hero">
                <Wifi className="w-3 h-3 mr-1.5" />
                NFC Smart Card
              </Badge>

              <h1
                className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-5 text-white"
                data-testid="text-nfc-hero-title"
              >
                Tap to share.<br />
                <span className="text-gradient-bright">No app needed.</span>
              </h1>

              <p className="text-white/55 text-base sm:text-lg leading-relaxed mb-8 max-w-lg" data-testid="text-nfc-hero-subtitle">
                The KONEX Basic Card is a matte black NFC card that instantly shares your contact, profile, or website with a single tap — and falls back to QR if needed.
              </p>

              <div className="flex flex-col gap-2 mb-9">
                {[
                  "Works with every modern smartphone — no app required",
                  "QR code on the back for older devices",
                  "Unlimited taps, one-time purchase",
                ].map((b) => (
                  <div key={b} className="flex items-center gap-2.5 text-white/55 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    {b}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <a href="#pricing">
                  <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xl shadow-blue-500/25 px-7"
                    data-testid="button-nfc-hero-order"
                  >
                    Order Your Card
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </a>
                <a href="#how-it-works">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/20 text-white bg-white/8 hover:bg-white/15 font-semibold px-7"
                    data-testid="button-nfc-hero-learn"
                  >
                    See How It Works
                  </Button>
                </a>
              </div>
            </div>

            {/* Right: interactive 3D card + product photo */}
            <div className="flex flex-col items-center gap-10">
              {/* 3D flip card */}
              <div>
                <FlipCard />
                <p className="text-center text-white/20 text-[10px] uppercase tracking-widest mt-4 font-medium">
                  Hover or tap to see both sides
                </p>
              </div>

              {/* Product photography */}
              <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl shadow-black/50 bg-white/5 border border-white/10">
                <img
                  src={cardImage}
                  alt="KONEX Basic NFC Card — front and back"
                  loading="lazy"
                  className="w-full h-auto object-contain p-4"
                  data-testid="img-nfc-product"
                  style={{ background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)" }}
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-12 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Why KONEX Card</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3" data-testid="text-features-title">
              Built for how people<br />actually connect.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              No fumbling with apps. No outdated paper cards. Just tap and share — instantly.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Wifi}
              title="Instant NFC Tap"
              description="Hold your card near any NFC-enabled phone. Your profile, contact details, or website opens instantly — no app install needed."
              accent="bg-blue-500/10 text-blue-500"
            />
            <FeatureCard
              icon={QrCode}
              title="QR Code Fallback"
              description="Every card has a unique QR code on the back. For older phones or non-NFC devices, a quick scan works just as well."
              accent="bg-emerald-500/10 text-emerald-500"
            />
            <FeatureCard
              icon={Smartphone}
              title="No App Required"
              description="Works natively with iOS and Android. Recipients just see a tap notification and a link — no downloads, no friction, no barriers."
              accent="bg-amber-500/10 text-amber-500"
            />
            <FeatureCard
              icon={Globe}
              title="Custom Digital Profile"
              description="Link to any URL — your LinkedIn, portfolio, booking page, WhatsApp, or a full KONEX digital card profile."
              accent="bg-sky-500/10 text-sky-500"
            />
            <FeatureCard
              icon={Zap}
              title="Unlimited Taps Forever"
              description="One purchase, unlimited taps for life. Update your profile URL anytime from your dashboard without reprinting anything."
              accent="bg-pink-500/10 text-pink-500"
            />
            <FeatureCard
              icon={Layers}
              title="Premium Matte Finish"
              description="The classic matte black PVC card is durable, credit-card sized, and designed to make the right impression every time."
              accent="bg-indigo-500/10 text-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-16 sm:py-24 border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-12 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">How It Works</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight" data-testid="text-hiw-title">
              Three seconds.<br />Permanent connection.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
            {/* Desktop connector */}
            <div className="hidden sm:block absolute top-[3.25rem] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-border to-transparent z-0" />

            {[
              {
                num: "01",
                icon: CreditCard,
                title: "Tap your card",
                body: "Hold the KONEX card near the top of someone's phone. The NFC chip does the rest — no unlocking required.",
                color: "bg-blue-600",
              },
              {
                num: "02",
                icon: Share2,
                title: "Your profile appears",
                body: "A notification or browser link opens instantly, showing your chosen profile, website, or contact card.",
                color: "bg-blue-600",
              },
              {
                num: "03",
                icon: Users,
                title: "They save your details",
                body: "One tap to save your contact. They're connected. You move on. No paper, no chasing, no follow-up.",
                color: "bg-blue-600",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="relative z-10 bg-background border border-border rounded-2xl p-7 flex flex-col gap-4 card-gradient-hover"
                data-testid={`step-card-${i + 1}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md shadow-blue-500/25`}>
                    {step.num}
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                </div>
                <h3 className="font-bold text-lg leading-snug">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof strip ────────────────────────────────────────────── */}
      <section className="py-8 border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: "10,000+", label: "Cards shipped" },
              { value: "4.9/5",   label: "Customer rating" },
              { value: "∞",      label: "Taps per card" },
              { value: "1-tap",  label: "Setup time" },
            ].map((s) => (
              <div key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-primary mb-0.5">{s.value}</div>
                <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-16 sm:py-24 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-12 text-center max-w-xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Pricing</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3" data-testid="text-pricing-title">
              One card. Unlimited connections.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              All cards come with a digital profile, QR fallback, and unlimited taps — forever.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                data-testid={`pricing-card-${tier.id}`}
                className={cn(
                  "flex flex-col rounded-2xl border p-7",
                  tier.highlighted
                    ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500 scale-[1.02] shadow-xl shadow-blue-500/25"
                    : "bg-card border-border",
                )}
              >
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${tier.highlighted ? "text-blue-200" : "text-muted-foreground"}`}>
                      {tier.name}
                    </p>
                    <p className={`text-sm ${tier.highlighted ? "text-white/70" : "text-muted-foreground"}`}>
                      {tier.tagline}
                    </p>
                  </div>
                  {tier.label && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${
                      tier.highlighted ? "bg-white/20 border-white/30 text-white" : "bg-primary/10 border-primary/20 text-primary"
                    }`}>
                      {tier.label}
                    </span>
                  )}
                </div>

                <div className="mb-6">
                  <span className="font-display text-4xl font-bold tracking-tight"><Price amount={tier.price} source="GBP" /></span>
                  <span className={`text-sm ml-1.5 ${tier.highlighted ? "text-white/60" : "text-muted-foreground"}`}>one-time</span>
                </div>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${tier.highlighted ? "text-white/70" : "text-primary"}`} />
                      <span className={tier.highlighted ? "text-white/80" : ""}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  data-testid={`button-order-${tier.id}`}
                  className={cn(
                    "w-full font-bold",
                    tier.highlighted
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {tier.cta}
                  <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Free shipping to UK · Dispatched within 2–3 business days · 30-day money-back guarantee
          </p>
        </div>
      </section>

      {/* ── Trust badges ──────────────────────────────────────────────────── */}
      <section className="py-12 border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Star,         label: "4.9/5 rating",       sub: "5,000+ reviews"         },
              { icon: Package,     label: "Free UK delivery",    sub: "2–3 business days"       },
              { icon: Zap,         label: "Unlimited taps",      sub: "No subscription fee"     },
              { icon: CheckCircle2, label: "30-day guarantee",   sub: "Full refund, no questions" },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex flex-col items-center text-center p-5 rounded-2xl border bg-background gap-3 card-gradient-hover"
                data-testid={`trust-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="text-5xl mb-5">🪪</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4" data-testid="text-nfc-final-cta">
            Ready to make a lasting impression?
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-8 max-w-lg mx-auto">
            Join thousands of professionals using KONEX to share smarter, connect faster, and leave paper cards behind for good.
          </p>
          <a href="#pricing">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xl shadow-blue-500/20 px-8 h-13"
              data-testid="button-nfc-bottom-cta"
            >
              Order Your Card Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </a>
          <p className="text-xs text-muted-foreground mt-4">From <Price amount={19.99} source="GBP" /> · Free UK delivery · 30-day guarantee</p>
        </div>
      </section>
    </main>
  );
}
