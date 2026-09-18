/** Drives the whole two-envelope sequence the way the demo will. */
import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", B="http://localhost:3000";
const br=await chromium.launch({executablePath:CHROME,args:["--no-sandbox"]});
const ctx=await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message.slice(0,200)));
const step = async (n)=>{ await p.waitForTimeout(900); console.log("  ..."+n); };

await p.goto(B+"/login",{waitUntil:"networkidle"});
await p.fill('input[name="email"]',"tanvir.ahmed@sjiblbd.com");
await p.fill('input[name="password"]',"Demo@2026");
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.endsWith("/login"),{timeout:30000});

await p.goto(B+"/tenders",{waitUntil:"networkidle"});
const href=await p.locator('a:has-text("TND/SJIBL/2026/112")').first().getAttribute("href");
const tid=href.split("/").pop();

// 1. Open all three technical envelopes on the evaluation screen.
await p.goto(B+`/tenders/${tid}/evaluation`,{waitUntil:"networkidle"});
for (let i=0;i<3;i++){
  const b=p.locator('button:has-text("Open technical envelope")').first();
  if (await b.count()===0) break;
  await b.click(); await p.waitForTimeout(1800);
}
await step("technical envelopes opened");
await p.screenshot({path:"/tmp/eval-opened.png"});

// 2. Qualify Rahim and Meghna, disqualify Bengal.
// Click the button inside the card belonging to a named vendor: walk up from
// the heading to the card, then down to the button.
const decide = async (vendor, action) => {
  const ok = await p.evaluate(([v, a]) => {
    const h = Array.from(document.querySelectorAll("h2")).find(x => x.textContent?.includes(v));
    if (!h) return "no-heading";
    let card = h;
    while (card && !card.querySelector?.(`button`)) card = card.parentElement;
    // climb until the card also contains the action button
    while (card && !Array.from(card.querySelectorAll("button")).some(b => b.textContent?.trim() === a)) {
      card = card.parentElement;
      if (!card || card.tagName === "BODY") return "no-button";
    }
    const btn = Array.from(card.querySelectorAll("button")).find(b => b.textContent?.trim() === a);
    if (!btn) return "no-button";
    btn.click();
    return "clicked";
  }, [vendor, action]);
  console.log(`  ${vendor} -> ${action}: ${ok}`);
  await p.waitForTimeout(2200);
};

await decide("Rahim Traders", "Qualify");
await decide("Meghna Technologies", "Qualify");
await decide("Bengal Office Solutions", "Disqualify");
await p.screenshot({path:"/tmp/eval-decided.png"});

// 3. Financials must still be sealed at this point.
await p.goto(B+`/tenders/${tid}?tab=bids`,{waitUntil:"networkidle"});
const sealedNow = await p.locator('text=Sealed').count();
console.log("  sealed badges before completion:", sealedNow);

// 4. Complete technical evaluation -> unseal.
await p.goto(B+`/tenders/${tid}/evaluation`,{waitUntil:"networkidle"});
const done=p.locator('button:has-text("Complete and unseal")').first();
console.log("  complete button present:", await done.count());
await done.click(); await p.waitForTimeout(2500);
await p.screenshot({path:"/tmp/eval-complete.png"});

// 5. Amounts now readable.
await p.goto(B+`/tenders/${tid}?tab=bids`,{waitUntil:"networkidle"});
const body=await p.locator('main').innerText();
for (const amt of ["13,86,000","14,04,000","13,20,000"]) {
  console.log(`  amount ${amt} visible:`, body.includes(amt));
}
await p.screenshot({path:"/tmp/tender-unsealed.png"});

// 6. Generate comparative statement.
await p.goto(B+`/tenders/${tid}`,{waitUntil:"networkidle"});
const gen=p.locator('button:has-text("Generate comparative statement")').first();
console.log("  generate button:", await gen.count());
await gen.click(); await p.waitForTimeout(2500);
await p.goto(B+`/tenders/${tid}/comparative-statement`,{waitUntil:"networkidle"});
await p.waitForTimeout(600);
await p.screenshot({path:"/tmp/comparative.png",fullPage:true});
const cs=await p.locator('main').innerText();
console.log("--- recommendation ---");
const i=cs.indexOf("Recommendation");
console.log(cs.slice(i, i+700));
await br.close();
