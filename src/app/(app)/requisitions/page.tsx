import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, ageInDays } from "@/lib/date";
import { REQUISITION_STATUS, label as enumLabel } from "@/lib/enums";
import { scopeFor } from "@/lib/queries";
import {
  Card, PageHeader, Pill, Money, Table, Th, Td, Tr, LinkCell,
  EmptyRow, Icon, ButtonLink, Stat,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function RequisitionsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = scopeFor(user);

  const where: Record<string, unknown> = {};
  if (scope === "own") where.requestedById = user.id;
  if (sp.status) where.status = sp.status;
  if (sp.department) where.department = { code: sp.department };
  if (sp.q) {
    where.OR = [
      { requisitionNo: { contains: sp.q } },
      { title: { contains: sp.q } },
    ];
  }

  const [rows, departments, counts] = await Promise.all([
    prisma.requisition.findMany({
      where,
      include: {
        requestedBy: { select: { fullName: true } },
        department: { select: { code: true, name: true } },
        branch: { select: { name: true } },
        lines: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.requisition.groupBy({
      by: ["status"], _count: { _all: true },
      _sum: { totalEstimatedValue: true },
      where: scope === "own" ? { requestedById: user.id } : {},
    }),
  ]);

  const totalValue = rows.reduce((s, r) => s + num(r.totalEstimatedValue), 0);
  const pending = counts.filter(c => ["SUBMITTED", "UNDER_APPROVAL"].includes(c.status))
    .reduce((s, c) => s + c._count._all, 0);
  const approved = counts.find(c => c.status === "APPROVED")?._count._all ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Module 2 — Requisition Management"
        title="Requisitions"
        subtitle={
          scope === "own"
            ? "Requisitions you have raised. Stock is checked on submission, and anything already held is issued from the store rather than purchased."
            : "All requisitions across the bank. Stock is checked on submission, and anything already held is issued from the store rather than purchased."
        }
        actions={can(user, "REQUISITION", "CREATE") ? (
          <ButtonLink href="/requisitions/new" variant="primary">
            <Icon name="plus" className="h-4 w-4" /> New requisition
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shown" value={rows.length} sub={sp.status || sp.q || sp.department ? "Filtered" : "All requisitions"} />
        <Stat label="Value shown" value={<Money value={totalValue} compact />} tone="info" />
        <Stat label="In approval" value={pending} tone={pending ? "warn" : "neutral"} />
        <Stat label="Approved" value={approved} tone="success" />
      </div>

      <Card pad={false}>
        <FilterBar
          basePath="/requisitions"
          current={sp}
          searchPlaceholder="Search by number or title…"
          filters={[
            {
              key: "status", label: "Status",
              options: REQUISITION_STATUS.map(s => ({ value: s, label: enumLabel(s) })),
            },
            {
              key: "department", label: "Division",
              options: departments.map(d => ({ value: d.code, label: `${d.code} — ${d.name}` })),
            },
          ]}
        />

        <Table>
          <thead>
            <tr>
              <Th width="170px">Reference</Th>
              <Th>Title</Th>
              {scope !== "own" ? <Th>Raised by</Th> : null}
              <Th>Division</Th>
              <Th>Branch</Th>
              <Th align="right">Lines</Th>
              <Th align="right">Value</Th>
              <Th>Status</Th>
              <Th align="right">Age</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={9}>
                No requisitions match these filters.
              </EmptyRow>
            ) : rows.map(r => (
              <Tr key={r.id}>
                <LinkCell href={`/requisitions/${r.id}`} mono>{r.requisitionNo}</LinkCell>
                <Td className="max-w-[300px] truncate">{r.title}</Td>
                {scope !== "own" ? <Td className="whitespace-nowrap">{r.requestedBy.fullName}</Td> : null}
                <Td><span className="font-mono text-[12px] text-ink-600">{r.department.code}</span></Td>
                <Td className="whitespace-nowrap text-ink-600">{r.branch.name}</Td>
                <Td align="right" className="text-ink-600">{r.lines.length}</Td>
                <Td align="right"><Money value={num(r.totalEstimatedValue)} /></Td>
                <Td><Pill status={r.status} /></Td>
                <Td align="right" className="whitespace-nowrap text-ink-500">
                  {ageInDays(r.createdAt)}d
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        {rows.length >= 120 ? (
          <div className="border-t border-ink-200 px-4 py-2.5 text-[12.5px] text-ink-500">
            Showing the most recent 120 requisitions. Narrow the filters to see older records.
          </div>
        ) : null}
      </Card>
    </>
  );
}
