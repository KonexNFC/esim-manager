import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TravelImage } from "@/components/travel-image";
import { getEventPhoto, travelPhotos } from "@/lib/travel-imagery";
import events from "@/data/events";
import { FESTIVAL_EVENTS } from "@/pages/home";

const mappedEvents = Array.from(new Map([...events, ...FESTIVAL_EVENTS].map(event => [event.id, event])).values());

export default function ImageCredits() {
  useEffect(() => { document.title = "Photography & Image Credits | Konex"; }, []);
  return (
    <main className="max-w-7xl mx-auto px-5 sm:px-8 py-12 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary mb-10"><ArrowLeft className="w-4 h-4" />Back to Konex</Link>
      <header className="max-w-3xl mb-14">
        <p className="text-primary text-xs font-bold uppercase tracking-[.2em] mb-5">The places behind the pictures</p>
        <h1 className="text-4xl sm:text-6xl font-bold mb-6">A world worth<br />giving credit to.</h1>
        <p className="text-muted-foreground leading-relaxed text-lg">Photography brings the journey into view. Here are the photographers, original sources and licences behind the images on Konex.</p>
        <div className="mt-7 p-5 rounded-2xl border bg-secondary/40 text-sm leading-relaxed">
          Images are resized, converted to WebP and displayed with responsive cropping and colour overlays. Each image and its derivatives remain under its source licence, including applicable ShareAlike requirements. These licences apply to the photographs, not to the Konex website as a whole.
        </div>
        <p className="text-sm text-muted-foreground mt-5 leading-relaxed">Individual country cards and heroes use photographs from that country, or navy-and-sky globe artwork when no dedicated photograph is available. Regional and global plans may use illustrative regional photography. Event photographs may show the host destination rather than the event itself. Refer to each photograph’s caption and source below.</p>
      </header>
      <section aria-label="Photography sources" className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
        {travelPhotos.map(photo => (
          <article key={photo.id} id={photo.id} className="rounded-2xl overflow-hidden border bg-card">
            <TravelImage photo={photo} className="aspect-[16/10] object-cover w-full" />
            <div className="p-6 sm:p-7">
              <h2 className="font-bold text-xl mb-3">{photo.alt}</h2>
              <p className="text-sm mb-4">Photograph by <strong>{photo.author}</strong></p>
              <p className="text-xs text-muted-foreground break-words mb-4 leading-relaxed">{photo.title}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-primary">
                <a href={photo.source} target="_blank" rel="noopener noreferrer" className="inline-flex gap-1 items-center underline underline-offset-4">Original source<ArrowUpRight className="w-3 h-3" /></a>
                <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{photo.license}</a>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-5">{photo.modifications}</p>
              <a href={`/images/travel/${photo.id}-1280.webp`} className="inline-block text-xs text-primary underline underline-offset-4 mt-3">View WebP derivative</a>
            </div>
          </article>
        ))}
      </section>
      <section className="mt-20 pt-12 border-t" aria-labelledby="event-sources-heading">
        <p className="text-xs uppercase tracking-[.18em] text-primary font-bold mb-4">Event photography index</p>
        <h2 id="event-sources-heading" className="text-3xl sm:text-4xl font-bold mb-5">The image behind each event.</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-2xl">This index covers the event directory, detail pages, homepage carousel and China guide, including entries not currently shown because of their dates. Photos are destination inspiration unless the source specifically identifies an event.</p>
        <div className="divide-y border-y">{mappedEvents.map(event => {
          const photo = getEventPhoto(event);
          return <div key={event.id} className="grid grid-cols-1 md:grid-cols-2 gap-3 py-5 text-sm">
            <div><h3 className="font-semibold">{event.name}</h3><p className="text-xs text-muted-foreground mt-1">{event.id}</p></div>
            <div><a href={`#${photo.id}`} className="font-medium underline underline-offset-4">{photo.alt}</a><p className="text-muted-foreground text-xs mt-2">{photo.isRegional ? "Regional inspiration" : "Destination / event photography"} · {photo.author} · <a href={photo.source} target="_blank" rel="noopener noreferrer" className="underline">{photo.title}</a></p></div>
          </div>;
        })}</div>
      </section>
    </main>
  );
}
