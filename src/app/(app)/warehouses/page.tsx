import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { Money } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const user = await requireUser();
  assertCan(user, "WAREHOUSE", "VIEW");

  const warehouses = await prisma.warehouse.findMany({
    include: { stockBalances: { include: { item: true } } },
    orderBy: { name: "asc" },
  });

  const rows = warehouses.map(w => {
    const units = w.stockBalances.reduce((s, b) => s + b.quantityOnHand, 0);
    const value = w.stockBalances.reduce((s, b) => s + b.quantityOnHand * num(b.lastPurchasePrice), 0);
    return {
      id: w.id, name: w.name, code: w.code, location: w.location,
      capacity: w.capacity, lines: w.stockBalances.length, units, value,
      utilisation: w.capacity ? Math.round((units / w.capacity) * 100) : 0,
    };
  });

  const columns: Array<Column<(typeof rows)[number]>> = [
    { header: "Code", mono: true, width: "110px", className: "text-ink-600", cell: w => w.code },
    { header: "Warehouse", cell: w => (
      <>
        <div className="font-medium text-ink-900">{w.name}</div>
        <div className="text-[11.5px] text-ink-500">{w.location}</div>
      </>
    ) },
    { header: "Item lines", align: "right", className: "text-ink-600", cell: w => w.lines },
    { header: "Units held", align: "right", cell: w => <span className="font-semibold tabular">{w.units.toLocaleString("en-US")}</span> },
    { header: "Stock value", align: "right", cell: w => <Money value={w.value} /> },
    { header: "Capacity", align: "right", className: "text-ink-600", cell: w => w.capacity.toLocaleString("en-US") },
    { header: "Utilisation", width: "160px", cell: w => (
      <div className="flex items-center gap-2">
        <div className="h-[14px] flex-1 overflow-hidden rounded-[3px] bg-ink-100">
          <div className="h-full bg-brand-500" style={{ width: `${Math.min(w.utilisation, 100)}%` }} />
        </div>
        <span className="w-9 shrink-0 text-right text-[12px] font-semibold text-ink-700 tabular">{w.utilisation}%</span>
      </div>
    ) },
  ];

  return (
    <Register
      eyebrow="Module 19 — Warehouse Management"
      title="Warehouses"
      subtitle="Multiple stores with capacity, current holding and value. Goods accepted on a receipt note land in the nominated store."
      stats={[
        { label: "Warehouses", value: rows.length },
        { label: "Units held", value: rows.reduce((s, r) => s + r.units, 0).toLocaleString("en-US"), tone: "info" },
        { label: "Total stock value", value: <Money value={rows.reduce((s, r) => s + r.value, 0)} compact />, tone: "success" },
      ]}
      columns={columns}
      rows={rows}
    />
  );
}
