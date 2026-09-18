/**
 * Domain errors. Each one exists because a control in the bid requires the
 * system to REFUSE an action rather than discourage it. They all carry a
 * `control` field naming the control that fired and where it is enforced, so
 * the UI can show not just "blocked" but why, and at which layer.
 */

export type ControlLayer = "MUTATION" | "DATA_ACCESS" | "WORKFLOW_ENGINE" | "PERMISSION";

export class ControlViolation extends Error {
  readonly isControlViolation = true;
  constructor(
    message: string,
    readonly control: string,
    readonly layer: ControlLayer,
    readonly detail: Record<string, string | number> = {},
    readonly reference: string = "",
  ) {
    super(message);
    this.name = "ControlViolation";
  }

  toJSON() {
    return {
      error: this.message,
      control: this.control,
      layer: this.layer,
      detail: this.detail,
      reference: this.reference,
    };
  }
}

/** Maker-checker: the creator of a record may never approve it. */
export class MakerCheckerViolation extends ControlViolation {
  constructor(detail: Record<string, string | number>) {
    super(
      "Maker-Checker control: you raised this document, so you cannot approve it. It must be actioned by a different user holding the required role.",
      "Maker-Checker",
      "MUTATION",
      detail,
      "Annexure-A 6(a)(iii) — Maker-Checker mechanism for every activity performed within the solution",
    );
    this.name = "MakerCheckerViolation";
  }
}

/** Two-envelope: financial parts are unreadable until technical evaluation completes. */
export class FinancialSealedError extends ControlViolation {
  constructor(detail: Record<string, string | number>) {
    super(
      "Financial offers for this tender are sealed. They cannot be read by any user, including administrators, until the technical evaluation is completed and signed off by the Technical Evaluation Committee.",
      "Two-Envelope Seal",
      "DATA_ACCESS",
      detail,
      "RFQ Clause 1.9 — Only technically qualified bidders will proceed to financial evaluation",
    );
    this.name = "FinancialSealedError";
  }
}

/** PO quantities must match the approved requisition. */
export class PurchaseOrderMismatchError extends ControlViolation {
  constructor(message: string, detail: Record<string, string | number>) {
    super(
      message,
      "Requisition / Work Order Quantity Match",
      "MUTATION",
      detail,
      "Annexure-B 3 — Item & Quantity matching of Requisition & approval with work order; error message if mismatch",
    );
    this.name = "PurchaseOrderMismatchError";
  }
}

/** RBAC refusal, enforced server side. */
export class PermissionDenied extends ControlViolation {
  constructor(module: string, action: string, roleNames: string) {
    super(
      `Access denied. Your roles (${roleNames}) do not carry the ${action} permission on ${module}.`,
      "Role-Based Access Control",
      "PERMISSION",
      { module, action, roles: roleNames },
      "Annexure-A 3(d)(i) — Parameterized role-based access control, configurable by the bank",
    );
    this.name = "PermissionDenied";
  }
}

/** Budget control on requisition submission. */
export class BudgetExceededError extends ControlViolation {
  constructor(detail: Record<string, string | number>) {
    super(
      "Budget control: this requisition exceeds the uncommitted balance remaining on the cost centre for the current financial year.",
      "Budget Control",
      "MUTATION",
      detail,
      "Annexure-B 22 — Apply Budget Control",
    );
    this.name = "BudgetExceededError";
  }
}

export function isControlViolation(e: unknown): e is ControlViolation {
  return typeof e === "object" && e !== null && "isControlViolation" in e;
}

/** Serialise any thrown value into something a client component can render. */
export function toErrorPayload(e: unknown) {
  if (isControlViolation(e)) return e.toJSON();
  return {
    error: e instanceof Error ? e.message : "An unexpected error occurred.",
    control: "",
    layer: "" as ControlLayer | "",
    detail: {},
    reference: "",
  };
}
