import { prisma } from "./db";
import type { Tx } from "./db";
import { formatBDT, num } from "./money";
import { formatDate } from "./date";
import { THRESHOLDS, SEVERITY_ORDER } from "./integrity-types";
import type { Finding } from "./integrity-types";

export * from "./integrity-types";

/**
 * PROCUREMENT INTEGRITY
 *
 * Annexure-B asks this system to RECORD procurement. It never asks it to
 * examine procurement. That is the gap this module fills, and it is the only
 * part of the build that can save the Bank money rather than time.
 *
 * Everything here runs over data the system already holds. No new capture, no
 * extra work for anyone, no integration. The seven tests are the ones an
 * internal audit function would run by hand over a spreadsheet twice a year,
 * run continuously instead.
 *
 * A finding is a QUESTION, never an accusation. Every one of them has an
 * innocent explanation available, and the wording says so: split purchases
 * happen for legitimate operational reasons, a concentrated supplier may
 * simply be the only competent one, bids cluster in a small market. The
 * system's job is to put the question in front of a human with the evidence
 * attached, not to decide. Writing it any other way would make it unusable,
 * because nobody trusts a tool that calls their colleagues fraudsters.
 */

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** "an invoice", "a requisition" — small, but it is on a projector. */
const article = (documentType: string): string => {
  const w = documentType.toLowerCase();
  return `${/^[aeiou]/.test(w) ? "an" : "a"} ${w}`;
};

const pct = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

// ---------------------------------------------------------------------------

/** Several orders to one vendor, each under the limit, together over it. */
export async function detectSplitPurchases(client: Tx = prisma): Promise<Finding[]> {
  const pos = await client.purchaseOrder.findMany({
    where: { status: { not: "DRAFT" }, issuedAt: { not: null } },
    include: { vendor: { select: { companyName: true } } },
    orderBy: { issuedAt: "asc" },
  });

  const byVendor = new Map<string, typeof pos>();
  for (const p of pos) {
    const list = byVendor.get(p.vendorId) ?? [];
    list.push(p);
    byVendor.set(p.vendorId, list);
  }

  const findings: Finding[] = [];
  const windowMs = THRESHOLDS.splitWindowDays * 86_400_000;

  for (const [, list] of byVendor) {
    for (let i = 0; i < list.length; i += 1) {
      const start = list[i]!.issuedAt!.getTime();
      const group = list.filter(p => {
        const t = p.issuedAt!.getTime();
        return t >= start && t - start <= windowMs;
      });
      if (group.length < 2) continue;

      const each = group.every(p => num(p.totalAmount) < THRESHOLDS.splitApprovalLimit);
      const total = group.reduce((s, p) => s + num(p.totalAmount), 0);
      if (!each || total < THRESHOLDS.splitApprovalLimit) continue;

      // Only report the widest group that starts here, and only once.
      if (findings.some(f => group.some(g => f.references.includes(g.poNo)))) continue;

      findings.push({
        code: "SPLIT_PURCHASE",
        severity: "HIGH",
        subject: `${group.length} work orders to ${group[0]!.vendor.companyName} within ${THRESHOLDS.splitWindowDays} days`,
        detail:
          `Each of these ${group.length} work orders is below the ৳ 20,00,000 approval limit, so each was approved at a lower tier. ` +
          `Together they come to ${formatBDT(total)}, which is above it. That may be entirely ordinary operational timing — ` +
          `it is flagged so somebody can say so on the record.`,
        amount: total,
        evidence: [
          { label: "Vendor", value: group[0]!.vendor.companyName },
          { label: "Combined value", value: formatBDT(total) },
          { label: "Largest single order", value: formatBDT(Math.max(...group.map(p => num(p.totalAmount)))) },
          { label: "Period", value: `${formatDate(group[0]!.issuedAt!)} to ${formatDate(group[group.length - 1]!.issuedAt!)}` },
        ],
        references: group.map(p => p.poNo),
      });
    }
  }
  return findings;
}

/** Paying materially above what this Bank has paid for the same item before. */
export async function detectPriceDrift(client: Tx = prisma): Promise<Finding[]> {
  const lines = await client.purchaseOrderLine.findMany({
    include: {
      item: { select: { code: true, name: true } },
      po: { select: { poNo: true, issuedAt: true, status: true, vendor: { select: { companyName: true } } } },
    },
  });

  const byItem = new Map<string, typeof lines>();
  for (const l of lines) {
    if (l.po.status === "DRAFT" || !l.po.issuedAt) continue;
    const list = byItem.get(l.itemId) ?? [];
    list.push(l);
    byItem.set(l.itemId, list);
  }

  const findings: Finding[] = [];
  for (const [, list] of byItem) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.po.issuedAt!.getTime() - b.po.issuedAt!.getTime());
    const latest = sorted[sorted.length - 1]!;
    const prior = sorted.slice(0, -1).map(l => num(l.unitPrice));
    const base = median(prior);
    if (base === 0) continue;

    const now = num(latest.unitPrice);
    const drift = pct(now - base, base);
    if (drift < THRESHOLDS.priceDriftPct) continue;

    findings.push({
      code: "PRICE_DRIFT",
      severity: drift >= 30 ? "HIGH" : "MEDIUM",
      subject: `${latest.item.name} bought ${drift.toFixed(0)}% above the usual price`,
      detail:
        `The last ${sorted.length - 1} purchases of this item averaged ${formatBDT(base)} per unit. ` +
        `${latest.po.poNo} paid ${formatBDT(now)}. That is ${formatBDT(now - base)} more per unit, ` +
        `${formatBDT((now - base) * latest.quantity)} across the order. Prices do move; this one is worth a sentence in the file.`,
      amount: (now - base) * latest.quantity,
      evidence: [
        { label: "Item", value: `${latest.item.code} — ${latest.item.name}` },
        { label: "Usual unit price", value: formatBDT(base) },
        { label: "This order", value: formatBDT(now) },
        { label: "Vendor", value: latest.po.vendor.companyName },
        { label: "Quantity", value: String(latest.quantity) },
      ],
      references: [latest.po.poNo],
    });
  }
  return findings;
}

