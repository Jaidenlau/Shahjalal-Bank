import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import {
  Card, CardHeader, PageHeader, Pill, Table, Th, Td, Tr,
  Icon, ButtonLink, Stat, Note,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const user = await requireUser();
  assertCan(user, "WORKFLOW", "VIEW");

  const definitions = await prisma.workflowDefinition.findMany({
    include: {
      steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } },
      createdBy: { select: { fullName: true } },
      _count: { select: { instances: true } },
    },
    orderBy: [{ documentType: "asc" }, { version: "desc" }],
  });

  // Ordered by where each sits in the procurement lifecycle rather than
  // alphabetically, so Requisition Approval — the one an administrator changes
  // most often, and the one the delegation of authority actually turns on —
  // is the first thing on the screen.
  const TYPE_ORDER = ["REQUISITION", "TENDER", "PURCHASE_ORDER", "INVOICE", "CONTRACT"];
  const byType = new Map<string, typeof definitions>();
  for (const t of TYPE_ORDER) {
    const defs = definitions.filter(d => d.documentType === t);
    if (defs.length) byType.set(t, defs);
  }
  for (const d of definitions) {
    if (!byType.has(d.documentType)) byType.set(d.documentType, definitions.filter(x => x.documentType === d.documentType));
  }

  const active = definitions.filter(d => d.isActive);
  const inFlight = await prisma.workflowInstance.count({ where: { status: "IN_PROGRESS" } });

  return (
    <>
      <PageHeader
        eyebrow="Module 1 — Workflow Management"
        title="Workflow builder"
        subtitle="Approval routing is configuration, not code. Bank administrators change these rules themselves, with no change request and no vendor involvement."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Document types" value={byType.size} />
        <Stat label="Active definitions" value={active.length} tone="success" />
        <Stat label="Total versions" value={definitions.length} sub="Nothing is ever overwritten" />
        <Stat label="Documents in approval" value={inFlight} tone={inFlight ? "warn" : "neutral"}
          sub="Each pinned to its own version" />
      </div>

      <div className="mb-5">
        <Note tone="info" title="How versioning protects work in progress">
          Saving a change never edits the version in use. It creates a new version and makes that
          one active. A document already in approval keeps the rules it started under, so changing
          a threshold today cannot retroactively alter an approval chain that began yesterday.
        </Note>
      </div>

      <div className="space-y-5">
        {Array.from(byType.entries()).map(([documentType, defs]) => {
          const current = defs.find(d => d.isActive) ?? defs[0]!;
          return (
            <Card key={documentType} pad={false}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2.5">
                    {current.name}
                    <span className="font-mono text-[12px] font-normal text-ink-500">{documentType}</span>
                  </span>
                }
                subtitle={current.description}
                action={
                  <ButtonLink href={`/admin/workflows/${current.id}`} variant="primary">
                    <Icon name="settings" className="h-4 w-4" /> Configure
                  </ButtonLink>
                }
              />

              {/* The active route, at a glance. */}
              <div className="border-b border-ink-200 bg-ink-50/60 px-5 py-3.5">
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Active route — version {current.version}
                </div>
                <ol className="flex flex-wrap items-center gap-2">
                  {current.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <div className="rounded-[5px] border border-ink-300 bg-white px-3 py-1.5">
                        <div className="text-[12.5px] font-semibold text-ink-900">{s.name}</div>
                        <div className="text-[11px] text-ink-500">
                          {s.requiredRole.name}
                          {s.conditionType !== "ALWAYS" ? (
                            <span className="ml-1.5 rounded-[3px] bg-warn-100 px-1.5 py-0.5 font-medium text-warn-700">
                              {enumLabel(s.conditionType)}{" "}
                              {s.conditionValue ? `৳ ${(Number(s.conditionValue) / 100).toLocaleString("en-IN")}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {i < current.steps.length - 1 ? (
                        <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th align="center" width="80px">Version</Th>
                    <Th align="center">Steps</Th>
                    <Th>Description</Th>
                    <Th>Created by</Th>
                    <Th>Created</Th>
                    <Th align="center">Documents</Th>
                    <Th align="center">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map(d => (
                    <Tr key={d.id}>
                      <Td align="center">
                        <Link href={`/admin/workflows/${d.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                          v{d.version}
                        </Link>
                      </Td>
                      <Td align="center" className="tabular">{d.steps.length}</Td>
                      <Td className="max-w-[360px] text-[12.5px] text-ink-600">{d.description}</Td>
                      <Td className="whitespace-nowrap text-ink-600">{d.createdBy.fullName}</Td>
                      <Td className="whitespace-nowrap text-ink-600">{formatDate(d.createdAt)}</Td>
                      <Td align="center" className="tabular text-ink-600">{d._count.instances}</Td>
                      <Td align="center">
                        {d.isActive
                          ? <Pill tone="success">Active</Pill>
                          : <Pill tone="neutral">Superseded</Pill>}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
