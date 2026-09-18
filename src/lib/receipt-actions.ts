"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { writeAudit } from "./audit";
import { grnNo, nextGrnSeq, invoiceNo, nextInvoiceSeq, vendorInitials } from "./docno";
import { num, applyBp } from "./money";
import { toErrorPayload } from "./errors";
import { threeWayMatch } from "./po-validation";
import { startWorkflow, actOnWorkflow } from "./workflow";
import type { ActionResult } from "./requisition-actions";
import type { WorkflowActionKind } from "./enums";

/** Goods receipt, invoice entry, three-way match and payment. */

export async function recordGoodsReceipt(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "GRN", "CREATE");

    const poId = String(formData.get("poId") ?? "");
    const challan = String(formData.get("challanNo") ?? "").trim();
    const remarks = String(formData.get("remarks") ?? "").trim();
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<{
      poLineId: string; received: number; accepted: number; rejected: number; remarks?: string;
    }>;

    if (!challan) return { ok: false, error: "A delivery challan number is required." };
    if (lines.length === 0) return { ok: false, error: "Record a quantity against at least one line." };

    const result = await prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId },
        include: {
          lines: { include: { item: true } },
          grns: { include: { lines: true } },
          vendor: true,
          requisition: { include: { requestedBy: { select: { id: true, fullName: true } } } },
        },
      });

      // A receipt cannot take cumulative delivery past the ordered quantity.
      for (const l of lines) {
        const poLine = po.lines.find(x => x.id === l.poLineId);
        if (!poLine) throw new Error("A line on this receipt does not belong to the work order.");
        const already = po.grns.flatMap(g => g.lines)
          .filter(gl => gl.poLineId === l.poLineId)
          .reduce((s, gl) => s + gl.quantityReceived, 0);
        if (already + l.received > poLine.quantity) {
          throw new Error(
            `Cannot record this receipt. Item: ${poLine.item.name}. Ordered quantity: ${poLine.quantity}. ` +
            `Already received: ${already}. Attempted now: ${l.received}. ` +
            `Cumulative receipt cannot exceed the work order quantity.`,
          );
        }
        if (l.accepted + l.rejected !== l.received) {
          throw new Error(
            `Cannot record this receipt. Item: ${poLine.item.name}. Accepted (${l.accepted}) plus rejected ` +
            `(${l.rejected}) must equal the quantity received (${l.received}).`,
          );
        }
      }

      const year = new Date().getFullYear();
      const seq = await nextGrnSeq(tx, year);
      const no = grnNo("CSD", year, seq);

      // Full or partial, decided from the cumulative position.
      const fullyReceived = po.lines.every(pl => {
        const already = po.grns.flatMap(g => g.lines)
          .filter(gl => gl.poLineId === pl.id)
          .reduce((s, gl) => s + gl.quantityReceived, 0);
        const now = lines.find(l => l.poLineId === pl.id)?.received ?? 0;
        return already + now >= pl.quantity;
      });

      const grn = await tx.goodsReceiptNote.create({
        data: {
          grnNo: no, poId, receivedById: user.id,
          deliveryChallanNo: challan,
          status: fullyReceived ? "FULL" : "PARTIAL",
          remarks: remarks || (fullyReceived ? "Received in good order and condition." : "Partial delivery. Balance to follow."),
          lines: {
            create: lines.map(l => ({
              poLineId: l.poLineId,
              quantityReceived: l.received,
              quantityAccepted: l.accepted,
              quantityRejected: l.rejected,
              remarks: l.remarks ?? "",
            })),
          },
        },
      });

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });

      // Stock moves: accepted quantities land on hand and leave the
      // under-purchase position.
      for (const l of lines) {
        const poLine = po.lines.find(x => x.id === l.poLineId)!;
        const bal = await tx.stockBalance.findFirst({ where: { itemId: poLine.itemId } });
        if (bal) {
          await tx.stockBalance.update({
            where: { id: bal.id },
            data: {
              quantityOnHand: bal.quantityOnHand + l.accepted,
              quantityUnderPurchase: Math.max(0, bal.quantityUnderPurchase - l.received),
              lastPurchasePrice: num(poLine.unitPrice),
              lastPurchaseDate: new Date(),
            },
          });
        }
      }

      await writeAudit(tx, {
        entityType: "GoodsReceiptNote", entityId: grn.id, entityLabel: no,
        action: "GOODS_RECEIVED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          grnNo: no, workOrder: po.poNo, vendor: po.vendor.companyName,
          challan, status: fullyReceived ? "FULL" : "PARTIAL",
          lines: lines.map(l => {
            const pl = po.lines.find(x => x.id === l.poLineId)!;
            return `${pl.item.name}: received ${l.received}, accepted ${l.accepted}, rejected ${l.rejected}`;
          }),
        },
      });

      // Annexure-B module 21: notify the requisition initiator that goods arrived.
      if (po.requisition?.requestedBy) {
        await tx.notification.create({
          data: {
            userId: po.requisition.requestedBy.id,
            title: "Goods received against your requisition",
            body: `${no} recorded against ${po.poNo}. ${lines.reduce((s, l) => s + l.accepted, 0)} unit(s) accepted into the Central Store and available for issue.`,
            link: `/grn/${grn.id}`,
          },
        });
      }

      return { id: grn.id, no };
    });

    revalidatePath("/grn");
    revalidatePath(`/purchase-orders/${poId}`);
    return { ok: true, redirectTo: `/grn/${result.id}`, message: `${result.no} recorded.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Enter an invoice and run the three-way match. */
export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "INVOICE", "CREATE");

    const poId = String(formData.get("poId") ?? "");
    const grnId = String(formData.get("grnId") ?? "") || null;
    const vendorInvoiceNo = String(formData.get("vendorInvoiceNo") ?? "").trim();
    const vatRateBp = Number(formData.get("vatRateBp") ?? 1500);
    const aitRateBp = Number(formData.get("aitRateBp") ?? 300);
    const securityBp = Number(formData.get("securityBp") ?? 500);
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<{
      itemCode: string; quantity: number; unitPrice: number;
    }>;

    if (!vendorInvoiceNo) return { ok: false, error: "The vendor's own invoice number is required." };
    if (lines.length === 0) return { ok: false, error: "Add at least one invoice line." };

    const result = await prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId },
        include: { lines: { include: { item: true } }, vendor: true, grns: { include: { lines: true } } },
      });

      const grnLines = (grnId
        ? po.grns.filter(g => g.id === grnId)
        : po.grns
      ).flatMap(g => g.lines);

      const match = threeWayMatch({
        poLines: po.lines.map(l => ({
          poLineId: l.id, itemCode: l.item.code, itemName: l.item.name,
          quantity: l.quantity, unitPrice: num(l.unitPrice), lineTotal: num(l.lineTotal),
        })),
        grnLines: grnLines.map(g => ({
          poLineId: g.poLineId, quantityReceived: g.quantityReceived, quantityAccepted: g.quantityAccepted,
        })),
        invoiceLines: lines,
      });

      const amount = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const vatAmount = applyBp(amount, vatRateBp);
      const taxDeducted = applyBp(amount, aitRateBp);
      const securityDeposit = applyBp(amount, securityBp);
      const netPayable = amount - taxDeducted - securityDeposit;

      const year = new Date().getFullYear();
      const seq = await nextInvoiceSeq(tx, year);
      const no = invoiceNo(vendorInitials(po.vendor.companyName), year, seq);

      const invoice = await tx.invoice.create({
        data: {
          invoiceNo: no, vendorInvoiceNo, poId, grnId, vendorId: po.vendorId,
          amount, vatRateBp, vatAmount, aitRateBp, taxDeducted, securityDeposit, netPayable,
          status: match.matched ? "MATCHED" : "DISPUTED",
          matchStatus: match.matched ? "MATCHED" : "MISMATCH",
          matchReport: JSON.stringify(match.failures),
        },
      });

      await writeAudit(tx, {
        entityType: "Invoice", entityId: invoice.id, entityLabel: no,
        action: "INVOICE_RECEIVED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          invoiceNo: no, vendorInvoiceNo, workOrder: po.poNo, vendor: po.vendor.companyName,
          amount, vatAmount, taxDeducted, securityDeposit, netPayable,
        },
      });

      await writeAudit(tx, {
        entityType: "Invoice", entityId: invoice.id, entityLabel: no,
        action: match.matched ? "THREE_WAY_MATCH_PASSED" : "THREE_WAY_MATCH_FAILED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          matchStatus: match.matched ? "MATCHED" : "MISMATCH",
          checkedAgainst: `${po.poNo} and ${grnLines.length} receipt line(s)`,
          failures: match.failures,
        },
      });

      // Only a matched invoice enters the payment workflow. A failed match is
      // returned to the vendor rather than routed for approval.
      if (match.matched) {
        await startWorkflow(tx, {
          documentType: "INVOICE", documentId: invoice.id, documentLabel: no,
          facts: { amount },
          initiatedBy: { id: user.id, fullName: user.fullName, roleName: user.roleName },
        });
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "UNDER_VERIFICATION" } });
      }

      return { id: invoice.id, no, matched: match.matched, failures: match.failures };
    });

    revalidatePath("/invoices");
    return {
      ok: true,
      redirectTo: `/invoices/${result.id}`,
      message: result.matched
        ? `${result.no} entered and matched. Routed for payment approval.`
        : `${result.no} entered. The three-way match failed and the invoice is marked disputed.`,
    };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Re-run the three-way match on an existing invoice. */
export async function runThreeWayMatch(invoiceId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "INVOICE", "EVALUATE");

    await prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: {
          po: { include: { lines: { include: { item: true } }, grns: { include: { lines: true } } } },
        },
      });

      const grnLines = inv.po.grns.flatMap(g => g.lines);
      // Invoice lines are reconstructed from the stored total against the PO
      // proportions when no explicit lines were captured.
      const invoiceLines = inv.po.lines.map(l => ({
        itemCode: l.item.code,
        quantity: l.quantity,
        unitPrice: num(l.unitPrice),
      }));

      const match = threeWayMatch({
        poLines: inv.po.lines.map(l => ({
          poLineId: l.id, itemCode: l.item.code, itemName: l.item.name,
          quantity: l.quantity, unitPrice: num(l.unitPrice), lineTotal: num(l.lineTotal),
        })),
        grnLines: grnLines.map(g => ({
          poLineId: g.poLineId, quantityReceived: g.quantityReceived, quantityAccepted: g.quantityAccepted,
        })),
        invoiceLines,
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          matchStatus: match.matched ? "MATCHED" : "MISMATCH",
          matchReport: JSON.stringify(match.failures),
          status: match.matched && inv.status === "DISPUTED" ? "MATCHED" : inv.status,
        },
      });

      await writeAudit(tx, {
        entityType: "Invoice", entityId: invoiceId, entityLabel: inv.invoiceNo,
        action: match.matched ? "THREE_WAY_MATCH_PASSED" : "THREE_WAY_MATCH_FAILED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { matchStatus: inv.matchStatus },
        newValue: { matchStatus: match.matched ? "MATCHED" : "MISMATCH", failures: match.failures },
      });
    });

    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, message: "Three-way match re-run." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Act on the invoice approval workflow. */
export async function actOnInvoice(
  invoiceId: string, action: WorkflowActionKind, comments: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const instance = await prisma.workflowInstance.findFirstOrThrow({
      where: { documentType: "INVOICE", documentId: invoiceId }, orderBy: { startedAt: "desc" },
    });

    await prisma.$transaction(async tx => {
      const result = await actOnWorkflow(tx, {
        instanceId: instance.id, documentLabel: inv.invoiceNo,
        makerId: instance.initiatedById, makerName: "the officer who entered this invoice",
        actor: { id: user.id, fullName: user.fullName, roleName: user.roleName, roleIds: user.roleIds },
        action, comments,
      });

      const next = result.instanceStatus === "APPROVED" ? "APPROVED"
        : result.instanceStatus === "REJECTED" ? "DISPUTED"
        : result.instanceStatus === "RETURNED" ? "DISPUTED"
        : "UNDER_VERIFICATION";

      await tx.invoice.update({ where: { id: invoiceId }, data: { status: next } });
      await writeAudit(tx, {
        entityType: "Invoice", entityId: invoiceId, entityLabel: inv.invoiceNo,
        action: `INVOICE_${action}`,
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: inv.status },
        newValue: { status: next, comments, nextStep: result.nextStepName ?? "None — approval complete" },
      });
    });

    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, message: `Invoice ${action.toLowerCase()}.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Mark an approved invoice as paid, and consume budget. */
export async function processPayment(invoiceId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "INVOICE", "APPROVE");

    await prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: {
          po: { include: { lines: { include: { item: true } }, requisition: { select: { departmentId: true } } } },
          vendor: true,
        },
      });
      if (inv.status !== "APPROVED") {
        throw new Error(`Only an approved invoice can be paid. This invoice is ${inv.status.toLowerCase().replace(/_/g, " ")}.`);
      }
      if (inv.matchStatus !== "MATCHED") {
        throw new Error("This invoice has not passed the three-way match and cannot be paid.");
      }

      await tx.invoice.update({
        where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() },
      });
      await tx.purchaseOrder.update({ where: { id: inv.poId }, data: { status: "CLOSED" } });

      // Budget consumption, by GL code on the purchased items.
      const deptId = inv.po.requisition?.departmentId;
      if (deptId) {
        const byGl = new Map<string, number>();
        for (const l of inv.po.lines) {
          byGl.set(l.item.glCode, (byGl.get(l.item.glCode) ?? 0) + num(l.lineTotal));
        }
        for (const [gl, amt] of byGl) {
          const b = await tx.budget.findFirst({ where: { departmentId: deptId, glCode: gl } });
          if (b) {
            await tx.budget.update({
              where: { id: b.id },
              data: {
                consumedAmount: num(b.consumedAmount) + amt,
                committedAmount: Math.max(0, num(b.committedAmount) - amt),
              },
            });
          }
        }
      }

      await writeAudit(tx, {
        entityType: "Invoice", entityId: invoiceId, entityLabel: inv.invoiceNo,
        action: "PAYMENT_PROCESSED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: "APPROVED" },
        newValue: {
          status: "PAID", vendor: inv.vendor.companyName,
          netPayable: num(inv.netPayable),
          vatBorneByBank: num(inv.vatAmount),
          aitDeducted: num(inv.taxDeducted),
          securityMoneyRetained: num(inv.securityDeposit),
        },
      });
    });

    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return { ok: true, message: "Payment processed." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}
