import { prisma } from "./db";
import type { Tx } from "./db";
import { FinancialSealedError } from "./errors";
import { writeAudit } from "./audit";

/**
 * TWO-ENVELOPE TENDERING — THE SEAL
 *
 * The bank's own tender document, RFQ clause 1.9, states:
 *   "Only technically qualified bidders will proceed to financial evaluation."
 *
 * This module is the ONLY path in the application that reads BidFinancialPart.
 * Every read goes through a check against the parent tender's
 * technicalEvaluationCompletedAt. While that is null, the amounts are not
 * returned to the caller at all — not filtered in the UI, not hidden with CSS,
 * not returned-and-ignored. The data does not leave this layer.
 *
 * This matters for the demo because the control has to be real when a bank IT
 * reviewer asks how it is enforced. The honest answer is: at the data access
 * layer, and there is no route around it, including for an administrator.
 *
 * Route handlers and components must import from here. Direct
 * `prisma.bidFinancialPart.findMany(...)` calls elsewhere are a defect;
 * `npm run check:seal` fails the build if any exist.
 */

export interface SealedSummary {
  bidId: string;
  vendorId: string;
  vendorName: string;
  sealed: true;
  submittedAt: Date | null;
  /** Size of the sealed envelope, so the UI can prove something is there. */
  documentCount: number;
  digest: string;
}

