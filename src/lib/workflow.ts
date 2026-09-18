import { prisma } from "./db";
import type { Tx } from "./db";
import { writeAudit } from "./audit";
import { MakerCheckerViolation } from "./errors";
import type { ConditionType, DocumentType, WorkflowActionKind } from "./enums";

/**
 * THE WORKFLOW ENGINE
 *
 * The bank's tender document, Annexure-A clause 8(a), requires:
 *   "...the capability or parameterized system so that bank users can create
 *    new workflow for their specific tasks without getting help from the bidder"
 *
 * So routing is data, not code. A WorkflowDefinition is a versioned, ordered
 * list of steps. Each step carries a condition evaluated at runtime against
 * the document being routed. Change the data, and the routing changes — with
 * no deployment and no vendor involvement.
 *
 * VERSION PINNING
 * A WorkflowInstance stores the version it started under AND a frozen snapshot
 * of the steps that applied to it (WorkflowInstanceStep). Editing a definition
 * creates a NEW version and never rewrites instances already in flight. This is
 * the first question a careful reviewer asks about configurable workflows, and
 * the answer needs to be structural rather than a promise.
 */

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/** The facts a condition can be evaluated against. */
export interface DocumentFacts {
  /** poisha */
  amount: number;
  departmentCode?: string;
  departmentName?: string;
  categoryCode?: string;
  categoryName?: string;
}

export interface StepDefinition {
  sequence: number;
  name: string;
  conditionType: string;
  conditionValue: string;
  requiredRoleId: string;
  requiredRoleName: string;
  actionType: string;
  escalationHours: number;
}

export interface EvaluatedStep extends StepDefinition {
  applies: boolean;
  /** Plain-English reason, shown in the routing preview and on the document. */
  reason: string;
}

/**
 * Does this step apply to this document?
 * Pure function — no database, no side effects — so the workflow simulator in
 * the builder can run it against hypothetical values without saving anything.
 */
export function evaluateCondition(
  conditionType: string,
  conditionValue: string,
  facts: DocumentFacts,
): { applies: boolean; reason: string } {
  switch (conditionType as ConditionType) {
    case "ALWAYS":
      return { applies: true, reason: "Applies to every document of this type." };

    case "AMOUNT_ABOVE": {
      const threshold = Number(conditionValue) || 0;
      const applies = facts.amount > threshold;
      return {
        applies,
        reason: applies
          ? `Value exceeds the ${fmt(threshold)} threshold.`
          : `Value does not exceed the ${fmt(threshold)} threshold, so this tier is not required.`,
      };
    }

    case "AMOUNT_BELOW": {
      const threshold = Number(conditionValue) || 0;
      const applies = facts.amount < threshold;
      return {
        applies,
        reason: applies
          ? `Value is below the ${fmt(threshold)} threshold.`
          : `Value is not below the ${fmt(threshold)} threshold, so this tier is not required.`,
      };
    }

    case "DEPARTMENT_IS": {
      const applies = (facts.departmentCode ?? "") === conditionValue;
      return {
        applies,
        reason: applies
          ? `Raised by ${facts.departmentName ?? conditionValue}.`
          : `Raised by ${facts.departmentName ?? "another department"}, not ${conditionValue}.`,
      };
    }

    case "CATEGORY_IS": {
      const applies = (facts.categoryCode ?? "") === conditionValue;
      return {
        applies,
        reason: applies
          ? `Items fall under ${facts.categoryName ?? conditionValue}.`
          : `Items do not fall under ${conditionValue}.`,
      };
    }

    default:
      return { applies: true, reason: "Unrecognised condition; step applied by default." };
  }
}

