import assert from "node:assert/strict";
import test from "node:test";
import { getCountryVisual, getDestinationPhoto, getEventPhoto } from "./travel-imagery";

test("unknown countries use deterministic designed artwork, never regional photography", () => {
  for (const code of ["UNKNOWN", "ZZ", ""]) {
    const visual = getCountryVisual(code);
    assert.equal(visual.kind, "designed");
    assert.equal("photo" in visual, false);
    assert.match(visual.background, /^linear-gradient\(/);
    assert.deepEqual(visual, getCountryVisual(code));
  }
  assert.deepEqual(getCountryVisual(" zz "), getCountryVisual("ZZ"));
  assert.notEqual(getCountryVisual("AO").background, getCountryVisual("ZZ").background);
});

test("Japan, Hong Kong, Kenya and Tanzania retain verified dedicated country photos", () => {
  for (const [code, id, subject] of [
    ["JP", "tokyo", /Fuji.*Japan/i],
    ["HK", "hongkong", /Hong Kong/i],
    ["KE", "kenya", /Kenya/i],
    ["TZ", "africa", /Tanzania/i],
  ] as const) {
    const visual = getCountryVisual(code);
    assert.equal(visual.kind, "photo", code);
    if (visual.kind !== "photo") throw new Error(`Missing photo for ${code}`);
    assert.equal(visual.photo.id, id);
    assert.match(visual.photo.alt, subject);
    assert.notEqual(visual.photo.isRegional, true);
    assert.deepEqual(getCountryVisual(code.toLowerCase()), visual);
  }
});

test("regional and event photo resolution remains separate from country artwork", () => {
  assert.equal(getDestinationPhoto("AFRICA").id, "africa");
  assert.equal(getDestinationPhoto("GLOBAL").id, "airport");
  assert.equal(getEventPhoto({ id: "art-basel-2026", countryCode: "US" }).id, "miami");
  assert.equal(getEventPhoto({ id: "unlisted-event", countryCode: "UNKNOWN" }).id, "airport");
  assert.equal(getCountryVisual("UNKNOWN").kind, "designed");
});
