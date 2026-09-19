import { prisma } from "./db";
import type { Tx } from "./db";
import { writeAudit } from "./audit";
import { num } from "./money";
import { matchRule } from "./shariah-types";
import type { ScreenTarget, ScreenHit } from "./shariah-types";
export * from "./shariah-types";

/**
 * SHARIAH GOVERNANCE FOR PROCUREMENT
 *
 * Shahjalal Islami Bank PLC is a Shariah-based bank. Its RFQ, Annexure-A and
 * Annexure-B do not mention Shariah anywhere, because the specification was
 * written by the IT Division as a general procurement specification. That gap
 * is not a reason to ignore it: procurement at an Islami bank is subject to
 * the Bank's Shariah Supervisory Committee like everything else it does.
 *
 * THE DESIGN POSITION, WHICH MATTERS MORE THAN THE CODE
 *
 * This module contains no fiqh. It does not decide what is or is not
 * permissible, and neither the vendor who wrote it nor the software is
 * competent to. What it does:
 *
 *   1. Holds the rules the Bank's OWN Shariah Supervisory Committee issues,
 *      as editable records with the Committee's decision reference attached.
 *   2. Applies those rules mechanically to procurement documents.
 *   3. Routes what they catch to the Committee for a human decision, and
 *      records that decision against the document permanently.
 *
 * Every screening outcome is therefore traceable to a Committee decision, not
 * to a judgement made by this system. A flag is a question put to the
 * Committee, never an answer given on its behalf. That distinction is the
 * whole point: it is what makes the feature honest rather than presumptuous,
 * and it is what the Committee itself would require.
 */

/** Collect every document the rules run against. */
export async function collectTargets(client: Tx = prisma): Promise<ScreenTarget[]> {
  const targets: ScreenTarget[] = [];

  const vendors = await client.vendor.findMany({ include: { categories: true } });
  for (const v of vendors) {
    targets.push({
      documentType: "Vendor",
      documentId: v.id,
      documentLabel: v.companyName,
      text: [v.companyName, v.address, ...v.categories.map(c => c.category)].join(" | "),
    });
  }

  const contracts = await client.contract.findMany({ include: { vendor: true } });
  for (const c of contracts) {
    targets.push({
      documentType: "Contract",
      documentId: c.id,
      documentLabel: `${c.contractNo} — ${c.title}`,
      text: [c.contractNo, c.title, c.type, c.slaTerms, c.vendor.companyName].join(" | "),
      amount: num(c.value),
    });
  }

  const pos = await client.purchaseOrder.findMany({
    where: { status: { not: "DRAFT" } },
    include: { vendor: true, lines: { include: { item: true } } },
  });
  for (const p of pos) {
    targets.push({
      documentType: "PurchaseOrder",
      documentId: p.id,
      documentLabel: p.poNo,
      text: [p.poNo, p.deliveryTerms, p.vendor.companyName, ...p.lines.map(l => l.item.name)].join(" | "),
      amount: num(p.totalAmount),
    });
  }

  return targets;
}

export interface ScreeningResult {
  screened: number;
  hits: ScreenHit[];
  opened: number;
  /** Flags that existed but whose rule no longer matches. */
  resolved: number;
}

/**
 * Re-run every active rule over every document.
 *
 * Flags are keyed on (rule, document), so re-running is idempotent: an
 * unchanged document against an unchanged rule keeps the flag it already has,
 * including any decision the Committee already recorded against it.
 */
export async function runScreening(
  actor: { id: string; fullName: string; roleName: string },
): Promise<ScreeningResult> {
  return prisma.$transaction(async tx => {
    const rules = await tx.shariahRule.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
    const targets = await collectTargets(tx);

    const hits: ScreenHit[] = [];
    for (const t of targets) {
      for (const r of rules) {
        const hit = matchRule(r, t);
        if (hit) hits.push(hit);
      }
    }

    const existing = await tx.shariahFlag.findMany();
    const key = (ruleId: string, type: string, id: string) => `${ruleId}␟${type}␟${id}`;
    const hitKeys = new Set(hits.map(h => key(h.ruleId, h.target.documentType, h.target.documentId)));
    const existingKeys = new Set(existing.map((f: { ruleId: string; documentType: string; documentId: string }) => key(f.ruleId, f.documentType, f.documentId)));

    let opened = 0;
    for (const h of hits) {
      if (existingKeys.has(key(h.ruleId, h.target.documentType, h.target.documentId))) continue;
      await tx.shariahFlag.create({
        data: {
          ruleId: h.ruleId,
          documentType: h.target.documentType,
          documentId: h.target.documentId,
          documentLabel: h.target.documentLabel,
          severity: h.severity,
          detail: h.detail,
        },
      });
      opened += 1;
    }

    // A flag whose rule no longer matches is withdrawn rather than deleted, so
    // the Committee can still see that it was once raised.
    let resolved = 0;
    for (const f of existing) {
      if (hitKeys.has(key(f.ruleId, f.documentType, f.documentId))) continue;
      if (f.status === "OPEN") {
        await tx.shariahFlag.update({ where: { id: f.id }, data: { status: "CLEARED" } });
        resolved += 1;
      }
    }

    await writeAudit(tx, {
      entityType: "ShariahScreening",
      entityId: "screening",
      entityLabel: "Shariah screening run",
      action: "SHARIAH_SCREENING_RUN",
      performedById: actor.id,
      performedByName: actor.fullName,
      performedByRole: actor.roleName,
      newValue: {
        rulesApplied: rules.length,
        documentsScreened: targets.length,
        flagsRaised: opened,
        flagsWithdrawn: resolved,
      },
    });

    return { screened: targets.length, hits, opened, resolved };
  });
}

