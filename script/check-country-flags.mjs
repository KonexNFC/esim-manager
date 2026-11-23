import {chromium} from "@playwright/test";
import {execFileSync} from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root="generated-artifacts/country-flags";
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:execFileSync("which",["chromium"],{encoding:"utf8"}).trim(),args:["--no-sandbox"]});
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
for(const theme of ["light","dark"])for(const width of [390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});
  await context.addInitScript(t=>localStorage.setItem("globe_theme",t),theme);
  const page=await context.newPage();
  await page.goto(`${base}/destinations`,{waitUntil:"networkidle"});
  const card=page.locator('[data-testid="card-destination-TO"]').last();
  await card.scrollIntoViewIfNeeded();
  await card.locator('img[src="/images/flags/to.svg"]').evaluate(i=>i.decode());
  assert.equal(await card.locator('img[src*="/images/travel/"]').count(),0);
  await page.screenshot({path:`${root}/${theme}-${width}-cards.jpg`});
  await page.goto(`${base}/destinations/TO`,{waitUntil:"networkidle"});
  await page.locator('.travel-photo-surface img[src="/images/flags/to.svg"]').evaluate(i=>i.decode());
  await page.screenshot({path:`${root}/${theme}-${width}-hero.jpg`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await context.close();
}
// A failed dedicated photo must use the same country's flag, not regional artwork.
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route("**/images/travel/spain-*.webp",route=>route.abort());
await page.goto(`${base}/destinations/ES`,{waitUntil:"networkidle"});
const fallback=page.locator('.travel-photo-surface img[src="/images/flags/es.svg"]');
await fallback.waitFor();await fallback.evaluate(i=>i.decode());
await page.screenshot({path:`${root}/failed-spain-photo.jpg`});
await browser.close();
console.log("Own-country flag cards and heroes passed at three widths in both themes; failed Spain photo uses Spain flag.");
