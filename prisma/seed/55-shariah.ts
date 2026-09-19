import type { PrismaClient } from "@prisma/client";
import { daysAgo } from "./rng";
import { collectTargets } from "../../src/lib/shariah";
import { matchRule } from "../../src/lib/shariah-types";

/**
 * Shariah governance seed.
 *
 * The rules below are written the way a Shariah Supervisory Committee would
 * issue them: each carries the Committee decision reference it implements, and
 * each is a record the Committee edits, not logic compiled into the product.
 * The demo must be able to show the Committee changing its own rule and the
 * screening changing with it — that is the whole claim.
 *
 * The rule texts here are illustrative placeholders for a demonstration. The
 * real set would be supplied by the Bank's own Committee during implementation,
 * and nothing in this file should be read as a Shariah ruling by us.
 */

export async function seedShariah(
  db: PrismaClient,
  users: Record<string, { id: string; fullName: string }>,
) {
  const secretary = users["Mufti Sirajul Haque"]!;
  const chairman = users["Dr. Abdul Hakim"]!;

  const rules = [
    {
      code: "SSC-PC-01", ruleType: "PROHIBITED_CATEGORY", sequence: 10,
      name: "Interest-based financial services",
      description:
        "Suppliers whose business is the provision of interest-bearing finance may not be engaged for services " +
        "forming part of the Bank's own operations. Referred to the Committee on every occurrence.",
      disposition: "REVIEW",
      pattern: "interest, conventional bank, money lending, leasing finance",
      reference: "SSC Decision 2019/07, minute 4(b)",
    },
    {
      code: "SSC-PC-02", ruleType: "PROHIBITED_CATEGORY", sequence: 20,
      name: "Alcohol, tobacco and gambling",
      description:
        "The Bank does not procure from, or contract with, suppliers dealing in alcohol, tobacco or any form of " +
        "gambling. Engagement is prohibited without exception.",
      disposition: "PROHIBITED",
      pattern: "alcohol, liquor, brewery, tobacco, cigarette, casino, lottery, betting",
      reference: "SSC Decision 2016/02, minute 9",
    },
    {
      code: "SSC-PC-03", ruleType: "CERTIFICATION", sequence: 30,
      name: "Food supply without halal certification",
      description:
        "Any supplier of food or catering to Bank premises, including the staff canteen, must hold current halal " +
        "certification. Supply without a valid certificate is referred to the Committee.",
      disposition: "REVIEW",
      pattern: "catering, canteen, food, meat, poultry, restaurant",
      reference: "SSC Decision 2021/11, minute 6",
    },
    {
      code: "SSC-PT-01", ruleType: "PAYMENT_TERM", sequence: 40,
      name: "Interest on late or deferred payment",
      description:
        "Any term providing for interest on late payment, or for a price that increases with time, is referred to " +
        "the Committee before the contract is signed. A penalty representing compensation for actual loss is a " +
        "separate question the Committee decides case by case.",
      disposition: "REVIEW",
      pattern: "interest on late, late payment interest, per annum interest, compound",
      reference: "SSC Decision 2018/04, minute 3",
    },
    {
      code: "SSC-PT-02", ruleType: "PAYMENT_TERM", sequence: 50,
      name: "Delay penalty clauses",
      description:
        "Delay penalties in favour of the Bank are referred to the Committee to confirm the penalty represents " +
        "compensation for demonstrable loss rather than a charge for time. The Bank's standard work order carries " +
        "such a clause at 1% per week capped at 5%, so this rule engages on most work orders by design.",
      disposition: "REVIEW",
      pattern: "penalty, liquidated damages",
      reference: "SSC Decision 2022/03, minute 5(a)",
    },
    {
      code: "SSC-CS-01", ruleType: "CONTRACT_STRUCTURE", sequence: 60,
      name: "Lease agreements require Ijarah assessment",
      description:
        "Any agreement described as a lease, rental or hire must be assessed by the Committee against the " +
        "conditions of Ijarah before execution, including who bears ownership risk and maintenance.",
      disposition: "REVIEW",
      pattern: "lease, rental, hire, tenancy",
      reference: "SSC Decision 2017/09, minute 2",
    },
    {
      code: "SSC-CS-02", ruleType: "CONTRACT_STRUCTURE", sequence: 70,
      name: "Advance payment against future delivery",
      description:
        "Full payment in advance for goods delivered later engages the conditions of Salam and must be assessed. " +
        "Note that the Bank's own RFQ terms prohibit advance payment, so this rule rarely engages on procurement " +
        "raised under the standard terms.",
      disposition: "REVIEW",
      pattern: "advance payment, payment in advance, prepayment",
      reference: "SSC Decision 2017/09, minute 7",
    },
    {
      code: "SSC-CS-03", ruleType: "CONTRACT_STRUCTURE", sequence: 80,
      name: "Construction and fit-out contracts",
      description:
        "Interior, civil works and commissioned manufacture are assessed against the conditions of Istisna, " +
        "particularly the specification of the work and the payment schedule against progress.",
      disposition: "REVIEW",
      pattern: "construction, civil works, fit-out, interior, fabrication, manufacture",
      reference: "SSC Decision 2020/06, minute 8",
    },
  ];

  const created: Record<string, { id: string }> = {};
  for (const r of rules) {
    const row = await db.shariahRule.create({
      data: {
        ...r,
        isActive: true,
        updatedByName: r.sequence <= 40 ? chairman.fullName : secretary.fullName,
      },
    });
    created[r.code] = row;
  }

  // --- Vendor screening positions the Committee has already settled --------
  const vendors = await db.vendor.findMany({ orderBy: { companyName: "asc" } });
  let permitted = 0;
  for (const v of vendors) {
    const isFood = /cater|food|canteen|restaurant/i.test(v.companyName);
    await db.vendor.update({
      where: { id: v.id },
      data: {
        shariahStatus: isFood ? "REVIEW_REQUIRED" : "PERMITTED",
        shariahNote: isFood
          ? "Halal certification to be produced and verified before any catering engagement."
          : "No prohibited category identified in the enlisted categories.",
        shariahScreenedAt: daysAgo(isFood ? 12 : 40),
      },
    });
    if (!isFood) permitted += 1;
  }

  // --- Contract structures already assessed by the Committee ---------------
  const contracts = await db.contract.findMany({ orderBy: { contractNo: "asc" } });
  const structureFor = (type: string, title: string) => {
    if (/lease|rent/i.test(title) || type === "LEASE") return "IJARAH";
    if (/construct|interior|fit|civil/i.test(title)) return "ISTISNA";
    if (type === "AMC" || type === "SERVICE") return "WAKALAH";
    return "MURABAHA";
  };

  let assessed = 0;
  for (const c of contracts.slice(0, 11)) {
    const structure = structureFor(c.type, c.title);
    await db.contract.update({ where: { id: c.id }, data: { shariahStructure: structure } });
    await db.shariahReview.create({
      data: {
        documentType: "Contract",
        documentId: c.id,
        documentLabel: `${c.contractNo} — ${c.title}`,
        structure,
        decision: assessed % 5 === 3 ? "APPROVED_WITH_CONDITIONS" : "APPROVED",
        conditions:
          assessed % 5 === 3
            ? "Delay penalty to be applied only against loss the Bank can demonstrate, and waived where the delay is outside the supplier's control."
            : "",
        reference: `SSC/${2026 - (assessed % 2)}/${String(140 + assessed).padStart(4, "0")}`,
        raisedAt: daysAgo(60 - assessed),
        decidedAt: daysAgo(55 - assessed),
        decidedById: assessed % 2 === 0 ? secretary.id : chairman.id,
        decidedByName: assessed % 2 === 0 ? secretary.fullName : chairman.fullName,
      },
    });
    assessed += 1;
  }

  // --- Canteen: halal certification against each supply --------------------
  const canteen = await db.canteenOrder.findMany();
  const suppliers = [
    { name: "Bismillah Catering Services", cert: "BSTI/HAL/2026/0412", days: 210 },
    { name: "Tanvir Food Corner", cert: "BSTI/HAL/2025/1188", days: 40 },
    { name: "Nabila Caterers", cert: "", days: 0 },
  ];
  for (let i = 0; i < canteen.length; i += 1) {
    const s = suppliers[i % suppliers.length]!;
    await db.canteenOrder.update({
      where: { id: canteen[i]!.id },
      data: {
        supplierName: s.name,
        halalCertNo: s.cert,
        halalCertExpiry: s.cert ? new Date(Date.now() + s.days * 86400000) : null,
      },
    });
  }

  // --- Run the real screening engine over the seeded data -----------------
  // Deliberately the same functions the application calls at runtime. If the
  // seed screened differently from the product, the demo would be showing
  // something the product does not do.
  const targets = await collectTargets(db);
  const ruleRows = await db.shariahRule.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });

  let flags = 0;
  const seen = new Set<string>();
  for (const t of targets) {
    for (const r of ruleRows) {
      const hit = matchRule(r, t);
      if (!hit) continue;
      const k = `${hit.ruleId}|${t.documentType}|${t.documentId}`;
      if (seen.has(k)) continue;
      seen.add(k);

      // A document the Committee has already ruled on carries a closed flag,
      // so the queue shows genuinely outstanding work rather than everything.
      const settled = await db.shariahReview.findUnique({
        where: { documentType_documentId: { documentType: t.documentType, documentId: t.documentId } },
      });

      await db.shariahFlag.create({
        data: {
          ruleId: hit.ruleId,
          documentType: t.documentType,
          documentId: t.documentId,
          documentLabel: t.documentLabel,
          severity: hit.severity,
          detail: hit.detail,
          status: settled ? "CLEARED" : "OPEN",
          reviewId: settled?.id ?? null,
          raisedAt: daysAgo(settled ? 58 : 6),
        },
      });
      flags += 1;
    }
  }

  return {
    flags,
    rules: rules.length,
    vendorsPermitted: permitted,
    contractsAssessed: assessed,
    committee: [secretary.fullName, chairman.fullName],
  };
}
