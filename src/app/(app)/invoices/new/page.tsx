import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { vendorInitials } from "@/lib/docno";
import { PageHeader, Note, ButtonLink, Icon } from "@/components/ui";
import { InvoiceForm, type InvoiceSource } from "./invoice-form";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  assertCan(user, "INVOICE", "CREATE");
  const sp = await searchParams;

  // Work orders with goods received but not yet fully invoiced.
  const candidates = await prisma.purchaseOrder.findMany({
    where: { grns: { some: {} } },
    include: {
      vendor: true,
      lines: { include: { item: true } },
      grns: { include: { lines: true } },
      invoices: { select: { id: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 20,
  });

  const open = candidates.filter(p => p.invoices.length === 0);
  const po = candidates.find(p => p.id === sp.po) ?? open[0] ?? candidates[0];

  if (!po) {
    return (
      <>
        <PageHeader eyebrow="Module 22 — Invoicing and Payment" title="Enter invoice" />
        <Note tone="info" title="No work order has goods received against it">
          An invoice is matched against a work order and its goods receipt, so at least one
          receipt must exist first.
          <div className="mt-3">
            <ButtonLink href="/grn" variant="primary">
              Go to goods receipt <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Note>
      </>
    );
  }

  const grn = po.grns.find(g => g.id === sp.grn) ?? po.grns[0]!;

  const source: InvoiceSource = {
    poId: po.id,
    poNo: po.poNo,
    grnId: grn.id,
    grnNo: grn.grnNo,
    vendorName: po.vendor.companyName,
    suggestedVendorInvoiceNo: `${vendorInitials(po.vendor.companyName)}-2026-${String(po.poNo.slice(-3))}`,
    lines: po.lines.map(l => {
      const accepted = po.grns.flatMap(g => g.lines)
        .filter(gl => gl.poLineId === l.id)
        .reduce((s, gl) => s + gl.quantityAccepted, 0);
      const received = po.grns.flatMap(g => g.lines)
        .filter(gl => gl.poLineId === l.id)
        .reduce((s, gl) => s + gl.quantityReceived, 0);
      return {
        itemCode: l.item.code,
        itemName: l.item.name,
        orderedQuantity: l.quantity,
        receivedQuantity: received,
        acceptedQuantity: accepted,
        poUnitPrice: num(l.unitPrice),
      };
    }),
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 22 — Invoicing and Payment"
        title="Enter invoice"
        subtitle={`${po.vendor.companyName} · against ${po.poNo} and ${grn.grnNo}`}
        actions={
          open.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-500">Work order:</span>
              {open.slice(0, 4).map(p => (
                <ButtonLink key={p.id} href={`/invoices/new?po=${p.id}`}
                  variant={p.id === po.id ? "primary" : "secondary"}>
                  <span className="font-mono text-[12.5px]">{p.poNo.split("/").pop()}</span>
                </ButtonLink>
              ))}
            </div>
          ) : undefined
        }
      />
      <InvoiceForm source={source} />
    </>
  );
}
