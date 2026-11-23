import { TravelImage } from "@/components/travel-image";
import { getCountryVisual } from "@/lib/travel-imagery";

/** Decorative artwork: the existing card/hero overlay supplies the country name. */
function CountryArtwork({ background, className }: { background: string; className: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden ${className}`} style={{ background }}>
      <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" className="h-full w-full opacity-[.16]" fill="none">
        <g stroke="hsl(199 93% 85%)" strokeWidth="1.2" transform="translate(405 160) rotate(-18)">
          <circle r="145" />
          <ellipse rx="95" ry="145" />
          <ellipse rx="42" ry="145" />
          <path d="M-145 0H145M0-145V145M-127-70H127M-127 70H127M-79-122H79M-79 122H79" />
          <circle r="170" strokeDasharray="3 10" />
        </g>
      </svg>
    </div>
  );
}

/** Only verified country photography; never a photograph from a neighbouring country. */
export function DestinationImage({ countryCode, className = "", priority = false, sizes }: {
  countryCode: string; className?: string; priority?: boolean; sizes?: string;
}) {
  const visual = getCountryVisual(countryCode);
  const fallback = <CountryArtwork background={visual.background} className={className} />;
  return visual.kind === "photo"
    ? <TravelImage photo={visual.photo} className={className} priority={priority} sizes={sizes} fallback={fallback} />
    : fallback;
}
