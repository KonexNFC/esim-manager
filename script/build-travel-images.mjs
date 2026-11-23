// Rebuild licensed, locally hosted derivatives from the audited source manifest.
// Originals are processed in memory, never retained in Git.
import fs from "node:fs/promises";
import sharp from "sharp";

const photos = [
  ...JSON.parse(await fs.readFile("client/src/data/travel-photos.json", "utf8")),
  ...JSON.parse(await fs.readFile("client/src/data/country-photos.json", "utf8")),
];
await fs.mkdir("client/public/images/travel", { recursive: true });
for (const photo of photos) {
  const outputs = [640, 1280].map(width => `client/public/images/travel/${photo.id}-${width}.webp`);
  if (!process.argv.slice(2).includes(photo.id) && (await Promise.all(outputs.map(path => fs.access(path).then(() => true, () => false)))).every(Boolean)) continue;
  const response = await fetch(photo.downloadUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${photo.id}: source returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  for (const width of [640, 1280]) {
    await sharp(buffer).rotate().resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 5 })
      .toFile(`client/public/images/travel/${photo.id}-${width}.webp`);
  }
  console.log(`Saved ${photo.id}`);
  await new Promise(resolve => setTimeout(resolve, 800));
}
