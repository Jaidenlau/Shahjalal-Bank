# Vertex ERP — Shahjalal Islami Bank PLC

Working demonstration of the ERP and integrated workflow platform proposed to
Shahjalal Islami Bank PLC, Common Services Division.

**→ [docs/RUN-SHEET.md](docs/RUN-SHEET.md) is what you hold during the demo.**

---

## Getting it running

Needs Node 20 or later. Nothing else — no database server, no Docker, no
network.

```bash
npm install
npm run setup     # creates the database and seeds it, ~10 seconds
npm run dev       # http://localhost:3000
```

Every login is `Demo@2026`.

| Sign in as | Role | Shows |
|---|---|---|
| rezaul.karim@sjiblbd.com | Requisition Initiator | Narrow access, raises requisitions, cannot approve |
| farhana.akter@sjiblbd.com | Department Head | Approval queue, first approval tier |
| shahidul.islam@sjiblbd.com | Procurement Executive | Tenders, committees, work orders |
| tanvir.ahmed@sjiblbd.com | Technical Evaluation Committee | Bid opening and evaluation |
| nasrin.sultana@sjiblbd.com | Finance Officer | Invoices, three-way match |
| mizanur.rahman@sjiblbd.com | System Administrator | Workflow builder, roles, audit trail |
| bids@rahimtraders.com.bd | Vendor | The external portal at `/vendor/login` |

The **Switch user** control in the top bar moves between people without
retyping. It is labelled a demonstration control on screen and writes an audit
row, so it is not a hole in the trail.

## Resetting

```bash
npm run reset     # back to the exact demo start state, ~5 seconds
```

Safe to run while the app is running. It clears and re-seeds in place rather
than replacing the database file — deleting the file leaves the running server
holding a removed inode, and every subsequent save fails silently.

The seed is deterministic. The same database comes out of every run, so a
rehearsal and the demonstration are identical.

## Checking it still works

```bash
npm run check     # typecheck, control assertions, navigation sweep, full thread
```

Four layers, all of which must pass:

| Command | What it proves |
|---|---|
| `npm run typecheck` | The whole codebase compiles |
| `npm run verify` | 34 assertions against the seeded database: maker-checker, the seal, quantity matching, routing, tamper detection, three-way match, no deadlocked approval chain, and seed timeline coherence |
| `npm run test:nav` | Signs in as all six personas and visits every navigation item — 92 screens, nothing 404s, errors or shows an empty state |
| `npm run test:thread` | Performs the entire demo in a browser, 24 steps from requisition to payment, ending with the audit chain verifying |

`npm run verify` runs against the live database and rolls back everything it
changes, so it is safe to run immediately before a demonstration.

## The controls, and where they are enforced

Each of these is a claim in the bid, implemented as an enforced code path
rather than interface behaviour, because the bank will test them in the room.

| Control | Where | Refuses with |
|---|---|---|
| Maker-checker | `src/lib/workflow.ts`, inside the mutation | The document, who raised it, who attempted it, the step and the required role |
| Two-envelope seal | `src/lib/sealed-bids.ts`, the only read path to financial offers | The tender, the vendor, the envelope reference and what unlocks it |
| Quantity matching | `src/lib/po-validation.ts` | The item, the approved quantity and the attempted quantity, by name |
| Configurable routing | `src/lib/workflow.ts`, versioned and pinned per document | — |
| Tamper-evident audit | `src/lib/audit.ts`, SHA-256 chained | The first record whose hash fails |

The seal is asserted by reading the sealed payload and checking it contains no
bid amount at all, rather than checking that the interface hides one.

## How it is built

- **Next.js 15** App Router, TypeScript, server components by default
- **Prisma** over **SQLite** — one file, no server, survives restarts
- **Tailwind CSS 4**, tokens in the bank's green
- No webfonts, no CDN, no external stylesheet, no runtime network call.
  Icons and charts are inline SVG. The venue may have no usable internet.

Money is stored as integer **poisha** (1 BDT = 100 poisha) in 64-bit columns
and formatted only at the display layer, with South Asian lakh grouping —
`৳ 13,86,000`, never `BDT 1,386,000`. A 32-bit column would cap at about
৳ 2.14 crore, which the bank's own property insurance cover exceeds.

Every state-changing action writes its audit row in the same transaction as the
change. Either both land or neither does.

### The demo stack is not the production stack

Deliberately. This runs on a single machine so it is portable and needs no
network. The production design is the three-tier architecture in the technical
proposal — separate application, database and middleware tiers, load balanced,
replicated across Production, DR and Far-DR.

The business logic, permission model, workflow engine and audit trail are real.
Only the deployment topology is condensed. Say so if asked; do not claim this is
a production deployment.

## Layout

```
prisma/
  schema.prisma        All 25 modules. Money in BigInt poisha.
  seed.ts              Deterministic. Clears and re-seeds in place.
  seed/                Split by domain; 40-procurement.ts holds the demo thread.
src/lib/
  workflow.ts          Routing engine, version pinning, maker-checker
  sealed-bids.ts       The only read path to financial offers
  po-validation.ts     Quantity matching and three-way match
  audit.ts             Hash chain, write and verify
  auth.ts              Sessions, RBAC
  money.ts             Poisha, lakh grouping, taka in words
src/app/(app)/         The internal application
src/app/vendor/        The external vendor portal, separate session
scripts/
  verify-controls.ts   The 34 assertions
  full-thread.mjs      The whole demo, in a browser
  click-every-link.mjs The navigation sweep
```

## Scope

All 25 modules from Annexure-B are present. **/about** maps each one to what is
actually built, separating what runs end to end from what is a working
register, and repeats the six items answered in the bid as needing
customisation. Nobody should have to guess which is which, and the answer
should not depend on who is asked.
