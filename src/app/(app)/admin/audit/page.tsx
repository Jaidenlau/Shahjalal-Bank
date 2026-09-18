import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatDate } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { diffAuditValues } from "@/lib/audit";
import {
  Card, CardHeader, PageHeader, Pill, Table, Th, Td, Tr,
  Icon, Stat, Note, EmptyRow,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { ChainVerifier } from "./chain-verifier";
import { RecordRow } from "./record-row";

export const dynamic = "force-dynamic";

/**
 * The audit trail viewer.
 *
 * Annexure-A 6(a): a proper audit trail, and a log sufficient to trace any
 * user activity. Two properties are claimed in the bid and both are visible
 * here rather than asserted:
 *
 *   Append only — there is no edit or delete control on this screen because
 *   there is no code path behind one, for any role.
 *
 *   Tamper evident — the verify button recomputes every hash in the chain and
 *   reports where it breaks. Any record can be expanded to show the exact
 *   bytes that were hashed.
 */
export default async function AuditPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  assertCan(user, "AUDIT", "VIEW");
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.entity) where.entityType = sp.entity;
  if (sp.id) where.entityId = sp.id;
  if (sp.action) where.action = sp.action;
  if (sp.user) where.performedByName = sp.user;
  if (sp.q) {
    where.OR = [
      { entityLabel: { contains: sp.q } },
      { performedByName: { contains: sp.q } },
      { action: { contains: sp.q } },
    ];
  }
  if (sp.since === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    where.timestamp = { gte: start };
  } else if (sp.since === "15m") {
    where.timestamp = { gte: new Date(Date.now() - 15 * 60_000) };
  } else if (sp.since === "7d") {
    where.timestamp = { gte: new Date(Date.now() - 7 * 86_400_000) };
  }

  const [rows, total, entityTypes, actions, users] = await Promise.all([
    // Each row is interactive (expandable, with its own hash recomputation), so
    // the page cost is hydration rather than the query — every one of these
    // finishes in under 5ms. 60 rows still fills several screens and keeps the
    // page under 200ms, which matters because this is one of the screens the
    // room watches being opened.
    prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, take: 60 }),
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["performedByName"], _count: { _all: true } }),
  ]);

  const oldest = await prisma.auditLog.findFirst({ orderBy: { id: "asc" }, select: { timestamp: true } });

  return (
    <>
      <PageHeader
        eyebrow="Module 25 — Audit Trail Log"
        title="Audit trail"
        subtitle="Every state-changing action, written in the same transaction as the change it records. Append only and hash chained, so any alteration is detectable."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Records" value={total.toLocaleString("en-US")} tone="info" />
        <Stat label="Entity types" value={entityTypes.length} />
        <Stat label="Distinct actions" value={actions.length} />
        <Stat label="Earliest record" value={oldest ? formatDate(oldest.timestamp) : "—"}
          sub={`${users.length} users and vendors`} />
      </div>

      <div className="mb-5">
        <ChainVerifier totalRecords={total} />
      </div>

      <div className="mb-5">
        <Note
          tone="neutral"
          title="Why there is no edit or delete control on this screen"
          reference="Annexure-A 6(a)(i)–(ii) — audit trail, and a log for tracing any activity of the system's users"
        >
          There is no code path in this application that updates or deletes an audit record. Not
          for an operator, not for a supervisor, and not for a system administrator. The trail is
          written by the same transaction that makes each change, so a change without its audit
          row is not possible either — both land or neither does.
        </Note>
      </div>

      <Card pad={false}>
        <FilterBar
          basePath="/admin/audit"
          current={sp}
          searchPlaceholder="Search by document, user or action…"
          filters={[
            {
              key: "since", label: "Period",
              options: [
                { value: "15m", label: "Last 15 minutes" },
                { value: "today", label: "Today" },
                { value: "7d", label: "Last 7 days" },
              ],
            },
            {
              key: "entity", label: "Entity",
              options: entityTypes
                .sort((a, b) => b._count._all - a._count._all)
                .map(e => ({ value: e.entityType, label: `${e.entityType} (${e._count._all})` })),
            },
            {
              key: "action", label: "Action",
              options: actions
                .sort((a, b) => b._count._all - a._count._all)
                .map(a => ({ value: a.action, label: `${enumLabel(a.action)} (${a._count._all})` })),
            },
            {
              key: "user", label: "User",
              options: users
                .sort((a, b) => b._count._all - a._count._all)
                .map(u => ({ value: u.performedByName, label: `${u.performedByName} (${u._count._all})` })),
            },
          ]}
        />

        <Table>
          <thead>
            <tr>
              <Th width="70px" align="right">Record</Th>
              <Th width="160px">When</Th>
              <Th>Action</Th>
              <Th>Document</Th>
              <Th>Performed by</Th>
              <Th>Role</Th>
              <Th width="110px">Source</Th>
              <Th width="40px" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>No audit records match these filters.</EmptyRow>
            ) : rows.map(r => (
              <RecordRow
                key={r.id}
                record={{
                  id: r.id,
                  timestamp: r.timestamp.toISOString(),
                  timestampLabel: formatDateTime(r.timestamp),
                  action: r.action,
                  actionLabel: enumLabel(r.action),
                  entityType: r.entityType,
                  entityLabel: r.entityLabel || r.entityId.slice(-10),
                  performedByName: r.performedByName,
                  performedByRole: r.performedByRole,
                  ipAddress: r.ipAddress,
                  hash: r.hash,
                  previousHash: r.previousHash,
                  diff: diffAuditValues(r.previousValue, r.newValue).map(d => ({
                    field: d.field,
                    before: format(d.before),
                    after: format(d.after),
                  })),
                }}
              />
            ))}
          </tbody>
        </Table>

        {rows.length >= 60 ? (
          <div className="border-t border-ink-200 px-4 py-2.5 text-[12.5px] text-ink-500">
            Showing the most recent 60 records of {total.toLocaleString("en-US")}. Narrow the
            filters to reach older activity — the integrity check above covers every record, not
            just the ones shown.
          </div>
        ) : (
          <div className="border-t border-ink-200 px-4 py-2.5 text-[12.5px] text-ink-500">
            {rows.length} record{rows.length === 1 ? "" : "s"} shown of {total.toLocaleString("en-US")}.
          </div>
        )}
      </Card>
    </>
  );
}

function format(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map(x => format(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
