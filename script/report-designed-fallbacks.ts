import fs from "node:fs/promises";
import {getCountryVisual} from "../client/src/lib/travel-imagery";
type Country = {countryCode:string; name:string; planCount:number};
const snapshot = JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const countries = Array.from((snapshot.countries as Country[]).reduce((map,c) => {
  if (!map.has(c.countryCode) || map.get(c.countryCode)!.planCount < c.planCount) map.set(c.countryCode,c);
  return map;
},new Map<string,Country>()).values()).sort((a,b)=>b.planCount-a.planCount || a.name.localeCompare(b.name));
const remaining = countries.filter(c=>getCountryVisual(c.countryCode).kind === "designed");
const esc = (s:unknown)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const csv = (s:unknown)=>`"${String(s).replace(/"/g,'""')}"`;
await fs.mkdir("generated-artifacts",{recursive:true});
await fs.writeFile("generated-artifacts/remaining-country-photos.csv","Rank,Country,Code,Catalogue plan count,Fallback\n"+remaining.map((c,i)=>[i+1,c.name,c.countryCode,c.planCount,"Designed gradient and globe; no photograph"].map(csv).join(",")).join("\n"));
await fs.writeFile("generated-artifacts/country-imagery-status.html",`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Country imagery status</title><style>body{max-width:1000px;margin:40px auto;padding:20px;background:#f5f8fc;color:#10243b;font:16px/1.6 system-ui}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #cad4df}th{background:#10243b;color:white}</style><h1>Country imagery status</h1><p>Audited ${new Date().toISOString()}: ${countries.length} distinct destinations; ${countries.length-remaining.length} dedicated photos; ${remaining.length} designed fallbacks. Duplicate country codes are counted once, taking their highest catalogue plan count rather than adding duplicate rows.</p><p>Every country still needing photography is listed below, ranked by catalogue plan count. These counts describe catalogue breadth, not measured popularity or guaranteed checkout availability. Countries without photos now display their name over a gradient and globe motif, never another country's landmark.</p><table><tr><th>Rank</th><th>Destination</th><th>Code</th><th>Plans</th></tr>${remaining.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.name)}</td><td>${c.countryCode}</td><td>${c.planCount}</td></tr>`).join("")}</table></html>`);
console.log(JSON.stringify({destinations:countries.length,dedicated:countries.length-remaining.length,designedFallback:remaining.length,remaining:remaining.map(c=>c.name)}));
