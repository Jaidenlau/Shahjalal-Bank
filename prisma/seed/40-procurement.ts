import type { PrismaClient } from "@prisma/client";
import { requisitionNo, tenderNo } from "../../src/lib/docno";
import { num } from "../../src/lib/money";
import { daysAgo, daysAhead, int, pick, pickMany, weighted, chance } from "./rng";
import { buildInstance, stepsForDefinition } from "./helpers";

/**
 * Requisitions, tenders and bids.
 *
 * THE DEMO THREAD
 * Two requisitions are seeded deliberately and everything else is history:
 *
 *   REQ/CSD/2026/0845  Rezaul Karim, 15 laptops, UNDER_APPROVAL.
 *     A standing fallback. If anything goes wrong with creating a requisition
 *     live on stage, the maker-checker refusal can still be shown on this one,
 *     and it keeps Farhana's approval queue non-empty from the opening screen.
 *
 *   REQ/CSD/2026/0846  The approved requisition behind tender TND/SJIBL/2026/112.
 *
 *   TND/SJIBL/2026/112  Published 11 days ago, closed yesterday, three bids in,
 *     technical envelopes unopened and financial envelopes sealed. A tender
 *     cannot be published and closed inside a fifteen-minute demo, so the
 *     two-envelope sequence runs against this one. Everything from the
 *     technical opening onward is performed live.
 *
 * Live creation during the demo continues from REQ/CSD/2026/0847 and
 * TND/SJIBL/2026/113, because the sequence readers take the numeric maximum.
 */

const REQ_TITLES: Array<[string, string]> = [
  ["Laptop replacement for branch operations staff", "IT"],
  ["Desktop computers for new account opening desks", "IT"],
  ["Replacement of dot matrix printers at cash counters", "IT"],
  ["Network switch upgrade for branch LAN", "IT"],
  ["UPS replacement for server room", "IT"],
  ["Toner cartridges — quarterly consumption", "IT"],
  ["Biometric attendance devices for branches", "IT"],
  ["Executive chairs for management floor", "FF"],
  ["Workstation clusters for expanded operations floor", "FF"],
  ["Filing cabinets for records room", "FF"],
  ["Teller counter refurbishment", "FF"],
  ["Visitor seating for branch waiting area", "FF"],
  ["A4 paper — half yearly indent", "OS"],
  ["Stationery indent for head office divisions", "OS"],
  ["Cheque book printing — annual requirement", "PB"],
  ["Letterhead and visiting card printing", "PB"],
  ["Branch signage board replacement", "PB"],
  ["Housekeeping consumables — monthly", "OS"],
  ["Drinking water supply for head office", "OS"],
  ["Air conditioner replacement, second floor", "EL"],
  ["Generator servicing and spare parts", "EL"],
  ["LED panel light replacement across floors", "EL"],
  ["Voltage stabilizers for branch equipment", "EL"],
  ["Vehicle tyre replacement — pool cars", "VT"],
  ["Engine oil and servicing consumables", "VT"],
  ["First aid boxes for all branches", "MD"],
  ["Interior painting, Motijheel branch", "CI"],
  ["Floor tile replacement, Dhanmondi branch", "CI"],
  ["Glass partition for manager's cabin", "CI"],
  ["Carpet tile replacement, head office", "CI"],
  ["Fire resistant safe for branch vault", "FF"],
  ["Scanner procurement for document digitisation", "IT"],
  ["Tablet devices for field verification officers", "IT"],
  ["Wireless access points for branch coverage", "IT"],
  ["Cat6 cabling for floor rewiring", "IT"],
  ["Ceiling fan replacement, Uttara branch", "EL"],
  ["Bookshelves for compliance department", "FF"],
  ["Register books and box files", "OS"],
  ["Envelope and printed stationery indent", "OS"],
  ["External hard drives for branch backup", "IT"],
  ["Blood pressure monitors for medical room", "MD"],
  ["Firewall appliance renewal for head office", "IT"],
  ["Patch panel and rack accessories", "IT"],
  ["Car battery replacement — pool vehicles", "VT"],
  ["Operator chairs for call centre", "FF"],
];

const JUSTIFICATIONS = [
  "Existing units beyond 5 year replacement cycle, repeated hardware failures affecting counter operations.",
  "Current stock exhausted. Required to maintain uninterrupted branch operations.",
  "Approved in the divisional budget for the current financial year under routine replacement.",
  "Equipment condemned by the technical inspection carried out last quarter.",
  "Required to support the additional headcount sanctioned for the division.",
  "Preventive replacement recommended in the internal audit observation of the last cycle.",
  "Branch expansion requirement as per the approved premises plan.",
  "Existing items damaged beyond economic repair; repair cost exceeds 60 percent of replacement value.",
  "Routine consumption indent based on the average monthly offtake of the last six months.",
  "Regulatory requirement for branch readiness as advised by the compliance division.",
];