function fmt(poisha: number): string {
  // Local copy to keep this module free of UI imports.
  const tk = Math.trunc(poisha / 100);
  const s = String(tk);
  if (s.length <= 3) return `৳ ${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `৳ ${rest},${last3}`;
}

/** Run every step of a definition against a document. Pure. */
export function resolveRoute(steps: StepDefinition[], facts: DocumentFacts): EvaluatedStep[] {
  return steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(s => {
      const { applies, reason } = evaluateCondition(s.conditionType, s.conditionValue, facts);
      return { ...s, applies, reason };
    });
}

// ---------------------------------------------------------------------------
// Definition lookup
// ---------------------------------------------------------------------------

/** The active definition for a document type, with its steps. */
export async function activeDefinition(documentType: DocumentType, client: Tx = prisma) {
  return client.workflowDefinition.findFirst({
    where: { documentType, isActive: true },
    include: { steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } } },
    orderBy: { version: "desc" },
  });
}

export function stepsOf(def: {
  steps: Array<{
    sequence: number; name: string; conditionType: string; conditionValue: string;
    requiredRoleId: string; actionType: string; escalationHours: number;
    requiredRole: { name: string };
  }>;
}): StepDefinition[] {
  return def.steps.map(s => ({
    sequence: s.sequence,
    name: s.name,
    conditionType: s.conditionType,
    conditionValue: s.conditionValue,
    requiredRoleId: s.requiredRoleId,
    requiredRoleName: s.requiredRole.name,
    actionType: s.actionType,
    escalationHours: s.escalationHours,
  }));
}

// ---------------------------------------------------------------------------
// Starting an instance
// ---------------------------------------------------------------------------

/**
 * Create a workflow instance for a document, pinning the definition version
 * and freezing the resolved route. Must run inside the same transaction as the
 * document's own status change.
 */
export async function startWorkflow(
  tx: Tx,
  args: {
    documentType: DocumentType;
    documentId: string;
    documentLabel: string;
    facts: DocumentFacts;
    initiatedBy: { id: string; fullName: string; roleName: string };
  },
) {
  const def = await activeDefinition(args.documentType, tx);
  if (!def) throw new Error(`No active workflow is configured for ${args.documentType}.`);

  const route = resolveRoute(stepsOf(def), args.facts);
  const applicable = route.filter(s => s.applies);
  if (applicable.length === 0) {
    throw new Error(`The active workflow for ${args.documentType} produced no applicable approval step.`);
  }

  const instance = await tx.workflowInstance.create({
    data: {
      workflowDefinitionId: def.id,
      workflowVersion: def.version, // PINNED
      documentType: args.documentType,
      documentId: args.documentId,
      status: "IN_PROGRESS",
      currentStepSequence: applicable[0].sequence,
      initiatedById: args.initiatedBy.id,
    },
  });

  // Freeze the resolved route, including the steps that did NOT apply and why.
  // Showing skipped steps is what makes the routing legible on screen.
  await tx.workflowInstanceStep.createMany({
    data: route.map(s => ({
      instanceId: instance.id,
      sequence: s.sequence,
      name: s.name,
      conditionType: s.conditionType,
      conditionValue: s.conditionValue,
      requiredRoleId: s.requiredRoleId,
      requiredRoleName: s.requiredRoleName,
      actionType: s.actionType,
      escalationHours: s.escalationHours,
      applies: s.applies,
      skipReason: s.applies ? null : s.reason,
    })),
  });

  await writeAudit(tx, {
    entityType: "WorkflowInstance",
    entityId: instance.id,
    entityLabel: args.documentLabel,
    action: "WORKFLOW_STARTED",
    performedById: args.initiatedBy.id,
    performedByName: args.initiatedBy.fullName,
    performedByRole: args.initiatedBy.roleName,
    newValue: {
      workflow: def.name,
      version: def.version,
      route: applicable.map(s => `${s.sequence}. ${s.name} (${s.requiredRoleName})`),
      skipped: route.filter(s => !s.applies).map(s => `${s.name}: ${s.reason}`),
    },
  });

  return { instance, route };
}

// ---------------------------------------------------------------------------
// Acting on a step — where maker-checker fires
// ---------------------------------------------------------------------------

export interface ActorContext {
  id: string;
  fullName: string;
  roleIds: string[];
  roleName: string;
}

export interface ActResult {
  instanceStatus: "IN_PROGRESS" | "APPROVED" | "REJECTED" | "RETURNED";
  nextStepSequence: number | null;
  nextStepName: string | null;
  nextStepRole: string | null;
  completed: boolean;
}

/**
 * Take an action on the current step of a workflow instance.
 *
 * MAKER-CHECKER is enforced here, in the mutation, not in the interface.
 * A hidden button is not access control; a refusal in the write path is.
 */
export async function actOnWorkflow(
  tx: Tx,
  args: {
    instanceId: string;
    documentLabel: string;
    /** The user who created the document being approved. */
    makerId: string;
    makerName: string;
    actor: ActorContext;
    action: WorkflowActionKind;
    comments: string;
  },
): Promise<ActResult> {
  const instance = await tx.workflowInstance.findUniqueOrThrow({
    where: { id: args.instanceId },
    include: { plannedSteps: { orderBy: { sequence: "asc" } } },
  });

  if (instance.status !== "IN_PROGRESS") {
    throw new Error(`This approval is already ${instance.status.toLowerCase()} and cannot be actioned again.`);
  }

  const applicable = instance.plannedSteps.filter(s => s.applies);
  const current = applicable.find(s => s.sequence === instance.currentStepSequence);
  if (!current) throw new Error("The current approval step could not be resolved.");

  // --- CONTROL 1: Maker-Checker -------------------------------------------
  if (args.actor.id === args.makerId) {
    throw new MakerCheckerViolation({
      document: args.documentLabel,
      raisedBy: args.makerName,
      attemptedBy: args.actor.fullName,
      step: `${current.sequence}. ${current.name}`,
      requiredRole: current.requiredRoleName,
    });
  }

  // --- CONTROL 2: the actor must hold the role this step requires ---------
  if (!args.actor.roleIds.includes(current.requiredRoleId)) {
    throw new MakerCheckerViolation({
      document: args.documentLabel,
      attemptedBy: args.actor.fullName,
      step: `${current.sequence}. ${current.name}`,
      requiredRole: current.requiredRoleName,
      yourRoles: args.actor.roleName,
    });
  }

  await tx.workflowAction.create({
    data: {
      workflowInstanceId: instance.id,
      stepSequence: current.sequence,
      actedById: args.actor.id,
      action: args.action,
      comments: args.comments,
    },
  });

  let nextStatus: ActResult["instanceStatus"] = "IN_PROGRESS";
  let nextSeq: number | null = null;
  let nextName: string | null = null;
  let nextRole: string | null = null;

  if (args.action === "REJECTED") {
    nextStatus = "REJECTED";
  } else if (args.action === "RETURNED") {
    nextStatus = "RETURNED";
  } else {
    const idx = applicable.findIndex(s => s.sequence === current.sequence);
    const next = applicable[idx + 1];
    if (next) {
      nextStatus = "IN_PROGRESS";
      nextSeq = next.sequence;
      nextName = next.name;
      nextRole = next.requiredRoleName;
    } else {
      nextStatus = "APPROVED";
    }
  }

  await tx.workflowInstance.update({
    where: { id: instance.id },
    data: {
      status: nextStatus,
      currentStepSequence: nextSeq ?? current.sequence,
      completedAt: nextStatus === "IN_PROGRESS" ? null : new Date(),
    },
  });

  await writeAudit(tx, {
    entityType: "WorkflowInstance",
    entityId: instance.id,
    entityLabel: args.documentLabel,
    action: `WORKFLOW_${args.action}`,
    performedById: args.actor.id,
    performedByName: args.actor.fullName,
    performedByRole: args.actor.roleName,
    previousValue: { status: instance.status, currentStep: `${current.sequence}. ${current.name}` },
    newValue: {
      status: nextStatus,
      actedStep: `${current.sequence}. ${current.name}`,
      comments: args.comments,
      nextStep: nextName ? `${nextSeq}. ${nextName} (${nextRole})` : "None — approval complete",
    },
  });

  return {
    instanceStatus: nextStatus,
    nextStepSequence: nextSeq,
    nextStepName: nextName,
    nextStepRole: nextRole,
    completed: nextStatus !== "IN_PROGRESS",
  };
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

/**
 * Instances currently waiting on a step this user could action.
 * Deliberately EXCLUDES documents the user raised themselves, because
 * maker-checker means they will never be able to action them — showing them in
 * an approval queue would be a lie.
 */
export async function pendingForUser(
  userId: string,
  roleIds: string[],
  client: Tx = prisma,
) {
  const instances = await client.workflowInstance.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      plannedSteps: true,
      definition: { select: { name: true } },
    },
    orderBy: { startedAt: "asc" },
  });

  return instances.filter(i => {
    if (i.initiatedById === userId) return false;
    const step = i.plannedSteps.find(s => s.sequence === i.currentStepSequence && s.applies);
    return step ? roleIds.includes(step.requiredRoleId) : false;
  });
}

/** The live chain for a document, for the detail-view panel. */
export async function chainForDocument(
  documentType: DocumentType,
  documentId: string,
  client: Tx = prisma,
) {
  const instance = await client.workflowInstance.findFirst({
    where: { documentType, documentId },
    include: {
      definition: { select: { name: true, version: true } },
      plannedSteps: { orderBy: { sequence: "asc" } },
      actions: { include: { actedBy: { select: { fullName: true, designation: true } } }, orderBy: { actedAt: "asc" } },
    },
    orderBy: { startedAt: "desc" },
  });
  if (!instance) return null;

  const steps = instance.plannedSteps.map(s => {
    const action = instance.actions.find(a => a.stepSequence === s.sequence);
    let state: "done" | "current" | "pending" | "skipped" = "pending";
    if (!s.applies) state = "skipped";
    else if (action) state = "done";
    else if (s.sequence === instance.currentStepSequence && instance.status === "IN_PROGRESS") state = "current";
    return { ...s, action, state };
  });

  return { instance, steps };
}
