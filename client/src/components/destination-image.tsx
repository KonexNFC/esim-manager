import { TravelImage } from "@/components/travel-image";
import { getCountryVisual } from "@/lib/travel-imagery";

/** The surrounding card/hero supplies the accessible destination name. */
function CountryFlag({ background, flag, className, priority }: {
  background: string;
  flag: { code: string; name: string; src: string } | null;
  className: string;
  priority: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`destination-flag-surface ${className}`}
      style={{ background }}
      data-country-visual={flag ? "flag" : "unavailable"}
      data-country-code={flag?.code}
    >
      {flag && (
        <div className="destination-flag-stage">
          <img
            src={flag.src}
            alt=""
            className="destination-flag-image"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

/** Only verified country photography; never a photograph from a neighbouring country. */
export function DestinationImage({ countryCode, className = "", priority = false, sizes }: {
  countryCode: string; className?: string; priority?: boolean; sizes?: string;
}) {
  const visual = getCountryVisual(countryCode);
  const fallback = <CountryFlag background={visual.background} flag={visual.flag} className={className} priority={priority} />;
  return visual.kind === "photo"
    ? <TravelImage photo={visual.photo} className={className} priority={priority} sizes={sizes} fallback={fallback} />
    : fallback;
}
