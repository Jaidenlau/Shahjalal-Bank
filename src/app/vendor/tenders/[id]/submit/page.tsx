import { notFound, redirect } from "next/navigation";
import { Countdown } from "@/components/countdown";
import Link from "next/link";
import { requireVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDateTime, countdown } from "@/lib/date";
import { Icon, Pill } from "@/components/ui";
import { SubmitBidForm, type QuoteLine } from "./submit-form";

export const dynamic = "force-dynamic";

export default async function SubmitBidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVendorUser();

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: {
      documents: { where: { section: "TECHNICAL_SPEC" }, take: 1 },
      requisitionLinks: {
        include: { requisition: { include: { lines: { include: { item: true } } } } },
      },
    },
  });
  if (!tender) notFound();
  if (tender.status !== "PUBLISHED") redirect(`/vendor/tenders/${id}`);

  const myBid = await prisma.bid.findFirst({
    where: { tenderId: id, vendorId: user.vendorId! },
    include: { technicalPart: true, financialPart: true },
  });

  // The lines the vendor is asked to price: only the quantity the bank routed
  // to purchase.
  const lines: QuoteLine[] = tender.requisitionLinks.flatMap(rl =>
    rl.requisition.lines
      .filter(l => l.quantityToPurchase > 0)
      .map(l => ({
        itemCode: l.item.code,
        itemName: l.item.name,
        quantity: l.quantityToPurchase,
        unitOfMeasure: l.item.unitOfMeasure,
        specification: l.item.specification ?? "",
      })),
  );

  return (
    <>
      <Link href={`/vendor/tenders/${id}`} className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> {tender.tenderNo}
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.015em] text-ink-950">Submit your bid</h1>
          <p className="mt-1 text-[14px] text-ink-600">{tender.title}</p>
        </div>
        <div className="shrink-0 rounded-[6px] border border-ink-300 bg-white px-4 py-2 text-center">
          <div className="text-[11.5px] uppercase tracking-[0.06em] text-ink-500">Closes in</div>
          <div className="text-[18px] font-bold leading-none text-ink-950"><Countdown to={tender.closingAt} initial={countdown(tender.closingAt)} /></div>
        </div>
      </div>

      <SubmitBidForm
        tenderId={id}
        tenderNo={tender.tenderNo}
        specification={tender.documents[0]?.content ?? ""}
        lines={lines}
        existingTechnical={myBid?.technicalPart ? {
          content: myBid.technicalPart.content,
          submittedAt: myBid.technicalPart.submittedAt?.toISOString() ?? null,
        } : null}
        financialSubmittedAt={myBid?.financialPart?.submittedAt?.toISOString() ?? null}
      />
    </>
  );
}
