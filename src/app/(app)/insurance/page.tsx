import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function InsurancePage() {
  const user = await requireUser();
  assertCan(user, "INSURANCE", "VIEW");

  const policies = await prisma.insurancePolicy.findMany({
    include: { claims: true }, orderBy: { endDate: "asc" },
  });
  const renewals = policies.filter(p => { const d = daysFromNow(p.endDate); return d >= 0 && d <= 60; });
  const openClaims = policies.flatMap(p => p.claims).filter(c => c.status !== "SETTLED" && c.status !== "REJECTED");

  const columns: Array<Column<(typeof policies)[number]>> = [
    { header: "Policy", mono: true, width: "170px", className: "text-ink-600", cell: p => p.policyNo },
    { header: "Type", align: "center", cell: p => (
      <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-700">{p.type}</span>
    ) },
    { header: "Covered", cell: p => (
      <>
        <div className="font-medium text-ink-900">{p.coveredAsset}</div>
        <div className="text-[11.5px] text-ink-500">{p.insurer}</div>
      </>
    ) },
    { header: "Sum insured", align: "right", cell: p => <Money value={num(p.sumInsured)} /> },
    { header: "Premium", align: "right", className: "text-ink-600", cell: p => <Money value={num(p.premium)} /> },
    { header: "Expires", className: "whitespace-nowrap", cell: p => {
      const d = daysFromNow(p.endDate);
      return (
        <span className={d <= 60 ? "font-semibold text-warn-700" : "text-ink-600"}>
          {formatDate(p.endDate)}
          {d <= 60 ? <span className="block text-[11.5px]">{d} days</span> : null}
        </span>
      );
    } },
    { header: "Claims", align: "center", className: "text-ink-600", cell: p => p.claims.length || "—" },
    { header: "Status", cell: p => <Pill status={p.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 15 — Insurance Management"
      title="Insurance"
      subtitle="Vehicle, locker, vault, property and fidelity cover, with renewal dates and claim settlement."
      stats={[
        { label: "Policies", value: policies.length },
        { label: "Total sum insured", value: <Money value={policies.reduce((s, p) => s + num(p.sumInsured), 0)} compact />, tone: "info" },
        { label: "Renewals within 60 days", value: renewals.length, tone: renewals.length ? "warn" : "success" },
        { label: "Open claims", value: openClaims.length, tone: openClaims.length ? "warn" : "neutral" },
      ]}
      columns={columns}
      rows={policies}
    >
      {renewals.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title={`${renewals.length} policies due for renewal within 60 days`}>
            {renewals.slice(0, 4).map(p => `${p.policyNo} (${daysFromNow(p.endDate)} days)`).join(" · ")}
            {renewals.length > 4 ? ` and ${renewals.length - 4} more.` : "."}
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
