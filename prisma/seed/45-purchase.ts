import type { PrismaClient } from "@prisma/client";
import { purchaseOrderNo, grnNo, invoiceNo, vendorInitials } from "../../src/lib/docno";
import { applyBp, num } from "../../src/lib/money";
import { financialYear } from "../../src/lib/date";
import { daysAgo, int, pick, pickMany, chance } from "./rng";
import { buildInstance, stepsForDefinition } from "./helpers";

/**
 * Budgets, work orders, goods receipts and invoices.
 *
 * One invoice is seeded with a deliberate quantity mismatch against its goods
 * receipt, so the three-way match failure state can be shown rather than only
 * described. The bid claims the match works; showing it catching something is
 * more convincing than showing it agreeing.
 */

export async function seedPurchase(
  db: PrismaClient,
  ctx: {
    dept: Record<string, { id: string; code: string; costCenterCode: string }>;
    role: Record<string, { id: string }>;
    users: Record<string, { id: string; fullName: string }>;
    items: Record<string, { id: string; code: string; name: string }>;
    vendors: Record<string, { id: string; companyName: string }>;
    workflows: { invoiceV2: { id: string; version: number }; poV1: { id: string; version: number } };
  },
) {
  const YEAR = 2026;
  const FY = financialYear();
  const { dept, role, users, items, vendors, workflows } = ctx;

  const invoiceSteps = await stepsForDefinition(db, workflows.invoiceV2.id);
  const actorFor = (roleId: string) => {
    if (roleId === role.FINANCE_OFFICER!.id) return users["Nasrin Sultana"];
    if (roleId === role.FINANCE_MANAGER!.id) return users["Kamrun Nahar"];
    if (roleId === role.CFO!.id) return users["Golam Mostafa"];
    return undefined;
  };

  // -------------------------------------------------------------------------
  // Budgets — allocation by division and GL for the financial year
  // -------------------------------------------------------------------------
  const budgetPlan: Array<[string, string, number, number]> = [
    // dept, gl, allocated, consumed
    ["CSD", "1204-01", 8500000_00, 5240000_00],
    ["CSD", "1204-02", 2200000_00, 1180000_00],
    ["CSD", "1206-01", 4800000_00, 2960000_00],
    ["CSD", "2301-04", 3200000_00, 2410000_00],
    ["CSD", "2301-06", 1800000_00, 1320000_00],
    ["CSD", "2304-01", 6500000_00, 3890000_00],
    ["ITD", "1204-01", 12000000_00, 7650000_00],
    ["ITD", "1204-05", 9500000_00, 6120000_00],
    ["ITD", "1204-03", 3400000_00, 1980000_00],
    ["FAD", "2301-04", 1200000_00, 740000_00],
    ["HRD", "2301-04", 900000_00, 520000_00],
    ["GBD", "1206-01", 5600000_00, 4180000_00],
    ["GBD", "2301-05", 4200000_00, 3340000_00],
  ];
  for (const [d, gl, allocated, consumed] of budgetPlan) {
    await db.budget.create({
      data: {
        financialYear: FY, departmentId: dept[d]!.id, glCode: gl,
        allocatedAmount: allocated, consumedAmount: consumed,
        committedAmount: Math.round(consumed * 0.12),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 20 work orders against the awarded tenders and direct purchases
  // -------------------------------------------------------------------------
  const awardedTenders = await db.tender.findMany({
    where: { status: "AWARDED" },
    include: { bids: { include: { vendor: true, financialPart: true } } },
    orderBy: { awardedAt: "asc" },
  });

  const allItems = Object.values(items);
  const priceOf = new Map<string, number>();
  for (const sb of await db.stockBalance.findMany({ select: { itemId: true, lastPurchasePrice: true } })) {
    priceOf.set(sb.itemId, num(sb.lastPurchasePrice));
  }

  interface SeededPo {
    id: string; poNo: string; vendorId: string; vendorName: string;
    total: number; issuedAt: Date;
    lines: Array<{ poLineId: string; itemId: string; itemCode: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  }
  const pos: SeededPo[] = [];

  const makePo = async (args: {
    seq: number; vendorId: string; vendorName: string; tenderId: string | null; bidId: string | null;
    ageDays: number; status: string;
    lines: Array<{ itemId: string; itemCode: string; itemName: string; quantity: number; unitPrice: number }>;
  }) => {
    const total = args.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const issuedAt = daysAgo(args.ageDays);
    const po = await db.purchaseOrder.create({
      data: {
        poNo: purchaseOrderNo("CSD", YEAR, args.seq),
        tenderId: args.tenderId, bidId: args.bidId, vendorId: args.vendorId,
        status: args.status, subtotal: total, totalAmount: total,
        deliveryTerms: "Delivery to Central Store, Corporate Head Office, Gulshan, Dhaka, against delivery challan.",
        deliveryDueAt: daysAgo(args.ageDays - int(12, 20)),
        issuedAt, issuedById: users["Shahidul Islam"]!.id, createdAt: issuedAt,
        lines: {
          create: args.lines.map(l => ({
            itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice,
            lineTotal: l.quantity * l.unitPrice,
          })),
        },
      },
      include: { lines: true },
    });
    const seeded: SeededPo = {
      id: po.id, poNo: po.poNo, vendorId: args.vendorId, vendorName: args.vendorName,
      total, issuedAt,
      lines: po.lines.map((pl, i) => ({
        poLineId: pl.id, itemId: pl.itemId,
        itemCode: args.lines[i]!.itemCode, itemName: args.lines[i]!.itemName,
        quantity: pl.quantity, unitPrice: num(pl.unitPrice), lineTotal: num(pl.lineTotal),
      })),
    };
    pos.push(seeded);
    return seeded;
  };

  let poSeq = 370;

  // Work orders traceable to an awarded tender.
  for (const t of awardedTenders) {
    const winner = t.bids.find(b => b.status === "AWARDED");
    if (!winner) continue;
    const amount = num(winner.financialPart?.totalAmount ?? t.estimatedValue);
    const chosen = pickMany(allItems, int(1, 3));
    const perLine = Math.floor(amount / chosen.length);
    await makePo({
      seq: poSeq++,
      vendorId: winner.vendorId, vendorName: winner.vendor.companyName,
      tenderId: t.id, bidId: winner.id,
      ageDays: Math.max(6, Math.floor((Date.now() - (t.awardedAt?.getTime() ?? Date.now())) / 86_400_000) - 2),
      status: "CLOSED",
      lines: chosen.map(it => {
        const unit = priceOf.get(it.id) ?? 10000_00;
        const qty = Math.max(1, Math.round(perLine / unit));
        return { itemId: it.id, itemCode: it.code, itemName: it.name, quantity: qty, unitPrice: unit };
      }),
    });
  }

  // Direct purchase work orders, to fill out the register to 20.
  const approvedVendorList = Object.values(vendors).filter(
    v => !["Sonar Bangla Suppliers", "Jamuna IT Services"].includes(v.companyName));
  while (pos.length < 20) {
    const v = pick(approvedVendorList);
    const chosen = pickMany(allItems, int(1, 2));
    const age = int(8, 150);
    await makePo({
      seq: poSeq++,
      vendorId: v.id, vendorName: v.companyName, tenderId: null, bidId: null,
      ageDays: age,
      status: age > 40 ? "CLOSED" : age > 20 ? "RECEIVED" : "ISSUED",
      lines: chosen.map(it => {
        const unit = priceOf.get(it.id) ?? 8000_00;
        return {
          itemId: it.id, itemCode: it.code, itemName: it.name,
          quantity: unit > 100_000_00 ? int(1, 4) : unit > 10_000_00 ? int(3, 15) : int(20, 120),
          unitPrice: unit,
        };
      }),
    });
  }

  // -------------------------------------------------------------------------
  // 15 goods receipts
  // -------------------------------------------------------------------------
  interface SeededGrn { id: string; grnNo: string; poId: string; lines: Array<{ poLineId: string; received: number; accepted: number }>; }
  const grns: SeededGrn[] = [];
  let grnSeq = 494;

  for (const [i, po] of pos.slice(0, 15).entries()) {
    // Most deliveries are complete; a couple are partial, which is what the
    // partial-delivery handling in the bid refers to.
    const partial = i === 3 || i === 9;
    const receivedAt = new Date(po.issuedAt.getTime() + int(6, 18) * 86_400_000);
    if (receivedAt.getTime() > Date.now()) continue;

    const lines = po.lines.map(l => {
      const received = partial ? Math.max(1, Math.floor(l.quantity * 0.6)) : l.quantity;
      // One consignment has a small rejection, which is realistic and gives the
      // accepted-versus-received columns something to show.
      const rejected = i === 6 ? Math.min(1, received) : 0;
      return { poLineId: l.poLineId, received, accepted: received - rejected, rejected };
    });

    const grn = await db.goodsReceiptNote.create({
      data: {
        grnNo: grnNo("CSD", YEAR, grnSeq++),
        poId: po.id,
        receivedAt,
        receivedById: pick([users["Rakibul Hasan"]!, users["Shahidul Islam"]!]).id,
        deliveryChallanNo: `CH/${vendorInitials(po.vendorName)}/${YEAR}/${int(1000, 9999)}`,
        status: partial ? "PARTIAL" : "FULL",
        remarks: partial
          ? "Partial delivery. Balance quantity to follow within the delivery period."
          : "Received in good order and condition.",
        lines: {
          create: lines.map(l => ({
            poLineId: l.poLineId, quantityReceived: l.received,
            quantityAccepted: l.accepted, quantityRejected: l.rejected,
            remarks: l.rejected > 0 ? "One unit rejected: physical damage to casing noted on inspection." : "",
          })),
        },
      },
    });
    grns.push({ id: grn.id, grnNo: grn.grnNo, poId: po.id, lines });
  }

  // -------------------------------------------------------------------------
  // 18 invoices, including one deliberate three-way match failure
  // -------------------------------------------------------------------------
  let invSeq = 215;
  const invoiceStatusPlan = [
    "PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PAID",
    "APPROVED", "APPROVED", "APPROVED",
    "MATCHED", "MATCHED",
    "UNDER_VERIFICATION", "UNDER_VERIFICATION", "UNDER_VERIFICATION",
    "RECEIVED", "RECEIVED",
    "DISPUTED", // the mismatch
  ];

  for (const [i, status] of invoiceStatusPlan.entries()) {
    const grn = grns[i % grns.length]!;
    const po = pos.find(p => p.id === grn.poId)!;
    const isMismatch = status === "DISPUTED";

    // Accepted quantities are what may legitimately be billed.
    const billedLines = po.lines.map(l => {
      const g = grn.lines.find(x => x.poLineId === l.poLineId);
      const accepted = g?.accepted ?? l.quantity;
      // The disputed invoice bills for more than was accepted.
      const quantity = isMismatch ? accepted + 3 : accepted;
      return { itemCode: l.itemCode, itemName: l.itemName, quantity, unitPrice: l.unitPrice };
    });

    const amount = billedLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (amount <= 0) continue;

    const vatAmount = applyBp(amount, 1500);
    const taxDeducted = applyBp(amount, 300);
    const securityDeposit = applyBp(amount, 500);
    const netPayable = amount - taxDeducted - securityDeposit;

    const receivedAt = daysAgo(int(3, 120));
    const invoice = await db.invoice.create({
      data: {
        invoiceNo: invoiceNo(vendorInitials(po.vendorName), YEAR, invSeq++),
        vendorInvoiceNo: `${vendorInitials(po.vendorName)}-${YEAR}-${int(100, 999)}`,
        poId: po.id, grnId: grn.id, vendorId: po.vendorId,
        amount, vatRateBp: 1500, vatAmount, aitRateBp: 300, taxDeducted,
        securityDeposit, netPayable,
        status, receivedAt,
        matchStatus: isMismatch ? "MISMATCH" : status === "RECEIVED" ? "NOT_RUN" : "MATCHED",
        matchReport: JSON.stringify(
          isMismatch
            ? billedLines.map(l => ({
                item: l.itemName,
                issue: `Invoice bills ${l.quantity} unit(s) against ${l.quantity - 3} received and accepted on ${grn.grnNo}.`,
              }))
            : [],
        ),
        paidAt: status === "PAID" ? new Date(receivedAt.getTime() + int(5, 20) * 86_400_000) : null,
      },
    });

    if (status !== "RECEIVED") {
      const completed = status === "PAID" || status === "APPROVED" ? 3
        : status === "MATCHED" ? 1
        : status === "DISPUTED" ? 1 : 1;
      await buildInstance(db, {
        definitionId: workflows.invoiceV2.id, version: workflows.invoiceV2.version,
        steps: invoiceSteps, documentType: "INVOICE", documentId: invoice.id,
        facts: { amount },
        initiatedById: users["Nasrin Sultana"]!.id, startedAt: receivedAt,
        completedSteps: completed,
        outcome: status === "PAID" || status === "APPROVED" ? "APPROVED"
          : status === "DISPUTED" ? "RETURNED" : "IN_PROGRESS",
        actorForRole: actorFor,
        comments: isMismatch
          ? ["Three-way match failed. Invoiced quantity exceeds the quantity received and accepted against the goods receipt note. Returned to the vendor for a revised invoice."]
          : undefined,
      });
    }
  }

  return { pos, grns };
}
