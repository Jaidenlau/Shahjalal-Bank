/**
 * Integrity finding vocabulary and thresholds.
 *
 * Split from the engine so client components can import the labels without
 * pulling the database into the browser bundle.
 */

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface Evidence {
  label: string;
  value: string;
}

export interface Finding {
  code: DetectorCode;
  severity: Severity;
  /** What the finding is about, in one line. */
  subject: string;
  /** Plain English, readable from the back of a room. */
  detail: string;
  evidence: Evidence[];
  /** Money at stake, in poisha, where the finding has an amount. */
  amount?: number;
  /** Document numbers a reviewer would go and open. */
  references: string[];
}

export type DetectorCode =
  | "SPLIT_PURCHASE"
  | "PRICE_DRIFT"
  | "VENDOR_CONCENTRATION"
  | "BID_CLUSTERING"
  | "REPEAT_WINNER"
  | "RAPID_APPROVAL"
  | "SINGLE_BID";

export interface DetectorDef {
  code: DetectorCode;
  name: string;
  /** What a reviewer should understand the test to be. */
  question: string;
  /** Why a bank cares. */
  matters: string;
  threshold: string;
}

/**
 * The seven tests, and the thresholds they run at.
 *
 * The thresholds below are defaults. They are shown on screen next to every
 * finding precisely so nobody has to take the number on trust, and in an
 * implementation they are set by the Bank against its own procurement policy
 * rather than by us. A control whose threshold is invisible is a control
 * nobody can argue with, which makes it useless to an auditor.
 */
export const DETECTORS: Record<DetectorCode, DetectorDef> = {
  SPLIT_PURCHASE: {
    code: "SPLIT_PURCHASE",
    name: "Split purchase",
    question: "Were several small orders placed with one supplier in a short window that together cross an approval threshold?",
    matters: "Splitting a purchase is the ordinary way an approval limit gets avoided. Each order looks unremarkable; the pattern does not.",
    threshold: "2 or more work orders to one vendor within 30 days, each below ৳ 20,00,000, together at or above it",
  },
  PRICE_DRIFT: {
    code: "PRICE_DRIFT",
    name: "Price drift",
    question: "Are we paying materially more for an item than we have paid before?",
    matters: "A price that moves without a reason is either a market change worth knowing about or a negotiation that went badly.",
    threshold: "Unit price 15% or more above the median of previous purchases of the same item",
  },
  VENDOR_CONCENTRATION: {
    code: "VENDOR_CONCENTRATION",
    name: "Vendor concentration",
    question: "How much of our spend goes to one supplier?",
    matters: "Concentration is a continuity risk before it is anything else. If that supplier fails, what stops?",
    threshold: "25% or more of total work order value in the period",
  },
  BID_CLUSTERING: {
    code: "BID_CLUSTERING",
    name: "Bid clustering",
    question: "Did the bids on a tender arrive suspiciously close together in price?",
    matters: "Genuinely independent bidders rarely land within a couple of percent of each other. It is the classic signature of an arrangement between them.",
    threshold: "3 or more bids with a spread of less than 3% between lowest and highest",
  },
  REPEAT_WINNER: {
    code: "REPEAT_WINNER",
    name: "Repeat winner",
    question: "Is one supplier winning an unusual share of tenders?",
    matters: "It may be that they are simply the best. It is worth being able to say that with a number rather than an impression.",
    threshold: "One vendor winning 40% or more of awarded tenders, with at least 3 awards",
  },
  RAPID_APPROVAL: {
    code: "RAPID_APPROVAL",
    name: "Approval without reading",
    question: "Was a document approved so quickly that nobody can have read it?",
    matters: "An approval is a control only if somebody looked. This measures whether they did.",
    threshold: "Approved within 60 seconds of arriving in the approver's queue",
  },
  SINGLE_BID: {
    code: "SINGLE_BID",
    name: "Single bid received",
    question: "Did an open tender attract only one bid?",
    matters: "One bid means no competition on price, whatever the method says. Often it points at a specification only one supplier can meet.",
    threshold: "An open or two-stage tender that closed with exactly 1 bid",
  },
};

export const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const THRESHOLDS = {
  splitWindowDays: 30,
  splitApprovalLimit: 20_00_000_00, // poisha — ৳ 20,00,000
  priceDriftPct: 15,
  concentrationPct: 25,
  clusterSpreadPct: 3,
  repeatWinnerPct: 40,
  repeatWinnerMinAwards: 3,
  rapidApprovalSeconds: 60,
};