/** How much of the Bank's spend sits with one supplier. */
export async function detectVendorConcentration(client: Tx = prisma): Promise<Finding[]> {
  const pos = await client.purchaseOrder.findMany({
    where: { status: { not: "DRAFT" } },
    include: { vendor: { select: { companyName: true } } },
  });
  const total = pos.reduce((s, p) => s + num(p.totalAmount), 0);
  if (total === 0) return [];

  const byVendor = new Map<string, { name: string; value: number; count: number }>();
  for (const p of pos) {
    const e = byVendor.get(p.vendorId) ?? { name: p.vendor.companyName, value: 0, count: 0 };
    e.value += num(p.totalAmount);
    e.count += 1;
    byVendor.set(p.vendorId, e);
  }

  const findings: Finding[] = [];
  for (const [, v] of byVendor) {
    const share = pct(v.value, total);
    if (share < THRESHOLDS.concentrationPct) continue;
    findings.push({
      code: "VENDOR_CONCENTRATION",
      severity: share >= 40 ? "HIGH" : "MEDIUM",
      subject: `${v.name} holds ${share.toFixed(0)}% of work order value`,
      detail:
        `${formatBDT(v.value)} across ${v.count} work orders, out of ${formatBDT(total)} in total. ` +
        `This is a continuity question before it is anything else: if this supplier stopped trading tomorrow, ` +
        `what would the Bank be unable to buy?`,
      amount: v.value,
      evidence: [
        { label: "Vendor", value: v.name },
        { label: "Share of spend", value: `${share.toFixed(1)}%` },
        { label: "Work orders", value: String(v.count) },
        { label: "Value", value: formatBDT(v.value) },
      ],
      references: [],
    });
  }
  return findings;
}

/** Bids that land suspiciously close together. */
export async function detectBidClustering(client: Tx = prisma): Promise<Finding[]> {
  const tenders = await client.tender.findMany({
    where: { technicalEvaluationCompletedAt: { not: null } },
    include: { bids: { include: { financialPart: true, vendor: { select: { companyName: true } } } } },
  });

  const findings: Finding[] = [];
  for (const t of tenders) {
    const priced = t.bids
      .filter(b => b.financialPart)
      .map(b => ({ name: b.vendor.companyName, amount: num(b.financialPart!.totalAmount) }))
      .filter(b => b.amount > 0);
    if (priced.length < 3) continue;

    const lo = Math.min(...priced.map(b => b.amount));
    const hi = Math.max(...priced.map(b => b.amount));
    const spread = pct(hi - lo, lo);
    if (spread >= THRESHOLDS.clusterSpreadPct) continue;

    findings.push({
      code: "BID_CLUSTERING",
      severity: "HIGH",
      subject: `${priced.length} bids on ${t.tenderNo} within ${spread.toFixed(1)}% of each other`,
      detail:
        `Lowest ${formatBDT(lo)}, highest ${formatBDT(hi)} — a spread of ${formatBDT(hi - lo)}. ` +
        `Independent bidders pricing the same work rarely land this close. In a small supplier market it can happen ` +
        `honestly, which is why this is a question for the evaluation committee rather than a conclusion.`,
      evidence: [
        { label: "Tender", value: `${t.tenderNo} — ${t.title}` },
        { label: "Bids", value: String(priced.length) },
        { label: "Spread", value: `${spread.toFixed(2)}%` },
        ...priced.map(b => ({ label: b.name, value: formatBDT(b.amount) })),
      ],
      references: [t.tenderNo],
    });
  }
  return findings;
}

