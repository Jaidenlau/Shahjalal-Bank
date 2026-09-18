import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { PageHeader, Note, ButtonLink, Icon } from "@/components/ui";
import { GrnForm, type GrnSource } from "./grn-form";

export const dynamic = "force-dynamic";

export default async function NewGrnPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  assertCan(user, "GRN", "CREATE");
  const sp = await searchParams;

  const open = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } },
    include: {
      vendor: true,
      lines: { include: { item: true } },
      grns: { include: { lines: true } },
    },
    orderBy: { deliveryDueAt: "asc" },
  });

  const po = open.find(p => p.id === sp.po) ?? open[0];

  if (!po) {
    return (
      <>
        <PageHeader
          eyebrow="Module 21 — Inventory Management"
          title="Record goods receipt"
        />
        <Note tone="info" title="No work order is awaiting delivery">
          A goods receipt is recorded against an issued work order. Issue one first.
          <div className="mt-3">
            <ButtonLink href="/purchase-orders" variant="primary">
              Go to purchase orders <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Note>
      </>
    );
  }

  const source: GrnSource = {
    poId: po.id,
    poNo: po.poNo,
    vendorName: po.vendor.companyName,
    vendorInitials: po.vendor.companyName.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase(),
    deliveryDue: po.deliveryDueAt ? formatDate(po.deliveryDueAt) : null,
    lines: po.lines.map(l => {
      const already = po.grns.flatMap(g => g.lines)
        .filter(gl => gl.poLineId === l.id)
        .reduce((s, gl) => s + gl.quantityReceived, 0);
      return {
        poLineId: l.id,
        itemCode: l.item.code,
        itemName: l.item.name,
        unitOfMeasure: l.item.unitOfMeasure,
        ordered: l.quantity,
        alreadyReceived: already,
        outstanding: l.quantity - already,
        unitPrice: num(l.unitPrice),
      };
    }),
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 21 — Inventory Management"
        title="Record goods receipt"
        subtitle={`Against ${po.poNo} — ${po.vendor.companyName}`}
        actions={
          open.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-500">Work order:</span>
              {open.slice(0, 4).map(p => (
                <ButtonLink key={p.id} href={`/grn/new?po=${p.id}`}
                  variant={p.id === po.id ? "primary" : "secondary"}>
                  <span className="font-mono text-[12.5px]">{p.poNo.split("/").pop()}</span>
                </ButtonLink>
              ))}
            </div>
          ) : undefined
        }
      />
      <GrnForm source={source} />
    </>
  );
}
