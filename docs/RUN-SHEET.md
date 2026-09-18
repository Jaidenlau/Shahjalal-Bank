# Demo run sheet

**Vertex ERP — Shahjalal Islami Bank PLC, Common Services Division**

Target 15 minutes. Timings are a guide, not a stopwatch.

Two audiences are in the room at once. Common Services people want to know
whether it matches how they actually work. IT Division people want to know
whether it is real. The order below alternates between them deliberately.

---

## Before you walk in

```bash
npm run reset          # restores the exact demo start state, ~5 seconds
npm run dev            # http://localhost:3000
```

`npm run reset` is safe to run while the app is running. Run it before you
start, and again between rehearsals.

- Laptop on mains power, screen sleep disabled, notifications off
- Browser at 100% zoom, one window, no other tabs
- **Disconnect from the internet.** Nothing in this build needs it, and
  proving that to yourself now removes the venue wifi as a risk
- Sign in as **rezaul.karim@sjiblbd.com** and leave the dashboard on screen

Every password is `Demo@2026`. The **Switch user** control in the top bar moves
between people without retyping anything.

---

## 0:00 — Open on their problem, not the product

No screen. Roughly:

> "Right now a purchase request in Common Services starts on paper, moves
> between desks, and nobody can tell you where it is without asking someone.
> What we're going to show you is that same process, start to finish, in one
> system, in about twelve minutes."

Do not open with architecture. Do not open with a feature list.

---

## 0:30 — Sign in as the person at the bottom

Already signed in as **Rezaul Karim**, Officer, Gulshan Branch.

Point at the sidebar. Say what he **cannot** see — no approvals, no tenders, no
finance. Bottom left reads **7 of 27 areas visible to Requisition Initiator**.

> "The first thing to establish is that this system knows who you are."

---

## 1:30 — Raise the requisition

**Requisitions → New requisition**

- Title: `Laptop replacement for branch operations staff`
- Search `laptop`, pick **Dell Latitude 5450**

Stop on the panel that appears. It shows current stock **3**, in transit,
under purchase, reorder level **10**, and last purchased at **৳ 1,18,500 on
13 Jun 2026**.

> "It already knows what we hold and what we last paid."

- Quantity: `15`. The line immediately reads **3 from store, 12 to purchase**

> "It checked the store before letting anyone start a purchase. The bank does
> not buy what it already owns."

- Paste the justification, **Submit for approval**

Lands on **REQ/CSD/2026/0847**, ৳ 17,77,500.

---

## 3:00 — The maker-checker moment  ★

Still Rezaul. On his own requisition, press **Attempt approval**.

**It is refused.** Red panel: *"you raised this document, so you cannot approve
it."*

Press **Why was this blocked?**

> "Maker-checker is enforced by the system, not by policy. That refusal happens
> inside the transaction that would have made the change. There is no route
> around it, including for an administrator."

Do not rush past this.

---

## 4:00 — Approve it properly

**Switch user → Farhana Akter.** Her sidebar is larger than Rezaul's.

Open the requisition. On the right, the approval chain shows step 3 greyed out:

> *Not required: Value does not exceed the ৳ 20,00,000 threshold.*

> "It routed through two tiers because of its value. A larger one would go
> further. Hold that thought — we'll come back to it."

Approve. It advances to Divisional Head.

**Switch user → Mizanur Rahman.** Approve. Now **Approved**.

---

## 5:00 — Into procurement

**Switch user → Shahidul Islam.**

Keep this brisk — it is setup, not a highlight. Show **Tenders**, then open
**TND/SJIBL/2026/112**, which closed yesterday with three bids.

> "Here's one that ran its full course. Published eleven days ago, closed
> yesterday, three bidders."

---

## 6:30 — Leave the bank entirely

New tab → `localhost:3000/vendor/login` → **bids@rahimtraders.com.bd**

The whole look changes — dark chrome, **External Vendor Portal**.

Open a tender, then **Submit bid**. Two panels side by side: Technical Offer,
Financial Offer, each with its own button.

> "Vendors are a completely separate class of user with their own permission
> model. They never touch anything inside the bank — a bidder cannot see who
> else has bid, how many have bid, or what anyone offered."

Point at the gold panel: *"On submission this offer is sealed."*

---

## 8:00 — The two-envelope moment  ★

Back to the bank tab. **Switch user → Tanvir Ahmed.**

**TND/SJIBL/2026/112 → Bids tab.**

Three bids. Each shows two envelopes. The financial ones are hatched and
locked, showing **৳ ▪▪,▪▪,▪▪▪** and an envelope reference.

Press **Open financial envelope**.

**Refused.** *"Financial offers for this tender are sealed."* Press **Why was
this blocked?** — it says *data access layer*, and cites the bank's own words.

> "Financial offers cannot be read by anyone, including us and including an
> administrator, until technical evaluation is complete and signed off. That is
> enforced in the data layer — the amounts are not read out of the database at
> all, rather than read and hidden on the screen. Clause 1.9 of your own tender
> document."

This is the control a bank cares most about. Let it land.

---

## 9:00 — Technical evaluation

**Technical evaluation (0/3).** Open all three technical envelopes.

Scroll to **Bengal Office Solutions**. The mandatory document checklist shows
in red: **Authorised distributor certificate from the manufacturer — NOT
SUBMITTED**.

> "No price appears anywhere on this screen, and none can be read while the
> evaluation is open. So this decision cannot be influenced by what anyone
> asked for."

Qualify Rahim. Qualify Meghna. **Disqualify Bengal.**

**Complete and unseal financials.**

Back to the **Bids** tab. The amounts are now readable:
Rahim **৳ 13,86,000** · Meghna **৳ 14,04,000** · Bengal **৳ 13,20,000**.