export interface OpenFinancialPart {
  bidId: string;
  vendorId: string;
  vendorName: string;
  sealed: false;
  totalAmount: number; // poisha
  currency: string;
  lineItems: Array<{ itemCode: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  submittedAt: Date | null;
  openedAt: Date | null;
  openedByName: string | null;
}

export type FinancialPartView = SealedSummary | OpenFinancialPart;

/** Is the seal on this tender lifted? */
export async function isFinancialUnlocked(tenderId: string, client: Tx = prisma): Promise<boolean> {
  const t = await client.tender.findUnique({
    where: { id: tenderId },
    select: { technicalEvaluationCompletedAt: true },
  });
  return Boolean(t?.technicalEvaluationCompletedAt);
}

/**
 * Read financial parts for a tender.
 *
 * While the tender's technical evaluation is incomplete this returns sealed
 * summaries with no amounts. It never throws, because the tender detail screen
 * legitimately needs to show that sealed envelopes exist.
 */
export async function listFinancialParts(tenderId: string, client: Tx = prisma): Promise<FinancialPartView[]> {
  const tender = await client.tender.findUnique({
    where: { id: tenderId },
    select: { id: true, tenderNo: true, technicalEvaluationCompletedAt: true },
  });
  if (!tender) return [];

  const unlocked = Boolean(tender.technicalEvaluationCompletedAt);

  const bids = await client.bid.findMany({
    where: { tenderId },
    include: {
      vendor: { select: { id: true, companyName: true } },
      financialPart: true,
    },
    orderBy: { vendor: { companyName: "asc" } },
  });

  return bids
    .filter(b => b.financialPart)
    .map((b): FinancialPartView => {
      const fp = b.financialPart!;
      if (!unlocked) {
        // Amounts are deliberately not read into the returned object.
        let documentCount = 0;
        try { documentCount = (JSON.parse(fp.documents) as unknown[]).length; } catch { documentCount = 0; }
        return {
          bidId: b.id,
          vendorId: b.vendor.id,
          vendorName: b.vendor.companyName,
          sealed: true,
          submittedAt: fp.submittedAt,
          documentCount,
          // A stable identifier for the envelope that reveals nothing about its contents.
          digest: fp.id.slice(-8).toUpperCase(),
        };
      }
      let lineItems: OpenFinancialPart["lineItems"] = [];
      try { lineItems = JSON.parse(fp.lineItems); } catch { lineItems = []; }
      return {
        bidId: b.id,
        vendorId: b.vendor.id,
        vendorName: b.vendor.companyName,
        sealed: false,
        totalAmount: fp.totalAmount,
        currency: fp.currency,
        lineItems,
        submittedAt: fp.submittedAt,
        openedAt: fp.openedAt,
        openedByName: null,
      };
    });
}

/**
 * Read ONE financial part, with intent to see the amount.
 *
 * This is what the "open financial envelope" button calls. Unlike the list
 * above, this REFUSES while the seal is on, because the caller is explicitly
 * asking to read a sealed amount. That refusal is the moment the demo shows.
 */
export async function readFinancialPart(bidId: string, client: Tx = prisma): Promise<OpenFinancialPart> {
  const bid = await client.bid.findUnique({
    where: { id: bidId },
    include: {
      vendor: { select: { id: true, companyName: true } },
      tender: { select: { id: true, tenderNo: true, title: true, technicalEvaluationCompletedAt: true, status: true } },
      financialPart: true,
    },
  });

  if (!bid || !bid.financialPart) {
    throw new Error("No financial offer has been submitted for this bid.");
  }

  if (!bid.tender.technicalEvaluationCompletedAt) {
    throw new FinancialSealedError({
      tender: bid.tender.tenderNo,
      vendor: bid.vendor.companyName,
      envelope: bid.financialPart.id.slice(-8).toUpperCase(),
      technicalEvaluationStatus: "Not completed",
      unlocksWhen: "Technical Evaluation Committee completes and signs off the technical evaluation",
    });
  }

  const fp = bid.financialPart;
  let lineItems: OpenFinancialPart["lineItems"] = [];
  try { lineItems = JSON.parse(fp.lineItems); } catch { lineItems = []; }

  let openedByName: string | null = null;
  if (fp.openedById) {
    const u = await client.user.findUnique({ where: { id: fp.openedById }, select: { fullName: true } });
    openedByName = u?.fullName ?? null;
  }

  return {
    bidId: bid.id,
    vendorId: bid.vendor.id,
    vendorName: bid.vendor.companyName,
    sealed: false,
    totalAmount: fp.totalAmount,
    currency: fp.currency,
    lineItems,
    submittedAt: fp.submittedAt,
    openedAt: fp.openedAt,
    openedByName,
  };
}

/**
 * Record the physical act of opening a financial envelope. Refuses while
 * sealed, writes an audit row when it succeeds.
 */
export async function openFinancialEnvelope(
  bidId: string,
  actor: { id: string; fullName: string; roleName: string },
): Promise<OpenFinancialPart> {
  return prisma.$transaction(async tx => {
    const view = await readFinancialPart(bidId, tx); // throws if sealed

    const bid = await tx.bid.findUniqueOrThrow({
      where: { id: bidId },
      include: { tender: { select: { tenderNo: true } }, vendor: { select: { companyName: true } } },
    });

    const already = await tx.bidFinancialPart.findUnique({ where: { bidId } });
    if (already && !already.openedAt) {
      await tx.bidFinancialPart.update({
        where: { bidId },
        data: { openedAt: new Date(), openedById: actor.id },
      });
      await writeAudit(tx, {
        entityType: "BidFinancialPart",
        entityId: bidId,
        entityLabel: `${bid.tender.tenderNo} — ${bid.vendor.companyName}`,
        action: "FINANCIAL_ENVELOPE_OPENED",
        performedById: actor.id,
        performedByName: actor.fullName,
        performedByRole: actor.roleName,
        newValue: { vendor: bid.vendor.companyName, totalAmount: view.totalAmount, openedBy: actor.fullName },
      });
    }

    return { ...view, openedAt: already?.openedAt ?? new Date(), openedByName: actor.fullName };
  });
}

/**
 * Complete technical evaluation and lift the seal.
 * Requires every bid to have been evaluated first, which is what makes the
 * unlock an outcome of the process rather than a button someone can just press.
 */
export async function completeTechnicalEvaluation(
  tenderId: string,
  actor: { id: string; fullName: string; roleName: string },
) {
  return prisma.$transaction(async tx => {
    const tender = await tx.tender.findUniqueOrThrow({
      where: { id: tenderId },
      include: { bids: { include: { vendor: { select: { companyName: true } } } } },
    });

    if (tender.technicalEvaluationCompletedAt) {
      return { alreadyComplete: true, tender };
    }

    const unevaluated = tender.bids.filter(b => b.status === "SUBMITTED");
    if (unevaluated.length > 0) {
      throw new Error(
        `Technical evaluation cannot be completed. ${unevaluated.length} bid(s) still await a qualify or disqualify decision: ${unevaluated
          .map(b => b.vendor.companyName)
          .join(", ")}.`,
      );
    }

    const now = new Date();
    const updated = await tx.tender.update({
      where: { id: tenderId },
      data: {
        technicalEvaluationCompletedAt: now,
        technicalEvaluationCompletedById: actor.id,
        status: "FINANCIAL_EVALUATION",
      },
    });

    await writeAudit(tx, {
      entityType: "Tender",
      entityId: tenderId,
      entityLabel: tender.tenderNo,
      action: "TECHNICAL_EVALUATION_COMPLETED",
      performedById: actor.id,
      performedByName: actor.fullName,
      performedByRole: actor.roleName,
      previousValue: { status: tender.status, technicalEvaluationCompletedAt: null, financialEnvelopes: "SEALED" },
      newValue: {
        status: "FINANCIAL_EVALUATION",
        technicalEvaluationCompletedAt: now.toISOString(),
        financialEnvelopes: "UNSEALED",
        qualified: tender.bids.filter(b => b.status === "TECHNICAL_QUALIFIED").map(b => b.vendor.companyName),
        disqualified: tender.bids.filter(b => b.status === "TECHNICAL_DISQUALIFIED").map(b => b.vendor.companyName),
      },
    });

    return { alreadyComplete: false, tender: updated };
  });
}
