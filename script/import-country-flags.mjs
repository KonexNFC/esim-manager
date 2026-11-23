// Vendor only catalogue flag assets from a fixed, MIT-licensed release.
import fs from "node:fs/promises";
const catalogue = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const countries = [...new Map(catalogue.countries.map(c => [c.countryCode, c])).values()];
const upstream = "https://raw.githubusercontent.com/lipis/flag-icons/v7.5.0";
await fs.mkdir("client/public/images/flags", { recursive: true });
const license = await fetch(`${upstream}/LICENSE`);
if (!license.ok) throw new Error("Flag licence unavailable");
await fs.writeFile("client/public/images/flags/LICENSE.txt", await license.text());
const flags = [];
for (let i=0; i<countries.length; i+=6) {
  await Promise.all(countries.slice(i,i+6).map(async c => {
    const code=c.countryCode.toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) throw new Error(`Not a country code: ${code}`);
    const response=await fetch(`${upstream}/flags/4x3/${code}.svg`, {signal:AbortSignal.timeout(45000)});
    if (!response.ok) throw new Error(`${code}: HTTP ${response.status}`);
    const svg=await response.text();
    if (!svg.includes("<svg") || /<script|<foreignObject|(?:href|src)=["']https?:/i.test(svg)) throw new Error(`Unsafe or invalid SVG: ${code}`);
    await fs.writeFile(`client/public/images/flags/${code}.svg`, svg);
    flags.push({code:c.countryCode, name:c.name, src:`/images/flags/${code}.svg`});
  }));
}
flags.sort((a,b)=>a.code.localeCompare(b.code));
await fs.writeFile("client/src/data/country-flags.json",JSON.stringify(flags,null,2)+"\n");
console.log(`Vendored ${flags.length} flags and licence.`);
