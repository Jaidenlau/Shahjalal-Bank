import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { readFinancialPart } from "@/lib/sealed-bids";
import { PageHeader, Note, Card, ButtonLink, Icon } from "@/components/ui";
import { PoForm, type PoSource } from "./po-form";

export const dynamic = "force-dynamic";

/**
 * Work order generation from an awarded tender.
 *
 * Pre-populated from the winning bid. The quantity field is editable, which is
 * the point: editing it beyond what the requisition approved must fail, and the
 * room needs to watch that happen.
 */
export default async function NewPurchaseOrderPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  assertCan(user, "PO", "CREATE");
  const sp = await searchParams;

  const awarded = await prisma.tender.findMany({
    where: { status: "AWARDED" },
    include: {
      bids: { where: { status: "AWARDED" }, include: { vendor: true } },
      requisitionLinks: {
        include: { requisition: { include: { lines: { include: { item: true } } } } },
      },
    },
    orderBy: { awardedAt: "desc" },
  });

  const selectedId = sp.tender ?? awarded[0]?.id;
  const tender = awarded.find(t => t.id === selectedId);

  if (!tender || !tender.bids[0] || tender.requisitionLinks.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Module 3 — Purchase Order Creation"
          title="New work order"
          subtitle="Work orders are raised from an awarded tender and validated against the requisition that authorised the purchase."
        />
        <Note tone="info" title="No awarded tender is ready for a work order">
          A work order is generated from the winning bid on an awarded tender, so that every line
          traces back to an approved requisition. Award a tender first.
          <div className="mt-3">
            <ButtonLink href="/tenders" variant="primary">
              Go to tenders <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Note>
      </>
    );
  }

  const bid = tender.bids[0]!;
  const req = tender.requisitionLinks[0]!.requisition;

  // The winning price, read through the seal — which is open by now, since a
  // tender cannot be awarded before technical evaluation completes.
  let quoted: Array<{ itemCode: string; unitPrice: number }> = [];
  try {
    const fp = await readFinancialPart(bid.id);
    quoted = fp.lineItems.map(li => ({ itemCode: li.itemCode, unitPrice: li.unitPrice }));
  } catch {
    quoted = [];
  }

  const source: PoSource = {
    tenderId: tender.id,
    tenderNo: tender.tenderNo,
    bidId: bid.id,
    vendorId: bid.vendorId,
    vendorName: bid.vendor.companyName,
    requisitionId: req.id,
    requisitionNo: req.requisitionNo,
    lines: req.lines
      .filter(l => l.quantityToPurchase > 0)
      .map(l => ({
        itemId: l.itemId,
        itemCode: l.item.code,
        itemName: l.item.name,
        unitOfMeasure: l.item.unitOfMeasure,
        approvedQuantity: l.quantityToPurchase,
        requisitionedQuantity: l.quantity,
        fromStore: l.quantityFromStore,
        unitPrice: quoted.find(q => q.itemCode === l.item.code)?.unitPrice
          ?? num(l.estimatedUnitPrice),
      })),
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 3 — Purchase Order Creation"
        title="New work order"
        subtitle={`From ${tender.tenderNo}, awarded to ${bid.vendor.companyName}`}
        actions={
          // A plain link per awarded tender: no client component needed, and it
          // still works if JavaScript is slow to hydrate on the demo machine.
          awarded.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-500">From:</span>
              {awarded.slice(0, 4).map(t => (
                <ButtonLink
                  key={t.id}
                  href={`/purchase-orders/new?tender=${t.id}`}
                  variant={t.id === tender.id ? "primary" : "secondary"}
                >
                  <span className="font-mono text-[12.5px]">{t.tenderNo.split("/").pop()}</span>
                </ButtonLink>
              ))}
            </div>
          ) : undefined
        }
      />

      <PoForm source={source} />
    </>
  );
}
