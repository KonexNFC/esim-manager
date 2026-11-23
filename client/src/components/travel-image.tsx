import { useState, type ReactNode } from "react";
import type { TravelPhoto } from "@/lib/travel-imagery";

/** Local responsive photography. A failed image reveals the parent's named gradient card, never a flag. */
export function TravelImage({ photo, className = "", priority = false, sizes = "(max-width: 640px) 100vw, 50vw", fallback }: {
  photo: TravelPhoto; className?: string; priority?: boolean; sizes?: string; fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === photo.id) return fallback ?? <div role="img" aria-label={`${photo.alt} — photograph unavailable`}
    className={`bg-gradient-to-br from-slate-900 via-sky-950 to-slate-800 ${className}`} />;
  return <img
    src={`/images/travel/${photo.id}-1280.webp`}
    srcSet={`/images/travel/${photo.id}-640.webp 640w, /images/travel/${photo.id}-1280.webp 1280w`}
    sizes={priority ? `(max-width: 640px) 1280px, ${sizes}` : sizes} alt={photo.alt} width={1280} height={800}
    loading={priority ? "eager" : "lazy"} decoding="async"
    onError={() => setFailed(photo.id)} className={className}
  />;
}
