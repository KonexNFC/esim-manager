// Generate reviewed manifest candidates and derivatives; visual review precedes publishing.
import fs from "node:fs/promises";
import sharp from "sharp";
const researched = JSON.parse(await fs.readFile("/tmp/country-photo-candidates.json", "utf8"));
const choices = { LV: 2, LT: 1, DZ: 2, RW: 2, MU: 1, BJ: 2, UG: 1, TN: 1, FI: 1 };
const output = JSON.parse(await fs.readFile("client/src/data/country-photos.json", "utf8"));
for (const entry of researched) {
  const photo = entry.choices[choices[entry.code] ?? 0];
  if (!photo) continue;
  const existingIndex = output.findIndex(existing => existing.code === entry.code);
  const replace = existingIndex >= 0 && entry.code in choices && output[existingIndex].title !== photo.title;
  if (existingIndex >= 0 && !replace) continue;
  if (replace) output.splice(existingIndex, 1);
  const { description, ...record } = photo;
  record.alt = photo.title.replace(/^File:/, "").replace(/\.(jpe?g|png)$/i, "");
  try {
    const paths = [640, 1280].map(w => `client/public/images/travel/${photo.id}-${w}.webp`);
    if (replace || !(await Promise.all(paths.map(p => fs.access(p).then(() => true, () => false)))).every(Boolean)) {
      const response = await fetch(photo.downloadUrl, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      for (const width of [640, 1280]) await sharp(buffer).rotate().resize({width, withoutEnlargement: true})
        .webp({quality:78, effort:5}).toFile(`client/public/images/travel/${photo.id}-${width}.webp`);
    }
    output.push(record);
    console.log("Prepared", entry.code, photo.id);
  } catch (e) { console.log("FAILED", entry.code, String(e)); }
}
await fs.writeFile("client/src/data/country-photos.json", JSON.stringify(output, null, 2) + "\n");
