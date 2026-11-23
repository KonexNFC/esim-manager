import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import flags from "../../client/src/data/country-flags.json";
import {getCountryVisual} from "../../client/src/lib/travel-imagery";

test("every catalogue flag has a local valid SVG and every destination has its own visual", async () => {
  assert.equal(new Set(flags.map(f=>f.code)).size,flags.length);
  assert.ok(flags.length >= 203);
  for (const flag of flags) {
    assert.equal(flag.src,`/images/flags/${flag.code.toLowerCase()}.svg`);
    const svg=await readFile(`client/public${flag.src}`);
    assert.match(svg.toString(),/<svg/);
    assert.doesNotMatch(svg.toString(),/<script|<foreignObject|(?:href|src)=["']https?:/i);
    assert.ok((await sharp(svg).metadata()).width);
    const visual=getCountryVisual(flag.code);
    assert.ok(visual.kind==="photo"||visual.kind==="flag",flag.code);
    assert.equal(visual.flag?.code,flag.code);
    if(visual.kind==="photo") assert.notEqual(visual.photo.isRegional,true,flag.code);
  }
  const license=await readFile("client/public/images/flags/LICENSE.txt","utf8");
  assert.match(license,/MIT License/);
  assert.match(license,/Panayiotis Lipiridis/);
});

test("Hong Kong, Macau, Taiwan and Japan have independent flags and verified photos", () => {
  for(const code of ["HK","MO","TW","JP"]) {
    const visual=getCountryVisual(code);
    assert.equal(visual.kind,"photo");
    assert.equal(visual.flag?.src,`/images/flags/${code.toLowerCase()}.svg`);
  }
  assert.deepEqual(getCountryVisual("UK"),getCountryVisual("GB"));
});
