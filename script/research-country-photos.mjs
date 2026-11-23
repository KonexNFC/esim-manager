// Read-only Commons research. Produces candidates for human visual/licence review.
import fs from "node:fs/promises";
const searches = {
  IE: ["ireland", "Cliffs of Moher panorama"],
  GR: ["greece", "Santorini Oia panorama"],
  AT: ["austria", "Hallstatt lake panorama"],
  BG: ["bulgaria", "Rila Monastery courtyard"],
  HR: ["croatia", "Dubrovnik old town panorama"],
  CY: ["cyprus", "Petra tou Romiou coast"],
  CZ: ["czechia", "Prague Charles Bridge panorama"],
  DK: ["denmark", "Nyhavn Copenhagen panorama"],
  EE: ["estonia", "Tallinn old town panorama"],
  FI: ["finland", "Helsinki Cathedral panorama"],
  HU: ["hungary", "Budapest parliament panorama"],
  IS: ["iceland", "Kirkjufell mountain"],
  LV: ["latvia", "Riga old town panorama"],
  LI: ["liechtenstein", "Vaduz Castle panorama"],
  LT: ["lithuania", "Trakai Island Castle"],
  LU: ["luxembourg", "Luxembourg city Grund panorama"],
  MT: ["malta", "Valletta skyline"],
  NO: ["norway", "Geirangerfjord panorama"],
  PL: ["poland", "Krakow Wawel panorama"],
  PT: ["portugal", "Lisbon Belem tower"],
  RO: ["romania", "Peles Castle"],
  SK: ["slovakia", "Bratislava castle panorama"],
  SI: ["slovenia", "Lake Bled panorama"],
  ES: ["spain", "Alhambra Granada panorama"],
  SE: ["sweden", "Stockholm Gamla Stan panorama"],
  CA: ["canada", "Moraine Lake Canada"],
  TR: ["turkey", "Cappadocia landscape panorama"],
  MY: ["malaysia", "Kuala Lumpur skyline panorama"],
  NL: ["netherlands", "Amsterdam canal panorama"],
  ID: ["indonesia", "Borobudur panorama"],
  MX: ["mexico", "Chichen Itza El Castillo"],
  ZA: ["southafrica", "Cape Town Table Mountain panorama"],
  KE: ["kenya", "Mount Kenya landscape"],
};
const strip = s => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const candidates = JSON.parse(await fs.readFile("/tmp/country-photo-candidates.json", "utf8").catch(() => "[]"));
for (const [code, [id, query]] of Object.entries(searches)) {
  if (candidates.some(entry => entry.code === code && entry.choices.length)) continue;
  const existing = candidates.findIndex(entry => entry.code === code);
  if (existing >= 0) candidates.splice(existing, 1);
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `file:${query}`,
    gsrnamespace: "6", gsrlimit: "5", prop: "imageinfo",
    iiprop: "url|extmetadata|size", iiurlwidth: "1280",
  });
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: AbortSignal.timeout(45000) });
    const data = await r.json();
    const pages = Object.values(data.query?.pages ?? {}).sort((a,b) => a.index-b.index);
    const choices = pages.flatMap(page => {
      const info = page.imageinfo?.[0], meta = info?.extmetadata ?? {};
      const licence = strip(meta.LicenseShortName?.value);
      if (!info || !/^(CC BY|CC0|Public domain)/.test(licence) || /NC|ND/.test(licence)
          || !/\.(jpe?g|png)$/i.test(page.title) || info.width < 1000 || info.width / info.height < 1.15
          || strip(meta.Restrictions?.value)) return [];
      return [{
        id, code, alt: query, title: page.title, source: info.descriptionurl,
        downloadUrl: info.thumburl ?? info.url, author: strip(meta.Artist?.value),
        license: licence, licenseUrl: meta.LicenseUrl?.value ?? "https://creativecommons.org/publicdomain/mark/1.0/",
        modifications: "Resized and converted to WebP; responsive cropping and colour overlays on the website.",
        description: strip(meta.ImageDescription?.value),
      }];
    });
    candidates.push({ code, query, choices });
    console.log(code, choices.map(c => c.title).join(" | ") || "NO SUITABLE RESULT");
  } catch (error) { candidates.push({ code, query, error: String(error), choices: [] }); console.log(code, String(error)); }
  await fs.writeFile("/tmp/country-photo-candidates.json", JSON.stringify(candidates, null, 2));
  await new Promise(resolve => setTimeout(resolve, 6500));
}
await fs.writeFile("/tmp/country-photo-candidates.json", JSON.stringify(candidates, null, 2));