export async function seedProcurement(
  db: PrismaClient,
  ctx: {
    dept: Record<string, { id: string; code: string; costCenterCode: string }>;
    branch: Record<string, { id: string; code: string }>;
    role: Record<string, { id: string }>;
    users: Record<string, { id: string; fullName: string }>;
    items: Record<string, { id: string; code: string; name: string }>;
    vendors: Record<string, { id: string; companyName: string }>;
    workflows: {
      requisitionV3: { id: string; version: number };
      requisitionV2: { id: string; version: number };
      tenderV2: { id: string; version: number };
    };
  },
) {
  const YEAR = 2026;
  const { dept, branch, role, users, items, vendors, workflows } = ctx;

  const reqV3Steps = await stepsForDefinition(db, workflows.requisitionV3.id);
  const reqV2Steps = await stepsForDefinition(db, workflows.requisitionV2.id);
  const tenderSteps = await stepsForDefinition(db, workflows.tenderV2.id);

  // Who acts for a given approval role.
  const actorFor = (roleId: string) => {
    if (roleId === role.DEPT_HEAD!.id) return users["Farhana Akter"];
    if (roleId === role.DIVISIONAL_HEAD!.id) return users["Mizanur Rahman"];
    if (roleId === role.MANAGING_DIRECTOR!.id) return users["Abdul Mannan"];
    if (roleId === role.PROCUREMENT_HEAD!.id) return users["Tanvir Ahmed"];
    if (roleId === role.PURCHASE_COMMITTEE!.id) return users["Farhana Akter"];
    return undefined;
  };

  const initiators = [
    { u: users["Rezaul Karim"]!, d: "CSD", b: "GUL" },
    { u: users["Nusrat Jahan"]!, d: "GBD", b: "MOT" },
    { u: users["Sabbir Ahmed"]!, d: "GBD", b: "DHN" },
    { u: users["Tahmina Begum"]!, d: "HRD", b: "UTT" },
    { u: users["Imran Hossain"]!, d: "GBD", b: "AGR" },
    { u: users["Rakibul Hasan"]!, d: "CSD", b: "CHO" },
  ];

  const itemsByPrefix = (prefix: string) =>
    Object.values(items).filter(i => i.code.startsWith(prefix));

  const priceOf = new Map<string, number>();
  for (const sb of await db.stockBalance.findMany({ select: { itemId: true, lastPurchasePrice: true } })) {
    priceOf.set(sb.itemId, num(sb.lastPurchasePrice));
  }

  const createdRequisitions: Array<{ id: string; requisitionNo: string; status: string; value: number; createdAt: Date }> = [];

  // -------------------------------------------------------------------------
  // 45 historical requisitions, REQ/CSD/2026/0800 – 0844
  // -------------------------------------------------------------------------
  // Target spread: 22 closed, 8 approved awaiting tender, 6 under approval,
  // 5 rejected, 4 draft.
  const statusPlan: string[] = [
    ...Array(22).fill("CLOSED"),
    ...Array(8).fill("APPROVED"),
    ...Array(6).fill("UNDER_APPROVAL"),
    ...Array(5).fill("REJECTED"),
    ...Array(4).fill("DRAFT"),
  ];

  for (let i = 0; i < 45; i++) {
    const seq = 800 + i;
    const [title, prefix] = REQ_TITLES[i % REQ_TITLES.length]!;
    const status = statusPlan[i]!;
    const who = initiators[i % initiators.length]!;
    // Spread across the last six months, oldest first.
    const ageDays = Math.round(178 - (i / 44) * 172);
    const createdAt = daysAgo(ageDays);

    const pool = itemsByPrefix(prefix);
    const chosen = pickMany(pool, Math.min(pool.length, int(1, 3)));
    if (chosen.length === 0) continue;

    const lines = chosen.map(it => {
      const unit = priceOf.get(it.id) ?? 5000_00;
      const qty = unit > 500_000_00 ? int(1, 2) : unit > 50_000_00 ? int(2, 12) : int(5, 60);
      return { item: it, qty, unit };
    });
    const total = lines.reduce((s, l) => s + l.qty * l.unit, 0);

    const req = await db.requisition.create({
      data: {
        requisitionNo: requisitionNo("CSD", YEAR, seq),
        type: weighted([["PRE_FACTO", 7], ["REPAIR_MAINTENANCE", 2], ["POST_FACTO", 1]]),
        title,
        requestedById: who.u.id,
        departmentId: dept[who.d]!.id,
        branchId: branch[who.b]!.id,
        status,
        totalEstimatedValue: total,
        justification: pick(JUSTIFICATIONS),
        costCenterCode: dept[who.d]!.costCenterCode,
        createdAt,
        submittedAt: status === "DRAFT" ? null : createdAt,
        closedAt: status === "CLOSED" ? daysAgo(Math.max(1, ageDays - int(20, 60))) : null,
        lines: {
          create: lines.map(l => ({
            itemId: l.item.id,
            quantity: l.qty,
            estimatedUnitPrice: l.unit,
            fulfilmentRoute: "TO_PURCHASE",
            quantityFromStore: 0,
            quantityToPurchase: l.qty,
            remarks: "",
          })),
        },
      },
    });
    createdRequisitions.push({ id: req.id, requisitionNo: req.requisitionNo, status, value: total, createdAt });

    if (status === "DRAFT") continue;

    // Older requisitions ran under v2 of the workflow; recent ones under v3.
    // This is what makes version pinning visible on historical documents.
    const usedV2 = ageDays > 96;
    const steps = usedV2 ? reqV2Steps : reqV3Steps;
    const defId = usedV2 ? workflows.requisitionV2.id : workflows.requisitionV3.id;
    const version = usedV2 ? workflows.requisitionV2.version : workflows.requisitionV3.version;

    const applicableCount = steps.filter(s =>
      s.conditionType === "ALWAYS" || (s.conditionType === "AMOUNT_ABOVE" && total > Number(s.conditionValue)),
    ).length;

    const outcome = status === "REJECTED" ? "REJECTED"
      : status === "UNDER_APPROVAL" ? "IN_PROGRESS"
      : "APPROVED";
    const completed = outcome === "IN_PROGRESS" ? int(0, Math.max(0, applicableCount - 1))
      : outcome === "REJECTED" ? 1
      : applicableCount;

    await buildInstance(db, {
      definitionId: defId, version, steps,
      documentType: "REQUISITION", documentId: req.id,
      facts: { amount: total, departmentCode: who.d },
      initiatedById: who.u.id, startedAt: createdAt,
      completedSteps: completed, outcome, actorForRole: actorFor,
    });
  }

  // -------------------------------------------------------------------------
  // REQ/CSD/2026/0845 — the maker-checker fallback, still awaiting Farhana
  // -------------------------------------------------------------------------
  const laptop = items["IT-LAP-0041"]!;
  const laptopPrice = 118500_00;
  const fallbackCreated = daysAgo(2);
  const fallbackTotal = 15 * laptopPrice; // ৳ 17,77,500

  const fallbackReq = await db.requisition.create({
    data: {
      requisitionNo: requisitionNo("CSD", YEAR, 845),
      type: "PRE_FACTO",
      title: "Laptop replacement for branch operations staff",
      requestedById: users["Rezaul Karim"]!.id,
      departmentId: dept.CSD!.id,
      branchId: branch.GUL!.id,
      status: "UNDER_APPROVAL",
      totalEstimatedValue: fallbackTotal,
      justification: "Existing units beyond 5 year replacement cycle, repeated hardware failures affecting counter operations.",
      costCenterCode: dept.CSD!.costCenterCode,
      createdAt: fallbackCreated,
      submittedAt: fallbackCreated,
      lines: {
        create: [{
          itemId: laptop.id, quantity: 15, estimatedUnitPrice: laptopPrice,
          fulfilmentRoute: "TO_PURCHASE", quantityFromStore: 3, quantityToPurchase: 12,
          remarks: "Stock check at submission: 3 available in Central Store, 12 to be purchased.",
        }],
      },
    },
  });
  await buildInstance(db, {
    definitionId: workflows.requisitionV3.id, version: workflows.requisitionV3.version,
    steps: reqV3Steps, documentType: "REQUISITION", documentId: fallbackReq.id,
    facts: { amount: fallbackTotal, departmentCode: "CSD" },
    initiatedById: users["Rezaul Karim"]!.id, startedAt: fallbackCreated,
    completedSteps: 0, outcome: "IN_PROGRESS", actorForRole: actorFor,
  });

  // -------------------------------------------------------------------------
  // REQ/CSD/2026/0846 — approved, and the source of tender TND/SJIBL/2026/112
  // -------------------------------------------------------------------------
  const sourceCreated = daysAgo(18);
  const sourceTotal = 15 * laptopPrice;
  const sourceReq = await db.requisition.create({
    data: {
      requisitionNo: requisitionNo("CSD", YEAR, 846),
      type: "PRE_FACTO",
      title: "Laptop replacement for branch operations staff — Gulshan and Motijheel",
      requestedById: users["Rezaul Karim"]!.id,
      departmentId: dept.CSD!.id,
      branchId: branch.GUL!.id,
      status: "CONVERTED_TO_TENDER",
      totalEstimatedValue: sourceTotal,
      justification: "Existing units beyond 5 year replacement cycle, repeated hardware failures affecting counter operations.",
      costCenterCode: dept.CSD!.costCenterCode,
      createdAt: sourceCreated,
      submittedAt: sourceCreated,
      lines: {
        create: [{
          itemId: laptop.id, quantity: 15, estimatedUnitPrice: laptopPrice,
          fulfilmentRoute: "TO_PURCHASE", quantityFromStore: 3, quantityToPurchase: 12,
          remarks: "Stock check at submission: 3 available in Central Store, 12 to be purchased.",
        }],
      },
    },
  });
  await buildInstance(db, {
    definitionId: workflows.requisitionV3.id, version: workflows.requisitionV3.version,
    steps: reqV3Steps, documentType: "REQUISITION", documentId: sourceReq.id,
    facts: { amount: sourceTotal, departmentCode: "CSD" },
    initiatedById: users["Rezaul Karim"]!.id, startedAt: sourceCreated,
    completedSteps: 2, outcome: "APPROVED", actorForRole: actorFor,
    comments: [
      "Approved. Branch has confirmed the condition of the existing units.",
      "Approved. Within the IT capital allocation for the financial year. Route through open tender.",
    ],
  });

  // -------------------------------------------------------------------------
  // 12 historical tenders, TND/SJIBL/2026/100 – 111
  // -------------------------------------------------------------------------
  const tenderPlan: Array<{ status: string; title: string; value: number; ageDays: number }> = [
    { status: "AWARDED", title: "Supply of desktop computers for branch expansion", value: 2840000_00, ageDays: 168 },
    { status: "AWARDED", title: "Annual supply of A4 paper and printing stationery", value: 980000_00, ageDays: 152 },
    { status: "AWARDED", title: "Supply and installation of air conditioning units", value: 4260000_00, ageDays: 139 },
    { status: "AWARDED", title: "Executive furniture for management floor", value: 1640000_00, ageDays: 121 },
    { status: "AWARDED", title: "Network switch and structured cabling upgrade", value: 3180000_00, ageDays: 104 },
    { status: "AWARDED", title: "Cheque book printing for the financial year", value: 2240000_00, ageDays: 88 },
    { status: "AWARDED", title: "Supply of UPS units for branch server rooms", value: 1420000_00, ageDays: 71 },
    { status: "AWARDED", title: "Interior refurbishment, Dhanmondi branch", value: 5850000_00, ageDays: 54 },
    { status: "TECHNICAL_EVALUATION", title: "Supply of biometric attendance devices", value: 1180000_00, ageDays: 34 },
    { status: "TECHNICAL_EVALUATION", title: "Vehicle tyre and battery annual rate contract", value: 860000_00, ageDays: 29 },
    { status: "PUBLISHED", title: "Supply of scanners for document digitisation", value: 1940000_00, ageDays: 9 },
    { status: "PUBLISHED", title: "Housekeeping and cleaning consumables, half yearly", value: 640000_00, ageDays: 5 },
  ];

  const approvedVendors = Object.values(vendors).filter(v =>
    !["Sonar Bangla Suppliers", "Jamuna IT Services"].includes(v.companyName));

  for (const [i, t] of tenderPlan.entries()) {
    const seq = 100 + i;
    const published = daysAgo(t.ageDays);
    const closing = daysAgo(t.ageDays - int(12, 18));
    const isOpen = t.status === "PUBLISHED";

    const tender = await db.tender.create({
      data: {
        tenderNo: tenderNo(YEAR, seq),
        title: t.title,
        description: `Procurement of ${t.title.toLowerCase()} for Shahjalal Islami Bank PLC, Common Services Division.`,
        method: weighted([["OTM", 6], ["LTM", 2], ["QM", 2]]),
        envelopeSystem: "TWO",
        status: t.status,
        estimatedValue: t.value,
        createdById: users["Shahidul Islam"]!.id,
        createdAt: daysAgo(t.ageDays + 6),
        publishedAt: published,
        closingAt: isOpen ? daysAhead(int(3, 12)) : closing,
        closedAt: isOpen ? null : closing,
        technicalEvaluationCompletedAt: t.status === "AWARDED" ? daysAgo(t.ageDays - int(19, 24)) : null,
        technicalEvaluationCompletedById: t.status === "AWARDED" ? users["Tanvir Ahmed"]!.id : null,
        awardedAt: t.status === "AWARDED" ? daysAgo(t.ageDays - int(25, 30)) : null,
      },
    });

    // Committees
    await db.committee.create({
      data: {
        tenderId: tender.id, type: "PURCHASE", name: "Purchase Committee",
        members: { create: [
          { userId: users["Shahidul Islam"]!.id, isChair: true },
          { userId: users["Farhana Akter"]!.id },
          { userId: users["Mizanur Rahman"]!.id },
        ] },
      },
    });
    await db.committee.create({
      data: {
        tenderId: tender.id, type: "OPENING", name: "Tender Opening Committee",
        members: { create: [
          { userId: users["Shahidul Islam"]!.id, isChair: true },
          { userId: users["Tanvir Ahmed"]!.id },
        ] },
      },
    });
    await db.committee.create({
      data: {
        tenderId: tender.id, type: "TECHNICAL_EVALUATION", name: "Technical Evaluation Committee",
        members: { create: [
          { userId: users["Tanvir Ahmed"]!.id, isChair: true },
          { userId: users["Farhana Akter"]!.id },
          { userId: users["Sharmin Akhter"]!.id },
        ] },
      },
    });

    await seedTenderDocuments(db, tender.id, t.title);

    // Bids
    const bidders = pickMany(approvedVendors, int(3, 4));
    for (const [j, v] of bidders.entries()) {
      const spread = 0.88 + j * 0.045;
      const amount = Math.round((t.value * spread) / 1000_00) * 1000_00;
      const status = t.status === "AWARDED"
        ? (j === 0 ? "AWARDED" : j === bidders.length - 1 ? "TECHNICAL_DISQUALIFIED" : "TECHNICAL_QUALIFIED")
        : "SUBMITTED";

      const bid = await db.bid.create({
        data: {
          tenderId: tender.id, vendorId: v.id, status,
          intentionToBidAt: daysAgo(t.ageDays - 2),
          submittedAt: isOpen ? (chance(0.6) ? daysAgo(int(1, 4)) : null) : daysAgo(t.ageDays - int(12, 17)),
          technicalScore: t.status === "AWARDED" ? (status === "TECHNICAL_DISQUALIFIED" ? int(40, 64) : int(72, 94)) : null,
          evaluatedAt: t.status === "AWARDED" ? daysAgo(t.ageDays - int(19, 23)) : null,
          evaluationComments: t.status === "AWARDED"
            ? (status === "TECHNICAL_DISQUALIFIED"
              ? "Did not meet the mandatory eligibility criteria set out in the tender document."
              : "Technically responsive. Meets the specification in full.")
            : null,
        },
      });

      await db.bidTechnicalPart.create({
        data: {
          bidId: bid.id,
          content: technicalNarrative(v.companyName, t.title),
          documents: JSON.stringify([
            { fileName: "technical-offer.pdf", fileSize: int(400, 2400) * 1024 },
            { fileName: "company-profile.pdf", fileSize: int(300, 1800) * 1024 },
            { fileName: "experience-certificates.pdf", fileSize: int(200, 1200) * 1024 },
          ]),
          submittedAt: daysAgo(t.ageDays - int(12, 17)),
          openedAt: isOpen ? null : daysAgo(t.ageDays - int(18, 19)),
          openedById: isOpen ? null : users["Tanvir Ahmed"]!.id,
        },
      });

      await db.bidFinancialPart.create({
        data: {
          bidId: bid.id,
          totalAmount: amount,
          lineItems: JSON.stringify([
            { itemCode: "—", itemName: t.title, quantity: 1, unitPrice: amount, lineTotal: amount },
          ]),
          documents: JSON.stringify([{ fileName: "financial-offer.pdf", fileSize: int(120, 600) * 1024 }]),
          sealedUntilTechnicalComplete: true,
          submittedAt: daysAgo(t.ageDays - int(12, 17)),
          openedAt: t.status === "AWARDED" ? daysAgo(t.ageDays - int(24, 25)) : null,
          openedById: t.status === "AWARDED" ? users["Tanvir Ahmed"]!.id : null,
        },
      });

      if (status === "AWARDED") {
        await db.tender.update({ where: { id: tender.id }, data: { awardedBidId: bid.id } });
      }
    }

    if (t.status !== "PUBLISHED") {
      await buildInstance(db, {
        definitionId: workflows.tenderV2.id, version: workflows.tenderV2.version,
        steps: tenderSteps, documentType: "TENDER", documentId: tender.id,
        facts: { amount: t.value },
        initiatedById: users["Shahidul Islam"]!.id, startedAt: daysAgo(t.ageDays + 5),
        completedSteps: 2, outcome: "APPROVED", actorForRole: actorFor,
      });
    }
  }

  // -------------------------------------------------------------------------
  // TND/SJIBL/2026/112 — THE DEMO TENDER
  // Closed yesterday. Technical envelopes unopened. Financial envelopes sealed.
  // -------------------------------------------------------------------------
  const demoPublished = daysAgo(11);
  const demoClosing = daysAgo(1);
  const purchaseQty = 12;
  const estimated = purchaseQty * laptopPrice; // ৳ 14,22,000

  const demoTender = await db.tender.create({
    data: {
      tenderNo: tenderNo(YEAR, 112),
      title: "Supply of 12 (twelve) laptop computers for branch operations",
      description:
        "Shahjalal Islami Bank PLC, Common Services Division, invites sealed tenders under the Open Tendering Method " +
        "for the supply of 12 (twelve) laptop computers to the specification set out in the technical schedule. " +
        "Tenders are to be submitted in two parts: a technical offer and a financial offer, in separate sealed envelopes.",
      method: "OTM",
      envelopeSystem: "TWO",
      status: "CLOSED",
      estimatedValue: estimated,
      createdById: users["Shahidul Islam"]!.id,
      createdAt: daysAgo(15),
      publishedAt: demoPublished,
      closingAt: demoClosing,
      closedAt: demoClosing,
      technicalEvaluationCompletedAt: null, // THE SEAL IS ON
      awardedAt: null,
      requisitionLinks: { create: [{ requisitionId: sourceReq.id }] },
    },
  });

  await db.committee.create({
    data: {
      tenderId: demoTender.id, type: "PURCHASE", name: "Purchase Committee",
      members: { create: [
        { userId: users["Shahidul Islam"]!.id, isChair: true },
        { userId: users["Farhana Akter"]!.id },
        { userId: users["Mizanur Rahman"]!.id },
      ] },
    },
  });
  await db.committee.create({
    data: {
      tenderId: demoTender.id, type: "OPENING", name: "Tender Opening Committee",
      members: { create: [
        { userId: users["Shahidul Islam"]!.id, isChair: true },
        { userId: users["Tanvir Ahmed"]!.id },
      ] },
    },
  });
  await db.committee.create({
    data: {
      tenderId: demoTender.id, type: "TECHNICAL_EVALUATION", name: "Technical Evaluation Committee",
      members: { create: [
        { userId: users["Tanvir Ahmed"]!.id, isChair: true },
        { userId: users["Farhana Akter"]!.id },
        { userId: users["Sharmin Akhter"]!.id },
      ] },
    },
  });

  await seedTenderDocuments(db, demoTender.id, "Supply of 12 (twelve) laptop computers for branch operations", {
    spec: laptopSpecDoc(purchaseQty),
  });

  await buildInstance(db, {
    definitionId: workflows.tenderV2.id, version: workflows.tenderV2.version,
    steps: tenderSteps, documentType: "TENDER", documentId: demoTender.id,
    facts: { amount: estimated },
    initiatedById: users["Shahidul Islam"]!.id, startedAt: daysAgo(14),
    completedSteps: 2, outcome: "APPROVED", actorForRole: actorFor,
    comments: [
      "Tender document reviewed and approved for publication under the Open Tendering Method.",
      "Purchase Committee concurrence recorded. Estimated value exceeds ৳ 10,00,000.",
    ],
  });

  // The three bids. Bengal is the cheapest AND the one that will fail the
  // technical evaluation, which is the entire point: it is what makes the seal
  // mean something, and it mirrors RFQ clause 1.10 — the bank is not obliged to
  // award to the lowest bidder.
  const demoBids: Array<{ vendor: string; amount: number; unit: number; hasDistributorCert: boolean; narrative: string }> = [
    {
      vendor: "Rahim Traders Ltd", amount: 1386000_00, unit: 115500_00, hasDistributorCert: true,
      narrative:
        "Offered model: Dell Latitude 5450, Intel Core i5-1335U, 16GB DDR5, 512GB NVMe SSD, 14 inch FHD display, " +
        "Windows 11 Professional preinstalled.\n\n" +
        "Warranty: 3 (three) years onsite, next business day response, backed by the manufacturer.\n" +
        "Delivery: 15 (fifteen) working days from receipt of work order.\n" +
        "Authorised distributor certificate for Dell Technologies in Bangladesh: ENCLOSED (Annexure T-3).\n" +
        "Experience: supplied identical configuration to two scheduled banks in the last 24 months; certificates enclosed.",
    },
    {
      vendor: "Meghna Technologies Ltd", amount: 1404000_00, unit: 117000_00, hasDistributorCert: true,
      narrative:
        "Offered model: Dell Latitude 5450, Intel Core i5-1335U, 16GB DDR5, 512GB NVMe SSD, 14 inch FHD display, " +
        "Windows 11 Professional preinstalled.\n\n" +
        "Warranty: 3 (three) years onsite, backed by the manufacturer.\n" +
        "Delivery: 12 (twelve) working days from receipt of work order.\n" +
        "Authorised distributor certificate for Dell Technologies in Bangladesh: ENCLOSED (Annexure B).\n" +
        "Experience: corporate supply history with three financial institutions; certificates enclosed.",
    },
    {
      vendor: "Bengal Office Solutions", amount: 1320000_00, unit: 110000_00, hasDistributorCert: false,
      narrative:
        "Offered model: Dell Latitude 5450, Intel Core i5-1335U, 16GB DDR5, 512GB NVMe SSD, 14 inch FHD display.\n\n" +
        "Warranty: 1 (one) year carry-in through our own service centre.\n" +
        "Delivery: 20 (twenty) working days from receipt of work order.\n" +
        "Authorised distributor certificate for Dell Technologies in Bangladesh: NOT ENCLOSED. " +
        "Procurement is through an authorised reseller channel; a letter of undertaking is submitted in place of " +
        "the manufacturer's certificate.\n" +
        "Experience: supply history with corporate clients; certificates enclosed.",
    },
  ];

  for (const b of demoBids) {
    const vendor = vendors[b.vendor]!;
    const bid = await db.bid.create({
      data: {
        tenderId: demoTender.id,
        vendorId: vendor.id,
        status: "SUBMITTED", // evaluated live during the demo
        intentionToBidAt: daysAgo(9),
        submittedAt: daysAgo(int(2, 4)),
      },
    });

    await db.bidTechnicalPart.create({
      data: {
        bidId: bid.id,
        content: b.narrative,
        documents: JSON.stringify(
          b.hasDistributorCert
            ? [
                { fileName: "technical-offer.pdf", fileSize: 1_240_000 },
                { fileName: "authorised-distributor-certificate.pdf", fileSize: 486_000 },
                { fileName: "experience-certificates.pdf", fileSize: 920_000 },
                { fileName: "trade-licence-and-tin.pdf", fileSize: 610_000 },
              ]
            : [
                { fileName: "technical-offer.pdf", fileSize: 1_120_000 },
                { fileName: "letter-of-undertaking.pdf", fileSize: 240_000 },
                { fileName: "experience-certificates.pdf", fileSize: 780_000 },
                { fileName: "trade-licence-and-tin.pdf", fileSize: 590_000 },
              ],
        ),
        submittedAt: daysAgo(int(2, 4)),
        openedAt: null, // opened live on stage
        openedById: null,
      },
    });

    await db.bidFinancialPart.create({
      data: {
        bidId: bid.id,
        totalAmount: b.amount,
        lineItems: JSON.stringify([
          {
            itemCode: "IT-LAP-0041",
            itemName: "Laptop, Dell Latitude 5450, i5 16GB 512GB",
            quantity: purchaseQty,
            unitPrice: b.unit,
            lineTotal: b.unit * purchaseQty,
          },
        ]),
        documents: JSON.stringify([{ fileName: "financial-offer.pdf", fileSize: 312_000 }]),
        sealedUntilTechnicalComplete: true,
        submittedAt: daysAgo(int(2, 4)),
        openedAt: null, // SEALED
        openedById: null,
      },
    });
  }

  return {
    demoTender,
    sourceReq,
    fallbackReq,
    requisitions: createdRequisitions,
    laptop,
    laptopPrice,
  };
}