/** One supplier winning an unusual share of tenders. */
export async function detectRepeatWinner(client: Tx = prisma): Promise<Finding[]> {
  const awarded = await client.tender.findMany({
    where: { awardedBidId: { not: null } },
    include: { bids: { include: { vendor: { select: { companyName: true } } } } },
  });
  if (awarded.length === 0) return [];

  const wins = new Map<string, { name: string; count: number; tenders: string[] }>();
  for (const t of awarded) {
    const win = t.bids.find(b => b.id === t.awardedBidId);
    if (!win) continue;
    const e = wins.get(win.vendorId) ?? { name: win.vendor.companyName, count: 0, tenders: [] };
    e.count += 1;
    e.tenders.push(t.tenderNo);
    wins.set(win.vendorId, e);
  }

  const findings: Finding[] = [];
  for (const [, w] of wins) {
    const share = pct(w.count, awarded.length);
    if (w.count < THRESHOLDS.repeatWinnerMinAwards || share < THRESHOLDS.repeatWinnerPct) continue;
    findings.push({
      code: "REPEAT_WINNER",
      severity: "MEDIUM",
      subject: `${w.name} has won ${w.count} of ${awarded.length} awarded tenders`,
      detail:
        `${share.toFixed(0)}% of awards. They may simply be the strongest supplier in this category — ` +
        `the point is that the Bank can now say that with a number instead of an impression.`,
      evidence: [
        { label: "Vendor", value: w.name },
        { label: "Awards won", value: `${w.count} of ${awarded.length}` },
        { label: "Share", value: `${share.toFixed(0)}%` },
      ],
      references: w.tenders,
    });
  }
  return findings;
}

/** Approved too fast for anybody to have read it. */
export async function detectRapidApproval(client: Tx = prisma): Promise<Finding[]> {
  const actions = await client.workflowAction.findMany({
    where: { action: "APPROVED" },
    include: {
      actedBy: { select: { fullName: true, designation: true } },
      instance: { select: { documentType: true, startedAt: true, id: true } },
    },
    orderBy: { actedAt: "asc" },
  });

  // The clock starts when the step became actionable: the instance start for
  // step 1, otherwise the previous approval on the same instance.
  const previous = new Map<string, Date>();
  const findings: Finding[] = [];

  for (const a of actions) {
    const since = previous.get(a.workflowInstanceId) ?? a.instance.startedAt;
    previous.set(a.workflowInstanceId, a.actedAt);

    const seconds = (a.actedAt.getTime() - since.getTime()) / 1000;
    if (seconds < 0 || seconds >= THRESHOLDS.rapidApprovalSeconds) continue;

    findings.push({
      code: "RAPID_APPROVAL",
      severity: seconds < 15 ? "HIGH" : "LOW",
      subject: `${a.actedBy.fullName} approved ${article(a.instance.documentType)} in ${Math.round(seconds)} seconds`,
      detail:
        `The document reached this approver and was approved ${Math.round(seconds)} seconds later. ` +
        `An approval is a control only if somebody looked at what they were approving.`,
      evidence: [
        { label: "Approver", value: `${a.actedBy.fullName} — ${a.actedBy.designation}` },
        { label: "Time to decision", value: `${Math.round(seconds)} seconds` },
        { label: "Step", value: String(a.stepSequence) },
        { label: "Comment left", value: a.comments.trim() || "None" },
      ],
      references: [],
    });
  }
  return findings;
}

/** An open tender that drew a single bid. */
export async function detectSingleBid(client: Tx = prisma): Promise<Finding[]> {
  const tenders = await client.tender.findMany({
    where: { status: { in: ["CLOSED", "FINANCIAL_EVALUATION", "AWARDED"] }, method: { in: ["OTM", "TWO_STAGE"] } },
    include: { bids: { include: { vendor: { select: { companyName: true } } } } },
  });

  return tenders
    .filter(t => t.bids.length === 1)
    .map((t): Finding => ({
      code: "SINGLE_BID",
      severity: "MEDIUM",
      subject: `${t.tenderNo} closed with one bid`,
      detail:
        `An open tender that attracts a single bid has no price competition, whatever the method says. ` +
        `It is often a sign the specification could only be met by one supplier, which is worth knowing before the next one is written.`,
      amount: num(t.estimatedValue),
      evidence: [
        { label: "Tender", value: `${t.tenderNo} — ${t.title}` },
        { label: "Method", value: t.method },
        { label: "Only bidder", value: t.bids[0]!.vendor.companyName },
        { label: "Estimated value", value: formatBDT(num(t.estimatedValue)) },
      ],
      references: [t.tenderNo],
    }));
}

// ---------------------------------------------------------------------------

export interface IntegrityReport {
  findings: Finding[];
  counts: Record<string, number>;
  exposure: number;
  ranAt: Date;
}

/** Run every test. */
export async function runIntegrityScan(client: Tx = prisma): Promise<IntegrityReport> {
  const groups = await Promise.all([
    detectSplitPurchases(client),
    detectPriceDrift(client),
    detectVendorConcentration(client),
    detectBidClustering(client),
    detectRepeatWinner(client),
    detectRapidApproval(client),
    detectSingleBid(client),
  ]);

  const findings = groups.flat().sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return s !== 0 ? s : (b.amount ?? 0) - (a.amount ?? 0);
  });

  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.code] = (counts[f.code] ?? 0) + 1;

  // Concentration is a share of spend already counted elsewhere, so including
  // it in the exposure total would double-count the same money.
  const exposure = findings
    .filter(f => f.code !== "VENDOR_CONCENTRATION")
    .reduce((s, f) => s + (f.amount ?? 0), 0);

  return { findings, counts, exposure, ranAt: new Date() };
}
