/**
 * Checks the screens the demo actually uses at projector resolution.
 *
 * The brief specifies 1280x720. What matters is that nothing scrolls
 * sideways, text is large enough to read from the back of a room, and the
 * thing the room is meant to look at is above the fold.
 */
import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const B = "http://localhost:3000";

const CHECKS = [
  { path: "/login", as: null, anchor: "Sign in", note: "the first screen the room sees" },
  { path: "/", as: "rezaul.karim@sjiblbd.com", anchor: "Good", note: "junior officer dashboard" },
  { path: "/requisitions/new", as: "rezaul.karim@sjiblbd.com", anchor: "New requisition", note: "raising the requisition" },
  { path: "/tenders", as: "tanvir.ahmed@sjiblbd.com", anchor: "Tenders", note: "tender list" },
  { path: "/admin/audit", as: "mizanur.rahman@sjiblbd.com", anchor: "Verify all", note: "the verify button must be above the fold" },
  { path: "/admin/workflows", as: "mizanur.rahman@sjiblbd.com", anchor: "Workflow builder", note: "builder list" },
  { path: "/about", as: "mizanur.rahman@sjiblbd.com", anchor: "Module coverage", note: "coverage map" },
  { path: "/vendor/login", as: null, anchor: "Bidder sign in", note: "vendor portal entry" },
];

const br = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let problems = 0;
console.log("\n  Projector check — 1280x720\n");

for (const c of CHECKS) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  if (c.as) {
    await p.goto(B + "/login", { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', c.as);
    await p.fill('input[name="password"]', "Demo@2026");
    await p.click('button[type="submit"]');
    await p.waitForURL(u => !u.pathname.endsWith("/login"), { timeout: 90000 });
  }
  await p.goto(B + c.path, { waitUntil: "networkidle" });
  await p.waitForTimeout(300);

  const m = await p.evaluate(() => {
    const doc = document.documentElement;
    // Anything wider than the window forces a sideways scroll.
    const overflowing = Array.from(document.querySelectorAll("body *"))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
      })
      .filter(el => {
        // Ignore anything inside a deliberately scrollable container.
        let n = el.parentElement;
        while (n) {
          const s = getComputedStyle(n);
          if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
          n = n.parentElement;
        }
        return true;
      })
      .slice(0, 3)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);

    // Smallest font actually used for visible body text.
    let smallest = 99;
    for (const el of Array.from(document.querySelectorAll("p,td,th,span,div,li,label,button,a"))) {
      const t = (el.textContent || "").trim();
      if (!t || t.length < 3) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size > 0 && size < smallest) smallest = size;
    }

    return {
      pageWidth: doc.scrollWidth,
      windowWidth: window.innerWidth,
      sideScroll: doc.scrollWidth > window.innerWidth + 2,
      overflowing,
      smallestFont: smallest,
    };
  });

  const anchorVisible = await p.evaluate((a) => {
    // Deepest element containing the text, so a button wrapping an icon plus a
    // label still matches.
    const all = Array.from(document.querySelectorAll("body *"))
      .filter(x => (x.textContent || "").includes(a));
    const el = all[all.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight;
  }, c.anchor);

  const issues = [];
  if (m.sideScroll) issues.push(`scrolls sideways (${m.pageWidth}px wide) — ${m.overflowing.join(", ")}`);
  if (m.smallestFont < 11) issues.push(`text as small as ${m.smallestFont}px`);
  if (anchorVisible === false) issues.push(`"${c.anchor}" is below the fold`);
  if (anchorVisible === null) issues.push(`"${c.anchor}" not found`);

  if (issues.length) { problems++; console.log(`  ✗ ${c.path.padEnd(22)} ${issues.join("; ")}`); }
  else console.log(`  ✓ ${c.path.padEnd(22)} ${c.note} — smallest text ${m.smallestFont}px`);

  await ctx.close();
}

console.log(`\n  ${CHECKS.length - problems}/${CHECKS.length} screens clean at projector resolution`);
await br.close();
process.exit(problems > 0 ? 1 : 0);
