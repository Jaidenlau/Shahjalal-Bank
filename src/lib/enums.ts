/**
 * SQLite has no native enum support through Prisma, so enum-like columns are
 * stored as String and constrained here. These are the single source of truth
 * for allowed values and for their human labels.
 */

export const USER_TYPE = ["INTERNAL", "VENDOR"] as const;
export type UserType = (typeof USER_TYPE)[number];

export const REQUISITION_TYPE = ["PRE_FACTO", "POST_FACTO", "REPAIR_MAINTENANCE", "AUCTION"] as const;
export type RequisitionType = (typeof REQUISITION_TYPE)[number];

export const REQUISITION_STATUS = [
  "DRAFT", "SUBMITTED", "UNDER_APPROVAL", "APPROVED",
  "CONVERTED_TO_TENDER", "CLOSED", "REJECTED", "RETURNED",
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUS)[number];

export const FULFILMENT_ROUTE = ["FROM_STORE", "TO_PURCHASE"] as const;
export type FulfilmentRoute = (typeof FULFILMENT_ROUTE)[number];

export const TENDER_METHOD = ["OTM", "LTM", "QM", "DPM", "TWO_STAGE"] as const;
export type TenderMethod = (typeof TENDER_METHOD)[number];

export const TENDER_STATUS = [
  "DRAFT", "PENDING_APPROVAL", "PUBLISHED", "CLOSED",
  "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION", "AWARDED", "CANCELLED",
] as const;
export type TenderStatus = (typeof TENDER_STATUS)[number];

export const BID_STATUS = ["SUBMITTED", "TECHNICAL_QUALIFIED", "TECHNICAL_DISQUALIFIED", "AWARDED"] as const;
export type BidStatus = (typeof BID_STATUS)[number];

export const PO_STATUS = ["DRAFT", "PENDING_APPROVAL", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUS)[number];

export const INVOICE_STATUS = ["RECEIVED", "UNDER_VERIFICATION", "MATCHED", "APPROVED", "PAID", "DISPUTED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const CONDITION_TYPE = ["ALWAYS", "AMOUNT_ABOVE", "AMOUNT_BELOW", "DEPARTMENT_IS", "CATEGORY_IS"] as const;
export type ConditionType = (typeof CONDITION_TYPE)[number];

export const ACTION_TYPE = ["APPROVE", "REVIEW", "ACKNOWLEDGE"] as const;
export type ActionType = (typeof ACTION_TYPE)[number];

export const WORKFLOW_ACTION = ["APPROVED", "REJECTED", "RETURNED"] as const;
export type WorkflowActionKind = (typeof WORKFLOW_ACTION)[number];

export const COMMITTEE_TYPE = ["PURCHASE", "OPENING", "TECHNICAL_EVALUATION"] as const;
export type CommitteeType = (typeof COMMITTEE_TYPE)[number];

export const DOCUMENT_TYPE = ["REQUISITION", "TENDER", "PURCHASE_ORDER", "INVOICE", "CONTRACT"] as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[number];

/** Human labels. Anything user-facing reads from here, never from the raw value. */
export const LABELS: Record<string, string> = {
  // requisition type
  PRE_FACTO: "Pre-Facto", POST_FACTO: "Post-Facto",
  REPAIR_MAINTENANCE: "Repair & Maintenance", AUCTION: "Auction",
  // generic status
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_APPROVAL: "Under Approval",
  APPROVED: "Approved", CONVERTED_TO_TENDER: "Converted to Tender",
  CLOSED: "Closed", REJECTED: "Rejected", RETURNED: "Returned",
  PENDING_APPROVAL: "Pending Approval", PUBLISHED: "Published",
  TECHNICAL_EVALUATION: "Technical Evaluation", FINANCIAL_EVALUATION: "Financial Evaluation",
  AWARDED: "Awarded", CANCELLED: "Cancelled",
  ISSUED: "Issued", PARTIALLY_RECEIVED: "Partially Received", RECEIVED: "Received",
  UNDER_VERIFICATION: "Under Verification", MATCHED: "Matched", PAID: "Paid", DISPUTED: "Disputed",
  IN_PROGRESS: "In Progress",
  // fulfilment
  FROM_STORE: "Issue from Store", TO_PURCHASE: "Raise Purchase",
  // tender method
  OTM: "Open Tendering Method", LTM: "Limited Tendering Method",
  QM: "Quotation Method", DPM: "Direct Purchase Method", TWO_STAGE: "Two-Stage Tendering",
  // envelope
  SINGLE: "Single Envelope", TWO: "Two Envelope",
  // bid
  TECHNICAL_QUALIFIED: "Technically Qualified", TECHNICAL_DISQUALIFIED: "Technically Disqualified",
  // committee
  PURCHASE: "Purchase Committee", OPENING: "Tender Opening Committee",
  // condition
  ALWAYS: "Always applies", AMOUNT_ABOVE: "Amount above", AMOUNT_BELOW: "Amount below",
  DEPARTMENT_IS: "Department is", CATEGORY_IS: "Item category is",
  // action
  APPROVE: "Approve", REVIEW: "Review", ACKNOWLEDGE: "Acknowledge",
  // capex
  CAPEX: "CAPEX", OPEX: "OPEX",
  // vendor
  PENDING: "Pending", SUSPENDED: "Suspended",
  // match
  NOT_RUN: "Not run", MISMATCH: "Mismatch",
  // integration
  CONNECTED: "Connected", DEGRADED: "Degraded", PENDING_CONFIGURATION: "Pending configuration",
};

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? value.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

/** Status pill colour family. Keyed by raw status value. */
export type Tone = "neutral" | "info" | "warn" | "success" | "danger" | "sealed";

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral", SUBMITTED: "info", UNDER_APPROVAL: "warn", PENDING_APPROVAL: "warn",
  APPROVED: "success", CONVERTED_TO_TENDER: "info", CLOSED: "neutral",
  REJECTED: "danger", RETURNED: "warn", CANCELLED: "danger",
  PUBLISHED: "success", TECHNICAL_EVALUATION: "warn", FINANCIAL_EVALUATION: "warn",
  AWARDED: "success", ISSUED: "success", PARTIALLY_RECEIVED: "warn", RECEIVED: "info",
  UNDER_VERIFICATION: "warn", MATCHED: "success", PAID: "success", DISPUTED: "danger",
  TECHNICAL_QUALIFIED: "success", TECHNICAL_DISQUALIFIED: "danger",
  IN_PROGRESS: "warn", PENDING: "warn", SUSPENDED: "danger",
  CONNECTED: "success", DEGRADED: "warn", PENDING_CONFIGURATION: "neutral",
  MISMATCH: "danger", NOT_RUN: "neutral",
  FROM_STORE: "info", TO_PURCHASE: "warn",
  FULL: "success", PARTIAL: "warn",
  ACTIVE: "success", EXPIRED: "danger", TERMINATED: "danger",
  IN_USE: "success", UNDER_REPAIR: "warn", RETIRED: "neutral", DISPOSED: "neutral",
  OPEN: "success", SETTLED: "success", UNDER_REVIEW: "warn",
  IN_TRANSIT: "info", DELIVERED: "success", DELAYED: "warn", DAMAGED: "danger",
  SCHEDULED: "info", ARRIVED: "success", NO_SHOW: "neutral",
  PLACED: "info", PREPARING: "warn", SERVED: "success",
  COMPLETED: "success", OVERDUE: "danger", OPERATIONAL: "success",
};

export function tone(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return STATUS_TONE[status] ?? "neutral";
}
