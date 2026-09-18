/**
 * Screenshot helper for checking screens at projector resolution.
 * Usage: node scripts/shot.mjs <path> <outfile> [--email=x] [--full]
 */
import { chromium } from "playwright-core";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3000";

const [, , path = "/", out = "/tmp/shot.png", ...flags] = process.argv;
const email = flags.find(f => f.startsWith("--email="))?.split("=")[1];
const full = flags.includes("--full");
const vendor = flags.includes("--vendor");

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
// 1280x720 is the projector resolution the demo is tested at.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

if (email) {
  const loginPath = vendor ? "/vendor/login" : "/login";
  await page.goto(BASE + loginPath, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Demo@2026");
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
}

const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(700);
console.log(`${path} -> ${res?.status()}`);

const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.screenshot({ path: out, fullPage: full });
if (errors.length) console.log("PAGE ERRORS:", errors.join("; "));

await browser.close();