// ---------------------------------------------------------------------------

async function seedTenderDocuments(
  db: PrismaClient,
  tenderId: string,
  title: string,
  override: { spec?: string } = {},
) {
  const sections: Array<[string, string, string]> = [
    ["NOTICE", "Tender Notice",
      `Shahjalal Islami Bank PLC, Common Services Division, Corporate Head Office, invites sealed tenders for ${title.toLowerCase()}.\n\n` +
      `Tender documents may be downloaded from the vendor portal by enlisted vendors. Tenders must be submitted in two separate ` +
      `sealed parts, a technical offer and a financial offer, before the closing date and time stated in this notice. ` +
      `Late tenders will not be accepted.\n\n` +
      `The Bank reserves the right to accept or reject any or all tenders without assigning any reason.`],
    ["ELIGIBILITY", "Eligibility for Tender Participation",
      `1. The bidder must be enlisted with Shahjalal Islami Bank PLC or must apply for enlistment with this tender.\n` +
      `2. Valid trade licence, e-TIN and BIN/VAT registration must be submitted.\n` +
      `3. The bidder must hold a valid authorised distributor or dealer certificate from the manufacturer for the offered brand.\n` +
      `4. The bidder must demonstrate supply experience with at least two corporate or financial-sector clients.\n` +
      `5. Bank solvency certificate from a scheduled bank in Bangladesh.`],
    ["TECHNICAL_SPEC", "Technical Specification",
      override.spec ?? `Detailed technical specification for ${title.toLowerCase()} as set out in the schedule to this document. ` +
      `All offered items must be new, unused, and of the current production model. Refurbished or reconditioned items will be rejected.`],
    ["FINANCIAL_FORMAT", "Financial Offer Format",
      `The financial offer must be submitted in the prescribed format, in Bangladeshi Taka (BDT), quoting:\n` +
      `  (a) unit price excluding VAT;\n  (b) applicable VAT;\n  (c) total price.\n\n` +
      `Prices must remain valid for 90 (ninety) days from the date of tender opening. ` +
      `The financial offer must be submitted in a separate sealed envelope marked "FINANCIAL OFFER".`],
    ["SCOPE", "Scope of Work",
      `Supply, delivery to the addresses nominated by the Bank, unpacking, installation where applicable, and handover ` +
      `against a delivery challan. The successful bidder shall provide warranty support for the period quoted, ` +
      `with a nominated service contact for the Bank's IT Division.`],
    ["TERMS", "Terms and Conditions",
      `1. Delivery within the period quoted from the date of the work order.\n` +
      `2. Payment after successful delivery and acceptance, subject to deduction of applicable VAT and AIT under prevailing government rules.\n` +
      `3. 5% security money will be retained from the bill and released after the warranty period.\n` +
      `4. Penalty of 1% of the work order value per week of delay, capped at 5%.\n` +
      `5. The Bank is not bound to accept the lowest offer.`],
  ];

  for (const [i, [section, docTitle, content]] of sections.entries()) {
    await db.tenderDocument.create({
      data: {
        tenderId, section, title: docTitle, content,
        fileName: `${section.toLowerCase().replace(/_/g, "-")}.pdf`,
        fileSize: 80_000 + content.length * 40,
        sequence: i,
      },
    });
  }
}

