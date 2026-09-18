import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, countdown, relativeDays } from "@/lib/date";
import { TENDER_STATUS, TENDER_METHOD, label as enumLabel } from "@/lib/enums";
import {
  Card, PageHeader, Pill, Money, Table, Th, Td, Tr, LinkCell,
  EmptyRow, Icon, ButtonLink, Stat,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function TendersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.status) where.status = sp.status;
  if (sp.method) where.method = sp.method;
  if (sp.q) where.OR = [{ tenderNo: { contains: sp.q } }, { title: { contains: sp.q } }];

  const tenders = await prisma.tender.findMany({
    where,
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { bids: true } },
      requisitionLinks: { select: { requisitionId: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  const open = tenders.filter(t => t.status === "PUBLISHED").length;
  const sealed = tenders.filter(t => t.status === "CLOSED" && !t.technicalEvaluationCompletedAt).length;
  const evaluating = tenders.filter(t => ["TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION"].includes(t.status)).length;

  return (
    <>
      <PageHeader
        eyebrow="Module 3 — e-Procurement Management"
        title="Tenders"
        subtitle="Open, limited, quotation, direct purchase and two-stage methods. Two-envelope tenders keep financial offers sealed until technical evaluation is signed off."
        actions={can(user, "TENDER", "CREATE") ? (
          <ButtonLink href="/tenders/new" variant="primary">
            <Icon name="plus" className="h-4 w-4" /> New tender
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total tenders" value={tenders.length} />
        <Stat label="Open for bidding" value={open} tone="success" />
        <Stat label="Closed, financials sealed" value={sealed} tone="sealed"
          sub={sealed ? "Awaiting technical evaluation" : "None"} />
        <Stat label="Under evaluation" value={evaluating} tone="warn" />
      </div>

      <Card pad={false}>
        <FilterBar
          basePath="/tenders"
          current={sp}
          searchPlaceholder="Search by tender number or title…"
          filters={[
            { key: "status", label: "Status", options: TENDER_STATUS.map(s => ({ value: s, label: enumLabel(s) })) },
            { key: "method", label: "Method", options: TENDER_METHOD.map(m => ({ value: m, label: enumLabel(m) })) },
          ]}
        />
        <Table>
          <thead>
            <tr>
              <Th width="180px">Tender no.</Th>
              <Th>Title</Th>
              <Th>Method</Th>
              <Th align="center">Envelope</Th>
              <Th align="right">Estimated</Th>
              <Th align="center">Bids</Th>
              <Th>Published</Th>
              <Th>Closing</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {tenders.length === 0 ? (
              <EmptyRow colSpan={9}>No tenders match these filters.</EmptyRow>
            ) : tenders.map(t => {
              const isSealed = t.status === "CLOSED" && !t.technicalEvaluationCompletedAt;
              return (
                <Tr key={t.id}>
                  <LinkCell href={`/tenders/${t.id}`} mono>{t.tenderNo}</LinkCell>
                  <Td className="max-w-[300px] truncate">{t.title}</Td>
                  <Td><span className="font-mono text-[12px] text-ink-600">{t.method}</span></Td>
                  <Td align="center">
                    {t.envelopeSystem === "TWO" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-700">
                        <Icon name="lock" className="h-3 w-3" /> Two
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-500">Single</span>
                    )}
                  </Td>
                  <Td align="right"><Money value={num(t.estimatedValue)} /></Td>
                  <Td align="center" className="font-semibold tabular">{t._count.bids}</Td>
                  <Td className="whitespace-nowrap text-ink-600">
                    {t.publishedAt ? formatDate(t.publishedAt) : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {t.status === "PUBLISHED" && t.closingAt ? (
                      <span className="font-semibold text-brand-700">{countdown(t.closingAt)}</span>
                    ) : t.closingAt ? (
                      <span className="text-ink-500">{formatDate(t.closingAt)}</span>
                    ) : "—"}
                  </Td>
                  <Td>
                    {isSealed ? <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Sealed</Pill>
                      : <Pill status={t.status} />}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
