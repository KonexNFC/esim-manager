import sources from "@/data/travel-photos.json";
import countrySources from "@/data/country-photos.json";
import flags from "@/data/country-flags.json";

export type TravelPhoto = (typeof sources)[number] & { isRegional?: boolean };
export const travelPhotos: TravelPhoto[] = [...sources, ...countrySources];
const byId = Object.fromEntries(travelPhotos.map(photo => [photo.id, photo])) as Record<string, TravelPhoto>;

const countryPhotos: Record<string, string> = {
  ...Object.fromEntries(countrySources.map(photo => [photo.code, photo.id])),
  CN: "china", NG: "lagos", BR: "rio", AE: "dubai", GB: "london", UK: "london",
  US: "newyork", FR: "paris", SG: "singapore", TH: "bangkok", JP: "tokyo",
  TZ: "africa", TC: "beach", IN: "india", PE: "peru", HK: "hongkong",
  DE: "germany", IT: "italy", CH: "switzerland", BE: "belgium", MC: "monaco", AU: "australia",
};
const regionPhotos: Record<string, string> = {
  EUROPE: "switzerland", AFRICA: "africa", LATAM: "peru", CARIBBEAN: "beach",
  APAC: "tokyo", SOUTHASIA: "india", MENA: "dubai", NORTHAM: "newyork",
  SEASIA: "bangkok", GLOBAL: "airport",
};

export function getTravelPhoto(id: string): TravelPhoto {
  return byId[id] ?? byId.airport;
}

export type CountryFlag = (typeof flags)[number];
const flagsByCode = Object.fromEntries(flags.map(flag => [flag.code, flag])) as Record<string, CountryFlag>;
export type CountryVisual =
  | { kind: "photo"; photo: TravelPhoto; background: string; flag: CountryFlag | null }
  | { kind: "flag"; background: string; flag: CountryFlag }
  | { kind: "unavailable"; background: string; flag: null };

/** Stable country artwork, independent of region labels and available regional photos. */
export function getCountryVisual(code: string): CountryVisual {
  const normalized = code.trim().toUpperCase();
  const key = normalized === "UK" ? "GB" : normalized;
  const seed = Array.from(key).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  const hue = 199 + seed % 17;
  const background = `linear-gradient(${125 + seed % 35}deg, hsl(215 65% 12%) 0%, hsl(${hue} 58% 23%) 57%, hsl(${hue} 64% 43%) 100%)`;
  const photo = byId[countryPhotos[key]];
  const flag = flagsByCode[key] ?? null;
  return photo ? { kind: "photo", photo, background, flag }
    : flag ? { kind: "flag", background, flag }
    : { kind: "unavailable", background, flag: null };
}

/** Regional/event photography resolver. Country surfaces must use getCountryVisual. */
export function getDestinationPhoto(code: string, region = ""): TravelPhoto {
  const key = code.toUpperCase();
  if (countryPhotos[key]) return byId[countryPhotos[key]];
  const normalized = region.toLowerCase().replace(/[-_]/g, " ");
  const fallback = regionPhotos[key]
    ?? (/caribbean|central america/.test(normalized) ? "beach"
      : /africa/.test(normalized) ? "africa"
      : /middle east|mena/.test(normalized) ? "dubai"
      : /south.?east asia/.test(normalized) ? "bangkok"
      : /south asia/.test(normalized) ? "india"
      : /asia|pacific/.test(normalized) ? "tokyo"
      : /europe/.test(normalized) ? "switzerland"
      : /south america|latin/.test(normalized) ? "peru"
      : /north america/.test(normalized) ? "newyork"
      : /oceania|australia/.test(normalized) ? "australia" : "airport");
  return { ...byId[fallback], isRegional: true };
}

const eventPhotos: Record<string, string> = {
  "art-basel-2026": "miami", "dsf-2026": "dubai", "canton-fair-2026": "guangzhou",
  "detty-december": "lagos", "harbin-ice-snow": "harbin", "rio-carnival": "rio",
  "chinese-new-year": "lanterns", "chinese-grand-prix": "shanghai",
  "canton-fair": "guangzhou", "ciie": "shanghai", "yiwu-fair": "china",
  "art-basel-miami": "miami", "art-basel-miami-beach": "miami",
  "dubai-shopping-festival": "dubai", "art-basel": "switzerland",
  "coachella": "california", "ces": "california",
  "tomorrowland": "belgium", "glastonbury": "london",
  "monaco-grand-prix": "monaco", "cannes-film-festival": "paris",
};
export function getEventPhoto(event: { id: string; countryCode: string }): TravelPhoto {
  return eventPhotos[event.id] ? byId[eventPhotos[event.id]] : getDestinationPhoto(event.countryCode);
}
