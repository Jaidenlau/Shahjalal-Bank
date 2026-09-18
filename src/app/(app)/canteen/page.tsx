import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatTime } from "@/lib/date";
import { Money, Pill, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function CanteenPage() {
  const user = await requireUser();
  assertCan(user, "CANTEEN", "VIEW");

  const orders = await prisma.canteenOrder.findMany({ orderBy: { orderedAt: "asc" } });

  const parse = (json: string): Array<{ name: string; qty: number; price: number }> => {
    try { return JSON.parse(json); } catch { return []; }
  };

  const columns: Array<Column<(typeof orders)[number]>> = [
    { header: "Order no.", mono: true, width: "150px", className: "text-ink-600", cell: o => o.orderNo },
    { header: "Employee", cell: o => (
      <>
        <div className="font-medium text-ink-900">{o.employeeName}</div>
        <div className="text-[11.5px] text-ink-500">{o.employeeId} · {o.department}</div>
      </>
    ) },
    { header: "Items", cell: o => (
      <ul className="space-y-0.5">
        {parse(o.items).map(i => (
          <li key={i.name} className="text-[12.5px] text-ink-700">
            {i.qty} × {i.name}
          </li>
        ))}
      </ul>
    ) },
    { header: "Ordered", align: "center", className: "whitespace-nowrap text-ink-600", cell: o => formatTime(o.orderedAt) },
    { header: "Serving slot", align: "center", className: "whitespace-nowrap text-ink-600", cell: o => o.servingSlot },
    { header: "Amount", align: "right", cell: o => <Money value={num(o.totalAmount)} /> },
    { header: "Payment", align: "center", cell: o => <Pill tone="neutral">Pending gateway</Pill> },
    { header: "Status", cell: o => <Pill status={o.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 18 — Canteen Management"
      title="Canteen"
      subtitle="Staff pre-orders by serving slot, with cart management and cancellation."
      stats={[
        { label: "Orders today", value: orders.length },
        { label: "Served", value: orders.filter(o => o.status === "SERVED").length, tone: "success" },
        { label: "In preparation", value: orders.filter(o => o.status === "PREPARING").length, tone: "warn" },
        { label: "Value today", value: <Money value={orders.reduce((s, o) => s + num(o.totalAmount), 0)} /> },
      ]}
      columns={columns}
      rows={orders}
    >
      <div className="mb-5">
        <Note
          tone="neutral"
          title="Payment collection"
          reference="Annexure-B module 18 — payment gateway: Need Customization"
        >
          Canteen payment collection depends on the payment service provider the Bank selects.
          It was answered in our proposal as requiring customisation rather than complied, and
          orders here carry a pending-gateway payment status accordingly.
        </Note>
      </div>
    </Register>
  );
}
