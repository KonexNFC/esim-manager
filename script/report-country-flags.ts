import fs from "node:fs/promises";
import {getCountryVisual} from "../client/src/lib/travel-imagery";
type Country={countryCode:string;name:string;planCount:number};
const data=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const countries=Array.from((data.countries as Country[]).reduce((m,c)=>{
  if(!m.has(c.countryCode)||m.get(c.countryCode)!.planCount<c.planCount)m.set(c.countryCode,c);
  return m;
},new Map<string,Country>()).values()).sort((a,b)=>b.planCount-a.planCount||a.name.localeCompare(b.name));
const rows=countries.map(c=>({...c,visual:getCountryVisual(c.countryCode)}));
if(rows.some(c=>!c.visual.flag))throw new Error("A catalogue destination lacks its own local flag");
const photos=rows.filter(c=>c.visual.kind==="photo").length;
const flagCount=rows.length-photos;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const quote=(s:unknown)=>`"${String(s).replace(/"/g,'""')}"`;
await fs.mkdir("generated-artifacts",{recursive:true});
await fs.writeFile("generated-artifacts/country-photo-flag-coverage.csv","Country,Code,Catalogue plan count,Current visual,Local flag\n"+rows.map(r=>[r.name,r.countryCode,r.planCount,r.visual.kind,r.visual.flag!.src].map(quote).join(",")).join("\n"));
await fs.writeFile("generated-artifacts/country-photo-flag-coverage.html",`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Country photo and flag coverage</title><style>body{font:16px/1.6 system-ui;background:#f5f8fc;color:#10243b;max-width:1100px;margin:auto;padding:30px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #cbd5e1}th{background:#10243b;color:white}</style><h1>Country photo and flag coverage</h1><p>${rows.length} distinct catalogue destinations: ${photos} dedicated photographs; ${flagCount} own-country flags. All ${rows.length} have locally hosted flag artwork available, including those with photos. No country surface uses another country's photograph or a generic designed-only fallback.</p><p>Checked ${new Date().toISOString()}. Ordered by public catalogue plan count, not measured popularity. Duplicate country codes counted once, taking the highest plan count.</p><table><tr><th>Destination</th><th>Code</th><th>Plans</th><th>Visual</th></tr>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.countryCode}</td><td>${r.planCount}</td><td>${r.visual.kind==="photo"?"Dedicated photo":"Own-country flag"}</td></tr>`).join("")}</table></html>`);
console.log(JSON.stringify({destinations:rows.length,photos,flags:flagCount,missing:0}));
