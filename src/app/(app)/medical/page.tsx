import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, daysFromNow } from "@/lib/date";
import { Pill, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function MedicalPage() {
  const user = await requireUser();
  assertCan(user, "MEDICAL", "VIEW");

  const items = await prisma.medicalItem.findMany({ orderBy: { code: "asc" } });
  const expiring = items.filter(i => i.expiryDate && daysFromNow(i.expiryDate) <= 90);
  const low = items.filter(i => i.quantityOnHand <= i.reorderLevel);

  const columns: Array<Column<(typeof items)[number]>> = [
    { header: "Code", mono: true, width: "120px", className: "text-ink-600", cell: i => i.code },
    { header: "Item", cell: i => <span className="font-medium text-ink-900">{i.name}</span> },
    { header: "Category", align: "center", cell: i => (
      <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">{i.category}</span>
    ) },
    { header: "UoM", align: "center", className: "text-ink-600", cell: i => i.unitOfMeasure },
    { header: "On hand", align: "right", cell: i => (
      <span className={`font-semibold tabular ${i.quantityOnHand <= i.reorderLevel ? "text-warn-700" : "text-ink-900"}`}>
        {i.quantityOnHand}
      </span>
    ) },
    { header: "Reorder at", align: "right", className: "text-ink-500", cell: i => i.reorderLevel },
    { header: "Batch", mono: true, className: "text-ink-600", cell: i => i.batchNo ?? "—" },
    { header: "Expiry", className: "whitespace-nowrap", cell: i => {
      if (!i.expiryDate) return <span className="text-ink-400">—</span>;
      const d = daysFromNow(i.expiryDate);
      return d < 0
        ? <Pill tone="danger">Expired</Pill>
        : <span className={d <= 90 ? "font-semibold text-warn-700" : "text-ink-600"}>{formatDate(i.expiryDate)}</span>;
    } },
    { header: "Supplier", className: "text-ink-600", cell: i => i.supplier ?? "—" },
  ];

  return (
    <Register
      eyebrow="Module 14 — Medical Supplies Management"
      title="Medical supplies"
      subtitle="Medical inventory with batch and expiry tracking, and the equipment register for the bank's medical room."
      stats={[
        { label: "Items", value: items.length },
        { label: "Below reorder level", value: low.length, tone: low.length ? "warn" : "success" },
        { label: "Expiring within 90 days", value: expiring.length, tone: expiring.length ? "warn" : "neutral" },
        { label: "Equipment", value: items.filter(i => i.category === "Equipment").length },
      ]}
      columns={columns}
      rows={items}
    >
      <div className="mb-5">
        <Note
          tone="neutral"
          title="Prescription records"
          reference="Annexure-B module 14 — prescription record: Need Customization"
        >
          Clinical and prescription data was answered in our proposal as requiring additional
          data-privacy handling rather than complied, so it sits outside this register and is
          configured with the Bank during implementation.
        </Note>
      </div>
    </Register>
  );
}
