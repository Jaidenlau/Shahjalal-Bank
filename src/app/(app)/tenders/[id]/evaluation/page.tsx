import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDateTime } from "@/lib/date";
import { listFinancialParts } from "@/lib/sealed-bids";
import { PageHeader, Card, Icon, Note, Pill, MetaItem } from "@/components/ui";
import { EvaluationBoard, type EvalBid } from "./evaluation-board";

export const dynamic = "force-dynamic";

/**
 * Technical evaluation.
 *
 * Deliberately shows NO price anywhere, even after the seal lifts, because the
 * decision recorded here must be defensible as a technical one. The panel at
 * the top says so explicitly, which is the answer to "how do we know price did
 * not influence the technical result".
 */
export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: {
      bids: {
        include: {
          vendor: { select: { companyName: true, contactPerson: true, tradeLicenseNo: true } },
          technicalPart: true,
        },
        orderBy: { vendor: { companyName: "asc" } },
      },
      committees: {
        where: { type: "TECHNICAL_EVALUATION" },
        include: { members: { include: { user: { select: { fullName: true, designation: true } } } } },
      },
      documents: { where: { section: "TECHNICAL_SPEC" }, take: 1 },
    },
  });
  if (!tender) notFound();

  const parts = await listFinancialParts(tender.id);
  const sealedCount = parts.filter(p => p.sealed).length;
  const unlocked = Boolean(tender.technicalEvaluationCompletedAt);
  const canEvaluate = can(user, "TENDER", "EVALUATE");

  const bids: EvalBid[] = tender.bids.map(b => ({
    id: b.id,
    vendorName: b.vendor.companyName,
    contactPerson: b.vendor.contactPerson,
    tradeLicenseNo: b.vendor.tradeLicenseNo,
    status: b.status,
    technicalScore: b.technicalScore,
    evaluationComments: b.evaluationComments,
    openedAt: b.technicalPart?.openedAt?.toISOString() ?? null,
    content: b.technicalPart?.openedAt ? b.technicalPart.content : null,
    documents: b.technicalPart?.openedAt ? safeDocs(b.technicalPart.documents) : [],
    documentCount: safeLen(b.technicalPart?.documents ?? "[]"),
  }));

  const committee = tender.committees[0];
  const evaluated = bids.filter(b => b.status !== "SUBMITTED").length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/tenders/${tender.id}`} className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> {tender.tenderNo}
            </span>
          </Link>
        }
        title="Technical evaluation"
        subtitle={tender.title}
        meta={
          <>
            <MetaItem label="Bids">{bids.length}</MetaItem>
            <MetaItem label="Evaluated">{evaluated} of {bids.length}</MetaItem>
            <MetaItem label="Financial offers">
              {unlocked ? "Unsealed" : `${sealedCount} sealed`}
            </MetaItem>
          </>
        }
      />

      <div className="mb-5">
        {unlocked ? (
          <Note tone="success" title="Technical evaluation completed">
            Completed {formatDateTime(tender.technicalEvaluationCompletedAt!)}. Financial offers
            are now readable. The technical decisions below were recorded before any price was
            visible, and the audit trail records that.
          </Note>
        ) : (
          <Note
            tone="sealed"
            title={<span className="flex items-center gap-2"><Icon name="lock" className="h-4 w-4" /> Prices are not visible on this screen</span>}
            reference="RFQ Clause 1.9 — “Only technically qualified bidders will proceed to financial evaluation.”"
          >
            No price appears anywhere on this page, and none can be read while the technical
            evaluation is open. Each bid is qualified or disqualified on the specification and
            the mandatory documents alone, so the technical decision cannot be influenced by
            what the bidder asked for.
          </Note>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EvaluationBoard
            tenderId={tender.id}
            bids={bids}
            canEvaluate={canEvaluate}
            unlocked={unlocked}
            tenderStatus={tender.status}
          />
        </div>

        <div className="space-y-5">
          {committee ? (
            <Card>
              <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
                {committee.name}
              </div>
              <ul className="space-y-2.5">
                {committee.members.map(m => (
                  <li key={m.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-ink-900">{m.user.fullName}</div>
                      <div className="text-[12px] text-ink-500">{m.user.designation}</div>
                    </div>
                    {m.isChair ? <Pill tone="info">Chair</Pill> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {tender.documents[0] ? (
            <Card>
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
                Technical specification
              </div>
              <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-700">
                {tender.documents[0].content}
              </pre>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function safeLen(json: string): number {
  try { return (JSON.parse(json) as unknown[]).length; } catch { return 0; }
}
function safeDocs(json: string): Array<{ fileName: string; fileSize: number }> {
  try { return JSON.parse(json); } catch { return []; }
}
