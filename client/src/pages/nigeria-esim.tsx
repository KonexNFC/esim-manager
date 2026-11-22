import { Price } from "@/lib/currency";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/use-in-view";
import {
  ArrowRight, CheckCircle2, XCircle, Minus,
  Wifi, MapPin, Car, Phone, CreditCard, Users,
  Clock, ShieldCheck, Zap, QrCode, ScanLine,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, inView } = useInView(0.1);
  return (
    <div ref={ref} className={`reveal ${inView ? "in-view" : ""} ${className}`}>
      {children}
    </div>
  );
}

const NG_PLANS = [
  {
    id: "starter",
    data: "1 GB",
    days: 7,
    price: 6,
    label: null,
    desc: "Perfect for a short visit or arrival connection",
  },
  {
    id: "popular",
    data: "3 GB",
    days: 15,
    price: 11,
    label: "Popular",
    desc: "Great for a two-week trip with regular usage",
  },
  {
    id: "explorer",
    data: "5 GB",
    days: 30,
    price: 16,
    label: null,
    desc: "Best value for a full month of travel",
  },
  {
    id: "heavy",
    data: "10 GB",
    days: 30,
    price: 24,
    label: "Best Data",
    desc: "For content creators, video calls & heavy users",
  },
];

const USE_CASES = [
  {
    icon: <Wifi className="w-5 h-5" />,
    title: "WhatsApp on arrival",
    desc: "Message family the moment you land — no Wi-Fi hunt needed.",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "Airport pickup coordination",
    desc: "Share your live location and stay in contact with your driver.",
  },
  {
    icon: <Car className="w-5 h-5" />,
    title: "Bolt & Uber",
    desc: "Book rides across Lagos, Abuja or PH from the arrivals hall.",
  },
  {
    icon: <MapPin className="w-5 h-5" />,
    title: "Google Maps",
    desc: "Navigate Nigerian roads and find your destination with confidence.",
  },
  {
    icon: <CreditCard className="w-5 h-5" />,
    title: "Banking apps",
    desc: "Receive OTPs and access UK banking apps that need mobile data.",
  },
  {
    icon: <Phone className="w-5 h-5" />,
    title: "Family calls",
    desc: "WhatsApp and FaceTime calls back to the UK without roaming bills.",
  },
];

type CheckValue = "yes" | "no" | "partial";

const COMPARISON_ROWS: { label: string; konex: CheckValue; local: CheckValue; roaming: CheckValue }[] = [
  { label: "Buy before travel",           konex: "yes", local: "no",  roaming: "yes"     },
  { label: "Physical SIM required",       konex: "no",  local: "yes", roaming: "no"      },
  { label: "Registration queue at airport", konex: "no", local: "yes", roaming: "no"     },
  { label: "Works the moment you land",   konex: "yes", local: "no",  roaming: "yes"     },
  { label: "Keeps your UK number active", konex: "yes", local: "no",  roaming: "yes"     },
  { label: "Best for short trips",        konex: "yes", local: "no",  roaming: "partial" },
];

const FAQS = [
  {
    q: "Does this give me a Nigerian phone number?",
    a: "No — a KONEX eSIM is a data-only plan. You keep your UK number fully active alongside it. You can make calls and receive texts on your UK number while using Nigerian mobile data for apps like WhatsApp, Maps, and Bolt.",
  },
  {
    q: "Can I use WhatsApp with this eSIM?",
    a: "Yes. WhatsApp works entirely over data, so once your KONEX eSIM is active you can call, message, and share your location using your existing UK WhatsApp number — no setup required.",
  },
  {
    q: "When should I install it?",
    a: "Install and configure your eSIM before you travel — ideally at home with a good Wi-Fi connection. The eSIM activates automatically when you land and your phone connects to a Nigerian network.",
  },
  {
    q: "Does it work in Lagos, Abuja, and Port Harcourt?",
    a: "Yes. Our Nigeria plans provide coverage across all major cities including Lagos, Abuja, Port Harcourt, Kano, and Ibadan, as well as secondary towns along key travel routes.",
  },
  {
    q: "Can I keep my UK SIM active at the same time?",
    a: "Yes — that's one of the biggest advantages of eSIM. Your physical UK SIM stays in your phone and remains fully active for calls and texts. The eSIM handles Nigerian data in parallel.",
  },
  {
    q: "What happens when my data runs out?",
    a: "Your eSIM stops routing data once the allowance is used. You can purchase an additional plan from your KONEX dashboard and it activates within seconds — no new QR code needed.",
  },
];

function Check({ value }: { value: CheckValue }) {
  if (value === "yes") return <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === "no")  return <XCircle className="w-5 h-5 text-red-400/70 mx-auto" />;
  return <Minus className="w-5 h-5 text-amber-400/80 mx-auto" />;
}

