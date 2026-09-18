import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { financialYear } from "@/lib/date";
import { Money, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const user = await requireUser();
  assertCan(user, "BUDGET", "VIEW");

  const budgets = await prisma.budget.findMany({
    include: { department: { select: { code: true, name: true, costCenterCode: true } } },
    orderBy: [{ department: { code: "asc" } }, { glCode: "asc" }],
  });

  const rows = budgets.map(b => {
    const allocated = num(b.allocatedAmount);
    const consumed = num(b.consumedAmount);
    const committed = num(b.committedAmount);
    return {
      id: b.id, financialYear: b.financialYear,
      deptCode: b.department.code, deptName: b.department.name,
      costCentre: b.department.costCenterCode, glCode: b.glCode,
      allocated, consumed, committed,
      available: allocated - consumed - committed,
      usedPct: allocated ? Math.round(((consumed + committed) / allocated) * 100) : 0,
    };
  });

  const totals = rows.reduce((a, r) => ({
    allocated: a.allocated + r.allocated,
    consumed: a.consumed + r.consumed,
    committed: a.committed + r.committed,
    available: a.available + r.available,
  }), { allocated: 0, consumed: 0, committed: 0, available: 0 });

  const tight = rows.filter(r => r.usedPct >= 85);

  const columns: Array<Column<(typeof rows)[number]>> = [
    { header: "Division", cell: r => (
      <>
        <div className="font-medium text-ink-900">{r.deptCode}</div>
        <div className="text-[11.5px] text-ink-500">{r.deptName}</div>
      </>
    ) },
    { header: "Cost centre", mono: true, className: "text-ink-600", cell: r => r.costCentre },
    { header: "GL code", mono: true, className: "text-ink-600", cell: r => r.glCode },
    { header: "Allocated", align: "right", cell: r => <Money value={r.allocated} /> },
    { header: "Consumed", align: "right", cell: r => <Money value={r.consumed} /> },
    { header: "Committed", align: "right", className: "text-ink-600", cell: r => <Money value={r.committed} /> },
    { header: "Available", align: "right", cell: r => (
      <span className={`font-semibold ${r.available <= 0 ? "text-danger-600" : "text-brand-700"}`}>
        <Money value={r.available} />
      </span>
    ) },
    { header: "Utilisation", width: "150px", cell: r => (
      <div className="flex items-center gap-2">
        <div className="h-[14px] flex-1 overflow-hidden rounded-[3px] bg-ink-100">
          <div className={`h-full ${r.usedPct >= 85 ? "bg-warn-500" : "bg-brand-500"}`}
            style={{ width: `${Math.min(r.usedPct, 100)}%` }} />
        </div>
        <span className={`w-9 shrink-0 text-right text-[12px] font-semibold tabular ${
          r.usedPct >= 85 ? "text-warn-700" : "text-ink-700"
        }`}>{r.usedPct}%</span>
      </div>
    ) },
  ];

  return (
    <Register
      eyebrow="Module 22 — Budget Control"
      title="Budget control"
      subtitle={`Allocation, commitment and consumption by cost centre and GL code for financial year ${financialYear()}. A requisition that would exceed the uncommitted balance is refused at submission.`}
      stats={[
        { label: "Allocated", value: <Money value={totals.allocated} compact /> },
        { label: "Consumed", value: <Money value={totals.consumed} compact />, tone: "info" },
        { label: "Committed", value: <Money value={totals.committed} compact />, tone: "warn" },
        { label: "Available", value: <Money value={totals.available} compact />, tone: "success" },
      ]}
      columns={columns}
      rows={rows}
      footnote={`Financial year ${financialYear()}, July to June. Committed amounts are released when the corresponding invoice is paid.`}
    >
      {tight.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title={`${tight.length} cost centre lines above 85% utilisation`}>
            {tight.map(r => `${r.deptCode} ${r.glCode} at ${r.usedPct}%`).join(" · ")}. A
            requisition against these will be refused once the available balance is exhausted,
            with the shortfall named.
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
