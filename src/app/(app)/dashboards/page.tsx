import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, countdown, financialYear } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Stat, Icon, EmptyRow,
} from "@/components/ui";
import { StatusBars, SpendBars } from "@/components/charts";

export const dynamic = "force-dynamic";

/**
 * The three electronic dashboards specified as Annexure-B modules 8, 9 and 10:
 * tender status, requisition status and work order status. Each carries the
 * exact field list named in the tender document.
 */
export default async function DashboardsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  assertCan(user, "DASHBOARD", "VIEW");
  const sp = await searchParams;
  const view = sp.view ?? "tender";

  const [tenders, requisitions, pos, reqStatus, budgets] = await Promise.all([
    prisma.tender.findMany({
      include: {
        createdBy: { select: { fullName: true, employeeId: true } },
        _count: { select: { bids: true } },
        requisitionLinks: { include: { requisition: { select: { requisitionNo: true } } } },
      },
      orderBy: [{ publishedAt: "desc" }],
    }),
    prisma.requisition.findMany({
      include: {
        requestedBy: { select: { fullName: true, employeeId: true } },
        department: { select: { code: true, name: true } },
        branch: { select: { name: true } },
        lines: { include: { item: { include: { category: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.purchaseOrder.findMany({
      include: {
        vendor: { select: { companyName: true } },
        lines: { include: { item: true } },
        tender: { select: { tenderNo: true, publishedAt: true, closingAt: true } },
        requisition: { select: { requisitionNo: true, createdAt: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.requisition.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.budget.findMany({ include: { department: { select: { code: true, name: true } } } }),
  ]);

  const byDept = new Map<string, { name: string; allocated: number; consumed: number }>();
  for (const b of budgets) {
    const cur = byDept.get(b.department.code) ?? { name: b.department.name, allocated: 0, consumed: 0 };
    cur.allocated += num(b.allocatedAmount);
    cur.consumed += num(b.consumedAmount);
    byDept.set(b.department.code, cur);
  }

  const tabs = [
    { key: "tender", label: "Tender status", module: "8" },
    { key: "requisition", label: "Requisition status", module: "9" },
    { key: "work-order", label: "Work order status", module: "10" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Modules 8, 9 and 10 — Electronic Dashboards"
        title="Dashboards"
        subtitle="The three dashboard views specified in the tender document, each carrying the field list named in Annexure-B."
      />

      <div className="mb-5 flex flex-wrap gap-1 border-b border-ink-200">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/dashboards?view=${t.key}`}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
              view === t.key
                ? "border-brand-600 text-brand-800"
                : "border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900"
            }`}
          >
            {t.label}
            <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-500">
              Module {t.module}
            </span>
          </Link>
        ))}
      </div>

      {view === "tender" ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total tenders" value={tenders.length} />
            <Stat label="Open" value={tenders.filter(t => t.status === "PUBLISHED").length} tone="success" />
            <Stat label="Under evaluation"
              value={tenders.filter(t => ["CLOSED", "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION"].includes(t.status)).length}
              tone="warn" />
            <Stat label="Awarded value"
              value={<Money value={tenders.filter(t => t.status === "AWARDED").reduce((s, t) => s + num(t.estimatedValue), 0)} compact />}
              tone="info" />
          </div>

          <div className="mb-5 grid gap-5 md:grid-cols-2">
            <Card pad={false}>
              <CardHeader title="Tenders by status" />
              <div className="p-5">
                <StatusBars data={Object.entries(
                  tenders.reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {}),
                ).map(([status, count]) => ({ status, count }))} />
              </div>
            </Card>
            <Card pad={false}>
              <CardHeader title="Tenders by procurement method" />
              <div className="p-5">
                <StatusBars data={Object.entries(
                  tenders.reduce<Record<string, number>>((a, t) => ({ ...a, [t.method]: (a[t.method] ?? 0) + 1 }), {}),
                ).map(([status, count]) => ({ status, count }))} />
              </div>
            </Card>
          </div>

          <Card pad={false}>
            <CardHeader title="Tender register" subtitle="Tender name and number, nature, location, publishing and closing dates, status, initiator and tagged requisitions" />
            <Table>
              <thead>
                <tr>
                  <Th width="165px">Tender no.</Th><Th>Tender name</Th><Th>Nature</Th>
                  <Th>Published</Th><Th>Closing</Th><Th align="center">Bids</Th>
                  <Th>Initiator</Th><Th>Requisition</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {tenders.map(t => (
                  <Tr key={t.id}>
                    <Td mono>
                      <Link href={`/tenders/${t.id}`} className="font-semibold text-brand-700 hover:underline">{t.tenderNo}</Link>
                    </Td>
                    <Td className="max-w-[240px] truncate">{t.title}</Td>
                    <Td className="text-ink-600">{enumLabel(t.method)}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{t.publishedAt ? formatDate(t.publishedAt) : "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-600">
                      {t.status === "PUBLISHED" && t.closingAt
                        ? <span className="font-semibold text-brand-700">{countdown(t.closingAt)}</span>
                        : t.closingAt ? formatDate(t.closingAt) : "—"}
                    </Td>
                    <Td align="center" className="tabular">{t._count.bids}</Td>
                    <Td className="whitespace-nowrap text-ink-600">
                      {t.createdBy.fullName}
                      <span className="block font-mono text-[11px] text-ink-400">{t.createdBy.employeeId}</span>
                    </Td>
                    <Td mono className="text-[11.5px] text-ink-600">
                      {t.requisitionLinks.map(r => r.requisition.requisitionNo).join(", ") || "—"}
                    </Td>
                    <Td><Pill status={t.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      ) : null}

      {view === "requisition" ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Requisitions" value={requisitions.length} sub="Most recent 60" />
            <Stat label="In approval" value={requisitions.filter(r => r.status === "UNDER_APPROVAL").length} tone="warn" />
            <Stat label="Approved" value={requisitions.filter(r => r.status === "APPROVED").length} tone="success" />
            <Stat label="Value" value={<Money value={requisitions.reduce((s, r) => s + num(r.totalEstimatedValue), 0)} compact />} tone="info" />
          </div>

          <div className="mb-5 grid gap-5 md:grid-cols-2">
            <Card pad={false}>
              <CardHeader title="Requisitions by status" />
              <div className="p-5"><StatusBars data={reqStatus.map(s => ({ status: s.status, count: s._count._all }))} /></div>
            </Card>
            <Card pad={false}>
              <CardHeader title="Budget by division" subtitle={`Financial year ${financialYear()}`} />
              <div className="p-5"><SpendBars data={Array.from(byDept.entries()).map(([code, v]) => ({ code, ...v }))} /></div>
            </Card>
          </div>

          <Card pad={false}>
            <CardHeader title="Requisition register" subtitle="Number, name, procuring entity, submission date, initiator, item category, CAPEX/OPEX and GL tagging" />
            <Table>
              <thead>
                <tr>
                  <Th width="165px">Requisition no.</Th><Th>Name</Th><Th>Procuring entity</Th>
                  <Th>Submitted</Th><Th>Initiator</Th><Th>Category</Th>
                  <Th align="center">CAPEX/OPEX</Th><Th align="center">GL / cost centre</Th>
                  <Th align="right">Value</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {requisitions.map(r => {
                  const cats = Array.from(new Set(r.lines.map(l => l.item.category.name)));
                  const capex = Array.from(new Set(r.lines.map(l => l.item.capexOpex)));
                  const gls = Array.from(new Set(r.lines.map(l => l.item.glCode)));
                  return (
                    <Tr key={r.id}>
                      <Td mono>
                        <Link href={`/requisitions/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.requisitionNo}</Link>
                      </Td>
                      <Td className="max-w-[220px] truncate">{r.title}</Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {r.department.code}
                        <span className="block text-[11px] text-ink-400">{r.branch.name}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-600">{r.submittedAt ? formatDate(r.submittedAt) : "—"}</Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {r.requestedBy.fullName}
                        <span className="block font-mono text-[11px] text-ink-400">{r.requestedBy.employeeId}</span>
                      </Td>
                      <Td className="max-w-[140px] truncate text-ink-600">{cats.join(", ")}</Td>
                      <Td align="center">
                        {capex.map(c => (
                          <span key={c} className={`mr-1 rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-bold ${
                            c === "CAPEX" ? "bg-info-100 text-info-700" : "bg-ink-100 text-ink-600"
                          }`}>{c}</span>
                        ))}
                      </Td>
                      <Td align="center" mono className="text-[11px] text-ink-600">
                        {gls.slice(0, 2).join(", ")}
                        <span className="block text-ink-400">{r.costCenterCode}</span>
                      </Td>
                      <Td align="right"><Money value={num(r.totalEstimatedValue)} /></Td>
                      <Td><Pill status={r.status} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      ) : null}

      {view === "work-order" ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Work orders" value={pos.length} />
            <Stat label="Open" value={pos.filter(p => ["ISSUED", "PARTIALLY_RECEIVED"].includes(p.status)).length} tone="warn" />
            <Stat label="Closed" value={pos.filter(p => p.status === "CLOSED").length} tone="success" />
            <Stat label="Total value" value={<Money value={pos.reduce((s, p) => s + num(p.totalAmount), 0)} compact />} tone="info" />
          </div>

          <Card pad={false}>
            <CardHeader title="Work order register" subtitle="Work order number and date, supplier, product, quantity, amount, and the requisition and tender each traces back to" />
            <Table>
              <thead>
                <tr>
                  <Th width="165px">Work order</Th><Th>Date</Th><Th>Supplier</Th>
                  <Th>Product</Th><Th align="right">Qty</Th><Th align="right">Amount</Th>
                  <Th>Requisition</Th><Th>Tender</Th><Th>Tender published</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pos.map(p => (
                  <Tr key={p.id}>
                    <Td mono>
                      <Link href={`/purchase-orders/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.poNo}</Link>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDate(p.issuedAt)}</Td>
                    <Td className="max-w-[170px] truncate">{p.vendor.companyName}</Td>
                    <Td className="max-w-[200px] truncate text-ink-600">
                      {p.lines.map(l => l.item.name).join(", ")}
                    </Td>
                    <Td align="right" className="tabular">{p.lines.reduce((s, l) => s + l.quantity, 0)}</Td>
                    <Td align="right"><Money value={num(p.totalAmount)} /></Td>
                    <Td mono className="text-[11.5px] text-ink-600">
                      {p.requisition?.requisitionNo ?? "—"}
                      {p.requisition ? <span className="block text-ink-400">{formatDate(p.requisition.createdAt)}</span> : null}
                    </Td>
                    <Td mono className="text-[11.5px] text-ink-600">{p.tender?.tenderNo ?? "Direct"}</Td>
                    <Td className="whitespace-nowrap text-[11.5px] text-ink-600">
                      {p.tender?.publishedAt ? formatDate(p.tender.publishedAt) : "—"}
                      {p.tender?.closingAt ? <span className="block text-ink-400">closed {formatDate(p.tender.closingAt)}</span> : null}
                    </Td>
                    <Td><Pill status={p.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      ) : null}
    </>
  );
}
