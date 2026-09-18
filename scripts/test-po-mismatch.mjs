import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const p=await (await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2})).newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,250)));

// Drive the tender to award first, as the demo does.
const login = async (email) => {
  // Already-signed-in sessions redirect away from /login, so clear first.
  await p.context().clearCookies();
  await p.goto(B+"/login",{waitUntil:"networkidle"});
  await p.fill('input[name="email"]',email);
  await p.fill('input[name="password"]',"Demo@2026");
  await p.click('button[type="submit"]');
  await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});
};
await login("tanvir.ahmed@sjiblbd.com");
await p.goto(B+"/tenders",{waitUntil:"networkidle"});
const href=await p.locator('a:has-text("TND/SJIBL/2026/112")').first().getAttribute("href");
const tid=href.split("/").pop();

await p.goto(B+`/tenders/${tid}/evaluation`,{waitUntil:"networkidle"});
for (let i=0;i<3;i++){
  const b=p.locator('button:has-text("Open technical envelope")').first();
  if (await b.count()===0) break;
  await b.click(); await p.waitForTimeout(1600);
}
const decide = async (vendor, action) => {
  await p.evaluate(([v,a])=>{
    const h=Array.from(document.querySelectorAll("h2")).find(x=>x.textContent?.includes(v));
    let card=h;
    while(card && !Array.from(card.querySelectorAll?.("button")||[]).some(b=>b.textContent?.trim()===a)){
      card=card.parentElement; if(!card||card.tagName==="BODY") return;
    }
    Array.from(card.querySelectorAll("button")).find(b=>b.textContent?.trim()===a)?.click();
  },[vendor,action]);
  await p.waitForTimeout(2000);
};
await p.reload({waitUntil:"networkidle"});
await decide("Rahim Traders","Qualify");
await decide("Meghna Technologies","Qualify");
await decide("Bengal Office Solutions","Disqualify");
await p.reload({waitUntil:"networkidle"});
console.log("buttons after evaluation:", JSON.stringify(await p.locator('button').allInnerTexts()));
await p.locator('button:has-text("Complete and unseal")').first().click();
await p.waitForTimeout(2500);
await p.goto(B+`/tenders/${tid}`,{waitUntil:"networkidle"});
await p.locator('button:has-text("Generate comparative statement")').first().click();
await p.waitForTimeout(2200);
await p.goto(B+`/tenders/${tid}/comparative-statement`,{waitUntil:"networkidle"});
// Award to Rahim (rank 1).
await p.locator('button:has-text("Award")').first().click();
await p.waitForTimeout(2500);
console.log("awarded");

// Now the work order, as the procurement officer.
await login("shahidul.islam@sjiblbd.com");
await p.goto(B+`/purchase-orders/new?tender=${tid}`,{waitUntil:"networkidle"});
await p.waitForTimeout(500);
await p.screenshot({path:"/tmp/po-form.png"});

// Change the quantity from the approved 12 to 15 and try to issue.
const qtyInput = p.locator('input[type="number"]').first();
await qtyInput.fill("15");
await p.waitForTimeout(500);
await p.locator('button:has-text("Issue work order")').click();
await p.waitForTimeout(2500);
const why=p.locator('button:has-text("Why was this blocked?")');
if (await why.count()) { await why.click(); await p.waitForTimeout(400); }
await p.screenshot({path:"/tmp/po-mismatch.png"});
console.log("REFUSAL:\n"+(await p.locator('[role="alert"]').first().innerText().catch(()=>"(none)")));

// Now set it back to 12 and issue for real.
await qtyInput.fill("12");
await p.waitForTimeout(400);
await p.locator('button:has-text("Issue work order")').click();
await p.waitForTimeout(3000);
console.log("after valid issue:", p.url());
await p.screenshot({path:"/tmp/po-issued.png", fullPage:true});
await br.close();
