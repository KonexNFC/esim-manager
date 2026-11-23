import fs from "node:fs/promises";
import { getDestinationPhoto } from "../client/src/lib/travel-imagery";
// Input is a read-only snapshot of the live public /api/countries response.
const snapshot = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const previous = new Set("CN NG BR AE GB US FR SG TH JP TZ TC IN PE HK DE IT CH BE MC AU".split(" "));
type Country = {countryCode:string; name:string; planCount:number; region:string};
const countries = Array.from((snapshot.countries as Country[]).reduce((map,c) => {
  if (!map.has(c.countryCode) || map.get(c.countryCode)!.planCount < c.planCount) map.set(c.countryCode,c);
  return map;
}, new Map<string,Country>()).values());
const ranked = countries.filter(c => !previous.has(c.countryCode))
  .sort((a,b) => b.planCount-a.planCount || a.name.localeCompare(b.name));
const escape = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const remaining = countries.filter(c => getDestinationPhoto(c.countryCode, c.region).isRegional).length;
const rows = ranked.map((c,i) => ({rank:i+1, ...c, photo:getDestinationPhoto(c.countryCode,c.region)}));
await fs.mkdir("generated-artifacts", {recursive:true});
await fs.writeFile("generated-artifacts/country-photo-coverage.csv",
  "Rank,Country,Code,Public catalogue plan count,Photo status,Photograph,Source\n" +
  rows.map(r => [r.rank,r.name,r.countryCode,r.planCount,r.photo.isRegional ? "Regional fallback" : "Added dedicated photo",r.photo.alt,r.photo.source].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n"));
await fs.writeFile("generated-artifacts/country-photo-coverage.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Konex country photograph coverage</title><style>body{font:16px/1.6 system-ui;background:#f5f8fc;color:#10243b;max-width:1100px;margin:auto;padding:32px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #cbd5e1}th{background:#10243b;color:white}a{color:#075985}.table{overflow:auto}</style><h1>Country photograph coverage</h1><p>Live catalogue snapshot checked ${escape(new Date().toISOString())}. ${countries.length} countries and territories; ${ranked.length} lacked dedicated photography before this update. Now ${countries.length-remaining} have dedicated photography and ${remaining} use labelled regional fallbacks.</p><p>Ranking is by the public catalogue's planCount, descending, with alphabetical ties. This is catalogue breadth, not customer demand or a guarantee that every listed offer can be purchased. Multi-country bundles are excluded. Every initially missing country is listed below, including ones upgraded in this update.</p><div class="table"><table><thead><tr><th>Rank</th><th>Destination</th><th>Code</th><th>Plans</th><th>Current photo</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.rank}</td><td>${escape(r.name)}</td><td>${r.countryCode}</td><td>${r.planCount}</td><td>${r.photo.isRegional?"Regional fallback":"Added dedicated photo"}<br><a href="${escape(r.photo.source)}">${escape(r.photo.alt)}</a></td></tr>`).join("")}</tbody></table></div></html>`);
console.log(JSON.stringify({countries:countries.length,initiallyMissing:ranked.length,added:ranked.length-remaining,dedicated:countries.length-remaining,remaining}));
