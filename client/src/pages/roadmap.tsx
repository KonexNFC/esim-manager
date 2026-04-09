import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Gift, PhoneCall,
  ArrowRight, CheckCircle2, Globe,
  Wifi, ShieldCheck, Rocket,
} from "lucide-react";
import { Navbar } from "@/components/navbar";

function DataRolloverSection() {
  const steps = [
    { pct: 100, label: "Trip 1 — Japan",     used: "3.2 GB", total: "5 GB", leftover: "1.8 GB", flag: "🇯🇵" },
    { pct: 64,  label: "Trip 2 — Thailand",  used: "2.2 GB", total: "5 GB + 1.8 GB carried", leftover: "4.6 GB", flag: "🇹🇭" },
    { pct: 38,  label: "Trip 3 — Indonesia", used: "2.6 GB", total: "5 GB + 4.6 GB carried", leftover: "7.0 GB", flag: "🇮🇩" },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card/50" id="rollover" data-testid="section-rollover">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <TrendingUp className="w-3.5 h-3.5" />
              Coming Q3 2026
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-rollover-title">
              Leftover data?<br />
              <span className="text-gradient">It rolls over.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Don't lose data you've paid for. Unused gigabytes carry forward automatically to your next trip — no expiry, no waste.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Rollover applies to all future trips with Konex",
                "No manual action required — it's automatic",
                "Pooled balance visible in your dashboard",
                "Works across any destination",
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <Button size="lg" className="font-bold" data-testid="button-rollover-notify">
                Get notified when it's live
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3" data-testid="rollover-demo">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-5 ${i === 0 ? "opacity-50 bg-muted/30" : "bg-background"}`}
                data-testid={`rollover-step-${i}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">{step.flag}</span>
                    <div>
                      <p className="font-bold text-sm">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.total}</p>
                    </div>
                  </div>
                  {i > 0 && (
                    <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                      +{steps[i - 1].leftover} carried
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{step.used} used</span>
                    <span className={`font-medium ${i > 0 ? "text-emerald-500" : ""}`}>{step.leftover} left</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${i === 0 ? "bg-muted-foreground/40" : "bg-primary"}`}
                      style={{ width: `${step.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GiftEsimSection() {
  const [form, setForm] = useState({ recipientName: "", recipientEmail: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleGift(e: React.FormEvent) {
    e.preventDefault();
    if (!form.recipientEmail) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <section className="py-16 sm:py-20 border-t" id="gift" data-testid="section-gift">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="order-2 lg:order-1" data-testid="gift-demo">
            <div className="relative max-w-sm mx-auto lg:mx-0">
              <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/15 via-violet-500/10 to-blue-500/10 p-8 text-center shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-5">
                  <Gift className="w-8 h-8 text-primary" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Gift eSIM</p>
                <h3 className="font-display text-xl font-bold mb-1">5 GB · 30 Days</h3>
                <p className="text-sm text-muted-foreground mb-4">Thailand · Southeast Asia</p>
                <div className="rounded-xl bg-card border p-3 mb-5">
                  <p className="text-xs text-muted-foreground mb-1">To: Aisha Patel</p>
                  <p className="text-sm italic text-foreground/80">"Safe travels on your adventure! Stay connected 🌏"</p>
                </div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-bold border border-primary/20">
                  <CheckCircle2 className="w-4 h-4" />
                  Delivered to inbox
                </div>
              </div>
              <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                Instant delivery
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-bold uppercase tracking-widest mb-5">
              <Gift className="w-3.5 h-3.5" />
              Coming Soon
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5" data-testid="text-gift-title">
              Send data to<br /><span className="text-gradient">a loved one.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Buy an eSIM plan as a gift. They get a link in their inbox to activate it when they're ready — no account needed.
            </p>

            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center" data-testid="gift-success">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-bold text-lg mb-1">You're on the list!</p>
                <p className="text-muted-foreground text-sm">We'll notify you when gift eSIMs launch.</p>
              </div>
            ) : (
              <form onSubmit={handleGift} className="space-y-3" data-testid="gift-form">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Your name</label>
                    <input
                      type="text"
                      placeholder="Alex Kim"
                      value={form.recipientName}
                      onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
                      className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-gift-recipient-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Your email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={form.recipientEmail}
                      onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))}
                      className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-gift-recipient-email"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full font-bold" size="lg" disabled={loading} data-testid="button-gift-submit">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Gift className="w-4 h-4" />
                      Notify me when it's ready
                    </span>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  No commitment — we'll just drop you an email when gift eSIMs go live.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function VoiceCallingSection() {
  const features = [
    { icon: PhoneCall,   title: "Local number included",     desc: "Get a dedicated number for your destination — calls look local." },
    { icon: Globe,       title: "Call 190+ countries",       desc: "Same eSIM, voice and data. No separate plan needed." },
    { icon: Wifi,        title: "Works over VoIP & carrier", desc: "Uses your data or the host network — whichever is stronger." },
    { icon: ShieldCheck, title: "Encrypted & private",       desc: "End-to-end encrypted calls with no call logs stored." },
  ];

  return (
    <section className="py-16 sm:py-20 border-t bg-card/50" id="voice" data-testid="section-voice">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-5">
            <PhoneCall className="w-3.5 h-3.5" />
            Coming Q4 2026
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4" data-testid="text-voice-title">
            Make calls with Konex.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            Your eSIM, your number — everywhere. Voice calling is coming so you can stay fully connected without juggling apps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {features.map((f, i) => (
            <div key={i} className="rounded-2xl border bg-background p-6 flex flex-col gap-4" data-testid={`card-voice-feature-${i}`}>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm mb-1">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center" data-testid="card-voice-early-access">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
            <PhoneCall className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display text-xl font-bold mb-2">Get early access to voice calling</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Create a Konex account and we'll notify you the moment voice calling launches — early users get priority access and a free trial minute pack.
          </p>
          <Link href="/signup">
            <Button size="lg" className="font-bold shadow-lg shadow-primary/20" data-testid="button-voice-signup">
              Join early access
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-4">Free to join · No credit card needed</p>
        </div>
      </div>
    </section>
  );
}

export default function Roadmap() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <title>What's Coming — Konex Roadmap</title>

      {/* Hero */}
      <section className="py-16 sm:py-24 border-b" data-testid="section-roadmap-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Rocket className="w-3.5 h-3.5" />
            Product Roadmap
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5">
            What's coming to<br />
            <span className="text-gradient">Konex</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed mb-8">
            We're constantly building to make global connectivity smarter. Here's a preview of what's next — sign up to be first in line.
          </p>

          {/* Timeline bar */}
          <div className="inline-flex items-center gap-0 rounded-2xl border bg-card overflow-hidden text-sm font-semibold" data-testid="roadmap-timeline">
            {[
              { label: "Gift eSIMs",     tag: "Coming Soon",  active: true  },
              { label: "Data Rollover",  tag: "Q3 2026",      active: false },
              { label: "Voice Calling",  tag: "Q4 2026",      active: false },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex flex-col items-center px-6 py-3 border-r last:border-r-0 gap-0.5 ${item.active ? "bg-primary/10" : ""}`}
                data-testid={`roadmap-milestone-${i}`}
              >
                <span className={item.active ? "text-primary" : "text-foreground"}>{item.label}</span>
                <span className="text-xs text-muted-foreground font-normal">{item.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GiftEsimSection />
      <DataRolloverSection />
      <VoiceCallingSection />

      {/* Bottom CTA */}
      <section className="py-16 sm:py-20 border-t" data-testid="section-roadmap-cta">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">Ready to connect now?</h2>
          <p className="text-muted-foreground text-lg mb-8">
            All current plans are available instantly — no waiting.
          </p>
          <Link href="/destinations">
            <Button size="lg" className="font-bold shadow-lg shadow-primary/20" data-testid="button-roadmap-shop">
              Browse eSIM Plans
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
