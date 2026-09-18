import { requireUser, assertCan, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ENTITIES } from "@/lib/report-schema";
import { formatDate } from "@/lib/date";
import { PageHeader, Card, CardHeader, Icon, Note, Stat } from "@/components/ui";
import { ReportBuilder } from "./report-builder";

export const dynamic = "force-dynamic";

/**
 * Reports.
 *
 * Annexure-A 6(c)(ii): bank users must be able to prepare new reports without
 * the bidder. The builder below is that capability, not a description of it —
 * pick an entity, pick columns, filter, run, export.
 */
export default async function ReportsPage() {
  const user = await requireUser();
  assertCan(user, "REPORT", "VIEW");

  const saved = await prisma.savedReport.findMany({
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const PREBUILT = [
    ["Division, department and branch wise purchase history", "requisition"],
    ["Product and service category wise purchase history", "requisition"],
    ["Tender status history", "tender"],
    ["Comparative statement history", "tender"],
    ["Vendor wise work order issued history", "purchaseOrder"],
    ["Enlisted vendor history", "vendor"],
    ["Invoicing and payment report", "invoice"],
    ["Fixed asset register with depreciation", "asset"],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Module 23 — Reports"
        title="Reports"
        subtitle="Pre-built reports across the dimensions named in the tender document, plus a builder so new reports need no vendor involvement."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reportable entities" value={ENTITIES.length} />
        <Stat label="Pre-built reports" value={PREBUILT.length} tone="info" />
        <Stat label="Saved by the bank" value={saved.length} tone="success" />
        <Stat label="Export" value="CSV" sub={can(user, "REPORT", "EXPORT") ? "Permitted for your role" : "Not permitted for your role"} />
      </div>

      <div className="mb-5">
        <Note
          tone="info"
          title="Why this is a builder and not a list"
          reference="Annexure-A 6(c)(ii) — parameter so bank users can prepare new reports without help of the bidder"
        >
          Every report below is the same mechanism with different selections saved against it.
          Adding a report is choosing an entity, columns and filters — not a change request.
        </Note>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card pad={false}>
          <CardHeader title="Pre-built reports" subtitle="The reporting dimensions named in Annexure-B module 23" />
          <ul className="divide-y divide-ink-100">
            {PREBUILT.map(([label, entity]) => (
              <li key={label} className="flex items-center gap-3 px-5 py-2.5">
                <Icon name="chart" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span className="flex-1 text-[13px] text-ink-800">{label}</span>
                <span className="shrink-0 rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-500">
                  {ENTITIES.find(e => e.key === entity)?.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card pad={false}>
          <CardHeader title="Saved by bank users" subtitle="Built in this screen, with no vendor involvement" />
          {saved.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-500">Nothing saved yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {saved.map(s => (
                <li key={s.id} className="px-5 py-2.5">
                  <div className="text-[13px] font-medium text-ink-900">{s.name}</div>
                  <div className="text-[11.5px] text-ink-500">
                    {ENTITIES.find(e => e.key === s.entity)?.label ?? s.entity} ·{" "}
                    {s.createdBy.fullName} · {formatDate(s.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ReportBuilder entities={ENTITIES} canExport={can(user, "REPORT", "EXPORT")} />
    </>
  );
}
