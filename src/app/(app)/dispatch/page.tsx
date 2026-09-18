import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/date";
import { Pill, Icon } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requireUser();
  assertCan(user, "DISPATCH", "VIEW");

  const notes = await prisma.dispatchNote.findMany({ orderBy: { dispatchedAt: "desc" } });

  const columns: Array<Column<(typeof notes)[number]>> = [
    { header: "Dispatch no.", mono: true, width: "150px", className: "text-ink-600", cell: d => d.dispatchNo },
    { header: "Gate pass", mono: true, width: "140px", className: "text-ink-600", cell: d => d.gatePassNo },
    { header: "Consignment", cell: d => (
      <>
        <div className="font-medium text-ink-900">{d.itemDescription}</div>
        <div className="text-[11.5px] text-ink-500">{d.quantity} unit(s)</div>
      </>
    ) },
    { header: "From", className: "text-ink-600", cell: d => d.fromLocation },
    { header: "To", className: "text-ink-600", cell: d => d.toLocation },
    { header: "Carrier", className: "text-ink-600", cell: d => d.carrier },
    { header: "Dispatched", className: "whitespace-nowrap text-ink-600", cell: d => formatDate(d.dispatchedAt) },
    { header: "Delivered", className: "whitespace-nowrap", cell: d => d.deliveredAt
      ? <span className="text-ink-600">{formatDate(d.deliveredAt)}<span className="block text-[11px] text-ink-400">{d.receivedBy}</span></span>
      : <span className="text-ink-400">—</span> },
    { header: "POD", align: "center", cell: d => d.podFileName
      ? <Icon name="file" className="mx-auto h-3.5 w-3.5 text-brand-600" />
      : <span className="text-ink-300">—</span> },
    { header: "Status", cell: d => <Pill status={d.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 11 — Dispatch Management"
      title="Dispatch and gate pass"
      subtitle="Gate pass issue, dispatch approval, delivery confirmation and proof of delivery, with delay and damage reporting."
      stats={[
        { label: "Dispatches", value: notes.length },
        { label: "Delivered", value: notes.filter(n => n.status === "DELIVERED").length, tone: "success" },
        { label: "In transit", value: notes.filter(n => n.status === "IN_TRANSIT").length, tone: "info" },
        { label: "Delayed or damaged", value: notes.filter(n => ["DELAYED", "DAMAGED"].includes(n.status)).length, tone: "danger" },
      ]}
      columns={columns}
      rows={notes}
    />
  );
}
