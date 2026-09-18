import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function CivilWorksPage() {
  const user = await requireUser();
  assertCan(user, "CIVIL", "VIEW");

  const projects = await prisma.civilWorksProject.findMany({ orderBy: { targetEndDate: "asc" } });
  const inProgress = projects.filter(p => p.status === "IN_PROGRESS");

  const columns: Array<Column<(typeof projects)[number]>> = [
    { header: "Project", mono: true, width: "160px", className: "text-ink-600", cell: p => p.projectNo },
    { header: "Title", cell: p => (
      <>
        <div className="font-medium text-ink-900">{p.title}</div>
        <div className="text-[11.5px] text-ink-500">{p.site}</div>
      </>
    ) },
    { header: "Contractor", className: "text-ink-600", cell: p => p.contractor },
    { header: "BOQ value", align: "right", cell: p => <Money value={num(p.boqValue)} /> },
    { header: "Started", className: "whitespace-nowrap text-ink-600", cell: p => formatDate(p.startDate) },
    { header: "Target completion", className: "whitespace-nowrap", cell: p => {
      const d = daysFromNow(p.targetEndDate);
      return (
        <span className={p.status !== "COMPLETED" && d < 0 ? "font-semibold text-danger-600" : "text-ink-600"}>
          {formatDate(p.targetEndDate)}
          {p.status !== "COMPLETED" && d < 0 ? <span className="block text-[11px]">{Math.abs(d)}d overdue</span> : null}
        </span>
      );
    } },
    { header: "Progress", width: "160px", cell: p => (
      <div className="flex items-center gap-2">
        <div className="h-[14px] flex-1 overflow-hidden rounded-[3px] bg-ink-100">
          <div className={`h-full ${p.progressPct === 100 ? "bg-brand-600" : "bg-info-500"}`}
            style={{ width: `${p.progressPct}%` }} />
        </div>
        <span className="w-9 shrink-0 text-right text-[12px] font-semibold text-ink-700 tabular">{p.progressPct}%</span>
      </div>
    ) },
    { header: "Liability period", className: "whitespace-nowrap text-ink-600", cell: p =>
      p.liabilityPeriodEndsAt ? formatDate(p.liabilityPeriodEndsAt) : "—" },
    { header: "Status", cell: p => <Pill status={p.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 13 — Interior and Civil Works Management"
      title="Interior and civil works"
      subtitle="Project initiation, BOQ, contractor engagement, site progress and defect liability period tracking."
      stats={[
        { label: "Projects", value: projects.length },
        { label: "In progress", value: inProgress.length, tone: "info" },
        { label: "Completed", value: projects.filter(p => p.status === "COMPLETED").length, tone: "success" },
        { label: "BOQ value", value: <Money value={projects.reduce((s, p) => s + num(p.boqValue), 0)} compact /> },
      ]}
      columns={columns}
      rows={projects}
      footnote="Drawings and measurement books are attached to each project in the full module."
    />
  );
}
