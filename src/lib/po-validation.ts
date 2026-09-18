import type { Tx } from "./db";
import { PurchaseOrderMismatchError } from "./errors";
import { formatBDT, num } from "./money";

/**
 * PURCHASE ORDER / REQUISITION MATCHING
 *
 * Annexure-B, module 3, e-Procurement Management, required:
 *   "Item & Quantity matching of Requisition & Board/EC/Mgt. approval with
 *    work order; Error message if mismatch"
 *
 * The bank asked for this by name, so the refusal message names the item, the
 * approved quantity and the attempted quantity rather than saying "validation
 * failed". It has to be readable from the back of a room on a projector.
 */

export interface ProposedPoLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number; // poisha
}

export interface ValidationContext {
  requisitionNo: string;
  approvalReference: string;
  /** Approved purchase quantities by itemId, from the requisition's lines. */
  approved: Map<string, { itemCode: string; itemName: string; quantity: number; estimatedUnitPrice: number }>;
}

/**
 * Build the approved position from the source requisition. Only the quantity
 * routed TO_PURCHASE is authorised for a work order; anything the stock check
 * routed to the store was never approved for purchase.
 */
export async function buildValidationContext(
  tx: Tx,
  requisitionId: string,
): Promise<ValidationContext> {
  const req = await tx.requisition.findUniqueOrThrow({
    where: { id: requisitionId },
    include: { lines: { include: { item: true } } },
  });

  const instance = await tx.workflowInstance.findFirst({
    where: { documentType: "REQUISITION", documentId: requisitionId, status: "APPROVED" },
    orderBy: { startedAt: "desc" },
  });

  const approved = new Map<string, { itemCode: string; itemName: string; quantity: number; estimatedUnitPrice: number }>();
  for (const line of req.lines) {
    const qty = line.quantityToPurchase > 0 ? line.quantityToPurchase : 0;
    if (qty <= 0) continue;
    approved.set(line.itemId, {
      itemCode: line.item.code,
      itemName: line.item.name,
      quantity: qty,
      estimatedUnitPrice: num(line.estimatedUnitPrice),
    });
  }

  return {
    requisitionNo: req.requisitionNo,
    approvalReference: instance?.id ?? "",
    approved,
  };
}

export interface MatchFinding {
  itemCode: string;
  itemName: string;
  approvedQuantity: number;
  attemptedQuantity: number;
  kind: "OVER" | "NOT_APPROVED" | "OK" | "UNDER";
}

/** Compare a proposed work order against the approved requisition position. */
export function matchReport(lines: ProposedPoLine[], ctx: ValidationContext): MatchFinding[] {
  const findings: MatchFinding[] = [];
  for (const line of lines) {
    const appr = ctx.approved.get(line.itemId);
    if (!appr) {
      findings.push({
        itemCode: line.itemCode, itemName: line.itemName,
        approvedQuantity: 0, attemptedQuantity: line.quantity, kind: "NOT_APPROVED",
      });
      continue;
    }
    if (line.quantity > appr.quantity) {
      findings.push({
        itemCode: appr.itemCode, itemName: appr.itemName,
        approvedQuantity: appr.quantity, attemptedQuantity: line.quantity, kind: "OVER",
      });
    } else if (line.quantity < appr.quantity) {
      findings.push({
        itemCode: appr.itemCode, itemName: appr.itemName,
        approvedQuantity: appr.quantity, attemptedQuantity: line.quantity, kind: "UNDER",
      });
    } else {
      findings.push({
        itemCode: appr.itemCode, itemName: appr.itemName,
        approvedQuantity: appr.quantity, attemptedQuantity: line.quantity, kind: "OK",
      });
    }
  }
  return findings;
}

/**
 * Refuse to issue a work order that does not match its approval.
 *
 * Over-quantity and unapproved items are hard failures: those are the cases
 * where money leaves the bank without an approval behind it. Under-quantity is
 * permitted, since a partial order against an approval is a legitimate
 * procurement decision, and it is reported rather than blocked.
 */
