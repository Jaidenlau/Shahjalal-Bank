"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireVendorUser } from "./auth";
import { writeAudit } from "./audit";
import { num } from "./money";
import { toErrorPayload } from "./errors";
import type { ActionResult } from "./requisition-actions";

/**
 * Vendor portal actions.
 *
 * Every one of these re-derives the vendor from the session rather than
 * trusting an id from the form, so a bidder cannot act on another bidder's
 * behalf by editing a request.
 */

export async function submitIntentionToBid(tenderId: string): Promise<ActionResult> {
  const user = await requireVendorUser();
  try {
    if (!user.vendorId) return { ok: false, error: "This login is not linked to a vendor record." };

    await prisma.$transaction(async tx => {
      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: user.vendorId! } });
      if (vendor.enlistmentStatus !== "APPROVED") {
        throw new Error("Your enlistment is not approved, so you cannot register an intention to bid.");
      }
      if (vendor.tradeLicenseExpiry < new Date()) {
        throw new Error("Your trade licence has expired. Renew it before participating in a tender.");
      }

      const tender = await tx.tender.findUniqueOrThrow({ where: { id: tenderId } });
      if (tender.status !== "PUBLISHED") {
        throw new Error("This tender is not open for bidding.");
      }

      const existing = await tx.bid.findFirst({ where: { tenderId, vendorId: user.vendorId! } });
      if (existing) return;

      await tx.bid.create({
        data: { tenderId, vendorId: user.vendorId!, status: "SUBMITTED", intentionToBidAt: new Date() },
      });

      await writeAudit(tx, {
        entityType: "Bid", entityId: tenderId,
        entityLabel: `${tender.tenderNo} — ${vendor.companyName}`,
        action: "INTENTION_TO_BID_REGISTERED",
        performedById: null, performedByName: vendor.companyName, performedByRole: "Vendor",
        ipAddress: "203.112.18.44",
        newValue: { tender: tender.tenderNo, vendor: vendor.companyName },
      });
    });

    revalidatePath(`/vendor/tenders/${tenderId}`);
    return { ok: true, message: "Intention to bid registered." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/**
 * Submit the technical part of a bid.
 * Independent of the financial part, which is the whole point of two envelopes.
 */
export async function submitTechnicalOffer(tenderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireVendorUser();
  try {
    if (!user.vendorId) return { ok: false, error: "This login is not linked to a vendor record." };
    const content = String(formData.get("content") ?? "").trim();
    const documents = JSON.parse(String(formData.get("documents") ?? "[]")) as string[];
    if (!content) return { ok: false, error: "A technical offer narrative is required." };

    await prisma.$transaction(async tx => {
      const tender = await tx.tender.findUniqueOrThrow({ where: { id: tenderId } });
      if (tender.status !== "PUBLISHED") throw new Error("This tender is closed to submissions.");

      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: user.vendorId! } });
      const bid = await tx.bid.upsert({
        where: { tenderId_vendorId: { tenderId, vendorId: user.vendorId! } },
        create: { tenderId, vendorId: user.vendorId!, status: "SUBMITTED", submittedAt: new Date() },
        update: { submittedAt: new Date() },
      });

      await tx.bidTechnicalPart.upsert({
        where: { bidId: bid.id },
        create: {
          bidId: bid.id, content,
          documents: JSON.stringify(documents.map(f => ({ fileName: f, fileSize: 420_000 }))),
          submittedAt: new Date(),
        },
        update: {
          content,
          documents: JSON.stringify(documents.map(f => ({ fileName: f, fileSize: 420_000 }))),
          submittedAt: new Date(),
        },
      });

      await writeAudit(tx, {
        entityType: "BidTechnicalPart", entityId: bid.id,
        entityLabel: `${tender.tenderNo} — ${vendor.companyName}`,
        action: "TECHNICAL_OFFER_SUBMITTED",
        performedById: null, performedByName: vendor.companyName, performedByRole: "Vendor",
        ipAddress: "203.112.18.44",
        newValue: { documents: documents.length, submittedAt: new Date().toISOString() },
      });
    });

    revalidatePath(`/vendor/tenders/${tenderId}`);
    revalidatePath(`/vendor/tenders/${tenderId}/submit`);
    return { ok: true, message: "Technical offer submitted." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/**
 * Submit the financial part. Sealed on receipt.
 *
 * The bidder is told plainly that once submitted, the amount is not readable
 * by the bank until technical evaluation completes — which is the reassurance
 * that makes a two-envelope process worth having from the bidder's side too.
 */
export async function submitFinancialOffer(tenderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireVendorUser();
  try {
    if (!user.vendorId) return { ok: false, error: "This login is not linked to a vendor record." };

    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<{
      itemCode: string; itemName: string; quantity: number; unitPrice: number;
    }>;
    if (lines.length === 0) return { ok: false, error: "Quote a price for at least one line." };
    const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (total <= 0) return { ok: false, error: "The quoted total must be greater than zero." };

    await prisma.$transaction(async tx => {
      const tender = await tx.tender.findUniqueOrThrow({ where: { id: tenderId } });
      if (tender.status !== "PUBLISHED") throw new Error("This tender is closed to submissions.");

      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: user.vendorId! } });
      const bid = await tx.bid.upsert({
        where: { tenderId_vendorId: { tenderId, vendorId: user.vendorId! } },
        create: { tenderId, vendorId: user.vendorId!, status: "SUBMITTED", submittedAt: new Date() },
        update: { submittedAt: new Date() },
      });

      await tx.bidFinancialPart.upsert({
        where: { bidId: bid.id },
        create: {
          bidId: bid.id, totalAmount: total,
          lineItems: JSON.stringify(lines.map(l => ({ ...l, lineTotal: l.quantity * l.unitPrice }))),
          documents: JSON.stringify([{ fileName: "financial-offer.pdf", fileSize: 312_000 }]),
          sealedUntilTechnicalComplete: true, submittedAt: new Date(),
        },
        update: {
          totalAmount: total,
          lineItems: JSON.stringify(lines.map(l => ({ ...l, lineTotal: l.quantity * l.unitPrice }))),
          submittedAt: new Date(),
        },
      });

      // The audit row records that a financial offer arrived and was sealed.
      // It deliberately does NOT record the amount: an audit trail readable by
      // bank staff would otherwise be a way around the seal.
      await writeAudit(tx, {
        entityType: "BidFinancialPart", entityId: bid.id,
        entityLabel: `${tender.tenderNo} — ${vendor.companyName}`,
        action: "FINANCIAL_OFFER_SUBMITTED",
        performedById: null, performedByName: vendor.companyName, performedByRole: "Vendor",
        ipAddress: "203.112.18.44",
        newValue: {
          status: "SEALED",
          lines: lines.length,
          amount: "WITHHELD — sealed until technical evaluation completes",
          submittedAt: new Date().toISOString(),
        },
      });
    });

    revalidatePath(`/vendor/tenders/${tenderId}`);
    revalidatePath(`/vendor/tenders/${tenderId}/submit`);
    return { ok: true, message: "Financial offer submitted and sealed." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}
