import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import Link from "next/link";
import { requireVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, countdown, daysFromNow } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { Card, CardHeader, Pill, Icon, Note, Money } from "@/components/ui";
import { IntentionButton } from "./intention-button";

export const dynamic = "force-dynamic";

/**
 * Tender as the vendor sees it.
 *
 * Shows the documents, the closing countdown, and the status of this bidder's
 * own two submissions. It shows nothing at all about other bidders — not their
 * names, not how many there are, not whether they have submitted. That is the
 * vendor-side half of the two-envelope guarantee.
 */
export default async function VendorTenderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVendorUser();

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: { documents: { orderBy: { sequence: "asc" } } },
  });
  if (!tender) notFound();

  const myBid = await prisma.bid.findFirst({
    where: { tenderId: id, vendorId: user.vendorId! },
    include: { technicalPart: true, financialPart: true },
  });

  const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: user.vendorId! } });
  const open = tender.status === "PUBLISHED";
  const licenceValid = vendor.tradeLicenseExpiry > new Date();
  const eligible = vendor.enlistmentStatus === "APPROVED" && licenceValid;

  const techDone = Boolean(myBid?.technicalPart?.submittedAt);
  const finDone = Boolean(myBid?.financialPart?.submittedAt);

  return (
    <>
      <Link href="/vendor/tenders" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> All tenders
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[23px] font-bold text-ink-950">{tender.tenderNo}</h1>
            <Pill status={tender.status} />
            {tender.envelopeSystem === "TWO" ? (
              <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Two envelope</Pill>
            ) : null}
          </div>
          <p className="mt-1 text-[15px] text-ink-700">{tender.title}</p>
        </div>
        {open ? (
          <div className="shrink-0 rounded-[6px] border border-ink-300 bg-white px-4 py-2.5 text-center">
            <div className="text-[11.5px] uppercase tracking-[0.06em] text-ink-500">Closes in</div>
            <div className="text-[20px] font-bold leading-none text-ink-950"><Countdown to={tender.closingAt} initial={countdown(tender.closingAt)} /></div>
            <div className="mt-0.5 text-[11px] text-ink-500">{formatDateTime(tender.closingAt)}</div>
          </div>
        ) : null}
      </div>

      {!eligible ? (
        <div className="mb-5">
          <Note tone="danger" title="You are not currently eligible to bid">
            {vendor.enlistmentStatus !== "APPROVED"
              ? "Your enlistment has not been approved by the Common Services Division."
              : `Your trade licence expired on ${formatDate(vendor.tradeLicenseExpiry)}. Renew it and upload the certificate to participate.`}
          </Note>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card pad={false}>
            <CardHeader title="Tender documents" subtitle="Download and review before submitting" />
            <div className="divide-y divide-ink-100">
              {tender.documents.map(d => (
                <details key={d.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 hover:bg-ink-50">
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon name="file" className="h-4 w-4 shrink-0 text-ink-400" />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink-900">{d.title}</div>
                        <div className="font-mono text-[11.5px] text-ink-500">
                          {d.fileName} · {(d.fileSize / 1024).toFixed(0)} KB
                        </div>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-3">
                      <Icon name="download" className="h-4 w-4 text-ink-400" />
                      <Icon name="chevronRight" className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <div className="border-t border-ink-100 bg-ink-50 px-5 py-4">
                    <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-700">{d.content}</pre>
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card pad={false}>
            <CardHeader title="Your submission" />
            <div className="space-y-3 p-5">
              {/* Technical */}
              <div className={`rounded-[6px] border px-3.5 py-3 ${techDone ? "border-brand-500/40 bg-brand-50" : "border-ink-200"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-ink-900">Technical offer</span>
                  {techDone ? <Pill tone="success">Submitted</Pill> : <Pill tone="neutral">Not submitted</Pill>}
                </div>
                {techDone ? (
                  <div className="mt-1 text-[11.5px] text-ink-500">
                    {formatDateTime(myBid!.technicalPart!.submittedAt!)}
                  </div>
                ) : null}
              </div>

              {/* Financial */}
              <div className={`rounded-[6px] border px-3.5 py-3 ${finDone ? "border-gold-500/50 bg-gold-50" : "border-ink-200"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-ink-900">Financial offer</span>
                  {finDone
                    ? myBid!.financialPart!.openedAt
                      ? <Pill tone="success">Opened by bank</Pill>
                      : <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Sealed</Pill>
                    : <Pill tone="neutral">Not submitted</Pill>}
                </div>
                {finDone ? (
                  <>
                    <div className="mt-1 text-[11.5px] text-ink-500">
                      {formatDateTime(myBid!.financialPart!.submittedAt!)}
                    </div>
                    {!myBid!.financialPart!.openedAt ? (
                      <p className="mt-1.5 text-[11.5px] leading-snug text-gold-700">
                        Held sealed. Nobody at the bank can read your price until the technical
                        evaluation is complete.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {open && eligible ? (
                <>
                  {!myBid ? (
                    <IntentionButton tenderId={tender.id} />
                  ) : null}
                  <Link
                    href={`/vendor/tenders/${tender.id}/submit`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-800"
                  >
                    {techDone || finDone ? "Revise submission" : "Submit bid"}
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                </>
              ) : !open ? (
                <div className="rounded-[5px] bg-ink-100 px-3.5 py-2.5 text-[12.5px] text-ink-600">
                  This tender is closed to submissions.
                  {myBid?.status === "AWARDED" ? (
                    <span className="mt-1 block font-semibold text-brand-700">
                      Your offer was accepted. A work order will follow.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>

          <Note tone="neutral" title="What other bidders see">
            Nothing about your submission. This portal shows you only your own bid. You cannot see
            who else has bid, how many have bid, or what they offered — and they cannot see yours.
          </Note>
        </div>
      </div>
    </>
  );
}
