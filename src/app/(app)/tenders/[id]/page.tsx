import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, formatDateTime, countdown, relativeDays } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { chainForDocument } from "@/lib/workflow";
import { listFinancialParts } from "@/lib/sealed-bids";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Field, MetaItem, Icon, ButtonLink, Note, SectionTitle,
} from "@/components/ui";
import { WorkflowChain } from "@/components/workflow-chain";
import { TenderTabs } from "./tabs";
import { BidsPanel, type BidRow } from "./bids-panel";
import { TenderActions } from "./tender-actions-panel";

export const dynamic = "force-dynamic";

export default async function TenderDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const user = await requireUser();

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true, designation: true } },
      documents: { orderBy: { sequence: "asc" } },
      committees: {
        include: { members: { include: { user: { select: { fullName: true, designation: true } } } } },
        orderBy: { type: "asc" },
      },
      bids: {
        include: {
          vendor: { select: { id: true, companyName: true, contactPerson: true, tradeLicenseNo: true } },
          technicalPart: true,
        },
        orderBy: { vendor: { companyName: "asc" } },
      },
      requisitionLinks: {
        include: {
          requisition: {
            select: { id: true, requisitionNo: true, title: true, status: true, totalEstimatedValue: true },
          },
        },
      },
      comparativeStatements: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });
  if (!tender) notFound();

  const chain = await chainForDocument("TENDER", tender.id);

  // Financial parts are read through the seal, never directly. While the
  // technical evaluation is incomplete this returns summaries with no amounts.
  const financialParts = await listFinancialParts(tender.id);
  const unlocked = Boolean(tender.technicalEvaluationCompletedAt);

  const bidRows: BidRow[] = tender.bids.map(b => {
    const fp = financialParts.find(f => f.bidId === b.id);
    return {
      id: b.id,
      vendorId: b.vendor.id,
      vendorName: b.vendor.companyName,
      contactPerson: b.vendor.contactPerson,
      tradeLicenseNo: b.vendor.tradeLicenseNo,
      status: b.status,
      submittedAt: b.submittedAt?.toISOString() ?? null,
      technicalScore: b.technicalScore,
      evaluationComments: b.evaluationComments,
      technical: b.technicalPart ? {
        openedAt: b.technicalPart.openedAt?.toISOString() ?? null,
        content: b.technicalPart.openedAt ? b.technicalPart.content : null,
        documentCount: safeLen(b.technicalPart.documents),
        documents: b.technicalPart.openedAt ? safeDocs(b.technicalPart.documents) : [],
      } : null,
      financial: fp
        ? fp.sealed
          ? { sealed: true as const, digest: fp.digest, documentCount: fp.documentCount,
              submittedAt: fp.submittedAt?.toISOString() ?? null }
          : { sealed: false as const, totalAmount: fp.totalAmount, lineItems: fp.lineItems,
              openedAt: fp.openedAt?.toISOString() ?? null,
              submittedAt: fp.submittedAt?.toISOString() ?? null }
        : null,
    };
  });

  const openedCount = tender.bids.filter(b => b.technicalPart?.openedAt).length;
  const evaluatedCount = tender.bids.filter(b => b.status !== "SUBMITTED").length;
  const canEvaluate = can(user, "TENDER", "EVALUATE");

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: `Documents (${tender.documents.length})` },
    { key: "committees", label: `Committees (${tender.committees.length})` },
    { key: "bids", label: `Bids (${tender.bids.length})`, highlight: !unlocked && tender.bids.length > 0 },
    { key: "evaluation", label: "Evaluation" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/tenders" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Tenders
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[23px]">{tender.tenderNo}</span>
            <Pill status={tender.status} />
            {tender.envelopeSystem === "TWO" ? (
              unlocked
                ? <Pill tone="success"><Icon name="unlock" className="h-3 w-3" /> Financials unsealed</Pill>
                : <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Financials sealed</Pill>
            ) : null}
          </span>
        }
        subtitle={tender.title}
        meta={
          <>
            <MetaItem label="Method">{enumLabel(tender.method)}</MetaItem>
            <MetaItem label="Envelope">{enumLabel(tender.envelopeSystem)}</MetaItem>
            <MetaItem label="Estimated"><Money value={num(tender.estimatedValue)} /></MetaItem>
            <MetaItem label="Published">{tender.publishedAt ? formatDate(tender.publishedAt) : "Not published"}</MetaItem>
            <MetaItem label="Closing">
              {tender.status === "PUBLISHED" && tender.closingAt
                ? countdown(tender.closingAt)
                : tender.closingAt ? formatDate(tender.closingAt) : "—"}
            </MetaItem>
            <MetaItem label="Bids">{tender.bids.length}</MetaItem>
          </>
        }
      />

      {/* --- The seal, stated plainly at the top of the record ------------- */}
      {tender.envelopeSystem === "TWO" && !unlocked && tender.bids.length > 0 ? (
        <div className="mb-5">
          <Note
            tone="sealed"
            title={<span className="flex items-center gap-2"><Icon name="lock" className="h-4 w-4" /> Financial offers are sealed</span>}
            reference="RFQ Clause 1.9 — “Only technically qualified bidders will proceed to financial evaluation.”"
          >
            {tender.bids.length} financial envelope{tender.bids.length === 1 ? " is" : "s are"} held sealed.
            No user of this system, including an administrator, can read a bid amount for this tender
            until the Technical Evaluation Committee completes and signs off the technical evaluation.
            The restriction is enforced in the data access layer: the amounts are not read out of the
            database at all, rather than being read and hidden in the interface.
          </Note>
        </div>
      ) : null}

      <TenderActions
        tenderId={tender.id}
        status={tender.status}
        canEvaluate={canEvaluate}
        canCreate={can(user, "TENDER", "CREATE")}
        bidCount={tender.bids.length}
        openedCount={openedCount}
        evaluatedCount={evaluatedCount}
        unlocked={unlocked}
        hasComparative={tender.comparativeStatements.length > 0}
      />

      <div className="mt-5">
        <TenderTabs tabs={tabs} active={tab} basePath={`/tenders/${tender.id}`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {tab === "overview" ? (
            <>
              <Card pad={false}>
                <CardHeader title="Tender notice" />
                <div className="p-5">
                  <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-800">
                    {tender.description}
                  </p>
                </div>
              </Card>

              {tender.requisitionLinks.length > 0 ? (
                <Card pad={false}>
                  <CardHeader
                    title="Source requisitions"
                    subtitle="Work order quantities will be validated against these"
                  />
                  <Table>
                    <thead>
                      <tr><Th>Reference</Th><Th>Title</Th><Th align="right">Value</Th><Th>Status</Th></tr>
                    </thead>
                    <tbody>
                      {tender.requisitionLinks.map(rl => (
                        <Tr key={rl.id}>
                          <Td mono>
                            <Link href={`/requisitions/${rl.requisition.id}`} className="font-semibold text-brand-700 hover:underline">
                              {rl.requisition.requisitionNo}
                            </Link>
                          </Td>
                          <Td>{rl.requisition.title}</Td>
                          <Td align="right"><Money value={num(rl.requisition.totalEstimatedValue)} /></Td>
                          <Td><Pill status={rl.requisition.status} /></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === "documents" ? (
            <Card pad={false}>
              <CardHeader
                title="Tender documents"
                subtitle="Published to the vendor portal for download by enlisted vendors"
              />
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
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-ink-100 bg-ink-50 px-5 py-4">
                      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-700">
                        {d.content}
                      </pre>
                    </div>
                  </details>
                ))}
              </div>
            </Card>
          ) : null}

          {tab === "committees" ? (
            <div className="space-y-5">
              {tender.committees.map(c => (
                <Card key={c.id} pad={false}>
                  <CardHeader title={c.name} subtitle={committeeBlurb(c.type)} />
                  <Table>
                    <thead>
                      <tr><Th>Member</Th><Th>Designation</Th><Th align="center">Role</Th></tr>
                    </thead>
                    <tbody>
                      {c.members.map(m => (
                        <Tr key={m.id}>
                          <Td className="font-medium">{m.user.fullName}</Td>
                          <Td className="text-ink-600">{m.user.designation}</Td>
                          <Td align="center">
                            {m.isChair ? <Pill tone="info">Chair</Pill> : <span className="text-[12.5px] text-ink-500">Member</span>}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ))}
              {tender.committees.length === 0 ? (
                <Card><p className="text-[13.5px] text-ink-500">No committees have been configured for this tender.</p></Card>
              ) : null}
            </div>
          ) : null}

          {tab === "bids" ? (
            <BidsPanel
              tenderId={tender.id}
              tenderNo={tender.tenderNo}
              tenderStatus={tender.status}
              bids={bidRows}
              unlocked={unlocked}
              canEvaluate={canEvaluate}
            />
          ) : null}

          {tab === "evaluation" ? (
            <Card>
              <SectionTitle>Technical evaluation</SectionTitle>
              <p className="text-[13.5px] leading-relaxed text-ink-600">
                Each bid is qualified or disqualified on technical grounds alone. Financial offers
                are not readable during this stage, so a technical decision cannot be influenced by
                price.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/tenders/${tender.id}/evaluation`} variant="primary">
                  Open evaluation screen <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </ButtonLink>
                {unlocked ? (
                  <ButtonLink href={`/tenders/${tender.id}/comparative-statement`}>
                    Comparative statement
                  </ButtonLink>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {chain ? (
            <Card>
              <WorkflowChain
                steps={chain.steps}
                workflowName={chain.instance.definition.name}
                version={chain.instance.workflowVersion}
                status={chain.instance.status}
              />
            </Card>
          ) : null}

          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">Details</div>
            <dl className="space-y-3">
              <Field label="Procurement method">{enumLabel(tender.method)}</Field>
              <Field label="Envelope system">{enumLabel(tender.envelopeSystem)}</Field>
              <Field label="Raised by">
                {tender.createdBy.fullName}
                <span className="block text-[12px] text-ink-500">{tender.createdBy.designation}</span>
              </Field>
              <Field label="Created">{formatDateTime(tender.createdAt)}</Field>
              {tender.publishedAt ? <Field label="Published">{formatDateTime(tender.publishedAt)}</Field> : null}
              {tender.closedAt ? <Field label="Closed">{formatDateTime(tender.closedAt)}</Field> : null}
              <Field label="Technical evaluation">
                {tender.technicalEvaluationCompletedAt ? (
                  <span className="text-brand-700">
                    Completed {formatDateTime(tender.technicalEvaluationCompletedAt)}
                  </span>
                ) : (
                  <span className="text-gold-700">Not completed — financial offers sealed</span>
                )}
              </Field>
              {tender.awardedAt ? <Field label="Awarded">{formatDateTime(tender.awardedAt)}</Field> : null}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function committeeBlurb(type: string): string {
  if (type === "PURCHASE") return "Concurrence on the tender document before publication";
  if (type === "OPENING") return "Present at the opening of sealed envelopes";
  return "Evaluates technical offers and signs off the technical evaluation";
}

function safeLen(json: string): number {
  try { return (JSON.parse(json) as unknown[]).length; } catch { return 0; }
}
function safeDocs(json: string): Array<{ fileName: string; fileSize: number }> {
  try { return JSON.parse(json); } catch { return []; }
}