export function assertPoMatchesRequisition(lines: ProposedPoLine[], ctx: ValidationContext): MatchFinding[] {
  const findings = matchReport(lines, ctx);

  const over = findings.find(f => f.kind === "OVER");
  if (over) {
    throw new PurchaseOrderMismatchError(
      `Cannot issue purchase order. Item: ${over.itemName}. Approved quantity: ${over.approvedQuantity}. ` +
        `Attempted quantity: ${over.attemptedQuantity}. Purchase order quantities must match the approved requisition.`,
      {
        item: over.itemName,
        itemCode: over.itemCode,
        approvedQuantity: over.approvedQuantity,
        attemptedQuantity: over.attemptedQuantity,
        excess: over.attemptedQuantity - over.approvedQuantity,
        sourceRequisition: ctx.requisitionNo,
      },
    );
  }

  const unapproved = findings.find(f => f.kind === "NOT_APPROVED");
  if (unapproved) {
    throw new PurchaseOrderMismatchError(
      `Cannot issue purchase order. Item: ${unapproved.itemName} does not appear on the approved requisition ` +
        `${ctx.requisitionNo}. Approved quantity: 0. Attempted quantity: ${unapproved.attemptedQuantity}. ` +
        `Every line on a purchase order must trace to an approved requisition line.`,
      {
        item: unapproved.itemName,
        itemCode: unapproved.itemCode,
        approvedQuantity: 0,
        attemptedQuantity: unapproved.attemptedQuantity,
        sourceRequisition: ctx.requisitionNo,
      },
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// THREE-WAY MATCH — PO / GRN / Invoice
// ---------------------------------------------------------------------------

export interface ThreeWayRow {
  itemCode: string;
  itemName: string;
  poQuantity: number;
  poUnitPrice: number;
  poLineTotal: number;
  grnQuantityReceived: number;
  grnQuantityAccepted: number;
  invoiceQuantity: number;
  invoiceUnitPrice: number;
  invoiceLineTotal: number;
  quantityMatches: boolean;
  priceMatches: boolean;
}

export interface ThreeWayResult {
  rows: ThreeWayRow[];
  matched: boolean;
  failures: string[];
  poTotal: number;
  invoiceTotal: number;
}

/**
 * PO, GRN and Invoice must agree on item, quantity and price before an
 * invoice can move to MATCHED. Annexure-B module 22:
 *   "Ability to perform three-way match (PO/Delivery Challan/Invoices)"
 */
export function threeWayMatch(args: {
  poLines: Array<{ itemCode: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number; poLineId: string }>;
  grnLines: Array<{ poLineId: string; quantityReceived: number; quantityAccepted: number }>;
  invoiceLines: Array<{ itemCode: string; quantity: number; unitPrice: number }>;
}): ThreeWayResult {
  const rows: ThreeWayRow[] = [];
  const failures: string[] = [];

  for (const po of args.poLines) {
    const grn = args.grnLines.filter(g => g.poLineId === po.poLineId);
    const received = grn.reduce((s, g) => s + g.quantityReceived, 0);
    const accepted = grn.reduce((s, g) => s + g.quantityAccepted, 0);
    const inv = args.invoiceLines.find(i => i.itemCode === po.itemCode);

    const invQty = inv?.quantity ?? 0;
    const invPrice = inv?.unitPrice ?? 0;

    // The invoice may only bill for what was accepted, at the ordered price.
    const quantityMatches = invQty === accepted;
    const priceMatches = invPrice === po.unitPrice;

    if (!quantityMatches) {
      failures.push(
        `${po.itemName}: invoice bills ${invQty} unit(s) but only ${accepted} were received and accepted against ` +
          `purchase order quantity ${po.quantity}.`,
      );
    }
    if (!priceMatches) {
      failures.push(
        `${po.itemName}: invoice unit price ${formatBDT(invPrice)} does not match the purchase order price ` +
          `${formatBDT(po.unitPrice)}.`,
      );
    }

    rows.push({
      itemCode: po.itemCode,
      itemName: po.itemName,
      poQuantity: po.quantity,
      poUnitPrice: po.unitPrice,
      poLineTotal: po.lineTotal,
      grnQuantityReceived: received,
      grnQuantityAccepted: accepted,
      invoiceQuantity: invQty,
      invoiceUnitPrice: invPrice,
      invoiceLineTotal: invQty * invPrice,
      quantityMatches,
      priceMatches,
    });
  }

  // Anything billed that was never ordered.
  for (const inv of args.invoiceLines) {
    if (!args.poLines.some(p => p.itemCode === inv.itemCode)) {
      failures.push(`${inv.itemCode}: invoiced but does not appear on the purchase order.`);
    }
  }

  return {
    rows,
    matched: failures.length === 0,
    failures,
    poTotal: args.poLines.reduce((s, p) => s + p.lineTotal, 0),
    invoiceTotal: args.invoiceLines.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
  };
}
