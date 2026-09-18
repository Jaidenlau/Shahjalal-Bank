import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatDate, formatTime } from "@/lib/date";
import { Pill, Icon } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  const user = await requireUser();
  assertCan(user, "VISITOR", "VIEW");

  const [visitors, appointments] = await Promise.all([
    prisma.visitor.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: { checkInAt: "desc" },
    }),
    prisma.visitorAppointment.findMany({ orderBy: { scheduledAt: "asc" } }),
  ]);

  const onSite = visitors.filter(v => !v.checkOutAt);

  const columns: Array<Column<(typeof visitors)[number]>> = [
    { header: "Visitor no.", mono: true, width: "140px", className: "text-ink-600", cell: v => v.visitorNo },
    { header: "Visitor", cell: v => (
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-200 text-[11px] font-bold text-ink-700">
          {v.photoInitials}
        </span>
        <span>
          <span className="block font-medium text-ink-900">{v.fullName}</span>
          <span className="block text-[11.5px] text-ink-500">{v.company}</span>
        </span>
      </div>
    ) },
    { header: "Purpose", className: "max-w-[220px] text-ink-600", cell: v => v.purpose },
    { header: "Host", cell: v => (
      <>
        <div className="text-ink-800">{v.hostName}</div>
        <div className="text-[11.5px] text-ink-500">{v.hostDepartment}</div>
      </>
    ) },
    { header: "Location", className: "text-ink-600", cell: v => v.branch?.name ?? "—" },
    { header: "Badge", align: "center", mono: true, className: "text-ink-600", cell: v => v.badgeNo },
    { header: "In", className: "whitespace-nowrap text-ink-600", cell: v => (
      <>
        {formatTime(v.checkInAt)}
        <div className="text-[11px] text-ink-400">{formatDate(v.checkInAt)}</div>
      </>
    ) },
    { header: "Out", className: "whitespace-nowrap", cell: v => v.checkOutAt
      ? <span className="text-ink-600">{formatTime(v.checkOutAt)}</span>
      : <Pill tone="info">On site</Pill> },
    { header: "", align: "center", cell: v => v.isBlacklisted
      ? <Pill tone="danger"><Icon name="alert" className="h-3 w-3" /> Blacklisted</Pill> : null },
  ];

  return (
    <Register
      eyebrow="Module 17 — Visitor Management"
      title="Visitors"
      subtitle="Visitor registration, host notification, badge issue and in/out times across all premises, with a blacklist."
      stats={[
        { label: "Visits logged", value: visitors.length, sub: "Last 7 days" },
        { label: "Currently on site", value: onSite.length, tone: onSite.length ? "info" : "neutral" },
        { label: "Appointments booked", value: appointments.length, tone: "warn" },
        { label: "Blacklisted", value: visitors.filter(v => v.isBlacklisted).length, tone: "danger" },
      ]}
      columns={columns}
      rows={visitors}
      footnote="Visitor photographs are captured at the reception desk in the full module; represented here by initials."
    />
  );
}