> "And there it is. The bidder we just disqualified was the cheapest. We did
> not know that when we disqualified them."

---

## 10:00 — Comparative statement and the work order  ★

**Generate comparative statement.** It ranks only the technically qualified
bidders, on bank letterhead, with a signature block.

Read the recommendation out. It records, for the file, that a cheaper offer
existed, was disqualified before any price was visible, and that under clause
1.10 the bank is not bound to accept the lowest offer.

Optional: press **Attempt award** on the Bengal row. Refused.

**Award** to Rahim Traders.

**Switch user → Shahidul Islam → Purchase orders → New work order.**

Pre-filled with 12 units. **Change the quantity to 15** and press **Issue work
order**.

**Refused:**

> *Cannot issue purchase order. Item: Laptop, Dell Latitude 5450, i5 16GB
> 512GB. Approved quantity: 12. Attempted quantity: 15. Purchase order
> quantities must match the approved requisition.*

> "Purchase orders are validated against the original requisition and the
> approval record. Quantities cannot drift between approval and purchase."

Set it back to **12**. Issue. Work order printed on letterhead, amount in words.

---

## 11:30 — Close the loop

Fast now.

**Goods receipt → Record receipt** against the work order. 12 received, 12
accepted. Mention that the officer who raised the requisition is notified
automatically.

**Switch user → Nasrin Sultana → Invoices → Enter invoice.**

The three-way match panel: work order, goods receipt and invoice side by side,
green where they agree. Then the payment computation — VAT borne by the bank,
AIT deducted, **5% security money retained through the warranty period**.

> "If those three documents disagree on item, quantity or price, the invoice
> cannot be paid at all. It is not routed for approval."

If you have time: **Switch user → Sumaiya Haque** to verify (Nasrin entered it,
so maker-checker blocks her — the same control again), then **Kamrun Nahar**,
then **Golam Mostafa**, then **Process payment**.

If you are short on time, say the chain exists and move on.

---

## 12:30 — The audit trail  ★

**Switch user → Mizanur Rahman → Audit trail.**

Press **Verify all … records**.

Green in about 11 milliseconds: *"All 535 records verified. Every record hashes
correctly and links to the one before it."*

Click any record open. It shows what changed, field by field, **and** the
cryptographic working — the exact bytes hashed, the previous record's hash, the
recomputed digest against the stored one.

> "Append only. Every action is written in the same transaction as the change
> it records, so a change without its audit row is not possible. Each record is
> locked to the one before it, so any edit, deletion or reordering is
> detectable — and it names the first record that fails. No user, no
> administrator and no vendor can alter this."

Filter to `REQ/CSD/2026/0847` to show the whole thread you just performed.

---

## 13:30 — The finisher  ★

**Workflow builder.** Open **Requisition Approval v3**.

In the preview on the right, type **3,00,000**. It shows **1 approval**.

Now change step 2's threshold from `500000` to `100000`.

**The preview redraws instantly — 2 approvals.** Point at the reason text:
*"Value exceeds the ৳ 1,00,000 threshold."*

> "No code was written, no change request was raised, and we were not involved.
> Your Common Services administrators do that themselves. When your delegation
> of authority changes, your system changes the same day."

Type a reason, **Save as version 4**.

> "And it saves as a new version. Anything already in approval keeps the rules
> it started under — changing a threshold today cannot retroactively alter an
> approval chain that began yesterday."

That last sentence is the first question a careful IT reviewer asks. Have it
ready.

---

## 14:30 — Stop

Do not tour the other modules. Say they are there, offer to open any one of
them, and hand the room to questions.

If they want proof of breadth in one click: **About → Module coverage**. All 25
modules, what runs end to end, what is a working register, and what was flagged
in the proposal as needing customisation.

---

## Questions to expect

**"Is this live anywhere?"**
No. This is a working demonstration of the system we proposed. The workflow
engine, permission model, two-envelope control and audit trail are real. The
deployment is condensed to a single machine so it is portable; the production
design is the three-tier architecture in the technical proposal.

**"How does it connect to our CBS?"**
Through the middleware tier — one layer owns every external connection, so a
CBS API change touches one place. Show **Integrations**. Say plainly that no
connector here is live.

**"Can we change X ourselves?"**
Workflows, reports, roles and permissions, backup and archival frequency: yes.
Anything structural is a change request. Be precise rather than generous.

**"What about the payment gateway?"**
Flagged in our proposal as requiring customisation once you select your payment
service provider. It is on the About screen with the other five such items.

**"What happens if a workflow changes mid-approval?"**
Versions are pinned. Show the builder's note: *N documents in approval will
stay on version 3*.

**"How do we know the audit log hasn't been edited?"**
Press the verify button in front of them, then open a record and show the
hash working.

**"How long until we have this?"**
Ninety working days from work order, as quoted. Phased, with your UAT before
go-live.

---

## If something goes wrong

**A screen misbehaves** — every list is reachable from the sidebar and none of
them depends on the live thread. Move on and come back.

**Creating the requisition fails** — `REQ/CSD/2026/0845` is already sitting in
Farhana's queue, raised by Rezaul, identical in every respect. Open it and the
maker-checker moment works exactly the same.

**The tender is in the wrong state** — `npm run reset` takes about five
seconds and is safe with the app running. Refresh the page afterwards.

**You are short on time** — cut in this order: the invoice approval chain, the
vendor portal, the comparative statement, goods receipt. Never cut: the
maker-checker refusal, the sealed envelope, the work order mismatch, the
workflow builder, the audit trail.

---

## The five moments, if you only have five minutes

1. Rezaul cannot approve his own requisition
2. The financial envelope refuses to open
3. The work order for 15 is refused against an approval for 12
4. The threshold change redraws the approval route live
5. The audit chain verifies, and shows its working
