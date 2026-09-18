import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num, formatBDT } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/date";
import {
  PageHeader, Card, CardHeader, Pill, Money, Table, Th, Td, Tr,
  Icon, Note, MetaItem, ButtonLink,
} from "@/components/ui";
import { BankLetterhead } from "@/components/brand";
import { PrintButton } from "@/components/print-button";
import { AwardPanel } from "./award-panel";

export const dynamic = "force-dynamic";

interface CsRow {
  vendorId: string; vendorName: string; technicalResult: string;
  technicalScore: number | null; financialTotal: number;
  eligible: boolean; evaluationComments: string; rank: number | null;
}

/**
 * The comparative statement.
 *
 * Laid out as a bank document rather than a web table, because this is the
 * artefact that goes to the Purchase Committee and the room will recognise the
 * shape. It ranks technically qualified bidders only, and states in the
 * recommendation why a cheaper disqualified offer was not taken — which is the
 * bank's own position under RFQ clause 1.10.
 */
export default async function ComparativeStatementPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: {
      comparativeStatements: { orderBy: { generatedAt: "desc" }, take: 1 },
      bids: { include: { vendor: { select: { companyName: true } } } },
      requisitionLinks: { include: { requisition: { select: { requisitionNo: true } } } },
    },
  });
  if (!tender) notFound();

  const cs = tender.comparativeStatements[0];
  const unlocked = Boolean(tender.technicalEvaluationCompletedAt);

  if (!unlocked) {
    return (
      <>
        <PageHeader
          eyebrow={<Link href={`/tenders/${id}`} className="hover:underline">← {tender.tenderNo}</Link>}
          title="Comparative statement"
          subtitle={tender.title}
        />
        <Note
          tone="sealed"
          title={<span className="flex items-center gap-2"><Icon name="lock" className="h-4 w-4" /> Not available yet</span>}
          reference="RFQ Clause 1.9 — “Only technically qualified bidders will proceed to financial evaluation.”"
        >
          A comparative statement compares prices, so it cannot be produced while the financial
          offers remain sealed. Complete the technical evaluation first.
          <div className="mt-3">
            <ButtonLink href={`/tenders/${id}/evaluation`} variant="primary">
              Go to technical evaluation <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Note>
      </>
    );
  }

  const generator = cs ? await prisma.user.findUnique({
    where: { id: cs.generatedById }, select: { fullName: true, designation: true },
  }) : null;

  let rows: CsRow[] = [];
  try { rows = cs ? JSON.parse(cs.rows) : []; } catch { rows = []; }
  const ordered = rows.slice().sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return a.financialTotal - b.financialTotal;
  });

  const winner = ordered.find(r => r.rank === 1);
  const cheapestOverall = rows.slice().sort((a, b) => a.financialTotal - b.financialTotal)[0];
  const savedAgainstEstimate = winner ? num(tender.estimatedValue) - winner.financialTotal : 0;
  const awardedBid = tender.bids.find(b => b.status === "AWARDED");

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/tenders/${id}`} className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> {tender.tenderNo}
            </span>
          </Link>
        }
        title="Comparative statement"
        subtitle={tender.title}
        actions={<PrintButton label="Print statement" />}
        meta={
          cs ? (
            <>
              <MetaItem label="Generated">{formatDateTime(cs.generatedAt)}</MetaItem>
              <MetaItem label="By">{generator?.fullName ?? "—"}</MetaItem>
              <MetaItem label="Bids compared">{rows.length}</MetaItem>
            </>
          ) : undefined
        }
      />

      {!cs ? (
        <Note tone="info" title="Not generated yet">
          The financial offers are unsealed. Generate the comparative statement from the tender
          record to rank the technically qualified bidders.
          <div className="mt-3">
            <ButtonLink href={`/tenders/${id}`} variant="primary">Back to tender</ButtonLink>
          </div>
        </Note>
      ) : (
        <>
          {awardedBid ? null : (
            <div className="mb-5">
              <AwardPanel
                tenderId={id}
                candidates={ordered.filter(r => r.eligible).map(r => {
                  const bid = tender.bids.find(b => b.vendor.companyName === r.vendorName);
                  return { bidId: bid?.id ?? "", vendorName: r.vendorName, amount: r.financialTotal, rank: r.rank };
                })}
                blocked={ordered.filter(r => !r.eligible).map(r => {
                  const bid = tender.bids.find(b => b.vendor.companyName === r.vendorName);
                  return { bidId: bid?.id ?? "", vendorName: r.vendorName, amount: r.financialTotal };
                })}
                canAward={can(user, "TENDER", "EVALUATE")}
              />
            </div>
          )}

          {/* The printable document. */}
          <Card pad={false} className="print-page">
            <div className="px-7 py-6">
              <BankLetterhead />

              <div className="mt-5 text-center">
                <h2 className="text-[17px] font-bold uppercase tracking-[0.06em] text-ink-950">
                  Comparative Statement
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  Tender No. {tender.tenderNo} &nbsp;·&nbsp; {tender.title}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5 border-y border-ink-200 py-3 text-[12.5px] sm:grid-cols-4">
                {[
                  ["Procurement method", tender.method],
                  ["Envelope system", "Two envelope"],
                  ["Published", tender.publishedAt ? formatDate(tender.publishedAt) : "—"],
                  ["Closed", tender.closedAt ? formatDate(tender.closedAt) : "—"],
                  ["Technical evaluation", tender.technicalEvaluationCompletedAt ? formatDate(tender.technicalEvaluationCompletedAt) : "—"],
                  ["Estimated value", formatBDT(num(tender.estimatedValue))],
                  ["Source requisition", tender.requisitionLinks.map(r => r.requisition.requisitionNo).join(", ") || "—"],
                  ["Bids received", String(tender.bids.length)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt className="text-[11px] uppercase tracking-[0.05em] text-ink-500">{l}</dt>
                    <dd className="font-medium text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>

              <Table className="mt-5">
                <thead>
                  <tr>
                    <Th width="54px" align="center">Rank</Th>
                    <Th>Bidder</Th>
                    <Th align="center">Technical result</Th>
                    <Th align="center">Score</Th>
                    <Th align="right">Financial offer</Th>
                    <Th align="right">Variance to estimate</Th>
                    <Th>Committee finding</Th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(r => {
                    const variance = r.financialTotal - num(tender.estimatedValue);
                    return (
                      <Tr key={r.vendorId} className={r.rank === 1 ? "bg-brand-50" : !r.eligible ? "bg-danger-50/50" : ""}>
                        <Td align="center">
                          {r.rank ? (
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                              r.rank === 1 ? "bg-brand-700 text-white" : "bg-ink-200 text-ink-700"
                            }`}>
                              {r.rank}
                            </span>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </Td>
                        <Td className="font-semibold">{r.vendorName}</Td>
                        <Td align="center"><Pill status={r.technicalResult} /></Td>
                        <Td align="center" className="tabular">{r.technicalScore ?? "—"}</Td>
                        <Td align="right" className={`font-semibold ${!r.eligible ? "text-ink-400 line-through" : ""}`}>
                          <Money value={r.financialTotal} />
                        </Td>
                        <Td align="right" className={variance <= 0 ? "text-brand-700" : "text-warn-700"}>
                          {variance <= 0 ? "−" : "+"}<Money value={Math.abs(variance)} />
                        </Td>
                        <Td className="max-w-[240px] text-[12.5px] text-ink-600">{r.evaluationComments}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>

              {/* The paragraph that answers "why not the cheapest". */}
              <div className="mt-5 rounded-[5px] border border-ink-300 bg-ink-50 px-4 py-3.5">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-600">
                  Recommendation
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-800">{cs.recommendation}</p>
                {winner && cheapestOverall && cheapestOverall.vendorId !== winner.vendorId ? (
                  <p className="mt-2 border-t border-ink-300 pt-2 text-[12.5px] leading-relaxed text-ink-600">
                    <strong className="font-semibold">Note for the record.</strong>{" "}
                    {cheapestOverall.vendorName} offered {formatBDT(cheapestOverall.financialTotal)}, which is{" "}
                    {formatBDT(winner.financialTotal - cheapestOverall.financialTotal)} below the recommended
                    award. That offer was technically disqualified before any price was visible to the
                    committee, and under clause 1.10 of the Bank&apos;s tender document the Bank is in no way
                    bound to award to the lowest bidder.
                  </p>
                ) : null}
                {winner && savedAgainstEstimate > 0 ? (
                  <p className="mt-2 text-[12.5px] text-brand-800">
                    The recommended award is {formatBDT(savedAgainstEstimate)} below the estimated value
                    carried on the source requisition.
                  </p>
                ) : null}
              </div>

              {/* Signature block, as the paper version carries. */}
              <div className="mt-8 grid grid-cols-3 gap-8">
                {["Prepared by", "Checked by", "Approved by"].map(role => (
                  <div key={role}>
                    <div className="h-12 border-b border-ink-400" />
                    <div className="mt-1 text-[11.5px] font-medium text-ink-700">{role}</div>
                    <div className="text-[10.5px] text-ink-500">
                      {role === "Prepared by" ? `${generator?.fullName ?? ""}` : "Purchase Committee"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
