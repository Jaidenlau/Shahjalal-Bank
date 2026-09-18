import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { RequisitionForm, type CatalogueItem } from "./requisition-form";

export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  const user = await requireUser();
  assertCan(user, "REQUISITION", "CREATE");

  const [items, departments, branches] = await Promise.all([
    prisma.item.findMany({
      include: { category: true, stockBalances: true },
      orderBy: { code: "asc" },
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Stock position travels with the catalogue so the picker can show current
  // holdings, in-transit and under-purchase quantities without a round trip
  // per keystroke. The authoritative check still runs server side on submit.
  const catalogue: CatalogueItem[] = items.map(i => ({
    id: i.id, code: i.code, name: i.name, category: i.category.name,
    uom: i.unitOfMeasure, capexOpex: i.capexOpex, glCode: i.glCode,
    reorderLevel: i.reorderLevel, specification: i.specification ?? "",
    onHand: i.stockBalances.reduce((s, b) => s + b.quantityOnHand, 0),
    inTransit: i.stockBalances.reduce((s, b) => s + b.quantityInTransit, 0),
    underPurchase: i.stockBalances.reduce((s, b) => s + b.quantityUnderPurchase, 0),
    lastPurchasePrice: num(i.stockBalances[0]?.lastPurchasePrice ?? 0),
    lastPurchaseDate: i.stockBalances[0]?.lastPurchaseDate?.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Module 2 — Requisition Management"
        title="New requisition"
        subtitle="Select items from the catalogue. Stock is checked on submission and anything already held is routed to the store rather than purchased."
      />
      <RequisitionForm
        catalogue={catalogue}
        departments={departments.map(d => ({ id: d.id, code: d.code, name: d.name, costCenterCode: d.costCenterCode }))}
        branches={branches.map(b => ({ id: b.id, name: b.name }))}
        defaultDepartmentId={user.departmentId ?? departments[0]!.id}
        defaultBranchId={user.branchId ?? branches[0]!.id}
      />
    </>
  );
}
