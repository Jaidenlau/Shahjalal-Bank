import { prisma } from "./db";
import { num } from "./money";
import { pendingForUser } from "./workflow";
import { financialYear } from "./date";
import type { SessionUser } from "./auth";

/**
 * Read models for the dashboard.
 *
 * Scope follows the viewer. A requisition initiator sees their own activity; an
 * approver sees their division; an administrator sees the whole division's
 * position. Same screen, different data, decided server side.
 */

export type Scope = "own" | "department" | "all";

export function scopeFor(user: SessionUser): Scope {
  if (user.permissions.has("AUDIT:VIEW") || user.permissions.has("DASHBOARD:VIEW")) {
    return user.roleNames.some(r =>
      ["System Administrator", "Divisional Head", "Managing Director", "Chief Financial Officer"].includes(r))
      ? "all" : "department";
  }
  return "own";
}

export async function dashboardData(user: SessionUser) {
  const scope = scopeFor(user);

  const reqWhere =
    scope === "own" ? { requestedById: user.id }
    : scope === "department" && user.departmentId ? {}
    : {};

  const [
    myRequisitions, pendingInstances, openTenders, invoicesAwaiting,
    recentRequisitions, statusCounts, budgets, recentActivity, sealedTenders,
  ] = await Promise.all([
    prisma.requisition.count({ where: reqWhere }),
    pendingForUser(user.id, user.roleIds),
    prisma.tender.count({ where: { status: { in: ["PUBLISHED", "CLOSED", "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION"] } } }),
    prisma.invoice.count({ where: { status: { in: ["RECEIVED", "UNDER_VERIFICATION", "MATCHED", "APPROVED"] } } }),
    prisma.requisition.findMany({
      where: reqWhere,
      include: {
        requestedBy: { select: { fullName: true } },
        department: { select: { code: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.requisition.groupBy({ by: ["status"], _count: { _all: true }, where: reqWhere }),
    prisma.budget.findMany({
      where: { financialYear: financialYear() },
      include: { department: { select: { name: true, code: true } } },
    }),
    prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 10 }),
    prisma.tender.findMany({
      where: { status: "CLOSED", technicalEvaluationCompletedAt: null },
      select: { id: true, tenderNo: true, title: true, closedAt: true, _count: { select: { bids: true } } },
      take: 4,
    }),
  ]);

  const allocated = budgets.reduce((s, b) => s + num(b.allocatedAmount), 0);
  const consumed = budgets.reduce((s, b) => s + num(b.consumedAmount), 0);
  const committed = budgets.reduce((s, b) => s + num(b.committedAmount), 0);

  // Spend by division, for the second chart.
  const byDept = new Map<string, { name: string; allocated: number; consumed: number }>();
  for (const b of budgets) {
    const key = b.department.code;
    const cur = byDept.get(key) ?? { name: b.department.name, allocated: 0, consumed: 0 };
    cur.allocated += num(b.allocatedAmount);
    cur.consumed += num(b.consumedAmount);
    byDept.set(key, cur);
  }

  return {
    scope,
    myRequisitions,
    pendingCount: pendingInstances.length,
    openTenders,
    invoicesAwaiting,
    recentRequisitions: recentRequisitions.map(r => ({
      id: r.id, requisitionNo: r.requisitionNo, title: r.title, status: r.status,
      value: num(r.totalEstimatedValue), createdAt: r.createdAt,
      requestedBy: r.requestedBy.fullName, department: r.department.code, branch: r.branch.name,
    })),
    statusCounts: statusCounts.map(s => ({ status: s.status, count: s._count._all })),
    budget: { allocated, consumed, committed, remaining: allocated - consumed - committed },
    byDepartment: Array.from(byDept.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.consumed - a.consumed),
    recentActivity: recentActivity.map(a => ({
      id: a.id, action: a.action, entityLabel: a.entityLabel, entityType: a.entityType,
      by: a.performedByName, role: a.performedByRole, at: a.timestamp,
    })),
    sealedTenders: sealedTenders.map(t => ({
      id: t.id, tenderNo: t.tenderNo, title: t.title,
      closedAt: t.closedAt, bidCount: t._count.bids,
    })),
  };
}

/** Pending approvals with the document behind each one resolved for display. */
export async function approvalQueue(user: SessionUser) {
  const instances = await pendingForUser(user.id, user.roleIds);

  const rows = await Promise.all(instances.map(async i => {
    const step = i.plannedSteps.find(s => s.sequence === i.currentStepSequence && s.applies);
    if (i.documentType === "REQUISITION") {
      const r = await prisma.requisition.findUnique({
        where: { id: i.documentId },
        include: {
          requestedBy: { select: { fullName: true, designation: true } },
          department: { select: { code: true, name: true } },
          branch: { select: { name: true } },
        },
      });
      if (!r) return null;
      return {
        instanceId: i.id, documentType: i.documentType, documentId: i.documentId,
        href: `/requisitions/${r.id}`, reference: r.requisitionNo, title: r.title,
        value: num(r.totalEstimatedValue), raisedBy: r.requestedBy.fullName,
        raisedByRole: r.requestedBy.designation,
        context: `${r.department.code} · ${r.branch.name}`,
        stepName: step?.name ?? "", stepSequence: i.currentStepSequence,
        workflow: i.definition.name, version: i.workflowVersion,
        startedAt: i.startedAt, escalationHours: step?.escalationHours ?? 48,
      };
    }
    if (i.documentType === "INVOICE") {
      const inv = await prisma.invoice.findUnique({
        where: { id: i.documentId },
        include: { vendor: { select: { companyName: true } } },
      });
      if (!inv) return null;
      return {
        instanceId: i.id, documentType: i.documentType, documentId: i.documentId,
        href: `/invoices/${inv.id}`, reference: inv.invoiceNo,
        title: `Invoice from ${inv.vendor.companyName}`,
        value: num(inv.netPayable), raisedBy: inv.vendor.companyName, raisedByRole: "Vendor",
        context: `Net payable`, stepName: step?.name ?? "", stepSequence: i.currentStepSequence,
        workflow: i.definition.name, version: i.workflowVersion,
        startedAt: i.startedAt, escalationHours: step?.escalationHours ?? 48,
      };
    }
    if (i.documentType === "TENDER") {
      const t = await prisma.tender.findUnique({ where: { id: i.documentId } });
      if (!t) return null;
      return {
        instanceId: i.id, documentType: i.documentType, documentId: i.documentId,
        href: `/tenders/${t.id}`, reference: t.tenderNo, title: t.title,
        value: num(t.estimatedValue), raisedBy: "Procurement", raisedByRole: "",
        context: t.method, stepName: step?.name ?? "", stepSequence: i.currentStepSequence,
        workflow: i.definition.name, version: i.workflowVersion,
        startedAt: i.startedAt, escalationHours: step?.escalationHours ?? 48,
      };
    }
    return null;
  }));

  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Documents the user raised that are still in approval.
 *
 * Shown separately from the approval queue, and explicitly labelled, because
 * maker-checker means the user will never be able to action these themselves.
 * Mixing them into an "approvals" list would be misleading.
 */
export async function ownInFlight(user: SessionUser) {
  const instances = await prisma.workflowInstance.findMany({
    where: { initiatedById: user.id, status: "IN_PROGRESS" },
    include: { plannedSteps: true, definition: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return Promise.all(instances.map(async i => {
    const step = i.plannedSteps.find(s => s.sequence === i.currentStepSequence && s.applies);
    const r = i.documentType === "REQUISITION"
      ? await prisma.requisition.findUnique({ where: { id: i.documentId } })
      : null;
    return {
      instanceId: i.id,
      href: r ? `/requisitions/${r.id}` : "#",
      reference: r?.requisitionNo ?? i.documentId.slice(-8),
      title: r?.title ?? i.documentType,
      value: r ? num(r.totalEstimatedValue) : 0,
      waitingOn: step?.requiredRoleName ?? "—",
      stepName: step?.name ?? "—",
      startedAt: i.startedAt,
    };
  }));
}