function laptopSpecDoc(qty: number): string {
  return (
    `Item: Laptop computer\nQuantity: ${qty} (twelve) units\n\n` +
    `MANDATORY SPECIFICATION\n` +
    `  Processor        Intel Core i5, 13th generation or later\n` +
    `  Memory           16 GB DDR5, expandable\n` +
    `  Storage          512 GB NVMe SSD\n` +
    `  Display          14 inch, Full HD (1920x1080), anti-glare\n` +
    `  Operating System Windows 11 Professional, preinstalled and licensed\n` +
    `  Security         TPM 2.0, fingerprint reader\n` +
    `  Ports            USB-C, USB-A, HDMI, RJ45 or certified adapter\n` +
    `  Warranty         Minimum 3 (three) years onsite, manufacturer backed\n\n` +
    `MANDATORY DOCUMENTATION\n` +
    `  (a) Authorised distributor certificate from the manufacturer for Bangladesh.\n` +
    `  (b) Manufacturer's product datasheet for the offered model.\n` +
    `  (c) Experience certificates from at least two corporate or financial-sector clients.\n\n` +
    `Offers not accompanied by item (a) will be treated as technically non-responsive.`
  );
}

function technicalNarrative(vendor: string, title: string): string {
  return (
    `${vendor} submits its technical offer for ${title.toLowerCase()}.\n\n` +
    `All items offered are new and of the current production model, supplied through authorised channels. ` +
    `Delivery will be completed within the period quoted from the date of the work order. ` +
    `Warranty and after-sales support will be provided through our service facility in Dhaka, with a nominated ` +
    `contact for the Bank's IT Division.\n\n` +
    `Supporting documents: trade licence, e-TIN, BIN/VAT registration, bank solvency certificate, ` +
    `experience certificates and manufacturer authorisation are enclosed with this offer.`
  );
}
