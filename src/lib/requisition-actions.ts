"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, assertCan, actorOf } from "./auth";
import { writeAudit } from "./audit";
import { startWorkflow, actOnWorkflow } from "./workflow";
import { requisitionNo, nextRequisitionSeq } from "./docno";
import { num } from "./money";
import { toErrorPayload, BudgetExceededError } from "./errors";
import { financialYear } from "./date";
import type { WorkflowActionKind } from "./enums";

export interface ActionResult {
  ok: boolean;
  error?: string;
  control?: string;
  layer?: string;
  detail?: Record<string, string | number>;
  reference?: string;
  redirectTo?: string;
  message?: string;
}

/**
 * Create and submit a requisition.
 *
 * The stock check runs here, on submission, not in the browser: it decides
 * what is issued from the store and what becomes a purchase, and the purchase
 * split is later what a work order is validated against. It has to be a
 * server-side fact, not a display convenience.
 */
export async function createRequisition(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "REQUISITION", "CREATE");

    const title = String(formData.get("title") ?? "").trim();
    const type = String(formData.get("type") ?? "PRE_FACTO");
    const justification = String(formData.get("justification") ?? "").trim();
    const branchId = String(formData.get("branchId") ?? user.branchId ?? "");
    const departmentId = String(formData.get("departmentId") ?? user.departmentId ?? "");
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<{
      itemId: string; quantity: number; estimatedUnitPrice: number; remarks?: string;
    }>;

    if (!title) return { ok: false, error: "A title is required." };
    if (lines.length === 0) return { ok: false, error: "Add at least one item to the requisition." };
    if (!justification) return { ok: false, error: "A justification is required." };

    const result = await prisma.$transaction(async tx => {
      const dept = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });

      // --- Stock check: split each line between store and purchase ---------
      const resolved = await Promise.all(lines.map(async l => {
        const item = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
        const balances = await tx.stockBalance.findMany({ where: { itemId: l.itemId } });
        const onHand = balances.reduce((s, b) => s + b.quantityOnHand, 0);
        const fromStore = Math.min(onHand, l.quantity);
        const toPurchase = l.quantity - fromStore;
        return {
          item, quantity: l.quantity,
          estimatedUnitPrice: l.estimatedUnitPrice,
          fromStore, toPurchase,
          fulfilmentRoute: toPurchase === 0 ? "FROM_STORE" : "TO_PURCHASE",
          remarks: fromStore > 0 && toPurchase > 0
            ? `Stock check at submission: ${fromStore} available in Central Store, ${toPurchase} to be purchased.`
            : fromStore > 0
            ? `Stock check at submission: ${fromStore} available in Central Store, issued from stock.`
            : "Stock check at submission: no stock available, full quantity routed to purchase.",
        };
      }));

      const total = resolved.reduce((s, l) => s + l.quantity * l.estimatedUnitPrice, 0);

      // --- Budget control ---------------------------------------------------
      // Annexure-B module 22 commits to budget control. Checked here rather
      // than after approval, so nobody spends approval time on something the
      // cost centre cannot fund.
      const glCodes = Array.from(new Set(resolved.map(l => l.item.glCode)));
      const budgets = await tx.budget.findMany({
        where: { financialYear: financialYear(), departmentId, glCode: { in: glCodes } },
      });
      for (const gl of glCodes) {
        const b = budgets.find(x => x.glCode === gl);
        if (!b) continue;
        const lineTotal = resolved
          .filter(l => l.item.glCode === gl)
          .reduce((s, l) => s + l.toPurchase * l.estimatedUnitPrice, 0);
        const available = num(b.allocatedAmount) - num(b.consumedAmount) - num(b.committedAmount);
        if (lineTotal > available) {
          throw new BudgetExceededError({
            costCentre: dept.costCenterCode,
            glCode: gl,
            financialYear: financialYear(),
            allocated: num(b.allocatedAmount),
            consumed: num(b.consumedAmount),
            committed: num(b.committedAmount),
            available,
            requested: lineTotal,
            shortfall: lineTotal - available,
          });
        }
      }

      const seq = await nextRequisitionSeq(tx, new Date().getFullYear());
      const reqNo = requisitionNo("CSD", new Date().getFullYear(), seq);

      const req = await tx.requisition.create({
        data: {
          requisitionNo: reqNo, type, title,
          requestedById: user.id, departmentId, branchId,
          status: "UNDER_APPROVAL",
          totalEstimatedValue: total,
          justification,
          costCenterCode: dept.costCenterCode,
          submittedAt: new Date(),
          lines: {
            create: resolved.map(l => ({
              itemId: l.item.id, quantity: l.quantity,
              estimatedUnitPrice: l.estimatedUnitPrice,
              fulfilmentRoute: l.fulfilmentRoute,
              quantityFromStore: l.fromStore,
              quantityToPurchase: l.toPurchase,
              remarks: l.remarks,
            })),
          },
        },
      });

      await writeAudit(tx, {
        entityType: "Requisition", entityId: req.id, entityLabel: reqNo,
        action: "REQUISITION_CREATED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: {
          requisitionNo: reqNo, title, type, totalEstimatedValue: total,
          lines: resolved.map(l => ({
            item: l.item.name, quantity: l.quantity,
            fromStore: l.fromStore, toPurchase: l.toPurchase,
          })),
        },
      });

      const { instance, route } = await startWorkflow(tx, {
        documentType: "REQUISITION", documentId: req.id, documentLabel: reqNo,
        facts: { amount: total, departmentCode: dept.code, departmentName: dept.name },
        initiatedBy: { id: user.id, fullName: user.fullName, roleName: user.roleName },
      });

      await writeAudit(tx, {
        entityType: "Requisition", entityId: req.id, entityLabel: reqNo,
        action: "REQUISITION_SUBMITTED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: "DRAFT" },
        newValue: { status: "UNDER_APPROVAL", workflowInstance: instance.id },
      });

      // Notify the first approver's role holders.
      const firstStep = route.find(s => s.applies);
      if (firstStep) {
        const approvers = await tx.userRole.findMany({
          where: { roleId: firstStep.requiredRoleId }, select: { userId: true },
        });
        for (const a of approvers) {
          if (a.userId === user.id) continue;
          await tx.notification.create({
            data: {
              userId: a.userId,
              title: "Requisition awaiting your approval",
              body: `${reqNo} — ${title}, raised by ${user.fullName}. Value ৳ ${(total / 100).toLocaleString("en-IN")}.`,
              link: `/requisitions/${req.id}`,
            },
          });
        }
      }

      return { id: req.id, reqNo };
    });

    revalidatePath("/requisitions");
    revalidatePath("/");
    return { ok: true, redirectTo: `/requisitions/${result.id}`, message: `${result.reqNo} submitted for approval.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/**
 * Act on a requisition's current approval step.
 * Maker-checker fires inside actOnWorkflow, in the mutation.
 */
export async function actOnRequisition(
  requisitionId: string, action: WorkflowActionKind, comments: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: requisitionId },
      include: { requestedBy: { select: { id: true, fullName: true } } },
    });
    const instance = await prisma.workflowInstance.findFirstOrThrow({
      where: { documentType: "REQUISITION", documentId: requisitionId },
      orderBy: { startedAt: "desc" },
    });

    await prisma.$transaction(async tx => {
      const result = await actOnWorkflow(tx, {
        instanceId: instance.id,
        documentLabel: req.requisitionNo,
        makerId: req.requestedBy.id,
        makerName: req.requestedBy.fullName,
        actor: actorOf(user),
        action, comments,
      });

      const nextStatus =
        result.instanceStatus === "APPROVED" ? "APPROVED"
        : result.instanceStatus === "REJECTED" ? "REJECTED"
        : result.instanceStatus === "RETURNED" ? "RETURNED"
        : "UNDER_APPROVAL";

      await tx.requisition.update({ where: { id: requisitionId }, data: { status: nextStatus } });

      await writeAudit(tx, {
        entityType: "Requisition", entityId: requisitionId, entityLabel: req.requisitionNo,
        action: `REQUISITION_${action}`,
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { status: req.status },
        newValue: { status: nextStatus, comments, nextStep: result.nextStepName ?? "None — approval complete" },
      });

      await tx.notification.create({
        data: {
          userId: req.requestedBy.id,
          title: `Requisition ${action.toLowerCase()}`,
          body: `${req.requisitionNo} was ${action.toLowerCase()} by ${user.fullName}${
            result.nextStepName ? `. It now awaits ${result.nextStepRole}.` : "."
          }`,
          link: `/requisitions/${requisitionId}`,
        },
      });
    });

    revalidatePath(`/requisitions/${requisitionId}`);
    revalidatePath("/requisitions/approvals");
    revalidatePath("/");
    return { ok: true, message: `Requisition ${action.toLowerCase()}.` };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/** Live stock and price lookup for the create form. */
export async function lookupItem(itemId: string) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { category: true, stockBalances: { include: { warehouse: true } } },
  });
  if (!item) return null;
  const onHand = item.stockBalances.reduce((s, b) => s + b.quantityOnHand, 0);
  const inTransit = item.stockBalances.reduce((s, b) => s + b.quantityInTransit, 0);
  const underPurchase = item.stockBalances.reduce((s, b) => s + b.quantityUnderPurchase, 0);
  const last = item.stockBalances.find(b => b.lastPurchaseDate);
  return {
    id: item.id, code: item.code, name: item.name, uom: item.unitOfMeasure,
    capexOpex: item.capexOpex, glCode: item.glCode, category: item.category.name,
    reorderLevel: item.reorderLevel, specification: item.specification,
    onHand, inTransit, underPurchase,
    lastPurchasePrice: num(last?.lastPurchasePrice ?? 0),
    lastPurchaseDate: last?.lastPurchaseDate ?? null,
  };
}

export async function goTo(path: string) {
  redirect(path);
}
