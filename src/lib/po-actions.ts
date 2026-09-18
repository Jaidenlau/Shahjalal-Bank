"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { writeAudit } from "./audit";
import { purchaseOrderNo, nextPoSeq } from "./docno";
import { num } from "./money";
import { toErrorPayload } from "./errors";
import {
  buildValidationContext, assertPoMatchesRequisition, matchReport,
  type ProposedPoLine,
} from "./po-validation";
import type { ActionResult } from "./requisition-actions";

/**
 * Work order issue.
 *
 * Annexure-B module 3 required item and quantity matching between the
 * requisition, the approval and the work order, with an error message on
 * mismatch. The bank asked for this by name, so the refusal names the item,
 * the approved quantity and the attempted quantity.
 */

export interface PoDraftLine {
  itemId: string; itemCode: string; itemName: string;
  quantity: number; unitPrice: number;
}

/** Non-mutating pre-check, so the form can show the position before issuing. */
export async function checkPoDraft(requisitionId: string, lines: PoDraftLine[]) {
  const ctx = await buildValidationContext(prisma, requisitionId);
  const findings = matchReport(lines as ProposedPoLine[], ctx);
  return {
    requisitionNo: ctx.requisitionNo,
    findings,
    blocked: findings.some(f => f.kind === "OVER" || f.kind === "NOT_APPROVED"),
  };
}

export async function issuePurchaseOrder(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "PO", "CREATE");

    const tenderId = String(formData.get("tenderId") ?? "") || null;
    const bidId = String(formData.get("bidId") ?? "") || null;
    const requisitionId = String(formData.get("requisitionId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const deliveryDays = Number(formData.get("deliveryDays") ?? 15);
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as PoDraftLine[];

    if (!requisitionId) return { ok: false, error: "A source requisition is required." };
    if (lines.length === 0) return { ok: false, error: "Add at least one line to the work order." };

    const result = await prisma.$transaction(async tx => {
      // --- THE CONTROL --------------------------------------------------
      // Validated against the approved requisition before anything is written.
      const ctx = await buildValidationContext(tx, requisitionId);
      const findings = assertPoMatchesRequisition(lines as ProposedPoLine[], ctx);

      const approval = await tx.workflowInstance.findFirst({
        where: { documentType: "REQUISITION", documentId: requisitionId, status: "APPROVED" },
        orderBy: { startedAt: "desc" },
      });

      const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const year = new Date().getFullYear();
      const seq = await nextPoSeq(tx, year);
      const no = purchaseOrderNo("CSD", year, seq);

      const po = await tx.purchaseOrder.create({
        data: {
          poNo: no, tenderId, bidId, vendorId,
          sourceRequisitionId: requisitionId,
          approvalReference: approval?.id ?? null,
          status: "ISSUED",
          subtotal: total, totalAmount: total,
          deliveryTerms: "Delivery to Central Store, Corporate Head Office, Gulshan, Dhaka, against delivery challan.",
          deliveryDueAt: new Date(Date.now() + deliveryDays * 86_400_000),
          issuedAt: new Date(), issuedById: user.id,
          lines: {
            create: lines.map(l => ({
              itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice,
              lineTotal: l.quantity * l.unitPrice,
            })),
          },
        },
      });

      // Reserve the quantity against stock so the catalogue reflects the
      // commitment immediately.
      for (const l of lines) {
        const bal = await tx.stockBalance.findFirst({ where: { itemId: l.itemId } });
        if (bal) {
          await tx.stockBalance.update({
            where: { id: bal.id },
            data: { quantityUnderPurchase: bal.quantityUnderPurchase + l.quantity },
          });
        }
      }

      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });

      await writeAudit(tx, {
        entityType: "PurchaseOrder", entityId: po.id, entityLabel: no,
        action: "PURCHASE_ORDER_ISSUED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          poNo: no, vendor: vendor.companyName, totalAmount: total,
          sourceRequisition: ctx.requisitionNo,
          approvalReference: approval?.id ?? "none",
          quantityMatch: findings.map(f => `${f.itemCode}: approved ${f.approvedQuantity}, ordered ${f.attemptedQuantity}`),
        },
      });

      const vu = await tx.vendorUser.findFirst({ where: { vendorId } });
      if (vu) {
        await tx.notification.create({
          data: {
            userId: vu.userId, title: "Work order issued",
            body: `${no} has been issued to you. Delivery is due within ${deliveryDays} working days.`,
            link: `/vendor`,
          },
        });
      }

      return { id: po.id, no };
    });

    revalidatePath("/purchase-orders");
    return { ok: true, redirectTo: `/purchase-orders/${result.id}`, message: `${result.no} issued.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Amend quantities on an issued work order. Validated the same way. */
export async function amendPurchaseOrder(
  poId: string, lines: PoDraftLine[],
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "PO", "CREATE");

    await prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId }, include: { lines: true, vendor: true },
      });
      if (!po.sourceRequisitionId) {
        throw new Error("This work order has no source requisition to validate against.");
      }
      if (po.status === "CLOSED" || po.status === "CANCELLED") {
        throw new Error(`This work order is ${po.status.toLowerCase()} and can no longer be amended.`);
      }

      const ctx = await buildValidationContext(tx, po.sourceRequisitionId);
      assertPoMatchesRequisition(lines as ProposedPoLine[], ctx);

      const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const before = po.lines.map(l => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: num(l.unitPrice) }));

      await tx.purchaseOrderLine.deleteMany({ where: { poId } });
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          subtotal: total, totalAmount: total,
          lines: {
            create: lines.map(l => ({
              itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice,
              lineTotal: l.quantity * l.unitPrice,
            })),
          },
        },
      });

      await writeAudit(tx, {
        entityType: "PurchaseOrder", entityId: poId, entityLabel: po.poNo,
        action: "PURCHASE_ORDER_AMENDED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { lines: before, totalAmount: num(po.totalAmount) },
        newValue: { lines, totalAmount: total, validatedAgainst: ctx.requisitionNo },
      });
    });

    revalidatePath(`/purchase-orders/${poId}`);
    return { ok: true, message: "Work order amended." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}
