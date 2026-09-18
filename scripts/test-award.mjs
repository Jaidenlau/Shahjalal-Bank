import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const p=await (await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2})).newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,200)));
await p.goto(B+"/login",{waitUntil:"networkidle"});
await p.fill('input[name="email"]',"tanvir.ahmed@sjiblbd.com");
await p.fill('input[name="password"]',"Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});
await p.goto(B+"/tenders",{waitUntil:"networkidle"});
const href=await p.locator('a:has-text("TND/SJIBL/2026/112")').first().getAttribute("href");
const tid=href.split("/").pop();
await p.goto(B+`/tenders/${tid}/comparative-statement`,{waitUntil:"networkidle"});
// Try to award the cheapest, disqualified bidder.
await p.locator('button:has-text("Attempt award")').first().click();
await p.waitForTimeout(2500);
console.log("REFUSAL:", (await p.locator('[role="alert"]').first().innerText().catch(()=>"(none)")).slice(0,400));
await p.screenshot({path:"/tmp/award-refused.png"});
// Print the recommendation paragraph.
const t=await p.locator('main').innerText();
const i=t.indexOf("RECOMMENDATION");
console.log("\n--- recommendation ---\n"+t.slice(i,i+800));
await br.close();
