import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, assertCan, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/date";
import { PageHeader, Icon, Pill, MetaItem } from "@/components/ui";
import { Builder, type BuilderStep, type RoleOption } from "./builder";

export const dynamic = "force-dynamic";

export default async function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  assertCan(user, "WORKFLOW", "VIEW");

  const def = await prisma.workflowDefinition.findUnique({
    where: { id },
    include: {
      steps: { include: { requiredRole: true }, orderBy: { sequence: "asc" } },
      createdBy: { select: { fullName: true } },
    },
  });
  if (!def) notFound();

  const [roles, departments, categories, siblings, inFlight] = await Promise.all([
    prisma.role.findMany({ where: { code: { not: "VENDOR" } }, orderBy: { rank: "asc" } }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.itemCategory.findMany({ where: { parentId: null }, orderBy: { name: "asc" } }),
    prisma.workflowDefinition.findMany({
      where: { documentType: def.documentType },
      orderBy: { version: "desc" },
      select: { id: true, version: true, isActive: true, description: true, createdAt: true },
    }),
    prisma.workflowInstance.count({
      where: { workflowDefinitionId: def.id, status: "IN_PROGRESS" },
    }),
  ]);

  const steps: BuilderStep[] = def.steps.map(s => ({
    key: s.id,
    sequence: s.sequence,
    name: s.name,
    conditionType: s.conditionType,
    conditionValue: s.conditionValue,
    requiredRoleId: s.requiredRoleId,
    actionType: s.actionType,
    escalationHours: s.escalationHours,
  }));

  const roleOptions: RoleOption[] = roles.map(r => ({ id: r.id, name: r.name }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/workflows" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Workflow builder
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {def.name}
            <span className="font-mono text-[18px] text-ink-500">v{def.version}</span>
            {def.isActive ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Superseded</Pill>}
          </span>
        }
        subtitle={def.description}
        meta={
          <>
            <MetaItem label="Document type">{def.documentType}</MetaItem>
            <MetaItem label="Steps">{def.steps.length}</MetaItem>
            <MetaItem label="Created by">{def.createdBy.fullName}</MetaItem>
            <MetaItem label="Created">{formatDate(def.createdAt)}</MetaItem>
            <MetaItem label="In approval on this version">{inFlight}</MetaItem>
          </>
        }
      />

      <Builder
        definitionId={def.id}
        documentType={def.documentType}
        version={def.version}
        isActive={def.isActive}
        initialSteps={steps}
        roles={roleOptions}
        departments={departments.map(d => ({ code: d.code, name: d.name }))}
        categories={categories.map(c => ({ code: c.code, name: c.name }))}
        versions={siblings.map(v => ({
          id: v.id, version: v.version, isActive: v.isActive,
          description: v.description, createdAt: v.createdAt.toISOString(),
        }))}
        inFlightCount={inFlight}
        canConfigure={can(user, "WORKFLOW", "CONFIGURE")}
      />
    </>
  );
}
