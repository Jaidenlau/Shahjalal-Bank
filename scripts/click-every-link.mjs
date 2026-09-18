/**
 * Clicks every navigation item as every persona and reports anything that
 * 404s, 500s, or renders an error. The docs call this out specifically: no
 * dead ends, because someone senior may ask to drive.
 */
import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";

const PERSONAS = [
  ["rezaul.karim@sjiblbd.com", "Requisition Initiator"],
  ["farhana.akter@sjiblbd.com", "Department Head"],
  ["shahidul.islam@sjiblbd.com", "Procurement Executive"],
  ["tanvir.ahmed@sjiblbd.com", "Technical Evaluation Committee"],
  ["nasrin.sultana@sjiblbd.com", "Finance Officer"],
  ["mizanur.rahman@sjiblbd.com", "System Administrator"],
];

const br = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let problems = 0, checked = 0;

for (const [email, role] of PERSONAS) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message.slice(0, 160)));

  await p.goto(B + "/login", { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "Demo@2026");
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.endsWith("/login"), { timeout: 90000 });

  // Every link the sidebar offers this persona.
  const hrefs = await p.$$eval('nav a[href^="/"]', els =>
    Array.from(new Set(els.map(e => e.getAttribute("href")).filter(Boolean))));

  console.log(`\n${role} — ${hrefs.length} navigation items`);
  for (const href of hrefs) {
    errors.length = 0;
    const res = await p.goto(B + href, { waitUntil: "networkidle", timeout: 40000 }).catch(() => null);
    await p.waitForTimeout(150);
    checked++;
    const status = res?.status() ?? 0;
    const body = await p.locator("body").innerText().catch(() => "");
    const broken =
      status >= 400 ||
      /Application error|This page could not be found|Unhandled Runtime|Internal Server Error/i.test(body) ||
      errors.length > 0;
    if (broken) {
      problems++;
      console.log(`  ✗ ${href} — ${status}${errors.length ? ` — ${errors[0]}` : ""}`);
      const snippet = body.slice(0, 160).replace(/\s+/g, " ");
      console.log(`      ${snippet}`);
    } else {
      // Flag screens that render but look empty.
      const rows = await p.locator("table tbody tr").count().catch(() => 0);
      const empty = /No records|coming soon|No .* match these filters/i.test(body) && rows <= 1;
      console.log(`  ${empty ? "○" : "✓"} ${href} — ${status}${empty ? " (empty state)" : ` (${rows} rows)`}`);
    }
  }
  await ctx.close();
}

console.log(`\n${checked} screens checked, ${problems} problems`);
await br.close();
process.exit(problems > 0 ? 1 : 0);
