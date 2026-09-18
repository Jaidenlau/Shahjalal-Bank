/**
 * Control verification.
 *
 * The five controls below are the demo. Each one is a claim made in the bid
 * that the bank will test in the room, so each is asserted here against the
 * real seeded database rather than trusted. Run with `npm run verify`.
 */
import { PrismaClient } from "@prisma/client";
import { verifyChain } from "../src/lib/audit";
import { readFinancialPart, listFinancialParts, isFinancialUnlocked } from "../src/lib/sealed-bids";
import { actOnWorkflow, resolveRoute, evaluateCondition } from "../src/lib/workflow";
import { assertPoMatchesRequisition, buildValidationContext, threeWayMatch } from "../src/lib/po-validation";
import { isControlViolation } from "../src/lib/errors";
import { formatBDT, num } from "../src/lib/money";

const db = new PrismaClient();
let pass = 0, fail = 0;

function ok(name: string, detail = "") {
  pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? `\n          ${detail}` : ""}`);
}
function bad(name: string, detail: string) {
  fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${name}\n          ${detail}`);
}

async function main() {
  console.log("\n  Vertex ERP — control verification\n");

  // -------------------------------------------------------------------------
  console.log("  1. Maker-checker — the creator cannot approve");
  // -------------------------------------------------------------------------
  const req = await db.requisition.findFirstOrThrow({
    where: { requisitionNo: "REQ/CSD/2026/0845" },
    include: { requestedBy: { include: { roles: true } } },
  });
  const inst = await db.workflowInstance.findFirstOrThrow({
    where: { documentType: "REQUISITION", documentId: req.id },
  });
  const maker = req.requestedBy;
  const approver = await db.user.findFirstOrThrow({
    where: { fullName: "Farhana Akter" }, include: { roles: true },
  });

  // (a) The maker, holding every role, is still refused.
  try {
    await db.$transaction(async tx => {
      await actOnWorkflow(tx, {
        instanceId: inst.id, documentLabel: req.requisitionNo,
        makerId: maker.id, makerName: maker.fullName,
        actor: { id: maker.id, fullName: maker.fullName, roleName: "Requisition Initiator",
                 roleIds: (await tx.role.findMany({ select: { id: true } })).map(r => r.id) },
        action: "APPROVED", comments: "attempting self-approval",
      });
      throw new Error("__NOT_BLOCKED__");
    });
    bad("maker cannot self-approve", "the mutation succeeded");
  } catch (e) {
    if (e instanceof Error && e.message === "__NOT_BLOCKED__") {
      bad("maker cannot self-approve", "the mutation succeeded");
    } else if (isControlViolation(e) && e.control === "Maker-Checker") {
      ok("maker cannot self-approve, even holding every role in the system", `refused at layer: ${e.layer}`);
    } else {
      bad("maker cannot self-approve", `wrong error: ${String(e)}`);
    }
  }

  // (b) A different user holding the required role succeeds.
  try {
    await db.$transaction(async tx => {
      const r = await actOnWorkflow(tx, {
        instanceId: inst.id, documentLabel: req.requisitionNo,
        makerId: maker.id, makerName: maker.fullName,
        actor: { id: approver.id, fullName: approver.fullName, roleName: "Department Head",
                 roleIds: approver.roles.map(r => r.roleId) },
        action: "APPROVED", comments: "verification run",
      });
      if (r.instanceStatus === "IN_PROGRESS" && r.nextStepName) {
        ok("a different user holding the role can approve",
           `advanced to step ${r.nextStepSequence}: ${r.nextStepName} (${r.nextStepRole})`);
      } else {
        ok("a different user holding the role can approve", `instance is now ${r.instanceStatus}`);
      }
      throw new Error("__ROLLBACK__"); // leave the demo state untouched
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "__ROLLBACK__")) {
      bad("checker can approve", String(e));
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n  2. Two-envelope seal — financial offers are unreadable");
  // -------------------------------------------------------------------------
  const tender = await db.tender.findFirstOrThrow({
    where: { tenderNo: "TND/SJIBL/2026/112" },
    include: { bids: { include: { vendor: true } } },
  });
  if (tender.technicalEvaluationCompletedAt) {
    bad("demo tender starts sealed", "technicalEvaluationCompletedAt is already set");
  } else {
    ok("demo tender starts sealed", `TND/SJIBL/2026/112, ${tender.bids.length} bids, technical evaluation not completed`);
  }

  const unlocked = await isFinancialUnlocked(tender.id);
  if (unlocked) bad("seal reports locked", "isFinancialUnlocked returned true");
  else ok("seal reports locked");

  // The list view must not carry amounts while sealed.
  const listed = await listFinancialParts(tender.id);
  const leaked = listed.filter(v => !v.sealed);
  const serialised = JSON.stringify(listed);
  const amountsInPayload = ["1386000", "1404000", "1320000", "138600000", "140400000", "132000000"]
    .filter(a => serialised.includes(a));
  if (leaked.length > 0) {
    bad("sealed list carries no amounts", `${leaked.length} part(s) returned unsealed`);
  } else if (amountsInPayload.length > 0) {
    bad("sealed list carries no amounts", `bid amounts present in payload: ${amountsInPayload.join(", ")}`);
  } else {
    ok("sealed list carries no amounts", `${listed.length} envelopes returned as sealed summaries only`);
  }

  // An explicit read must be refused.
  const bengal = tender.bids.find(b => b.vendor.companyName === "Bengal Office Solutions")!;
  try {
    await readFinancialPart(bengal.id);
    bad("explicit read of a sealed envelope is refused", "readFinancialPart returned data");
  } catch (e) {
    if (isControlViolation(e) && e.control === "Two-Envelope Seal") {
      ok("explicit read of a sealed envelope is refused", `refused at layer: ${e.layer} — ${e.reference}`);
    } else {
      bad("explicit read of a sealed envelope is refused", `wrong error: ${String(e)}`);
    }
  }

  // And it opens once technical evaluation is complete.
  await db.$transaction(async tx => {
    await tx.tender.update({ where: { id: tender.id }, data: { technicalEvaluationCompletedAt: new Date() } });
    const view = await readFinancialPart(bengal.id, tx);
    if (num(view.totalAmount) === 1320000_00) {
      ok("the same read succeeds once technical evaluation completes",
         `Bengal Office Solutions: ${formatBDT(num(view.totalAmount))} — the lowest offer, and the disqualified one`);
    } else {
      bad("unlock returns the right amount", `got ${view.totalAmount}`);
    }
    throw new Error("__ROLLBACK__");
  }).catch(e => { if (!(e instanceof Error && e.message === "__ROLLBACK__")) throw e; });

  const stillSealed = await db.tender.findUniqueOrThrow({ where: { id: tender.id } });
  if (stillSealed.technicalEvaluationCompletedAt) bad("verification left demo state clean", "tender is now unlocked");
  else ok("verification left demo state clean", "tender is still sealed for the demo");

  // -------------------------------------------------------------------------
  console.log("\n  3. Work order / requisition quantity match");
  // -------------------------------------------------------------------------
  const source = await db.requisition.findFirstOrThrow({
    where: { requisitionNo: "REQ/CSD/2026/0846" },
    include: { lines: { include: { item: true } } },
  });
  const ctx = await buildValidationContext(db, source.id);
  const laptop = source.lines[0]!;
  const approvedQty = ctx.approved.get(laptop.itemId)?.quantity;
  if (approvedQty === 12) ok("approved purchase quantity is the to-purchase split", "3 from store, 12 to purchase");
  else bad("approved purchase quantity", `expected 12, got ${approvedQty}`);

  // Matching quantity passes.
  try {
    assertPoMatchesRequisition(
      [{ itemId: laptop.itemId, itemCode: laptop.item.code, itemName: laptop.item.name, quantity: 12, unitPrice: 115500_00 }],
      ctx,
    );
    ok("a work order for the approved quantity is accepted", "12 units");
  } catch (e) { bad("matching quantity accepted", String(e)); }

  // Over-quantity is refused, with a message readable from a projector.
  try {
    assertPoMatchesRequisition(
      [{ itemId: laptop.itemId, itemCode: laptop.item.code, itemName: laptop.item.name, quantity: 15, unitPrice: 115500_00 }],
      ctx,
    );
    bad("over-quantity work order is refused", "it was accepted");
  } catch (e) {
    if (isControlViolation(e)) {
      ok("over-quantity work order is refused", e.message);
    } else bad("over-quantity refused", String(e));
  }

  // An item never approved is refused.
  const other = await db.item.findFirstOrThrow({ where: { code: "IT-MON-0018" } });
  try {
    assertPoMatchesRequisition(
      [{ itemId: other.id, itemCode: other.code, itemName: other.name, quantity: 5, unitPrice: 21800_00 }],
      ctx,
    );
    bad("unapproved item is refused", "it was accepted");
  } catch (e) {
    if (isControlViolation(e)) ok("an item not on the requisition is refused", e.message);
    else bad("unapproved item refused", String(e));
  }

  // -------------------------------------------------------------------------
  console.log("\n  4. Workflow routing responds to configuration");
  // -------------------------------------------------------------------------
  const def = await db.workflowDefinition.findFirstOrThrow({
    where: { documentType: "REQUISITION", isActive: true },
    include: { steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } } },
  });
  const steps = def.steps.map(s => ({
    sequence: s.sequence, name: s.name, conditionType: s.conditionType, conditionValue: s.conditionValue,
    requiredRoleId: s.requiredRoleId, requiredRoleName: s.requiredRole.name,
    actionType: s.actionType, escalationHours: s.escalationHours,
  }));

  const at = (amount: number) => resolveRoute(steps, { amount }).filter(s => s.applies).length;
  const checks: Array<[number, number, string]> = [
    [80_000_00, 1, "৳ 80,000 — one approval"],
    [1777500_00, 2, "৳ 17,77,500 — the demo requisition, two approvals"],
    [2500000_00, 3, "৳ 25,00,000 — three approvals"],
  ];
  for (const [amount, expected, label] of checks) {
    const got = at(amount);
    if (got === expected) ok(`routing: ${label}`);
    else bad(`routing: ${label}`, `expected ${expected} steps, got ${got}`);
  }

  // Lowering the second threshold must change the route, with no code change.
  const lowered = steps.map(s => s.sequence === 2 ? { ...s, conditionValue: String(1_00_000 * 100) } : s);
  const before = resolveRoute(steps, { amount: 300000_00 }).filter(s => s.applies).length;
  const after = resolveRoute(lowered, { amount: 300000_00 }).filter(s => s.applies).length;
  if (before === 1 && after === 2) {
    ok("lowering the step 2 threshold reroutes a ৳ 3,00,000 requisition", "1 approval before, 2 after — configuration only");
  } else {
    bad("threshold change reroutes", `before=${before} after=${after}`);
  }

  const alwaysApplies = evaluateCondition("ALWAYS", "", { amount: 0 }).applies;
  if (alwaysApplies) ok("ALWAYS condition applies unconditionally");
  else bad("ALWAYS condition", "did not apply");

  // -------------------------------------------------------------------------
  console.log("\n  5. Audit trail — append only and tamper evident");
  // -------------------------------------------------------------------------
  const chain = await verifyChain(db);
  if (chain.ok) ok("hash chain verifies end to end", chain.reason);
  else bad("hash chain verifies", chain.reason);

  // Tamper with one row inside a rolled-back transaction and confirm detection.
  await db.$transaction(async tx => {
    const victim = await tx.auditLog.findFirstOrThrow({ orderBy: { id: "asc" }, skip: 40 });
    await tx.auditLog.update({
      where: { id: victim.id },
      data: { performedByName: "Someone Else" },
    });
    const after = await verifyChain(tx);
    if (!after.ok && after.firstBrokenId === victim.id) {
      ok("altering a single field is detected", after.reason);
    } else {
      bad("tamper detection", `ok=${after.ok} brokenId=${after.firstBrokenId} expected=${victim.id}`);
    }
    throw new Error("__ROLLBACK__");
  }).catch(e => { if (!(e instanceof Error && e.message === "__ROLLBACK__")) throw e; });

  // Deleting a row must also break the chain.
  await db.$transaction(async tx => {
    const victim = await tx.auditLog.findFirstOrThrow({ orderBy: { id: "asc" }, skip: 60 });
    await tx.auditLog.delete({ where: { id: victim.id } });
    const after = await verifyChain(tx);
    if (!after.ok) ok("deleting a record is detected", after.reason);
    else bad("deletion detection", "chain still verified after a delete");
    throw new Error("__ROLLBACK__");
  }).catch(e => { if (!(e instanceof Error && e.message === "__ROLLBACK__")) throw e; });

  const finalChain = await verifyChain(db);
  if (finalChain.ok) ok("chain is intact after verification", `${finalChain.checked} records`);
  else bad("chain intact after verification", finalChain.reason);

  // -------------------------------------------------------------------------
  console.log("\n  6. Three-way match");
  // -------------------------------------------------------------------------
  const good = threeWayMatch({
    poLines: [{ poLineId: "L1", itemCode: "IT-LAP-0041", itemName: "Laptop", quantity: 12, unitPrice: 115500_00, lineTotal: 1386000_00 }],
    grnLines: [{ poLineId: "L1", quantityReceived: 12, quantityAccepted: 12 }],
    invoiceLines: [{ itemCode: "IT-LAP-0041", quantity: 12, unitPrice: 115500_00 }],
  });
  if (good.matched) ok("three-way match passes when all three agree");
  else bad("three-way match passes", good.failures.join("; "));

  const badMatch = threeWayMatch({
    poLines: [{ poLineId: "L1", itemCode: "IT-LAP-0041", itemName: "Laptop", quantity: 12, unitPrice: 115500_00, lineTotal: 1386000_00 }],
    grnLines: [{ poLineId: "L1", quantityReceived: 12, quantityAccepted: 11 }],
    invoiceLines: [{ itemCode: "IT-LAP-0041", quantity: 12, unitPrice: 115500_00 }],
  });
  if (!badMatch.matched) ok("three-way match fails on a quantity discrepancy", badMatch.failures[0]!);
  else bad("three-way match fails", "it passed");

  const seededMismatch = await db.invoice.findFirst({ where: { matchStatus: "MISMATCH" } });
  if (seededMismatch) ok("a failing invoice is seeded for the demo", seededMismatch.invoiceNo);
  else bad("seeded mismatch invoice", "none found");

  // -------------------------------------------------------------------------
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
