import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "../../src/lib/audit";
import { num } from "../../src/lib/money";
import { daysAgo, int, pick, chance } from "./rng";

/**
 * Historical audit backfill.
 *
 * Rows are generated from the documents that were actually seeded, then sorted
 * into chronological order and written one at a time so the hash chain is
 * genuinely valid end to end. The "Verify integrity" button on the audit
 * viewer recomputes every hash, so a shortcut here would fail visibly on stage.
 *
 * Volume matters: an audit viewer showing twenty rows reads as a prototype.
 */

interface PendingRow {
  timestamp: Date;
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: string;
  performedById: string | null;
  performedByName: string;
  performedByRole: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress: string;
}

const IPS = ["10.10.4.18", "10.10.4.22", "10.10.4.37", "10.10.6.11", "10.10.6.45", "10.20.1.14", "10.20.3.9"];

export async function seedAudit(
  db: PrismaClient,
  users: Record<string, { id: string; fullName: string }>,
) {
  const rows: PendingRow[] = [];

  const roleOf: Record<string, string> = {
    "Rezaul Karim": "Requisition Initiator",
    "Farhana Akter": "Department Head",
    "Shahidul Islam": "Procurement Executive",
    "Tanvir Ahmed": "Technical Evaluation Committee",
    "Nasrin Sultana": "Finance Officer",
    "Mizanur Rahman": "System Administrator",
    "Abdul Mannan": "Managing Director",
    "Kamrun Nahar": "Finance Manager",
    "Golam Mostafa": "Chief Financial Officer",
    "Sharmin Akhter": "Technical Evaluation Committee",
    "Rakibul Hasan": "Store Keeper",
    "Nusrat Jahan": "Requisition Initiator",
    "Sabbir Ahmed": "Requisition Initiator",
    "Tahmina Begum": "Requisition Initiator",
    "Imran Hossain": "Requisition Initiator",
    "Shafiqul Alam": "Department Head",
  };

  const actor = (name: string) => ({
    id: users[name]?.id ?? null,
    performedByName: name,
    performedByRole: roleOf[name] ?? "Officer",
  });

  // --- Requisition lifecycle ----------------------------------------------
  const requisitions = await db.requisition.findMany({
    include: { requestedBy: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  for (const r of requisitions) {
    const a = actor(r.requestedBy.fullName);
    rows.push({
      timestamp: r.createdAt, entityType: "Requisition", entityId: r.id, entityLabel: r.requisitionNo,
      action: "REQUISITION_CREATED", performedById: a.id, performedByName: a.performedByName,
      performedByRole: a.performedByRole, ipAddress: pick(IPS),
      newValue: { requisitionNo: r.requisitionNo, title: r.title, status: "DRAFT", totalEstimatedValue: num(r.totalEstimatedValue) },
    });
    if (r.submittedAt) {
      rows.push({
        timestamp: new Date(r.submittedAt.getTime() + 60_000), entityType: "Requisition", entityId: r.id,
        entityLabel: r.requisitionNo, action: "REQUISITION_SUBMITTED",
        performedById: a.id, performedByName: a.performedByName, performedByRole: a.performedByRole,
        ipAddress: pick(IPS),
        previousValue: { status: "DRAFT" }, newValue: { status: "SUBMITTED", submittedAt: r.submittedAt.toISOString() },
      });
    }
    if (r.status === "CLOSED" && r.closedAt) {
      const b = actor("Shahidul Islam");
      rows.push({
        timestamp: r.closedAt, entityType: "Requisition", entityId: r.id, entityLabel: r.requisitionNo,
        action: "REQUISITION_CLOSED", performedById: b.id, performedByName: b.performedByName,
        performedByRole: b.performedByRole, ipAddress: pick(IPS),
        previousValue: { status: "APPROVED" }, newValue: { status: "CLOSED" },
      });
    }
  }

  // --- Workflow actions ---------------------------------------------------
  const actions = await db.workflowAction.findMany({
    include: {
      actedBy: { select: { fullName: true } },
      instance: { select: { id: true, documentType: true, documentId: true } },
    },
    orderBy: { actedAt: "asc" },
  });

  const labelCache = new Map<string, string>();
  const labelFor = async (type: string, id: string): Promise<string> => {
    const key = `${type}:${id}`;
    if (labelCache.has(key)) return labelCache.get(key)!;
    let label = id.slice(-8);
    if (type === "REQUISITION") label = (await db.requisition.findUnique({ where: { id }, select: { requisitionNo: true } }))?.requisitionNo ?? label;
    if (type === "TENDER") label = (await db.tender.findUnique({ where: { id }, select: { tenderNo: true } }))?.tenderNo ?? label;
    if (type === "INVOICE") label = (await db.invoice.findUnique({ where: { id }, select: { invoiceNo: true } }))?.invoiceNo ?? label;
    if (type === "PURCHASE_ORDER") label = (await db.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } }))?.poNo ?? label;
    labelCache.set(key, label);
    return label;
  };

  for (const act of actions) {
    const a = actor(act.actedBy.fullName);
    rows.push({
      timestamp: act.actedAt, entityType: "WorkflowInstance", entityId: act.instance.id,
      entityLabel: await labelFor(act.instance.documentType, act.instance.documentId),
      action: `WORKFLOW_${act.action}`,
      performedById: a.id, performedByName: a.performedByName, performedByRole: a.performedByRole,
      ipAddress: pick(IPS),
      newValue: { step: act.stepSequence, action: act.action, comments: act.comments },
    });
  }

  // --- Tender lifecycle ---------------------------------------------------
  const tenders = await db.tender.findMany({ orderBy: { createdAt: "asc" } });
  for (const t of tenders) {
    const a = actor("Shahidul Islam");
    rows.push({
      timestamp: t.createdAt, entityType: "Tender", entityId: t.id, entityLabel: t.tenderNo,
      action: "TENDER_CREATED", performedById: a.id, performedByName: a.performedByName,
      performedByRole: a.performedByRole, ipAddress: pick(IPS),
      newValue: { tenderNo: t.tenderNo, title: t.title, method: t.method, envelopeSystem: t.envelopeSystem },
    });
    if (t.publishedAt) {
      rows.push({
        timestamp: t.publishedAt, entityType: "Tender", entityId: t.id, entityLabel: t.tenderNo,
        action: "TENDER_PUBLISHED", performedById: a.id, performedByName: a.performedByName,
        performedByRole: a.performedByRole, ipAddress: pick(IPS),
        previousValue: { status: "PENDING_APPROVAL" },
        newValue: { status: "PUBLISHED", publishedAt: t.publishedAt.toISOString(), closingAt: t.closingAt?.toISOString() },
      });
    }
    if (t.closedAt) {
      rows.push({
        timestamp: t.closedAt, entityType: "Tender", entityId: t.id, entityLabel: t.tenderNo,
        action: "TENDER_CLOSED", performedById: a.id, performedByName: a.performedByName,
        performedByRole: a.performedByRole, ipAddress: pick(IPS),
        previousValue: { status: "PUBLISHED" }, newValue: { status: "CLOSED" },
      });
    }
    if (t.technicalEvaluationCompletedAt) {
      const b = actor("Tanvir Ahmed");
      rows.push({
        timestamp: t.technicalEvaluationCompletedAt, entityType: "Tender", entityId: t.id, entityLabel: t.tenderNo,
        action: "TECHNICAL_EVALUATION_COMPLETED", performedById: b.id, performedByName: b.performedByName,
        performedByRole: b.performedByRole, ipAddress: pick(IPS),
        previousValue: { financialEnvelopes: "SEALED" },
        newValue: { financialEnvelopes: "UNSEALED", completedAt: t.technicalEvaluationCompletedAt.toISOString() },
      });
    }
    if (t.awardedAt) {
      rows.push({
        timestamp: t.awardedAt, entityType: "Tender", entityId: t.id, entityLabel: t.tenderNo,
        action: "TENDER_AWARDED", performedById: a.id, performedByName: a.performedByName,
        performedByRole: a.performedByRole, ipAddress: pick(IPS),
        previousValue: { status: "FINANCIAL_EVALUATION" }, newValue: { status: "AWARDED" },
      });
    }
  }

  // --- Bid submissions (by vendor users) ----------------------------------
  const bids = await db.bid.findMany({
    include: { vendor: { select: { companyName: true } }, tender: { select: { tenderNo: true } } },
  });
  for (const b of bids) {
    if (!b.submittedAt) continue;
    rows.push({
      timestamp: b.submittedAt, entityType: "Bid", entityId: b.id,
      entityLabel: `${b.tender.tenderNo} — ${b.vendor.companyName}`,
      action: "BID_SUBMITTED", performedById: null,
      performedByName: b.vendor.companyName, performedByRole: "Vendor",
      ipAddress: `203.112.${int(10, 250)}.${int(2, 250)}`,
      newValue: { technicalPart: "SUBMITTED", financialPart: "SUBMITTED (SEALED)" },
    });
  }

  // --- Work orders, receipts, invoices ------------------------------------
  const pos = await db.purchaseOrder.findMany({ include: { vendor: { select: { companyName: true } } } });
  for (const p of pos) {
    if (!p.issuedAt) continue;
    const a = actor("Shahidul Islam");
    rows.push({
      timestamp: p.issuedAt, entityType: "PurchaseOrder", entityId: p.id, entityLabel: p.poNo,
      action: "PURCHASE_ORDER_ISSUED", performedById: a.id, performedByName: a.performedByName,
      performedByRole: a.performedByRole, ipAddress: pick(IPS),
      newValue: { poNo: p.poNo, vendor: p.vendor.companyName, totalAmount: num(p.totalAmount), status: "ISSUED" },
    });
  }

  const grns = await db.goodsReceiptNote.findMany({ include: { receivedBy: { select: { fullName: true } } } });
  for (const g of grns) {
    const a = actor(g.receivedBy.fullName);
    rows.push({
      timestamp: g.receivedAt, entityType: "GoodsReceiptNote", entityId: g.id, entityLabel: g.grnNo,
      action: "GOODS_RECEIVED", performedById: a.id, performedByName: a.performedByName,
      performedByRole: a.performedByRole, ipAddress: pick(IPS),
      newValue: { grnNo: g.grnNo, challan: g.deliveryChallanNo, status: g.status },
    });
  }

  const invoices = await db.invoice.findMany({ include: { vendor: { select: { companyName: true } } } });
  for (const inv of invoices) {
    const a = actor("Nasrin Sultana");
    rows.push({
      timestamp: inv.receivedAt, entityType: "Invoice", entityId: inv.id, entityLabel: inv.invoiceNo,
      action: "INVOICE_RECEIVED", performedById: a.id, performedByName: a.performedByName,
      performedByRole: a.performedByRole, ipAddress: pick(IPS),
      newValue: { invoiceNo: inv.invoiceNo, vendor: inv.vendor.companyName, amount: num(inv.amount), netPayable: num(inv.netPayable) },
    });
    if (inv.matchStatus !== "NOT_RUN") {
      rows.push({
        timestamp: new Date(inv.receivedAt.getTime() + 2 * 3_600_000), entityType: "Invoice", entityId: inv.id,
        entityLabel: inv.invoiceNo, action: inv.matchStatus === "MATCHED" ? "THREE_WAY_MATCH_PASSED" : "THREE_WAY_MATCH_FAILED",
        performedById: a.id, performedByName: a.performedByName, performedByRole: a.performedByRole,
        ipAddress: pick(IPS),
        newValue: { matchStatus: inv.matchStatus },
      });
    }
    if (inv.paidAt) {
      const b = actor("Kamrun Nahar");
      rows.push({
        timestamp: inv.paidAt, entityType: "Invoice", entityId: inv.id, entityLabel: inv.invoiceNo,
        action: "PAYMENT_PROCESSED", performedById: b.id, performedByName: b.performedByName,
        performedByRole: b.performedByRole, ipAddress: pick(IPS),
        previousValue: { status: "APPROVED" }, newValue: { status: "PAID", netPayable: num(inv.netPayable) },
      });
    }
  }

  // --- Vendor enlistment --------------------------------------------------
  const vendors = await db.vendor.findMany();
  for (const v of vendors) {
    const a = actor("Shahidul Islam");
    rows.push({
      timestamp: v.createdAt, entityType: "Vendor", entityId: v.id, entityLabel: v.companyName,
      action: "VENDOR_REGISTERED", performedById: null, performedByName: v.companyName,
      performedByRole: "Vendor", ipAddress: `203.112.${int(10, 250)}.${int(2, 250)}`,
      newValue: { companyName: v.companyName, tradeLicenseNo: v.tradeLicenseNo, status: "PENDING" },
    });
    if (v.enlistedAt) {
      rows.push({
        timestamp: v.enlistedAt, entityType: "Vendor", entityId: v.id, entityLabel: v.companyName,
        action: "VENDOR_ENLISTMENT_APPROVED", performedById: a.id, performedByName: a.performedByName,
        performedByRole: a.performedByRole, ipAddress: pick(IPS),
        previousValue: { enlistmentStatus: "PENDING" }, newValue: { enlistmentStatus: "APPROVED" },
      });
    }
  }

  // --- Configuration changes ----------------------------------------------
  const definitions = await db.workflowDefinition.findMany({ orderBy: { createdAt: "asc" } });
  for (const d of definitions) {
    const a = actor("Mizanur Rahman");
    rows.push({
      timestamp: d.createdAt, entityType: "WorkflowDefinition", entityId: d.id,
      entityLabel: `${d.name} v${d.version}`,
      action: d.version === 1 ? "WORKFLOW_DEFINITION_CREATED" : "WORKFLOW_DEFINITION_VERSIONED",
      performedById: a.id, performedByName: a.performedByName, performedByRole: a.performedByRole,
      ipAddress: pick(IPS),
      newValue: { name: d.name, documentType: d.documentType, version: d.version, description: d.description },
    });
  }

  // --- Sign-in activity, to fill out the day-to-day picture ---------------
  const staff = Object.keys(roleOf);
  for (let day = 178; day >= 0; day -= 1) {
    if (chance(0.55)) continue;
    const who = pick(staff);
    const a = actor(who);
    if (!a.id) continue;
    rows.push({
      timestamp: daysAgo(day), entityType: "User", entityId: a.id, entityLabel: who,
      action: chance(0.9) ? "USER_SIGNED_IN" : "USER_SIGNED_OUT",
      performedById: a.id, performedByName: who, performedByRole: a.performedByRole,
      ipAddress: pick(IPS),
      newValue: { channel: "Web", userAgent: "Internal network" },
    });
  }

  // --- Write, in chronological order, so the chain is genuinely valid -----
  rows.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());

  for (const r of rows) {
    await db.$transaction(async tx => {
      await writeAudit(tx, {
        entityType: r.entityType, entityId: r.entityId, entityLabel: r.entityLabel,
        action: r.action, performedById: r.performedById,
        performedByName: r.performedByName, performedByRole: r.performedByRole,
        previousValue: r.previousValue, newValue: r.newValue,
        ipAddress: r.ipAddress, timestamp: r.timestamp,
      });
    });
  }

  return rows.length;
}
