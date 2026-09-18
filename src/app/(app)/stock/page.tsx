import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { Money, Pill, Icon, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const user = await requireUser();
  assertCan(user, "STOCK", "VIEW");

  const items = await prisma.item.findMany({
    include: { category: true, stockBalances: { include: { warehouse: true } } },
    orderBy: { code: "asc" },
  });

  const rows = items.map(i => {
    const onHand = i.stockBalances.reduce((s, b) => s + b.quantityOnHand, 0);
    const inTransit = i.stockBalances.reduce((s, b) => s + b.quantityInTransit, 0);
    const underPurchase = i.stockBalances.reduce((s, b) => s + b.quantityUnderPurchase, 0);
    const bal = i.stockBalances[0];
    return {
      id: i.id, code: i.code, name: i.name, category: i.category.name,
      uom: i.unitOfMeasure, capexOpex: i.capexOpex, glCode: i.glCode,
      reorderLevel: i.reorderLevel, onHand, inTransit, underPurchase,
      lastPrice: num(bal?.lastPurchasePrice ?? 0),
      lastDate: bal?.lastPurchaseDate ?? null,
      value: onHand * num(bal?.lastPurchasePrice ?? 0),
    };
  });

  const belowReorder = rows.filter(r => r.onHand <= r.reorderLevel);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  const columns: Array<Column<(typeof rows)[number]>> = [
    { header: "Code", mono: true, width: "130px", className: "text-ink-600", cell: r => r.code },
    { header: "Item", cell: r => (
      <>
        <div className="font-medium text-ink-900">{r.name}</div>
        <div className="text-[11.5px] text-ink-500">{r.category}</div>
      </>
    ) },
    { header: "UoM", align: "center", className: "text-ink-600", cell: r => r.uom },
    { header: "CAPEX / OPEX", align: "center", cell: r => (
      <span className={`rounded-[3px] px-1.5 py-0.5 text-[11px] font-bold ${
        r.capexOpex === "CAPEX" ? "bg-info-100 text-info-700" : "bg-ink-100 text-ink-600"
      }`}>{r.capexOpex}</span>
    ) },
    { header: "GL", align: "center", mono: true, className: "text-ink-600", cell: r => r.glCode },
    { header: "On hand", align: "right", cell: r => (
      <span className={`font-semibold tabular ${r.onHand <= r.reorderLevel ? "text-warn-700" : "text-ink-900"}`}>
        {r.onHand}
      </span>
    ) },
    { header: "In transit", align: "right", className: "text-ink-600", cell: r => r.inTransit || "—" },
    { header: "Under purchase", align: "right", className: "text-ink-600", cell: r => r.underPurchase || "—" },
    { header: "Reorder at", align: "right", className: "text-ink-500", cell: r => r.reorderLevel },
    { header: "Last price", align: "right", cell: r => (
      <>
        <Money value={r.lastPrice} />
        {r.lastDate ? <div className="text-[11px] text-ink-400">{formatDate(r.lastDate)}</div> : null}
      </>
    ) },
  ];

  return (
    <Register
      eyebrow="Module 21 — Inventory Management"
      title="Stock and catalogue"
      subtitle="Current stock, stock in transit, stock under purchase, reorder level and last purchase price for every catalogue item. This is what the requisition screen reads when it runs a stock check."
      stats={[
        { label: "Catalogue items", value: rows.length },
        { label: "Below reorder level", value: belowReorder.length, tone: belowReorder.length ? "warn" : "success" },
        { label: "Stock value", value: <Money value={totalValue} compact />, tone: "info" },
        { label: "Under purchase", value: rows.reduce((s, r) => s + r.underPurchase, 0), sub: "Units on order" },
      ]}
      columns={columns}
      rows={rows}
      footnote={`${rows.length} items across 8 categories. Values are at last purchase price.`}
    >
      {belowReorder.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title={`${belowReorder.length} items at or below reorder level`}>
            {belowReorder.slice(0, 6).map(r => `${r.name} (${r.onHand} of ${r.reorderLevel})`).join(" · ")}
            {belowReorder.length > 6 ? ` and ${belowReorder.length - 6} more.` : "."}
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
