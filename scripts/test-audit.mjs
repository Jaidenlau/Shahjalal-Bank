import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const p=await (await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2})).newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,250)));
await p.goto(B+"/login",{waitUntil:"networkidle"});
await p.fill('input[name="email"]',"mizanur.rahman@sjiblbd.com");
await p.fill('input[name="password"]',"Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});
await p.goto(B+"/admin/audit",{waitUntil:"networkidle"});

await p.locator('button:has-text("Verify all")').click();
await p.waitForTimeout(3000);
const t = await p.locator('main').innerText();
const i = t.indexOf("Chain");
console.log(t.slice(i, i+420));
await p.screenshot({path:"/tmp/audit-verified.png"});

// Expand a record to show the cryptographic working.
await p.locator('table tbody tr').first().click();
await p.waitForTimeout(1800);
await p.screenshot({path:"/tmp/audit-proof.png"});
const t2 = await p.locator('main').innerText();
const j = t2.indexOf("INTEGRITY PROOF");
console.log("\n--- proof panel ---\n" + t2.slice(j, j+500));
await br.close();
