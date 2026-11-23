import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root="generated-artifacts/destination-grid";
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:execFileSync("which",["chromium"],{encoding:"utf8"}).trim(),args:["--no-sandbox"]});
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const results=[];
for(const theme of ["light","dark"]) for(const width of [390,768,1280]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});
  await context.addInitScript(t=>localStorage.setItem("globe_theme",t),theme);
  const page=await context.newPage();
  await page.goto(`${base}/destinations`,{waitUntil:"networkidle"});
  await page.locator('[data-testid="card-destination-JP"]').first().waitFor();
  const geometry=await page.locator('[data-testid^="card-destination-"]').evaluateAll(links=>links.map(link=>{
    const card=link.firstElementChild, r=link.getBoundingClientRect(), c=card.getBoundingClientRect();
    const badge=card.querySelector('[data-testid^="badge-plan-count-"]'), b=badge?.getBoundingClientRect();
    return {id:link.dataset.testid,width:r.width,cardWidth:c.width,overflow:c.right>r.right+1||c.left<r.left-1,badgeClipped:!!b&&(b.right>c.right+1||b.left<c.left-1||badge.scrollWidth>badge.clientWidth+1)};
  }));
  assert.equal(geometry.some(g=>g.overflow||g.badgeClipped),false,JSON.stringify({theme,width,bad:geometry.filter(g=>g.overflow||g.badgeClipped)}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  for(const code of ["JP","KE"]) {
    const target=page.locator(`[data-testid="card-destination-${code}"]`).last();
    await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
    await page.screenshot({path:`${root}/${theme}-${width}-${code}.jpg`});
  }
  results.push({theme,width,cards:geometry.length,overflowing:0,clippedBadges:0});
  await context.close();
}
const page=await browser.newPage({viewport:{width:1280,height:900}});
for(const code of ["ES","PT","CA"]) {
  await page.goto(`${base}/destinations/${code}`,{waitUntil:"networkidle"});
  const img=page.locator('.travel-photo-surface img').first();
  await img.waitFor();
  assert.equal(await img.evaluate(i=>i.complete&&i.naturalWidth>0),true);
  await page.screenshot({path:`${root}/${code}-hero.jpg`});
}
await browser.close();
await fs.writeFile(`${root}/results.json`,JSON.stringify(results,null,2));console.log(results);