export default function NigeriaEsim() {
  const [, navigate] = useLocation();
  useEffect(() => {
    document.title = "Nigeria eSIM for UK Travellers | KONEX – Instant Data, No Registration Queue";
  }, []);

  return (
    <main className="min-h-screen bg-background">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        data-testid="section-nigeria-hero"
        style={{ background: "linear-gradient(135deg, #0a1f0e 0%, #0d2818 40%, #061422 100%)" }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #008751 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 left-0 w-[500px] h-[400px] opacity-10"
            style={{ background: "radial-gradient(circle, #008751 0%, transparent 70%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          {/* Top flag pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/8 border border-white/15 text-white/80 text-xs font-semibold uppercase tracking-widest mb-7">
            <span>🇳🇬</span>
            <span>Nigeria eSIM for UK Travellers</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.05] tracking-tight mb-5 max-w-3xl" data-testid="text-nigeria-hero-headline">
            Nigeria eSIM for<br className="hidden sm:block" /> UK travellers.
          </h1>
          <p className="text-white/60 text-lg sm:text-xl max-w-2xl leading-relaxed mb-10" data-testid="text-nigeria-hero-sub">
            Land in Lagos, Abuja or Port Harcourt already connected.
            Buy before you fly, receive your QR code instantly, and avoid airport SIM queues.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              className="font-bold h-12 px-8 text-base shadow-xl shadow-emerald-900/40 hover:scale-[1.02] transition-all duration-200 border-0"
              style={{ background: "linear-gradient(135deg, #008751, #00a65e)" }}
              onClick={() => navigate("/find-plan?country=NG")}
              data-testid="button-nigeria-hero-primary"
            >
              Get Nigeria eSIM
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-bold h-12 px-8 text-base border-white/20 text-white/80 bg-white/5 hover:bg-white/10 hover:text-white hover:border-white/30"
              onClick={() => navigate("/destinations/NG")}
              data-testid="button-nigeria-hero-secondary"
            >
              View Nigeria Plans
            </Button>
          </div>

          {/* Quick trust chips */}
          <div className="flex flex-wrap gap-3 mt-10">
            {[
              { icon: <Zap className="w-3.5 h-3.5" />, label: "Instant QR code delivery" },
              { icon: <QrCode className="w-3.5 h-3.5" />, label: "Install before you fly" },
              { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: "Keeps UK number active" },
              { icon: <Clock className="w-3.5 h-3.5" />, label: "No registration queue" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 text-white/65 text-xs font-medium">
                <span className="text-emerald-400">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain-point section ────────────────────────────────────────────────── */}
      <Reveal>
        <section className="py-14 sm:py-20 bg-muted/30 border-t border-border" data-testid="section-nigeria-pain">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">The problem with local SIMs</p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-5">
                  Nigerian airport SIMs<br />require in-person registration.
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  NCC regulations require all Nigerian SIM cards to be registered with biometric data. At the airport this means:
                </p>
                <ul className="space-y-3">
                  {[
                    "Present your passport and visa in-person at the carrier desk",
                    "Biometric fingerprint scan before activation",
                    "Waiting 15–60 minutes for manual processing",
                    "SIM may not activate immediately — sometimes hours later",
                    "Cards sold outside official booths may be blocked",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className="rounded-2xl border border-emerald-500/25 p-7"
                style={{ background: "linear-gradient(135deg, rgba(0,135,81,0.08) 0%, rgba(0,135,81,0.03) 100%)" }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="font-bold text-sm">With KONEX eSIM</span>
                </div>
                <ul className="space-y-4">
                  {[
                    { step: "01", text: "Buy your plan online — takes under 2 minutes" },
                    { step: "02", text: "Receive QR code instantly to your email" },
                    { step: "03", text: "Scan and install on your phone at home" },
                    { step: "04", text: "Land in Lagos — data activates automatically" },
                    { step: "05", text: "Walk straight to arrivals, already connected" },
                  ].map(({ step, text }) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[10px] font-bold flex items-center justify-center leading-none">
                        {step}
                      </span>
                      <span className="text-sm leading-snug pt-0.5">{text}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-7 font-bold border-0"
                  style={{ background: "linear-gradient(135deg, #008751, #00a65e)" }}
                  onClick={() => navigate("/find-plan?country=NG")}
                  data-testid="button-pain-cta"
                >
                  Get Nigeria eSIM
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Plan cards ────────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="py-14 sm:py-20 border-t border-border" id="plans" data-testid="section-nigeria-plans">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Nigeria Data Plans</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
                Pick your plan.
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                All plans cover Nigeria. No hidden fees. Activate before departure.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {NG_PLANS.map((plan) => {
                const isPopular = plan.label === "Popular";
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-1 ${
                      isPopular
                        ? "border-emerald-500/40 bg-gradient-to-b from-emerald-950/30 to-transparent shadow-lg shadow-emerald-900/20"
                        : "border-border bg-card hover:border-emerald-500/25"
                    }`}
                    data-testid={`card-nigeria-plan-${plan.id}`}
                  >
                    {plan.label && (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap"
                        style={{ background: "linear-gradient(135deg, #008751, #00a65e)" }}
                      >
                        {plan.label}
                      </div>
                    )}

                    <div className="mb-4">
                      <div className="text-3xl font-bold tracking-tight mb-0.5">{plan.data}</div>
                      <div className="text-xs text-muted-foreground font-medium">{plan.days}-day validity</div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">From <Price amount={plan.price} /></span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-5 flex-1">{plan.desc}</p>

                    <ul className="space-y-1.5 mb-5 text-xs">
                      {["Coverage: Nigeria", "4G LTE speeds", "Instant QR delivery"].map(f => (
                        <li key={f} className="flex items-center gap-1.5 text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="w-full font-bold border-0 text-sm"
                      style={isPopular
                        ? { background: "linear-gradient(135deg, #008751, #00a65e)" }
                        : undefined}
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => navigate("/find-plan?country=NG")}
                      data-testid={`button-nigeria-plan-${plan.id}`}
                    >
                      Buy Now
                      <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground mt-5">
              Prices shown in USD · Converted at checkout to your preferred currency
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── Use-case grid ─────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="py-14 sm:py-20 bg-muted/30 border-t border-border" data-testid="section-nigeria-usecases">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Why you need data on arrival</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
                Everything that needs<br className="hidden sm:block" /> mobile data in Nigeria.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {USE_CASES.map((uc) => (
                <div
                  key={uc.title}
                  className="flex gap-4 p-5 rounded-xl border border-border bg-card hover:border-emerald-500/25 hover:shadow-sm transition-all duration-200"
                  data-testid={`card-nigeria-usecase-${uc.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-600 dark:text-emerald-400">
                    {uc.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{uc.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{uc.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Comparison table ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="py-14 sm:py-20 border-t border-border" data-testid="section-nigeria-comparison">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">How we compare</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
                KONEX vs the alternatives.
              </h2>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
              {/* Header */}
              <div className="grid grid-cols-4 bg-muted/60 border-b border-border">
                <div className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest" />
                {["KONEX eSIM", "Local SIM", "Roaming"].map((col, i) => (
                  <div
                    key={col}
                    className={`px-3 py-3 text-center text-xs font-bold uppercase tracking-widest ${
                      i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    {i === 0 && <span className="mr-1">🇳🇬</span>}
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {COMPARISON_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-4 border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                  data-testid={`row-comparison-${i}`}
                >
                  <div className="px-4 py-3.5 text-sm font-medium">{row.label}</div>
                  <div className="px-3 py-3.5 flex items-center justify-center">
                    <Check value={row.konex} />
                  </div>
                  <div className="px-3 py-3.5 flex items-center justify-center">
                    <Check value={row.local} />
                  </div>
                  <div className="px-3 py-3.5 flex items-center justify-center">
                    <Check value={row.roaming} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 justify-center mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Yes</span>
              <span className="flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-red-400/70" /> No</span>
              <span className="flex items-center gap-1.5"><Minus className="w-3.5 h-3.5 text-amber-400" /> Varies</span>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="py-14 sm:py-20 bg-muted/30 border-t border-border" data-testid="section-nigeria-faq">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Common questions</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
                Nigeria eSIM FAQ.
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-2">
              {FAQS.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border border-border rounded-xl px-5 bg-card"
                  data-testid={`faq-nigeria-${i}`}
                >
                  <AccordionTrigger className="text-sm font-semibold text-left hover:no-underline py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </Reveal>

      {/* ── Final CTA ─────────────────────────────────────────────────────────── */}
      <section
        className="py-16 sm:py-24 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #061a0c 0%, #0a2015 50%, #061422 100%)" }}
        data-testid="section-nigeria-final-cta"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-25"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 100%, #008751 0%, transparent 70%)" }} />
        </div>
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="text-5xl mb-5">🇳🇬</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            Ready to land connected?
          </h2>
          <p className="text-white/55 text-lg max-w-lg mx-auto mb-8 leading-relaxed">
            Get your Nigeria eSIM now. It takes under 2 minutes — you'll have the QR code before you finish packing.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="font-bold h-12 px-8 text-base shadow-xl shadow-emerald-900/40 hover:scale-[1.02] transition-all duration-200 border-0"
              style={{ background: "linear-gradient(135deg, #008751, #00a65e)" }}
              onClick={() => navigate("/find-plan?country=NG")}
              data-testid="button-nigeria-final-cta"
            >
              Get Nigeria eSIM
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-bold h-12 px-8 text-base border-white/20 text-white/80 bg-white/5 hover:bg-white/10"
              onClick={() => navigate("/destinations/NG")}
              data-testid="button-nigeria-view-plans"
            >
              View All Nigeria Plans
            </Button>
          </div>
          <p className="text-white/25 text-xs mt-6">
            Instant QR delivery · No contract · Cancel anytime
          </p>
        </div>
      </section>

    </main>
  );
}
