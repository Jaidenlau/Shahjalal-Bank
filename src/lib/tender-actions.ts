"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, assertCan, actorOf } from "./auth";
import { writeAudit } from "./audit";
import { startWorkflow, actOnWorkflow } from "./workflow";
import { tenderNo, nextTenderSeq } from "./docno";
import { num } from "./money";
import { toErrorPayload } from "./errors";
import {
  completeTechnicalEvaluation as completeTechEval,
  openFinancialEnvelope as openFinancial,
  listFinancialParts,
} from "./sealed-bids";
import type { ActionResult } from "./requisition-actions";

/**
 * Tender lifecycle.
 *
 * The two-envelope control lives in sealed-bids.ts, not here. These actions
 * call into it and surface what it returns; none of them reach for
 * BidFinancialPart directly.
 */

/** Convert one or more approved requisitions into a tender. */
export async function createTenderFromRequisitions(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "CREATE");

    const requisitionIds = JSON.parse(String(formData.get("requisitionIds") ?? "[]")) as string[];
    const title = String(formData.get("title") ?? "").trim();
    const method = String(formData.get("method") ?? "OTM");
    const envelopeSystem = String(formData.get("envelopeSystem") ?? "TWO");
    const closingDays = Number(formData.get("closingDays") ?? 14);
    const description = String(formData.get("description") ?? "").trim();
    const committees = JSON.parse(String(formData.get("committees") ?? "{}")) as Record<string, string[]>;

    if (requisitionIds.length === 0) return { ok: false, error: "Select at least one approved requisition." };
    if (!title) return { ok: false, error: "A tender title is required." };

    const result = await prisma.$transaction(async tx => {
      const reqs = await tx.requisition.findMany({
        where: { id: { in: requisitionIds } },
        include: { lines: { include: { item: true } } },
      });

      const notApproved = reqs.filter(r => r.status !== "APPROVED");
      if (notApproved.length > 0) {
        throw new Error(
          `Only approved requisitions can be converted to a tender. ${notApproved
            .map(r => `${r.requisitionNo} is ${r.status.toLowerCase().replace(/_/g, " ")}`)
            .join("; ")}.`,
        );
      }

      // Only the quantity routed to purchase is tendered. Stock already held
      // was never approved for procurement.
      const estimatedValue = reqs.reduce(
        (s, r) => s + r.lines.reduce((ls, l) => ls + l.quantityToPurchase * num(l.estimatedUnitPrice), 0),
        0,
      );

      const year = new Date().getFullYear();
      const seq = await nextTenderSeq(tx, year);
      const no = tenderNo(year, seq);
      const closingAt = new Date(Date.now() + closingDays * 86_400_000);

      const tender = await tx.tender.create({
        data: {
          tenderNo: no, title,
          description: description ||
            `Shahjalal Islami Bank PLC, Common Services Division, invites sealed tenders for ${title.toLowerCase()}.`,
          method, envelopeSystem, status: "PENDING_APPROVAL",
          estimatedValue, createdById: user.id, closingAt,
          requisitionLinks: { create: requisitionIds.map(id => ({ requisitionId: id })) },
        },
      });

      // Committees, as required by Annexure-B module 3.
      for (const [type, memberIds] of Object.entries(committees)) {
        if (!memberIds || memberIds.length === 0) continue;
        await tx.committee.create({
          data: {
            tenderId: tender.id, type,
            name: type === "PURCHASE" ? "Purchase Committee"
              : type === "OPENING" ? "Tender Opening Committee"
              : "Technical Evaluation Committee",
            members: { create: memberIds.map((userId, i) => ({ userId, isChair: i === 0 })) },
          },
        });
      }

      // Tender document sections.
      const sections: Array<[string, string, string]> = [
        ["NOTICE", "Tender Notice",
          `Shahjalal Islami Bank PLC, Common Services Division, Corporate Head Office, invites sealed tenders for ${title.toLowerCase()}.\n\n` +
          `Tenders must be submitted in two separate sealed parts, a technical offer and a financial offer, before the closing date and time. Late tenders will not be accepted.\n\n` +
          `The Bank reserves the right to accept or reject any or all tenders without assigning any reason.`],
        ["ELIGIBILITY", "Eligibility for Tender Participation",
          `1. The bidder must be enlisted with Shahjalal Islami Bank PLC.\n2. Valid trade licence, e-TIN and BIN/VAT registration.\n3. Valid authorised distributor or dealer certificate from the manufacturer for the offered brand.\n4. Supply experience with at least two corporate or financial-sector clients.\n5. Bank solvency certificate from a scheduled bank in Bangladesh.`],
        ["TECHNICAL_SPEC", "Technical Specification",
          reqs.flatMap(r => r.lines.filter(l => l.quantityToPurchase > 0).map(l =>
            `${l.item.name}\n  Code: ${l.item.code}\n  Quantity: ${l.quantityToPurchase} ${l.item.unitOfMeasure}\n` +
            (l.item.specification ? `  Specification: ${l.item.specification}\n` : ""))).join("\n") +
          `\nAll offered items must be new, unused and of the current production model.`],
        ["FINANCIAL_FORMAT", "Financial Offer Format",
          `The financial offer must be submitted in the prescribed format, in Bangladeshi Taka (BDT), quoting unit price excluding VAT, applicable VAT, and total price.\n\nPrices must remain valid for 90 (ninety) days from the date of tender opening. The financial offer must be submitted in a separate sealed envelope.`],
        ["SCOPE", "Scope of Work",
          `Supply, delivery to the addresses nominated by the Bank, unpacking, installation where applicable, and handover against a delivery challan, with warranty support for the period quoted.`],
        ["TERMS", "Terms and Conditions",
          `1. Delivery within the period quoted from the date of the work order.\n2. Payment after successful delivery and acceptance, subject to deduction of applicable VAT and AIT under prevailing government rules.\n3. 5% security money retained from the bill and released after the warranty period.\n4. Penalty of 1% of the work order value per week of delay, capped at 5%.\n5. The Bank is not bound to accept the lowest offer.`],
      ];
      for (const [i, [section, docTitle, content]] of sections.entries()) {
        await tx.tenderDocument.create({
          data: {
            tenderId: tender.id, section, title: docTitle, content,
            fileName: `${section.toLowerCase().replace(/_/g, "-")}.pdf`,
            fileSize: 80_000 + content.length * 40, sequence: i,
          },
        });
      }

      await tx.requisition.updateMany({
        where: { id: { in: requisitionIds } },
        data: { status: "CONVERTED_TO_TENDER" },
      });

      await writeAudit(tx, {
        entityType: "Tender", entityId: tender.id, entityLabel: no,
        action: "TENDER_CREATED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          tenderNo: no, title, method, envelopeSystem, estimatedValue,
          sourceRequisitions: reqs.map(r => r.requisitionNo),
          closingAt: closingAt.toISOString(),
        },
      });

      await startWorkflow(tx, {
        documentType: "TENDER", documentId: tender.id, documentLabel: no,
        facts: { amount: estimatedValue },
        initiatedBy: { id: user.id, fullName: user.fullName, roleName: user.roleName },
      });

      return { id: tender.id, no };
    });

    revalidatePath("/tenders");
    revalidatePath("/requisitions");
    return { ok: true, redirectTo: `/tenders/${result.id}`, message: `${result.no} created and sent for approval.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

export async function actOnTender(
  tenderId: string, action: "APPROVED" | "REJECTED" | "RETURNED", comments: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    const instance = await prisma.workflowInstance.findFirstOrThrow({
      where: { documentType: "TENDER", documentId: tenderId }, orderBy: { startedAt: "desc" },
    });

    await prisma.$transaction(async tx => {
      const result = await actOnWorkflow(tx, {
        instanceId: instance.id, documentLabel: tender.tenderNo,
        makerId: tender.createdById, makerName: "the tender's creator",
        actor: actorOf(user), action, comments,
      });
      if (result.instanceStatus === "APPROVED") {
        await tx.tender.update({ where: { id: tenderId }, data: { status: "DRAFT" } });
      } else if (result.instanceStatus === "REJECTED") {
        await tx.tender.update({ where: { id: tenderId }, data: { status: "CANCELLED" } });
      }
      await writeAudit(tx, {
        entityType: "Tender", entityId: tenderId, entityLabel: tender.tenderNo,
        action: `TENDER_${action}`,
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: { status: result.instanceStatus, comments },
      });
    });

    revalidatePath(`/tenders/${tenderId}`);
    return { ok: true, message: `Tender ${action.toLowerCase()}.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Publish an approved tender to the vendor portal. */
export async function publishTender(tenderId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "CREATE");
    await prisma.$transaction(async tx => {
      const t = await tx.tender.findUniqueOrThrow({ where: { id: tenderId } });
      if (t.status !== "DRAFT" && t.status !== "PENDING_APPROVAL") {
        throw new Error(`This tender is ${t.status.toLowerCase().replace(/_/g, " ")} and cannot be published again.`);
      }
      const now = new Date();
      await tx.tender.update({
        where: { id: tenderId },
        data: { status: "PUBLISHED", publishedAt: now, closingAt: t.closingAt ?? new Date(Date.now() + 14 * 86_400_000) },
      });
      await writeAudit(tx, {
        entityType: "Tender", entityId: tenderId, entityLabel: t.tenderNo,
        action: "TENDER_PUBLISHED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: t.status }, newValue: { status: "PUBLISHED", publishedAt: now.toISOString() },
      });

      // Notify enlisted vendors through the portal.
      const vendorUsers = await tx.vendorUser.findMany({ include: { vendor: true } });
      for (const vu of vendorUsers) {
        if (vu.vendor.enlistmentStatus !== "APPROVED") continue;
        await tx.notification.create({
          data: {
            userId: vu.userId, title: "New tender published",
            body: `${t.tenderNo} — ${t.title}. Closing ${(t.closingAt ?? now).toDateString()}.`,
            link: `/vendor/tenders/${tenderId}`,
          },
        });
      }
    });
    revalidatePath(`/tenders/${tenderId}`);
    revalidatePath("/tenders");
    return { ok: true, message: "Tender published to the vendor portal." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Close a published tender to further bids. */
export async function closeTender(tenderId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");
    await prisma.$transaction(async tx => {
      const t = await tx.tender.findUniqueOrThrow({
        where: { id: tenderId }, include: { bids: true },
      });
      if (t.status !== "PUBLISHED") {
        throw new Error(`Only a published tender can be closed. This tender is ${t.status.toLowerCase().replace(/_/g, " ")}.`);
      }
      const now = new Date();
      await tx.tender.update({ where: { id: tenderId }, data: { status: "CLOSED", closedAt: now } });
      await writeAudit(tx, {
        entityType: "Tender", entityId: tenderId, entityLabel: t.tenderNo,
        action: "TENDER_CLOSED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: "PUBLISHED" },
        newValue: { status: "CLOSED", closedAt: now.toISOString(), bidsReceived: t.bids.length },
      });
    });
    revalidatePath(`/tenders/${tenderId}`);
    return { ok: true, message: "Tender closed. Technical envelopes may now be opened." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Open a technical envelope. Financial envelopes are untouched by this. */
export async function openTechnicalEnvelope(bidId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");
    await prisma.$transaction(async tx => {
      const bid = await tx.bid.findUniqueOrThrow({
        where: { id: bidId },
        include: { vendor: true, tender: true, technicalPart: true },
      });
      if (bid.tender.status === "PUBLISHED") {
        throw new Error("The tender has not closed yet. Technical envelopes cannot be opened before the closing date.");
      }
      if (!bid.technicalPart) throw new Error("No technical offer was submitted for this bid.");
      if (bid.technicalPart.openedAt) return;

      await tx.bidTechnicalPart.update({
        where: { bidId }, data: { openedAt: new Date(), openedById: user.id },
      });
      if (bid.tender.status === "CLOSED") {
        await tx.tender.update({ where: { id: bid.tenderId }, data: { status: "TECHNICAL_EVALUATION" } });
      }
      await writeAudit(tx, {
        entityType: "BidTechnicalPart", entityId: bidId,
        entityLabel: `${bid.tender.tenderNo} — ${bid.vendor.companyName}`,
        action: "TECHNICAL_ENVELOPE_OPENED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: { vendor: bid.vendor.companyName, openedBy: user.fullName, financialEnvelope: "REMAINS SEALED" },
      });
    });
    revalidatePath(`/tenders/${(await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).tenderId}`);
    return { ok: true, message: "Technical envelope opened. The financial envelope remains sealed." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/**
 * Attempt to open a financial envelope.
 * Refuses while the seal is on — this is the demo's second big moment.
 */
export async function openFinancialEnvelopeAction(bidId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");
    const bid = await prisma.bid.findUniqueOrThrow({ where: { id: bidId } });
    await openFinancial(bidId, { id: user.id, fullName: user.fullName, roleName: user.roleName });
    revalidatePath(`/tenders/${bid.tenderId}`);
    return { ok: true, message: "Financial envelope opened." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Qualify or disqualify a bid on technical grounds. */
export async function evaluateBid(
  bidId: string, qualified: boolean, score: number, comments: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");
    const bid = await prisma.bid.findUniqueOrThrow({
      where: { id: bidId }, include: { vendor: true, tender: true, technicalPart: true },
    });

    await prisma.$transaction(async tx => {
      if (!bid.technicalPart?.openedAt) {
        throw new Error("The technical envelope must be opened before this bid can be evaluated.");
      }
      await tx.bid.update({
        where: { id: bidId },
        data: {
          status: qualified ? "TECHNICAL_QUALIFIED" : "TECHNICAL_DISQUALIFIED",
          technicalScore: score, evaluationComments: comments, evaluatedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        entityType: "Bid", entityId: bidId,
        entityLabel: `${bid.tender.tenderNo} — ${bid.vendor.companyName}`,
        action: qualified ? "BID_TECHNICALLY_QUALIFIED" : "BID_TECHNICALLY_DISQUALIFIED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: bid.status },
        newValue: {
          status: qualified ? "TECHNICAL_QUALIFIED" : "TECHNICAL_DISQUALIFIED",
          technicalScore: score, comments,
          financialOffer: "NOT READ — still sealed at time of technical decision",
        },
      });
    });

    revalidatePath(`/tenders/${bid.tenderId}`);
    revalidatePath(`/tenders/${bid.tenderId}/evaluation`);
    return { ok: true, message: `${bid.vendor.companyName} ${qualified ? "qualified" : "disqualified"}.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Complete technical evaluation, which lifts the seal. */
export async function completeTechnicalEvaluationAction(tenderId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");
    await completeTechEval(tenderId, { id: user.id, fullName: user.fullName, roleName: user.roleName });
    revalidatePath(`/tenders/${tenderId}`);
    revalidatePath(`/tenders/${tenderId}/evaluation`);
    return { ok: true, message: "Technical evaluation completed. Financial envelopes are now unsealed." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Generate the ranked comparative statement. */
export async function generateComparativeStatement(tenderId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");

    const parts = await listFinancialParts(tenderId);
    if (parts.some(p => p.sealed)) {
      return {
        ok: false,
        error: "A comparative statement cannot be generated while financial offers remain sealed. Complete the technical evaluation first.",
        control: "Two-Envelope Seal", layer: "DATA_ACCESS",
      };
    }

    const bids = await prisma.bid.findMany({
      where: { tenderId }, include: { vendor: true },
    });

    const rows = parts
      .filter((p): p is Extract<typeof p, { sealed: false }> => !p.sealed)
      .map(p => {
        const bid = bids.find(b => b.id === p.bidId)!;
        return {
          vendorId: p.vendorId, vendorName: p.vendorName,
          technicalResult: bid.status,
          technicalScore: bid.technicalScore ?? null,
          financialTotal: p.totalAmount,
          eligible: bid.status === "TECHNICAL_QUALIFIED" || bid.status === "AWARDED",
          evaluationComments: bid.evaluationComments ?? "",
        };
      });

    // Only technically qualified bids are ranked. RFQ clause 1.9: only
    // technically qualified bidders proceed to financial evaluation.
    const eligible = rows.filter(r => r.eligible).sort((a, b) => a.financialTotal - b.financialTotal);
    const ranked = rows.map(r => ({
      ...r,
      rank: r.eligible ? eligible.findIndex(e => e.vendorId === r.vendorId) + 1 : null,
    }));

    const lowest = eligible[0];
    const overall = rows.slice().sort((a, b) => a.financialTotal - b.financialTotal)[0];
    const recommendation = lowest
      ? `Award recommended to ${lowest.vendorName} at the lowest evaluated price among technically qualified bidders.` +
        (overall && overall.vendorId !== lowest.vendorId
          ? ` ${overall.vendorName} submitted a lower price but was technically disqualified, and under RFQ clause 1.10 the Bank is not bound to accept the lowest offer.`
          : "")
      : "No technically qualified bid is available for award.";

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });

    await prisma.$transaction(async tx => {
      await tx.comparativeStatement.create({
        data: {
          tenderId, generatedById: user.id,
          rows: JSON.stringify(ranked), recommendation,
        },
      });
      await writeAudit(tx, {
        entityType: "ComparativeStatement", entityId: tenderId, entityLabel: tender.tenderNo,
        action: "COMPARATIVE_STATEMENT_GENERATED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          ranked: ranked.map(r => `${r.rank ?? "—"}. ${r.vendorName} ${r.financialTotal}`),
          recommendation,
        },
      });
    });

    revalidatePath(`/tenders/${tenderId}/comparative-statement`);
    return { ok: true, message: "Comparative statement generated." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Award the tender to a technically qualified bidder. */
export async function awardTender(tenderId: string, bidId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "TENDER", "EVALUATE");

    await prisma.$transaction(async tx => {
      const bid = await tx.bid.findUniqueOrThrow({
        where: { id: bidId }, include: { vendor: true, tender: true },
      });
      if (!bid.tender.technicalEvaluationCompletedAt) {
        throw new Error("A tender cannot be awarded before its technical evaluation is complete.");
      }
      if (bid.status === "TECHNICAL_DISQUALIFIED") {
        throw new Error(
          `${bid.vendor.companyName} was technically disqualified and cannot be awarded this tender, whatever price was offered.`,
        );
      }

      await tx.bid.update({ where: { id: bidId }, data: { status: "AWARDED" } });
      await tx.tender.update({
        where: { id: tenderId },
        data: { status: "AWARDED", awardedAt: new Date(), awardedBidId: bidId },
      });
      await writeAudit(tx, {
        entityType: "Tender", entityId: tenderId, entityLabel: bid.tender.tenderNo,
        action: "TENDER_AWARDED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: bid.tender.status },
        newValue: { status: "AWARDED", awardedTo: bid.vendor.companyName },
      });

      const vu = await tx.vendorUser.findFirst({ where: { vendorId: bid.vendorId } });
      if (vu) {
        await tx.notification.create({
          data: {
            userId: vu.userId, title: "Notification of Award",
            body: `Your offer for ${bid.tender.tenderNo} — ${bid.tender.title} has been accepted. A work order will follow.`,
            link: `/vendor/tenders/${tenderId}`,
          },
        });
      }
    });

    revalidatePath(`/tenders/${tenderId}`);
    return { ok: true, message: "Tender awarded. A work order can now be issued." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}
