/**
 * Shariah vocabulary and the pure matching rule.
 *
 * Split out from shariah.ts so client components can import the structures and
 * decision labels without dragging the database and node:crypto into the
 * browser bundle. Nothing here touches a node built-in.
 */

export const STRUCTURES = [
  { code: "MURABAHA", name: "Murabaha", note: "Cost-plus sale at a disclosed margin." },
  { code: "IJARAH", name: "Ijarah", note: "Lease of usufruct for a known term and rental." },
  { code: "ISTISNA", name: "Istisna", note: "Commissioned manufacture or construction." },
  { code: "SALAM", name: "Salam", note: "Advance payment for deferred delivery of a described good." },
  { code: "WAKALAH", name: "Wakalah", note: "Agency arrangement on a fee basis." },
  { code: "NOT_APPLICABLE", name: "Not applicable", note: "Ordinary spot purchase requiring no structure." },
  { code: "NOT_ASSESSED", name: "Not assessed", note: "Awaiting Committee assessment." },
] as const;

export function structureName(code: string): string {
  return STRUCTURES.find(s => s.code === code)?.name ?? code;
}

export const DECISIONS: Record<string, { label: string; tone: "success" | "warn" | "danger" | "muted" }> = {
  PENDING: { label: "Awaiting Committee", tone: "warn" },
  APPROVED: { label: "Approved", tone: "success" },
  APPROVED_WITH_CONDITIONS: { label: "Approved with conditions", tone: "warn" },
  REFERRED_BACK: { label: "Referred back", tone: "danger" },
};

// ---------------------------------------------------------------------------
// THE SCREENING ENGINE
// ---------------------------------------------------------------------------

export interface ScreenTarget {
  documentType: "Vendor" | "Contract" | "PurchaseOrder" | "CanteenSupply";
  documentId: string;
  documentLabel: string;
  /** Free text the rules' patterns are matched against. */
  text: string;
  /** Present for documents that carry a value, in poisha. */
  amount?: number;
}

export interface ScreenHit {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  severity: "REVIEW" | "PROHIBITED";
  detail: string;
  target: ScreenTarget;
}

/**
 * Match one document against one rule.
 *
 * Matching is deliberately dumb: case-insensitive substring against the
 * comma-separated terms the Committee entered. A rule that is hard to read is
 * a rule the Committee cannot audit, and a Committee that cannot audit its own
 * rules will not trust the output.
 */
export function matchRule(
  rule: { id: string; code: string; name: string; pattern: string; disposition: string; isActive: boolean },
  target: ScreenTarget,
): ScreenHit | null {
  if (!rule.isActive) return null;
  if (rule.disposition === "PERMITTED") return null;

  const terms = rule.pattern.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  if (terms.length === 0) return null;

  const haystack = target.text.toLowerCase();
  const matched = terms.find(t => haystack.includes(t));
  if (!matched) return null;

  return {
    ruleId: rule.id,
    ruleCode: rule.code,
    ruleName: rule.name,
    severity: rule.disposition === "PROHIBITED" ? "PROHIBITED" : "REVIEW",
    detail: `Matched the term "${matched}" in ${target.documentLabel}.`,
    target,
  };
}

