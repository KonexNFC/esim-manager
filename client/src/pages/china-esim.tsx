import { useEffect, useState } from "react";
import { TravelImage } from "@/components/travel-image";
import { getEventPhoto, getTravelPhoto } from "@/lib/travel-imagery";
import { Link } from "wouter";
import { ArrowRight, CalendarDays, CheckCircle2, Info, Mail, MapPin, Plane, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Price } from "@/lib/currency";
import { chinaDataLabel, chinaDataSize, chinaPlanHref, chinaValidity, useChinaPlans } from "@/hooks/use-china-plans";
import { newFeaturedEvents, upcomingEvents } from "@shared/featured-events";
import events from "@/data/events";

const restrictionsNote = "Access to some apps and websites in mainland China may be restricted, and this can vary by plan and provider. Please check the plan details before you buy.";

const checklist = [
  { title: "Check your phone supports eSIM", copy: "Confirm eSIM support for your specific phone model before buying." },
  { title: "Check your phone is carrier-unlocked", copy: "If you are unsure, ask your home carrier before buying." },
  { title: "Install before you travel", copy: "Use a reliable Wi-Fi connection and follow your emailed QR or manual installation instructions. Check the plan’s activation terms." },
  { title: "Turn your eSIM on after arrival", copy: "Select it as your mobile data line and follow the settings in your installation guide." },
  { title: "Keep your home SIM for calls and texts", copy: "This eSIM is data only. Home-carrier charges may apply to calls and texts; check your roaming settings." },
];

const faqs = [
  { q: "How will I receive my eSIM?", a: "After payment, your eSIM is delivered by email with a QR code and manual installation instructions. Delivery is typically within minutes; rare cases can take up to 24 hours." },
  { q: "Will it work with my phone?", a: "You need a compatible, carrier-unlocked phone. Check your specific model and its eSIM support before buying." },
  { q: "Does it include a phone number?", a: "No. These are data-only plans, without a phone number, calls or SMS. You can keep your home SIM for calls and texts, subject to your device’s dual-SIM support and your home carrier’s terms and charges." },
  { q: "When should I install my eSIM?", a: "Install before you travel while connected to Wi-Fi. Follow the emailed guide and review your plan’s activation and validity terms. Turn the eSIM on for mobile data after arrival." },
  { q: "What if I run out of data?", a: "You can buy another available China plan. Follow the installation instructions supplied with that purchase; do not assume it tops up your existing eSIM." },
  { q: "Will every app and website be accessible?", a: `${restrictionsNote} Access is not guaranteed.` },
];

