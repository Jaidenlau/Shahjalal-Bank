import type { PrismaClient } from "@prisma/client";
import { daysAgo } from "./rng";
import { purchaseOrderNo, tenderNo } from "../../src/lib/docno";

/**
 * Integrity cases.
 *
 * The generated procurement data is unrealistically well behaved: no supplier
 * ever drifts on price, no purchase is ever split, every tender attracts a
 * full field. Six months of a real bank's procurement contains all of those
 * things, usually with an innocent explanation and occasionally without one.
 *
 * So these are planted deliberately, and each is a pattern an internal audit
 * function would genuinely look for. Without them the integrity screen would
 * be an empty table, which proves nothing to anybody.
 */

export async function seedIntegrityCases(
  db: PrismaClient,
  users: Record<string, { id: string; fullName: string }>,
) {
  const YEAR = 2026;
  const shahidul = users["Shahidul Islam"]!;
  const planted: string[] = [];

  // --- 1. A split purchase ------------------------------------------------
  // Three orders to one supplier inside three weeks. Each sits below the
  // ৳ 20,00,000 board threshold and was approved at a lower tier; together
  // they are well above it.
  const furnisher = await db.vendor.findFirst({ where: { companyName: "Shahjahan Furnishers" } });
  const chair = await db.item.findFirst({ where: { name: { contains: "Chair" } } });
  if (furnisher && chair) {
    const legs = [
      { seq: 391, ageDays: 74, qty: 46, unit: 18_500_00 },
      { seq: 392, ageDays: 63, qty: 44, unit: 18_500_00 },
      { seq: 393, ageDays: 55, qty: 42, unit: 18_500_00 },
    ];
    for (const l of legs) {
      const total = l.qty * l.unit;
      const issuedAt = daysAgo(l.ageDays);
      const po = await db.purchaseOrder.create({
        data: {
          poNo: purchaseOrderNo("CSD", YEAR, l.seq),
          vendorId: furnisher.id,
          status: "ISSUED",
          subtotal: total, totalAmount: total,
          deliveryTerms: "Delivery to Central Store, Corporate Head Office, Gulshan, Dhaka, against delivery challan.",
          deliveryDueAt: daysAgo(l.ageDays - 14),
          issuedAt, createdAt: issuedAt, issuedById: shahidul.id,
          lines: { create: [{ itemId: chair.id, quantity: l.qty, unitPrice: l.unit, lineTotal: total }] },
        },
      });
      planted.push(po.poNo);
    }
  }

  // --- 2. Price drift -----------------------------------------------------
  // The same consumable, bought repeatedly at a steady price, then once at a
  // materially higher one. This is the cheapest money a procurement team ever
  // finds and nobody has the time to look for it by hand.
  const oilLines = await db.purchaseOrderLine.findMany({
    where: { item: { name: { contains: "Engine Oil" } } },
    include: { po: true },
    orderBy: { po: { issuedAt: "asc" } },
  });
  if (oilLines.length >= 3) {
    const last = oilLines[oilLines.length - 1]!;
    const bumped = Math.round(Number(last.unitPrice) * 1.24);
    await db.purchaseOrderLine.update({
      where: { id: last.id },
      data: { unitPrice: bumped, lineTotal: bumped * last.quantity },
    });
    const newTotal = bumped * last.quantity;
    const others = await db.purchaseOrderLine.findMany({ where: { poId: last.poId, id: { not: last.id } } });
    const rest = others.reduce((s, l) => s + Number(l.lineTotal), 0);
    await db.purchaseOrder.update({
      where: { id: last.poId },
      data: { subtotal: newTotal + rest, totalAmount: newTotal + rest },
    });
    planted.push(last.po.poNo);
  }

  // --- 3. Bid clustering --------------------------------------------------
  // Three bids landing within two percent of each other. In a small supplier
  // market this happens honestly; it is still the first thing an investigator
  // would look at, so the Bank should see it without being told.
  const clusterTender = await db.tender.findFirst({
    where: { tenderNo: `TND/SJIBL/${YEAR}/103` },
    include: { bids: { include: { financialPart: true } } },
  });
  if (clusterTender) {
    const priced = clusterTender.bids.filter(b => b.financialPart);
    const base = 15_40_000_00;
    const offsets = [0, 9_000_00, 18_000_00];
    for (const [i, b] of priced.slice(0, 3).entries()) {
      await db.bidFinancialPart.update({
        where: { bidId: b.id },
        data: { totalAmount: base + (offsets[i] ?? 0) },
      });
    }
    planted.push(clusterTender.tenderNo);
  }

  // --- 4. A tender that drew one bid --------------------------------------
  const soleVendor = await db.vendor.findFirst({ where: { companyName: "Meghna Technologies Ltd" } });
  const creator = users["Tanvir Ahmed"] ?? shahidul;
  if (soleVendor) {
    const t = await db.tender.create({
      data: {
        tenderNo: tenderNo(YEAR, 113),
        title: "Supply and installation of core network switches, Corporate Head Office",
        description: "Replacement of end-of-life distribution switches at the Corporate Head Office.",
        method: "OTM", envelopeSystem: "TWO", status: "CLOSED",
        estimatedValue: 42_00_000_00,
        createdById: creator.id,
        createdAt: daysAgo(58), publishedAt: daysAgo(55), closingAt: daysAgo(40), closedAt: daysAgo(40),
      },
    });
    await db.bid.create({
      data: {
        tenderId: t.id, vendorId: soleVendor.id, status: "SUBMITTED",
        intentionToBidAt: daysAgo(52), submittedAt: daysAgo(41),
      },
    });
    planted.push(t.tenderNo);
  }

  // --- 5. An approval nobody could have read ------------------------------
  // Eight seconds between the document arriving and being approved.
  const action = await db.workflowAction.findFirst({
    where: { action: "APPROVED" },
    include: { instance: true },
    orderBy: { actedAt: "desc" },
  });
  if (action) {
    await db.workflowAction.update({
      where: { id: action.id },
      data: { actedAt: new Date(action.instance.startedAt.getTime() + 8_000), comments: "" },
    });
  }

  return { planted };
}
