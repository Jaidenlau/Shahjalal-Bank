"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { writeAudit } from "./audit";
import { resolveRoute, type StepDefinition, type DocumentFacts } from "./workflow";
import { toErrorPayload } from "./errors";
import type { ActionResult } from "./requisition-actions";

/**
 * Workflow configuration.
 *
 * Annexure-A clause 8(a): "the capability or parameterized system so that bank
 * users can create new workflow for their specific tasks without getting help
 * from the bidder". Saving here writes DATA, not code — no deployment, no
 * vendor.
 *
 * Saving ALWAYS creates a new version and never edits the current one. A
 * document already in flight keeps the version it started under, so changing a
 * rule can never retroactively corrupt an approval in progress. That is the
 * first question a careful reviewer asks about configurable workflows and the
 * answer needs to be structural rather than a promise.
 */

export interface StepInput {
  sequence: number;
  name: string;
  conditionType: string;
  conditionValue: string;
  requiredRoleId: string;
  actionType: string;
  escalationHours: number;
}

export async function saveWorkflowVersion(
  definitionId: string, steps: StepInput[], note: string,
): Promise<ActionResult & { newVersionId?: string; newVersion?: number }> {
  const user = await requireUser();
  try {
    assertCan(user, "WORKFLOW", "CONFIGURE");
    if (steps.length === 0) return { ok: false, error: "A workflow needs at least one step." };

    const result = await prisma.$transaction(async tx => {
      const current = await tx.workflowDefinition.findUniqueOrThrow({
        where: { id: definitionId },
        include: { steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } } },
      });

      const highest = await tx.workflowDefinition.findFirst({
        where: { documentType: current.documentType },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (highest?.version ?? current.version) + 1;

      // In-flight instances are untouched: they reference the definition they
      // started under, and that row is not modified here.
      const inFlight = await tx.workflowInstance.count({
        where: { workflowDefinitionId: definitionId, status: "IN_PROGRESS" },
      });

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: { isActive: false, supersededAt: new Date() },
      });

      const created = await tx.workflowDefinition.create({
        data: {
          name: current.name,
          documentType: current.documentType,
          version: nextVersion,
          isActive: true,
          description: note || `Revised from version ${current.version}.`,
          createdById: user.id,
          steps: {
            create: steps.map(s => ({
              sequence: s.sequence, name: s.name,
              conditionType: s.conditionType, conditionValue: s.conditionValue,
              requiredRoleId: s.requiredRoleId, actionType: s.actionType,
              escalationHours: s.escalationHours,
            })),
          },
        },
      });

      const before = current.steps.map(s =>
        `${s.sequence}. ${s.name} — ${s.conditionType}${s.conditionValue ? ` ${s.conditionValue}` : ""} — ${s.requiredRole.name}`);
      const roleNames = await tx.role.findMany({
        where: { id: { in: steps.map(s => s.requiredRoleId) } },
        select: { id: true, name: true },
      });
      const after = steps.map(s =>
        `${s.sequence}. ${s.name} — ${s.conditionType}${s.conditionValue ? ` ${s.conditionValue}` : ""} — ${
          roleNames.find(r => r.id === s.requiredRoleId)?.name ?? "?"}`);

      await writeAudit(tx, {
        entityType: "WorkflowDefinition", entityId: created.id,
        entityLabel: `${current.name} v${nextVersion}`,
        action: "WORKFLOW_DEFINITION_VERSIONED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        previousValue: { version: current.version, steps: before },
        newValue: {
          version: nextVersion, steps: after, note,
          inFlightDocumentsUnaffected: inFlight,
        },
      });

      return { id: created.id, version: nextVersion, inFlight };
    });

    revalidatePath("/admin/workflows");
    revalidatePath(`/admin/workflows/${result.id}`);
    return {
      ok: true,
      newVersionId: result.id,
      newVersion: result.version,
      message:
        `Saved as version ${result.version} and made active.` +
        (result.inFlight > 0
          ? ` ${result.inFlight} document${result.inFlight === 1 ? "" : "s"} already in approval continue on their original version.`
          : ""),
    };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}

/**
 * Routing simulation. Pure, no writes.
 *
 * This is what lets an administrator see the consequence of a rule change
 * before committing to it, and it is the same resolveRoute the engine uses at
 * runtime — not a parallel implementation that could drift.
 */
export async function simulateRoute(
  steps: StepInput[], facts: DocumentFacts,
): Promise<Array<{ sequence: number; name: string; roleName: string; applies: boolean; reason: string; actionType: string }>> {
  const roles = await prisma.role.findMany({
    where: { id: { in: steps.map(s => s.requiredRoleId) } },
    select: { id: true, name: true },
  });

  const defs: StepDefinition[] = steps.map(s => ({
    sequence: s.sequence, name: s.name,
    conditionType: s.conditionType, conditionValue: s.conditionValue,
    requiredRoleId: s.requiredRoleId,
    requiredRoleName: roles.find(r => r.id === s.requiredRoleId)?.name ?? "Unknown role",
    actionType: s.actionType, escalationHours: s.escalationHours,
  }));

  return resolveRoute(defs, facts).map(s => ({
    sequence: s.sequence, name: s.name, roleName: s.requiredRoleName,
    applies: s.applies, reason: s.reason, actionType: s.actionType,
  }));
}

/** Activate a previous version, for rollback. */
export async function activateVersion(definitionId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertCan(user, "WORKFLOW", "CONFIGURE");
    await prisma.$transaction(async tx => {
      const def = await tx.workflowDefinition.findUniqueOrThrow({ where: { id: definitionId } });
      await tx.workflowDefinition.updateMany({
        where: { documentType: def.documentType, isActive: true },
        data: { isActive: false, supersededAt: new Date() },
      });
      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: { isActive: true, supersededAt: null },
      });
      await writeAudit(tx, {
        entityType: "WorkflowDefinition", entityId: definitionId,
        entityLabel: `${def.name} v${def.version}`,
        action: "WORKFLOW_VERSION_ACTIVATED",
        performedById: user.id, performedByName: user.fullName, performedByRole: user.roleName,
        newValue: { activeVersion: def.version, documentType: def.documentType },
      });
    });
    revalidatePath("/admin/workflows");
    return { ok: true, message: "Version activated." };
  } catch (e) {
    return { ok: false, ...toErrorPayload(e) };
  }
}
