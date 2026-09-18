import type { PrismaClient } from "@prisma/client";
import { daysAgo } from "./rng";

/**
 * Workflow definitions.
 *
 * Requisition Approval is seeded at v3, with v1 and v2 retained and inactive,
 * so the builder opens on a definition that visibly has history. That matters:
 * an administrator seeing "version 3" with two superseded versions behind it
 * reads as a system that has been configured before, not one where versioning
 * is a label on a single record.
 *
 * The demo requisition is ৳ 17,77,500, which under v3 engages steps 1 and 2
 * but not step 3. Changing step 2's threshold in the builder is the closing
 * move of the demo.
 */

export async function seedWorkflows(
  db: PrismaClient,
  role: Record<string, { id: string }>,
  admin: { id: string },
) {
  const L = (tk: number) => String(tk * 100); // taka -> poisha, as a string condition value

  // --- Requisition Approval: v1 and v2, superseded ------------------------
  const v1 = await db.workflowDefinition.create({
    data: {
      name: "Requisition Approval", documentType: "REQUISITION", version: 1, isActive: false,
      description: "Initial configuration at go-live. Single approval tier.",
      createdById: admin.id, createdAt: daysAgo(240), supersededAt: daysAgo(180),
      steps: {
        create: [
          { sequence: 1, name: "Department Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.DEPT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
        ],
      },
    },
  });

  const v2 = await db.workflowDefinition.create({
    data: {
      name: "Requisition Approval", documentType: "REQUISITION", version: 2, isActive: false,
      description: "Added a divisional tier above ৳ 10,00,000 following the internal audit recommendation of March 2026.",
      createdById: admin.id, createdAt: daysAgo(180), supersededAt: daysAgo(96),
      steps: {
        create: [
          { sequence: 1, name: "Department Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.DEPT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
          { sequence: 2, name: "Divisional Head Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(10_00_000),
            requiredRoleId: role.DIVISIONAL_HEAD!.id, actionType: "APPROVE", escalationHours: 72 },
        ],
      },
    },
  });

  // --- Requisition Approval v3: ACTIVE ------------------------------------
  const v3 = await db.workflowDefinition.create({
    data: {
      name: "Requisition Approval", documentType: "REQUISITION", version: 3, isActive: true,
      description: "Current delegation of authority. Divisional tier from ৳ 5,00,000, Managing Director from ৳ 20,00,000.",
      createdById: admin.id, createdAt: daysAgo(96),
      steps: {
        create: [
          { sequence: 1, name: "Department Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.DEPT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
          { sequence: 2, name: "Divisional Head Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(5_00_000),
            requiredRoleId: role.DIVISIONAL_HEAD!.id, actionType: "APPROVE", escalationHours: 72 },
          { sequence: 3, name: "Managing Director Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(20_00_000),
            requiredRoleId: role.MANAGING_DIRECTOR!.id, actionType: "APPROVE", escalationHours: 96 },
        ],
      },
    },
  });

  // --- Tender Approval v2 -------------------------------------------------
  await db.workflowDefinition.create({
    data: {
      name: "Tender Approval", documentType: "TENDER", version: 1, isActive: false,
      description: "Initial configuration. Procurement Head only.",
      createdById: admin.id, createdAt: daysAgo(240), supersededAt: daysAgo(140),
      steps: {
        create: [
          { sequence: 1, name: "Procurement Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.PROCUREMENT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
        ],
      },
    },
  });

  const tenderV2 = await db.workflowDefinition.create({
    data: {
      name: "Tender Approval", documentType: "TENDER", version: 2, isActive: true,
      description: "Purchase Committee concurrence required before publication above ৳ 10,00,000.",
      createdById: admin.id, createdAt: daysAgo(140),
      steps: {
        create: [
          { sequence: 1, name: "Procurement Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.PROCUREMENT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
          { sequence: 2, name: "Purchase Committee Concurrence", conditionType: "AMOUNT_ABOVE", conditionValue: L(10_00_000),
            requiredRoleId: role.PURCHASE_COMMITTEE!.id, actionType: "APPROVE", escalationHours: 96 },
        ],
      },
    },
  });

  // --- Invoice Approval v2 ------------------------------------------------
  await db.workflowDefinition.create({
    data: {
      name: "Invoice Approval", documentType: "INVOICE", version: 1, isActive: false,
      description: "Initial configuration. Verification and approval, no CFO tier.",
      createdById: admin.id, createdAt: daysAgo(240), supersededAt: daysAgo(120),
      steps: {
        create: [
          { sequence: 1, name: "Finance Officer Verification", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.FINANCE_OFFICER!.id, actionType: "REVIEW", escalationHours: 24 },
          { sequence: 2, name: "Finance Manager Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.FINANCE_MANAGER!.id, actionType: "APPROVE", escalationHours: 48 },
        ],
      },
    },
  });

  const invoiceV2 = await db.workflowDefinition.create({
    data: {
      name: "Invoice Approval", documentType: "INVOICE", version: 2, isActive: true,
      description: "CFO approval added above ৳ 10,00,000 per the current payment delegation matrix.",
      createdById: admin.id, createdAt: daysAgo(120),
      steps: {
        create: [
          { sequence: 1, name: "Finance Officer Verification", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.FINANCE_OFFICER!.id, actionType: "REVIEW", escalationHours: 24 },
          { sequence: 2, name: "Finance Manager Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.FINANCE_MANAGER!.id, actionType: "APPROVE", escalationHours: 48 },
          { sequence: 3, name: "Chief Financial Officer Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(10_00_000),
            requiredRoleId: role.CFO!.id, actionType: "APPROVE", escalationHours: 72 },
        ],
      },
    },
  });

  // --- Purchase Order and Contract ---------------------------------------
  const poV1 = await db.workflowDefinition.create({
    data: {
      name: "Work Order Approval", documentType: "PURCHASE_ORDER", version: 1, isActive: true,
      description: "Procurement Head signs off every work order before issue.",
      createdById: admin.id, createdAt: daysAgo(240),
      steps: {
        create: [
          { sequence: 1, name: "Procurement Head Approval", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.PROCUREMENT_HEAD!.id, actionType: "APPROVE", escalationHours: 48 },
          { sequence: 2, name: "Managing Director Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(50_00_000),
            requiredRoleId: role.MANAGING_DIRECTOR!.id, actionType: "APPROVE", escalationHours: 96 },
        ],
      },
    },
  });

  const contractV1 = await db.workflowDefinition.create({
    data: {
      name: "Contract Approval", documentType: "CONTRACT", version: 1, isActive: true,
      description: "Legal and divisional sign-off on contracts and annual maintenance agreements.",
      createdById: admin.id, createdAt: daysAgo(240),
      steps: {
        create: [
          { sequence: 1, name: "Divisional Head Review", conditionType: "ALWAYS", conditionValue: "",
            requiredRoleId: role.DIVISIONAL_HEAD!.id, actionType: "REVIEW", escalationHours: 72 },
          { sequence: 2, name: "Managing Director Approval", conditionType: "AMOUNT_ABOVE", conditionValue: L(25_00_000),
            requiredRoleId: role.MANAGING_DIRECTOR!.id, actionType: "APPROVE", escalationHours: 120 },
        ],
      },
    },
  });

  return { requisitionV3: v3, requisitionV2: v2, requisitionV1: v1, tenderV2, invoiceV2, poV1, contractV1 };
}
