import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const user = await requireUser();
  assertCan(user, "ASSET", "VIEW");

  const [assets, maintenance] = await Promise.all([
    prisma.asset.findMany({
      include: { branch: { select: { name: true } }, maintenance: true },
      orderBy: { assetTag: "asc" },
    }),
    prisma.assetMaintenance.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { asset: { select: { name: true, assetTag: true } } },
      orderBy: { reportedAt: "desc" },
    }),
  ]);

  const bookValue = assets.reduce((s, a) => s + num(a.bookValue), 0);
  const cost = assets.reduce((s, a) => s + num(a.purchaseCost), 0);

  const columns: Array<Column<(typeof assets)[number]>> = [
    { header: "Asset tag", mono: true, width: "160px", className: "text-ink-600", cell: a => a.assetTag },
    { header: "Asset", cell: a => (
      <>
        <div className="font-medium text-ink-900">{a.name}</div>
        <div className="text-[11.5px] text-ink-500">{a.category}{a.serialNo ? ` · ${a.serialNo}` : ""}</div>
      </>
    ) },
    { header: "Location", className: "text-ink-600", cell: a => a.location },
    { header: "Purchased", className: "whitespace-nowrap text-ink-600", cell: a => formatDate(a.purchaseDate) },
    { header: "Cost", align: "right", cell: a => <Money value={num(a.purchaseCost)} /> },
    { header: "Depreciation", align: "right", className: "text-ink-600", cell: a => (
      <>
        <Money value={num(a.accumulatedDepreciation)} />
        <div className="text-[11px] text-ink-400">{a.depreciationRateBp / 100}% pa</div>
      </>
    ) },
    { header: "Book value", align: "right", cell: a => (
      <span className="font-semibold"><Money value={num(a.bookValue)} /></span>
    ) },
    { header: "Warranty", className: "whitespace-nowrap", cell: a => {
      if (!a.warrantyExpiry) return <span className="text-ink-400">—</span>;
      const d = daysFromNow(a.warrantyExpiry);
      return d < 0
        ? <span className="text-ink-400">Expired</span>
        : <span className={d < 90 ? "text-warn-700" : "text-ink-600"}>{formatDate(a.warrantyExpiry)}</span>;
    } },
    { header: "Work orders", align: "center", className: "text-ink-600", cell: a => a.maintenance.length || "—" },
    { header: "Status", cell: a => <Pill status={a.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 4 — Repair and Maintenance Management"
      title="Assets and maintenance"
      subtitle="Fixed asset register with depreciation, location and specification, and the work orders raised against each asset."
      stats={[
        { label: "Assets", value: assets.length },
        { label: "Acquisition cost", value: <Money value={cost} compact />, tone: "info" },
        { label: "Net book value", value: <Money value={bookValue} compact />, tone: "success" },
        { label: "Open work orders", value: maintenance.length, tone: maintenance.length ? "warn" : "neutral" },
      ]}
      columns={columns}
      rows={assets}
      footnote="Depreciation is straight line at the rate recorded against each asset class."
    />
  );
}
