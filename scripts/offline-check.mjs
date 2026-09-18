/**
 * Proves nothing in the build reaches the network at runtime.
 *
 * The venue may have no usable internet. Rather than trusting that we avoided
 * webfonts and CDNs, this blocks every request that is not localhost and fails
 * if any page tries to make one.
 */
import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const B = "http://localhost:3000";

const PAGES = [
  "/login", "/vendor/login", "/", "/requisitions", "/requisitions/new",
  "/requisitions/approvals", "/tenders", "/purchase-orders", "/grn", "/invoices",
  "/stock", "/vendors", "/assets", "/contracts", "/budgets", "/warehouses",
  "/transport", "/visitors", "/canteen", "/medical", "/insurance", "/auctions",
  "/dispatch", "/building", "/civil-works", "/dashboards", "/reports",
  "/admin/workflows", "/admin/audit", "/admin/users", "/admin/roles",
  "/admin/integrations", "/about",
];

const br = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });

const external = [];
await ctx.route("**/*", route => {
  const url = route.request().url();
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return route.continue();
  }
  external.push(`${route.request().resourceType()} ${url}`);
  return route.abort();
});

const p = await ctx.newPage();
const errors = [];
p.on("pageerror", e => errors.push(e.message.slice(0, 140)));

await p.goto(B + "/login", { waitUntil: "networkidle" });
await p.fill('input[name="email"]', "mizanur.rahman@sjiblbd.com");
await p.fill('input[name="password"]', "Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u => !u.pathname.endsWith("/login"), { timeout: 30000 });

console.log("\n  Offline check — every non-localhost request blocked\n");
let bad = 0;
for (const path of PAGES) {
  errors.length = 0;
  const res = await p.goto(B + path, { waitUntil: "networkidle", timeout: 40000 }).catch(() => null);
  await p.waitForTimeout(120);
  const status = res?.status() ?? 0;
  const body = await p.locator("body").innerText().catch(() => "");
  const broken = status >= 400 || /Application error|could not be found/i.test(body) || errors.length > 0;
  if (broken) { bad++; console.log(`  ✗ ${path} — ${status} ${errors[0] ?? ""}`); }
  else console.log(`  ✓ ${path}`);
}

console.log(`\n  ${PAGES.length - bad}/${PAGES.length} pages render with no network access`);
if (external.length) {
  console.log(`\n  \x1b[31m${external.length} external request(s) attempted:\x1b[0m`);
  for (const e of Array.from(new Set(external)).slice(0, 20)) console.log(`    ${e}`);
} else {
  console.log("  No external request was attempted by any page.");
}
await br.close();
process.exit(bad > 0 || external.length > 0 ? 1 : 0);
