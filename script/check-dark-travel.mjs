// Read-only UI audit. Opens the plan summary, but never submits checkout.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = "generated-artifacts/dark-mode";
await fs.mkdir(root, { recursive: true });
const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000";
const browser = await chromium.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("globe_theme", "dark"));
  const page = await context.newPage();
  for (const [name, route] of Object.entries({
    home: "/", destination: "/destinations/CN", china: "/china-esim",
    credits: "/image-credits", events: "/events", browse: "/destinations", nigeria: "/nigeria-esim",
  })) {
    const errors = [], failures = [];
    const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
    const onError = error => errors.push(String(error));
    const onResponse = response => { if (response.status() >= 400) failures.push({ status: response.status(), url: response.url().replace(base, "") }); };
    page.on("console", onConsole); page.on("pageerror", onError); page.on("response", onResponse);
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 90000 });
    await page.screenshot({ path: `${root}/${size}-${name}.jpg`, type: "jpeg", quality: 75 });
    const item = {
      size, route, dark: await page.locator("html").evaluate(el => el.classList.contains("dark")),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
      creditsLink: await page.locator('a[href="/image-credits"]').count(), errors, failures,
    };
    if (name === "home") {
      const carousel = page.locator('[data-testid="section-events-carousel"]');
      const fallback = page.locator("section").filter({ hasText: "Art Basel Miami Beach" }).first();
      const target = await carousel.count() ? carousel : fallback;
      if (await target.count()) { await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200); await page.screenshot({ path: `${root}/${size}-carousel.jpg`, type: "jpeg", quality: 75 }); }
      await page.locator('a[href="/image-credits"]').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${root}/${size}-footer.jpg`, type: "jpeg", quality: 75 });
    }
    if (name === "destination") {
      const select = page.locator('[data-testid="button-compare-select-recommended"]');
      await select.waitFor({ timeout: 60000 });
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${root}/${size}-comparison.jpg`, type: "jpeg", quality: 75 });
      await select.click();
      await page.locator('[data-testid="text-checkout-title"]').waitFor();
      await page.screenshot({ path: `${root}/${size}-checkout.jpg`, type: "jpeg", quality: 75 });
    }
    results.push(item);
    page.off("console", onConsole); page.off("pageerror", onError); page.off("response", onResponse);
    console.log(JSON.stringify(item));
  }
  await context.close();
}
await browser.close();
await fs.writeFile(`${root}/results.json`, JSON.stringify(results, null, 2));
