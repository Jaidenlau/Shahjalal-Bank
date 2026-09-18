import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const user = await requireUser();
  assertCan(user, "CONTRACT", "VIEW");

  const contracts = await prisma.contract.findMany({
    include: { vendor: { select: { companyName: true } }, milestones: true },
    orderBy: { endDate: "asc" },
  });

  const expiring = contracts.filter(c => {
    const d = daysFromNow(c.endDate);
    return d >= 0 && d <= 60;
  });
  const value = contracts.reduce((s, c) => s + num(c.value), 0);

  const columns: Array<Column<(typeof contracts)[number]>> = [
    { header: "Contract", mono: true, width: "160px", className: "text-ink-600", cell: c => c.contractNo },
    { header: "Title", cell: c => (
      <>
        <div className="font-medium text-ink-900">{c.title}</div>
        <div className="text-[11.5px] text-ink-500">{c.vendor.companyName}</div>
      </>
    ) },
    { header: "Type", align: "center", cell: c => (
      <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-700">{c.type}</span>
    ) },
    { header: "Value", align: "right", cell: c => <Money value={num(c.value)} /> },
    { header: "Performance security", align: "right", className: "text-ink-600", cell: c => <Money value={num(c.performanceSecurity)} /> },
    { header: "Retention", align: "right", className: "text-ink-600", cell: c => <Money value={num(c.retentionMoney)} /> },
    { header: "Period", className: "whitespace-nowrap text-ink-600", cell: c => (
      <>
        {formatDate(c.startDate)}
        <div className="text-[11.5px] text-ink-400">to {formatDate(c.endDate)}</div>
      </>
    ) },
    { header: "Expires in", align: "right", cell: c => {
      const d = daysFromNow(c.endDate);
      return d < 0
        ? <span className="text-danger-600">Expired</span>
        : <span className={d <= 60 ? "font-semibold text-warn-700" : "text-ink-600"}>{d} days</span>;
    } },
    { header: "Milestones", align: "center", className: "text-ink-600", cell: c => (
      <>{c.milestones.filter(m => m.status === "COMPLETED").length}/{c.milestones.length}</>
    ) },
    { header: "Status", cell: c => <Pill status={c.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 20 — Contract Management"
      title="Contracts"
      subtitle="Contract register with validity, performance security, retention money, SLA terms and renewal reminders."
      stats={[
        { label: "Active contracts", value: contracts.length },
        { label: "Contracted value", value: <Money value={value} compact />, tone: "info" },
        { label: "Expiring within 60 days", value: expiring.length, tone: expiring.length ? "warn" : "success" },
        { label: "Retention held", value: <Money value={contracts.reduce((s, c) => s + num(c.retentionMoney), 0)} compact /> },
      ]}
      columns={columns}
      rows={contracts}
    >
      {expiring.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title={`${expiring.length} contract${expiring.length === 1 ? "" : "s"} inside the renewal notice period`}>
            {expiring.map(c => `${c.title} (${daysFromNow(c.endDate)} days)`).join(" · ")}. Each
            contract carries a renewal notice period, and reminders fire from that point.
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
