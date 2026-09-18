import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", e => console.log("PAGEERROR:", e.message));
page.on("console", m => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });

// Sign in as Rezaul, the officer who raised REQ/CSD/2026/0845.
await page.goto(B + "/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "rezaul.karim@sjiblbd.com");
await page.fill('input[name="password"]', "Demo@2026");
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.endsWith("/login"), { timeout: 30000 });
await page.waitForLoadState("networkidle");

await page.goto(B + "/requisitions", { waitUntil: "networkidle" });
const href = await page.locator('a:has-text("REQ/CSD/2026/0845")').first().getAttribute("href");
await page.goto(B + href, { waitUntil: "networkidle" });
console.log("on:", page.url());

await page.screenshot({ path: "/tmp/req-before.png" });

// Press Approve on his own requisition.
const btn = page.locator('button:has-text("Attempt approval")').first();
if (await btn.count() === 0) { console.log("NO APPROVE BUTTON"); }
else {
  await btn.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "/tmp/req-blocked.png" });
  // Expand the explanation panel.
  const why = page.locator('button:has-text("Why was this blocked?")');
  if (await why.count()) { await why.click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: "/tmp/req-blocked-why.png" });
  const text = await page.locator('[role="alert"]').first().innerText().catch(() => "");
  console.log("REFUSAL TEXT:\n" + text);
}
await browser.close();
