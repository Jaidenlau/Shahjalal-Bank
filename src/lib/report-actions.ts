"use server";

import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { num, formatBDT } from "./money";
import { formatDate } from "./date";
import { ENTITIES, type FieldDef } from "./report-schema";

/**
 * Report execution. The entity and column definitions live in report-schema.ts,
 * because a "use server" module may only export async functions.
 */

export interface ReportRow { [k: string]: string | number | null }

export interface ReportResult {
  columns: FieldDef[];
  rows: ReportRow[];
  total: number;
  generatedAt: string;
  filterSummary: string[];
  moneyTotals: Record<string, number>;
}

export async function runReport(
  entityKey: string, columnKeys: string[], filters: Record<string, string>,
): Promise<ReportResult> {
  const user = await requireUser();
  assertCan(user, "REPORT", "VIEW");

  const entity = ENTITIES.find(e => e.key === entityKey);
  if (!entity) throw new Error("Unknown entity.");
  const columns = entity.fields.filter(f => columnKeys.includes(f.key));

  const raw = await fetchRows(entityKey);
  const active = Object.entries(filters).filter(([, v]) => v);

  const rows = raw.filter(r =>
    active.every(([k, v]) => String(r[k] ?? "").toLowerCase() === v.toLowerCase()));

  const moneyTotals: Record<string, number> = {};
  for (const c of columns) {
    if (c.type === "money") {
      moneyTotals[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
  }

  return {
    columns,
    rows: rows.map(r => Object.fromEntries(columns.map(c => [c.key, r[c.key] ?? null]))),
    total: rows.length,
    generatedAt: new Date().toISOString(),
    filterSummary: active.map(([k, v]) => `${entity.fields.find(f => f.key === k)?.label ?? k}: ${v}`),
    moneyTotals,
  };
}

/** Distinct values for a filterable field, so the builder offers real options. */
export async function filterOptions(entityKey: string, field: string): Promise<string[]> {
  await requireUser();
  const raw = await fetchRows(entityKey);
  return Array.from(new Set(raw.map(r => String(r[field] ?? "")).filter(Boolean))).sort();
}

async function fetchRows(entityKey: string): Promise<ReportRow[]> {
  switch (entityKey) {
    case "requisition": {
      const rows = await prisma.requisition.findMany({
        include: {
          requestedBy: { select: { fullName: true } },
          department: { select: { code: true } },
          branch: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(r => ({
        requisitionNo: r.requisitionNo, title: r.title, type: r.type, status: r.status,
        department: r.department.code, branch: r.branch.name,
        requestedBy: r.requestedBy.fullName, costCenterCode: r.costCenterCode,
        totalEstimatedValue: num(r.totalEstimatedValue),
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? null,
      }));
    }
    case "tender": {
      const rows = await prisma.tender.findMany({
        include: { _count: { select: { bids: true } } }, orderBy: { createdAt: "desc" },
      });
      return rows.map(t => ({
        tenderNo: t.tenderNo, title: t.title, method: t.method,
        envelopeSystem: t.envelopeSystem, status: t.status,
        estimatedValue: num(t.estimatedValue), bidCount: t._count.bids,
        publishedAt: t.publishedAt?.toISOString() ?? null,
        closingAt: t.closingAt?.toISOString() ?? null,
        awardedAt: t.awardedAt?.toISOString() ?? null,
      }));
    }
    case "purchaseOrder": {
      const rows = await prisma.purchaseOrder.findMany({
        include: {
          vendor: { select: { companyName: true } },
          tender: { select: { tenderNo: true } },
          requisition: { select: { requisitionNo: true } },
        },
        orderBy: { issuedAt: "desc" },
      });
      return rows.map(p => ({
        poNo: p.poNo, vendor: p.vendor.companyName, status: p.status,
        totalAmount: num(p.totalAmount),
        tenderNo: p.tender?.tenderNo ?? "Direct",
        requisitionNo: p.requisition?.requisitionNo ?? "",
        issuedAt: p.issuedAt?.toISOString() ?? null,
        deliveryDueAt: p.deliveryDueAt?.toISOString() ?? null,
      }));
    }
    case "invoice": {
      const rows = await prisma.invoice.findMany({
        include: { vendor: { select: { companyName: true } } }, orderBy: { receivedAt: "desc" },
      });
      return rows.map(i => ({
        invoiceNo: i.invoiceNo, vendorInvoiceNo: i.vendorInvoiceNo,
        vendor: i.vendor.companyName, status: i.status, matchStatus: i.matchStatus,
        amount: num(i.amount), vatAmount: num(i.vatAmount),
        taxDeducted: num(i.taxDeducted), netPayable: num(i.netPayable),
        receivedAt: i.receivedAt.toISOString(), paidAt: i.paidAt?.toISOString() ?? null,
      }));
    }
    case "vendor": {
      const rows = await prisma.vendor.findMany({
        include: { _count: { select: { bids: true, purchaseOrders: true } } },
        orderBy: { companyName: "asc" },
      });
      return rows.map(v => ({
        companyName: v.companyName, tradeLicenseNo: v.tradeLicenseNo,
        enlistmentStatus: v.enlistmentStatus,
        tradeLicenseExpiry: v.tradeLicenseExpiry.toISOString(),
        contactPerson: v.contactPerson,
        bidCount: v._count.bids, poCount: v._count.purchaseOrders,
        enlistedAt: v.enlistedAt?.toISOString() ?? null,
      }));
    }
    case "asset": {
      const rows = await prisma.asset.findMany({ orderBy: { assetTag: "asc" } });
      return rows.map(a => ({
        assetTag: a.assetTag, name: a.name, category: a.category, status: a.status,
        location: a.location, purchaseCost: num(a.purchaseCost), bookValue: num(a.bookValue),
        purchaseDate: a.purchaseDate.toISOString(),
      }));
    }
    default:
      return [];
  }
}

/** CSV, formatted the way the rest of the system displays values. */
export async function exportCsv(
  entityKey: string, columnKeys: string[], filters: Record<string, string>,
): Promise<string> {
  const user = await requireUser();
  assertCan(user, "REPORT", "EXPORT");

  const result = await runReport(entityKey, columnKeys, filters);
  const head = result.columns.map(c => c.label);
  const lines = [head.map(csvCell).join(",")];

  for (const row of result.rows) {
    lines.push(result.columns.map(c => {
      const v = row[c.key];
      if (v === null || v === undefined) return "";
      if (c.type === "money") return csvCell(formatBDT(Number(v), { sign: false }));
      if (c.type === "date") return csvCell(formatDate(String(v)));
      return csvCell(String(v));
    }).join(","));
  }

  return lines.join("\r\n");
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