function ChinaPlans() {
  const { groupedPlans, fromPrice, sizes, validityOptions, hasUnlimited, isLoading, isError, isFetching, refetch } = useChinaPlans();
  return (
    <section id="china-plans" className="py-14 sm:py-20 border-b scroll-mt-24" data-testid="section-china-plans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[.18em] font-bold text-primary mb-4">From the live catalogue</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">Choose the data for your trip.</h2>
            <p className="text-muted-foreground leading-relaxed">Compare the lowest quoted price for each available data size. Review the selected plan’s details before you buy.</p>
          </div>
          {!isError && fromPrice !== undefined && <p className="shrink-0 text-xl font-bold" data-testid="text-china-from-price">From <Price amount={fromPrice} /></p>}
        </div>
        {isLoading ? <div role="status"><span className="sr-only">Loading live China plans</span><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2].map(n => <div key={n} className="h-52 rounded-2xl bg-muted motion-safe:animate-pulse" />)}</div></div>
          : isError ? <div role="alert" className="rounded-2xl border bg-card p-7"><h3 className="font-bold text-lg mb-2">We couldn’t check today’s prices.</h3><p className="text-muted-foreground mb-5">Please retry to load the live China catalogue.</p><Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Checking…" : "Try again"}</Button></div>
          : !groupedPlans.length ? <div className="rounded-2xl border bg-card p-7"><QrCode aria-hidden className="text-primary w-8 h-8 mb-4" /><h3 className="font-bold text-xl mb-2">No current quotes to show.</h3><p className="text-muted-foreground mb-5">We won’t show an estimated price in place of a live quote. Check the plan picker for availability.</p><div className="flex flex-wrap gap-3"><Button asChild><Link href="/destinations/CN">Open China plan picker<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button><Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>Refresh quotes</Button></div></div>
          : <>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-sm text-muted-foreground" data-testid="text-china-plan-options">
              {!!sizes.length && <span>Data: {sizes.length === 1 ? chinaDataSize(sizes[0]) : `${chinaDataSize(sizes[0])}–${chinaDataSize(sizes[sizes.length - 1])}`}{hasUnlimited ? " + unlimited options" : ""}</span>}
              {!sizes.length && hasUnlimited && <span>Unlimited data options available</span>}
              {!!validityOptions.length && <span>Quoted validity options: {validityOptions.join(", ")} {validityOptions.length === 1 && validityOptions[0] === 1 ? "day" : "days"}</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedPlans.map(plan => <article key={plan.id} className="rounded-2xl border bg-card p-6 sm:p-7 flex flex-col" data-testid={`card-china-plan-${plan.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><h3 className="font-display text-2xl font-bold">{chinaDataLabel(plan)}</h3><p className="text-sm text-muted-foreground mt-2">{chinaValidity(plan) !== undefined ? `${chinaValidity(plan)}-day validity for this plan` : "Check plan details for validity"}</p></div><div className="text-right"><span className="text-xs text-muted-foreground">From</span><p className="font-bold text-xl"><Price amount={plan.quote.amount} /></p></div></div>
                <p className="text-sm text-muted-foreground mb-6 flex-1">Lowest current quote for this data size. Other plans may have different validity and terms.</p>
                <Button asChild variant="outline" className="w-full font-bold"><Link href={chinaPlanHref(plan)}>View this plan<ArrowRight aria-hidden className="w-4 h-4 ml-auto" /></Link></Button>
              </article>)}
            </div>
            <p className="text-xs text-muted-foreground mt-5 leading-relaxed">Prices come from current USD quotes and may change. Checkout is charged in USD; other display currencies are approximate conversions. Final availability and price are confirmed in the plan picker.</p>
          </>}
      </div>
    </section>
  );
}

function ChinaEvents() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const upcoming = upcomingEvents(newFeaturedEvents.filter(event => event.countryCode === "CN"), now);
  if (!upcoming.length) return null;
  return <section className="py-14 sm:py-20 border-b bg-secondary/25" data-testid="section-china-events">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="max-w-xl mb-8"><p className="text-xs uppercase tracking-[.18em] font-bold text-primary mb-4">On your itinerary</p><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">A reason to make the trip.</h2><p className="text-muted-foreground">Upcoming China events. Check the event details as you plan.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {upcoming.map(event => {
          const detail = events.find(item => item.id === event.id);
          return <article key={event.id} className="travel-photo-surface travel-event-card rounded-2xl border border-white/20 p-6 sm:p-7 flex flex-col">
            <TravelImage photo={getEventPhoto(event)} className="travel-photo" />
            <div className="flex items-center gap-2 text-white text-xs font-semibold mb-5"><CalendarDays aria-hidden className="w-4 h-4 shrink-0" /><span>{event.dates}</span></div>
            <h3 className="text-xl font-bold mb-3">{event.name}</h3><p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">{event.subtitle}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mb-5"><MapPin aria-hidden className="w-4 h-4" />{event.location}</p>
            <Link href={`/events/${detail?.slug ?? event.id}`} className="text-sm font-bold text-white inline-flex gap-2 items-center self-start border border-white/50 rounded-lg px-4 py-2">View event guide<ArrowRight aria-hidden className="w-4 h-4" /></Link>
            <p className="travel-photo-caption mt-4">{getEventPhoto(event).isRegional ? "Regional inspiration" : "Destination inspiration"} · {getEventPhoto(event).alt}</p>
          </article>;
        })}
      </div>
    </div>
  </section>;
}

export default function ChinaEsim() {
  useEffect(() => {
    const previousTitle = document.title;
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = existingMeta?.getAttribute("content");
    const meta = existingMeta ?? document.createElement("meta");
    if (!existingMeta) { meta.name = "description"; document.head.appendChild(meta); }
    document.title = "China eSIM – Konex eSIM";
    meta.content = "Plan your mainland China eSIM before you fly. Compare live quoted data plans, check phone compatibility and follow a practical pre-flight installation checklist.";
    return () => {
      document.title = previousTitle;
      if (!existingMeta) meta.remove();
      else if (previousDescription === null || previousDescription === undefined) meta.removeAttribute("content");
      else meta.content = previousDescription;
    };
  }, []);

  return <main className="min-h-[100dvh] bg-background text-foreground">
    <section className="konex-inverse travel-photo-surface overflow-hidden" data-testid="section-china-hero">
      <TravelImage photo={getTravelPhoto("china")} priority className="travel-photo" sizes="100vw" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <Link href="/destinations" className="text-xs text-white/75 hover:underline underline-offset-4">Destinations / Mainland China</Link>
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-10 lg:gap-20 items-center mt-9">
          <div>
            <p className="text-primary uppercase tracking-[.2em] font-bold text-xs mb-5">Your pre-flight connection guide</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-.045em] leading-[1.08] mb-6">China eSIM –<br /><span className="text-primary">install before<br className="hidden lg:block" /> you fly</span></h1>
            <p className="text-white/85 text-base sm:text-lg leading-relaxed mb-7 max-w-lg">Choose a data plan for your trip to mainland China. Your QR code and installation instructions are emailed after payment, so you can set up on Wi-Fi before you leave.</p>
            <Button asChild size="lg" className="font-bold h-12"><Link href="/destinations/CN" data-testid="button-china-hero-plans">Choose your China plan<ArrowRight aria-hidden className="ml-2 w-4 h-4" /></Link></Button>
            <p className="text-xs text-white/75 leading-relaxed mt-4">Email delivery is typically within minutes; rare cases take up to 24 hours. <Link href="/terms" className="underline underline-offset-4">Delivery terms</Link></p>
          </div>
          <div className="bg-card text-card-foreground rounded-3xl border border-border p-6 sm:p-8 [--primary-text:202_90%_30%] dark:[--primary-text:199_93%_72%]">
            <div className="flex justify-between items-center border-b pb-5 mb-7"><span className="text-xs uppercase tracking-[.18em] font-bold text-muted-foreground">Before departure</span><Plane aria-hidden className="text-primary w-5 h-5" /></div>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-7">A little setup.<br />One less thing to organise.</h2>
            <ol className="space-y-6">
              {[{ icon: Smartphone, title: "Check your device", text: "Compatible and carrier-unlocked." }, { icon: Mail, title: "Choose a plan", text: "Get your eSIM by email after payment." }, { icon: QrCode, title: "Install on Wi-Fi", text: "Follow the guide before you travel." }].map(({ icon: Icon, title, text }, i) => <li key={title} className="flex gap-4"><div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon aria-hidden className="w-5 h-5" /></div><div><p className="font-bold text-sm"><span className="text-muted-foreground mr-2">0{i + 1}</span>{title}</p><p className="text-sm text-muted-foreground mt-1">{text}</p></div></li>)}
            </ol>
            <Link href="/compatibility" className="inline-flex items-center gap-2 text-primary font-bold text-sm mt-8">Check phone compatibility<ArrowRight aria-hidden className="w-4 h-4" /></Link>
          </div>
        </div>
      </div>
    </section>
    <div className="bg-secondary/60 border-b" role="note"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-3 items-start"><Info aria-hidden className="w-5 h-5 shrink-0 text-primary mt-0.5" /><p className="text-sm leading-relaxed">{restrictionsNote}</p></div></div>
    <ChinaPlans />
    <section className="py-14 sm:py-20 border-b" data-testid="section-china-checklist">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-[.8fr_1.2fr] gap-8 lg:gap-20">
        <div><p className="text-xs uppercase tracking-[.18em] font-bold text-primary mb-4">Pack this checklist</p><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-5">Ready before<br />the departure gate.</h2><p className="text-muted-foreground leading-relaxed mb-6">Check your device, install with care, and keep your plan’s instructions handy for arrival.</p><Button asChild variant="outline" className="font-bold"><Link href="/compatibility">Check compatibility<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Link></Button></div>
        <ol className="divide-y border rounded-2xl bg-card px-5 sm:px-7">{checklist.map(item => <li key={item.title} className="py-6 flex gap-4"><CheckCircle2 aria-hidden className="w-5 h-5 shrink-0 text-primary mt-0.5" /><div><h3 className="font-bold mb-2">{item.title}</h3><p className="text-sm text-muted-foreground leading-relaxed">{item.copy}</p></div></li>)}</ol>
      </div>
    </section>
    <ChinaEvents />
    <section className="py-14 sm:py-20" data-testid="section-china-faq"><div className="max-w-3xl mx-auto px-4 sm:px-6">
      <p className="text-xs uppercase tracking-[.18em] font-bold text-primary mb-4">Before you buy</p><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-8">China eSIM questions, answered.</h2>
      <Accordion type="single" collapsible className="space-y-3">{faqs.map((faq, index) => <AccordionItem key={faq.q} value={`china-faq-${index}`} className="rounded-xl border px-5 bg-card"><AccordionTrigger className="text-left font-semibold hover:no-underline">{faq.q}</AccordionTrigger><AccordionContent className="text-muted-foreground leading-relaxed">{faq.a}</AccordionContent></AccordionItem>)}</Accordion>
    </div></section>
    <section className="konex-inverse py-14 sm:py-20" data-testid="section-china-final-cta"><div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-7"><div><p className="text-xs uppercase tracking-[.18em] font-bold text-primary mb-4">Next step: your plan</p><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">Sort your data before you fly.</h2><p className="text-white/85 max-w-xl leading-relaxed">Review the available China plans, check the details, and choose the right data allowance for your trip.</p></div><Button asChild size="lg" className="font-bold shrink-0 self-start md:self-auto"><Link href="/destinations/CN">View China plans<ArrowRight aria-hidden className="w-4 h-4 ml-2" /></Link></Button></div></section>
  </main>;
}