// ---------------------------------------------------------------------------
// COMMITTEE DECISIONS
// ---------------------------------------------------------------------------

export class ShariahAuthorityError extends Error {
  readonly control = "SHARIAH_COMMITTEE_ONLY";
  readonly layer = "Business rule, inside the decision transaction";
  readonly detail: Record<string, unknown>;
  constructor(message: string, detail: Record<string, unknown>) {
    super(message);
    this.name = "ShariahAuthorityError";
    this.detail = detail;
  }
}

/**
 * Record a Shariah Supervisory Committee decision on a document.
 *
 * Only a member of the Committee may do this. That is not a UI restriction:
 * an administrator pressing this on the Committee's behalf would make the
 * record worthless, so the check is here, inside the transaction that writes
 * the decision.
 */
export async function recordShariahDecision(args: {
  documentType: string;
  documentId: string;
  documentLabel: string;
  structure: string;
  decision: "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REFERRED_BACK";
  conditions: string;
  reference: string;
  actor: { id: string; fullName: string; roleName: string; roleCodes: string[] };
}) {
  const { actor } = args;

  if (!actor.roleCodes.includes("SHARIAH")) {
    throw new ShariahAuthorityError(
      `Only a member of the Shariah Supervisory Committee may record a Shariah decision. ` +
        `${actor.fullName} holds the role ${actor.roleName}, which does not sit on the Committee. ` +
        `A Shariah decision recorded by anyone else would not be a decision of the Committee.`,
      {
        attemptedBy: actor.fullName,
        attemptedByRole: actor.roleName,
        requiredRole: "Shariah Supervisory Committee",
        document: args.documentLabel,
      },
    );
  }

  if (args.decision === "APPROVED_WITH_CONDITIONS" && !args.conditions.trim()) {
    throw new ShariahAuthorityError(
      "An approval with conditions must state the conditions. The conditions are what the supplier is bound to.",
      { document: args.documentLabel },
    );
  }

  return prisma.$transaction(async tx => {
    const previous = await tx.shariahReview.findUnique({
      where: { documentType_documentId: { documentType: args.documentType, documentId: args.documentId } },
    });

    const review = await tx.shariahReview.upsert({
      where: { documentType_documentId: { documentType: args.documentType, documentId: args.documentId } },
      create: {
        documentType: args.documentType,
        documentId: args.documentId,
        documentLabel: args.documentLabel,
        structure: args.structure,
        decision: args.decision,
        conditions: args.conditions,
        reference: args.reference,
        decidedAt: new Date(),
        decidedById: actor.id,
        decidedByName: actor.fullName,
      },
      update: {
        structure: args.structure,
        decision: args.decision,
        conditions: args.conditions,
        reference: args.reference,
        decidedAt: new Date(),
        decidedById: actor.id,
        decidedByName: actor.fullName,
      },
    });

    // Attach the document's open flags to this decision and close them.
    await tx.shariahFlag.updateMany({
      where: { documentType: args.documentType, documentId: args.documentId, status: "OPEN" },
      data: { reviewId: review.id, status: args.decision === "REFERRED_BACK" ? "UPHELD" : "CLEARED" },
    });

    // Carry the structure onto the document itself so it prints on the record.
    if (args.documentType === "Contract") {
      await tx.contract.update({ where: { id: args.documentId }, data: { shariahStructure: args.structure } });
    } else if (args.documentType === "PurchaseOrder") {
      await tx.purchaseOrder.update({ where: { id: args.documentId }, data: { shariahStructure: args.structure } });
    } else if (args.documentType === "Vendor") {
      await tx.vendor.update({
        where: { id: args.documentId },
        data: {
          shariahStatus: args.decision === "REFERRED_BACK" ? "PROHIBITED" : "PERMITTED",
          shariahNote: args.conditions || args.reference,
          shariahScreenedAt: new Date(),
        },
      });
    }

    await writeAudit(tx, {
      entityType: "ShariahReview",
      entityId: review.id,
      entityLabel: args.documentLabel,
      action: "SHARIAH_DECISION_RECORDED",
      performedById: actor.id,
      performedByName: actor.fullName,
      performedByRole: actor.roleName,
      previousValue: previous
        ? { decision: previous.decision, structure: previous.structure, conditions: previous.conditions }
        : { decision: "None recorded", structure: "NOT_ASSESSED" },
      newValue: {
        decision: args.decision,
        structure: args.structure,
        conditions: args.conditions,
        committeeReference: args.reference,
        decidedBy: actor.fullName,
      },
    });

    return review;
  });
}
