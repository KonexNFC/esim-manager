import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { travelPhotos, getDestinationPhoto, getEventPhoto } from "../../client/src/lib/travel-imagery";
import events from "../../client/src/data/events";
import { newFeaturedEvents } from "../../shared/featured-events";

test("every published photograph has licensed local responsive WebP derivatives", async () => {
  for (const photo of travelPhotos) {
    assert.match(photo.source, /^https:\/\/commons.wikimedia.org\//);
    assert.match(photo.license, /^(CC BY|CC0|Public domain)/);
    assert.ok(photo.author && photo.licenseUrl && photo.alt && photo.modifications);
    for (const width of [640, 1280]) {
      const buffer = await readFile(`client/public/images/travel/${photo.id}-${width}.webp`);
      const meta = await sharp(buffer).metadata();
      assert.equal(meta.format, "webp");
      assert.ok(meta.width! <= width);
      assert.ok(buffer.length < 600_000, `${photo.id} is too large`);
    }
  }
});

test("all events resolve to photographs and missing destinations get labelled regional imagery", () => {
  for (const event of [...events, ...newFeaturedEvents]) assert.ok(getEventPhoto(event).source);
  assert.equal(getEventPhoto({ id: "art-basel-2026", countryCode: "US" }).id, "miami");
  assert.equal(getDestinationPhoto("CN").id, "china");
  assert.equal(getDestinationPhoto("UNKNOWN", "Africa").id, "africa");
  assert.equal(getDestinationPhoto("UNKNOWN", "Africa").isRegional, true);
  assert.equal(getDestinationPhoto("UNKNOWN").id, "airport");
});

test("priority countries have dedicated photographs rather than regional fallbacks", () => {
  for (const code of ["ES", "PT", "CA", "MX", "ZA", "KE"]) {
    const photo = getDestinationPhoto(code);
    assert.notEqual(photo.id, "airport", code);
    assert.notEqual(photo.isRegional, true, code);
  }
});
