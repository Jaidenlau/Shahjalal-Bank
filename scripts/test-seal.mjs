import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const ctx=await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,200)));
await p.goto(B+"/login",{waitUntil:"networkidle"});
await p.fill('input[name="email"]',"tanvir.ahmed@sjiblbd.com");
await p.fill('input[name="password"]',"Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});

await p.goto(B+"/tenders",{waitUntil:"networkidle"});
const href=await p.locator('a:has-text("TND/SJIBL/2026/112")').first().getAttribute("href");
await p.goto(B+href+"?tab=bids",{waitUntil:"networkidle"});
await p.waitForTimeout(500);
await p.screenshot({path:"/tmp/tender-sealed.png"});

// Attempt to open a sealed financial envelope.
const btn=p.locator('button:has-text("Open financial envelope")').first();
console.log("financial buttons:", await p.locator('button:has-text("Open financial envelope")').count());
await btn.click();
await p.waitForTimeout(2500);
const why=p.locator('button:has-text("Why was this blocked?")');
if (await why.count()) { await why.click(); await p.waitForTimeout(400); }
await p.screenshot({path:"/tmp/tender-refused.png"});
const t=await p.locator('[role="alert"]').first().innerText().catch(()=>"(none)");
console.log("REFUSAL:\n"+t);
await br.close();
