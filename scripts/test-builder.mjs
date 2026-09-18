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

await p.goto(B+"/admin/workflows",{waitUntil:"networkidle"});
await p.screenshot({path:"/tmp/wf-list.png"});
// Open the active Requisition Approval definition.
const link = p.locator('a:has-text("Configure")').first();
await link.click();
await p.waitForLoadState("networkidle");
await p.waitForTimeout(1200);
console.log("on:", p.url());

const route = async () => (await p.locator('text=Resulting route').locator('xpath=..').innerText()).replace(/\s+/g," ");
console.log("BEFORE @ 17,77,500:", await route());

// The finisher: at ৳3,00,000 the current rules give one approval.
await p.fill('#amt', "3,00,000");
await p.waitForTimeout(1200);
console.log("AT 3,00,000 (before change):", await route());
await p.screenshot({path:"/tmp/wf-before.png"});

// Lower the step-2 threshold from 5,00,000 to 1,00,000.
const thresholds = p.locator('input[placeholder="500000"]');
console.log("threshold inputs:", await thresholds.count());
await thresholds.first().fill("100000");
await p.waitForTimeout(1400);
console.log("AT 3,00,000 (after change):", await route());
await p.screenshot({path:"/tmp/wf-after.png"});

// Save as a new version.
await p.fill('#note', "Divisional tier lowered to BDT 1,00,000 per the revised delegation of authority.");
await p.locator('button:has-text("Save as version")').click();
await p.waitForTimeout(3000);
console.log("after save:", p.url());
const t = await p.locator('main').innerText();
console.log(t.slice(0,300));
await p.screenshot({path:"/tmp/wf-saved.png"});
await br.close();
