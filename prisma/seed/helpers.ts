import type { PrismaClient } from "@prisma/client";
import { resolveRoute, type StepDefinition, type DocumentFacts } from "../../src/lib/workflow";

/**
 * Seed-time helpers for building workflow instances on historical documents.
 *
 * Historical rows go through the same route resolution as live ones, so the
 * approval chains shown on old requisitions are consistent with the rules that
 * were active when they were raised. Faking those chains would show up the
 * moment anyone opened an old document during the demo.
 */

export interface SeedStep { def: StepDefinition; }

export async function stepsForDefinition(db: PrismaClient, definitionId: string): Promise<StepDefinition[]> {
  const def = await db.workflowDefinition.findUniqueOrThrow({
    where: { id: definitionId },
    include: { steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } } },
  });
  return def.steps.map(s => ({
    sequence: s.sequence, name: s.name, conditionType: s.conditionType,
    conditionValue: s.conditionValue, requiredRoleId: s.requiredRoleId,
    requiredRoleName: s.requiredRole.name, actionType: s.actionType,
    escalationHours: s.escalationHours,
  }));
}

export interface BuildInstanceArgs {
  definitionId: string;
  version: number;
  steps: StepDefinition[];
  documentType: string;
  documentId: string;
  facts: DocumentFacts;
  initiatedById: string;
  startedAt: Date;
  /** How many applicable steps have already been actioned. */
  completedSteps: number;
  outcome: "IN_PROGRESS" | "APPROVED" | "REJECTED" | "RETURNED";
  /** Who acts at each applicable step, by role id. */
  actorForRole: (roleId: string) => { id: string } | undefined;
  comments?: string[];
}

/** Create a WorkflowInstance with its frozen route and any actions taken. */
export async function buildInstance(db: PrismaClient, a: BuildInstanceArgs) {
  const route = resolveRoute(a.steps, a.facts);
  const applicable = route.filter(s => s.applies);
  if (applicable.length === 0) return null;

  const done = Math.min(a.completedSteps, applicable.length);
  const currentSeq = a.outcome === "IN_PROGRESS"
    ? (applicable[done]?.sequence ?? applicable[applicable.length - 1]!.sequence)
    : (applicable[Math.max(0, done - 1)]?.sequence ?? applicable[0]!.sequence);

  const instance = await db.workflowInstance.create({
    data: {
      workflowDefinitionId: a.definitionId,
      workflowVersion: a.version,
      documentType: a.documentType,
      documentId: a.documentId,
      status: a.outcome,
      currentStepSequence: currentSeq,
      initiatedById: a.initiatedById,
      startedAt: a.startedAt,
      completedAt: a.outcome === "IN_PROGRESS" ? null : new Date(a.startedAt.getTime() + done * 86_400_000),
      plannedSteps: {
        create: route.map(s => ({
          sequence: s.sequence, name: s.name, conditionType: s.conditionType,
          conditionValue: s.conditionValue, requiredRoleId: s.requiredRoleId,
          requiredRoleName: s.requiredRoleName, actionType: s.actionType,
          escalationHours: s.escalationHours, applies: s.applies,
          skipReason: s.applies ? null : s.reason,
        })),
      },
    },
  });

  for (let i = 0; i < done; i++) {
    const step = applicable[i]!;
    const actor = a.actorForRole(step.requiredRoleId);
    if (!actor) continue;
    const isLast = i === done - 1;
    const action = isLast && a.outcome !== "IN_PROGRESS" && a.outcome !== "APPROVED"
      ? a.outcome
      : "APPROVED";
    await db.workflowAction.create({
      data: {
        workflowInstanceId: instance.id,
        stepSequence: step.sequence,
        actedById: actor.id,
        action,
        comments: a.comments?.[i] ?? defaultComment(action, step.name),
        actedAt: new Date(a.startedAt.getTime() + (i + 1) * 86_400_000 * 0.8),
      },
    });
  }

  return { instance, route, applicable };
}

function defaultComment(action: string, stepName: string): string {
  if (action === "REJECTED") {
    return "Not approved at this time. Justification does not establish operational necessity for the current quarter.";
  }
  if (action === "RETURNED") {
    return "Returned to initiator. Please attach the comparative quotation and confirm the cost centre before resubmission.";
  }
  const options = [
    "Approved. Requirement verified against the branch position.",
    "Approved. Within the divisional allocation for the current financial year.",
    "Recommended and approved.",
    "Approved. Please proceed through the standard procurement route.",
    "Verified and approved.",
  ];
  return options[stepName.length % options.length]!;
}
