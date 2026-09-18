import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, daysFromNow } from "@/lib/date";
import { Pill, Icon, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof load>>[number];

async function load() {
  return prisma.vendor.findMany({
    include: {
      categories: true,
      documents: { select: { id: true, verifiedAt: true } },
      bids: { select: { id: true, status: true } },
      purchaseOrders: { select: { id: true } },
    },
    orderBy: { companyName: "asc" },
  });
}

export default async function VendorsPage() {
  const user = await requireUser();
  assertCan(user, "VENDOR", "VIEW");
  const vendors = await load();

  const expiring = vendors.filter(v => {
    const d = daysFromNow(v.tradeLicenseExpiry);
    return d >= 0 && d < 45;
  });

  const columns: Array<Column<Row>> = [
    { header: "Company", cell: v => (
      <>
        <div className="font-medium text-ink-900">{v.companyName}</div>
        <div className="text-[11.5px] text-ink-500">{v.contactPerson} · {v.contactPhone}</div>
      </>
    ) },
    { header: "Trade licence", mono: true, className: "text-ink-600", cell: v => v.tradeLicenseNo },
    { header: "Licence expiry", cell: v => {
      const d = daysFromNow(v.tradeLicenseExpiry);
      return (
        <span className={d < 45 ? "font-semibold text-warn-700" : "text-ink-600"}>
          {formatDate(v.tradeLicenseExpiry)}
          {d < 45 ? <span className="block text-[11.5px]">{d < 0 ? "Expired" : `${d} days`}</span> : null}
        </span>
      );
    } },
    { header: "Categories", cell: v => (
      <div className="flex flex-wrap gap-1">
        {v.categories.map(c => (
          <span key={c.id} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] text-ink-700">{c.category}</span>
        ))}
      </div>
    ) },
    { header: "Documents", align: "center", cell: v => (
      <span className="text-[12.5px] text-ink-600 tabular">
        {v.documents.filter(d => d.verifiedAt).length}/{v.documents.length}
        <span className="block text-[11.5px] text-ink-400">verified</span>
      </span>
    ) },
    { header: "Bids", align: "center", cell: v => <span className="tabular">{v.bids.length}</span> },
    { header: "Work orders", align: "center", cell: v => <span className="tabular">{v.purchaseOrders.length}</span> },
    { header: "Enlistment", cell: v => <Pill status={v.enlistmentStatus} /> },
  ];

  return (
    <Register
      eyebrow="Module 6 — Vendor Enlistment Portal"
      title="Vendors"
      subtitle="Enlisted suppliers, their verified documents and trade licence validity. Vendors manage their own profile through the external portal."
      stats={[
        { label: "Vendors", value: vendors.length },
        { label: "Approved", value: vendors.filter(v => v.enlistmentStatus === "APPROVED").length, tone: "success" },
        { label: "Pending enlistment", value: vendors.filter(v => v.enlistmentStatus === "PENDING").length, tone: "warn" },
        { label: "Licence expiring", value: expiring.length, tone: expiring.length ? "warn" : "neutral", sub: "Within 45 days" },
      ]}
      columns={columns}
      rows={vendors}
    >
      {expiring.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title="Trade licence renewals due">
            {expiring.map(v => v.companyName).join(", ")} — licence expiring within 45 days. A
            vendor whose licence has lapsed cannot register an intention to bid or submit an
            offer, which the portal enforces at submission.
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
