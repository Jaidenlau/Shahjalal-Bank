import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const ctx=await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,200)));

await p.goto(B+"/login",{waitUntil:"networkidle"});
await p.fill('input[name="email"]',"rezaul.karim@sjiblbd.com");
await p.fill('input[name="password"]',"Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});

await p.goto(B+"/requisitions/new",{waitUntil:"networkidle"});
await p.fill('#title',"Laptop replacement for branch operations staff");
await p.fill('input[placeholder*="Search 64"]',"laptop");
await p.waitForTimeout(600);
await p.locator('button:has-text("Dell Latitude 5450")').first().click();
await p.waitForTimeout(400);
await p.screenshot({path:"/tmp/req-picker.png"});
// 15 units against stock of 3 -> should split 3 store / 12 purchase
await p.fill('input[type="number"]',"15");
await p.waitForTimeout(300);
await p.locator('button:has-text("Add line")').click();
await p.waitForTimeout(400);
await p.fill('textarea',"Existing units beyond 5 year replacement cycle, repeated hardware failures affecting counter operations.");
await p.waitForTimeout(200);
await p.screenshot({path:"/tmp/req-form-filled.png"});

await p.locator('button:has-text("Submit for approval")').click();
await p.waitForTimeout(4000);
console.log("after submit:", p.url());
const txt = await p.locator('main').innerText();
console.log(txt.slice(0,500));
await p.screenshot({path:"/tmp/req-created.png"});
await br.close();
