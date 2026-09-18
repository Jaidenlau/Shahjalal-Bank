import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { PO_STATUS, label as enumLabel } from "@/lib/enums";
import {
  Card, PageHeader, Pill, Money, Table, Th, Td, Tr, LinkCell,
  EmptyRow, Icon, ButtonLink, Stat,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ poNo: { contains: sp.q } }, { vendor: { companyName: { contains: sp.q } } }];

  const [pos, awardedTenders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { companyName: true } },
        tender: { select: { id: true, tenderNo: true } },
        requisition: { select: { id: true, requisitionNo: true } },
        lines: { select: { id: true } },
        grns: { select: { id: true } },
        invoices: { select: { id: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),
    // Awarded tenders with no work order yet — the next action for procurement.
    prisma.tender.findMany({
      where: { status: "AWARDED", purchaseOrders: { none: {} } },
      include: {
        bids: { where: { status: "AWARDED" }, include: { vendor: { select: { companyName: true } } } },
      },
      take: 5,
    }),
  ]);

  const totalValue = pos.reduce((s, p) => s + num(p.totalAmount), 0);
  const open = pos.filter(p => ["ISSUED", "PARTIALLY_RECEIVED"].includes(p.status)).length;

  return (
    <>
      <PageHeader
        eyebrow="Module 3 — Purchase Order Creation"
        title="Purchase orders"
        subtitle="Work orders are validated line by line against the approved requisition. Quantities cannot drift between approval and purchase."
        actions={can(user, "PO", "CREATE") ? (
          <ButtonLink href="/purchase-orders/new" variant="primary">
            <Icon name="plus" className="h-4 w-4" /> New work order
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Work orders" value={pos.length} />
        <Stat label="Open" value={open} tone={open ? "warn" : "neutral"} sub="Issued or partly received" />
        <Stat label="Total value" value={<Money value={totalValue} compact />} tone="info" />
        <Stat label="Awaiting work order" value={awardedTenders.length}
          tone={awardedTenders.length ? "warn" : "neutral"} sub="Awarded tenders" />
      </div>

      {awardedTenders.length > 0 && can(user, "PO", "CREATE") ? (
        <Card pad={false} className="mb-5 border-brand-500/40">
          <div className="border-b border-brand-500/25 bg-brand-50 px-5 py-3">
            <h2 className="text-[14px] font-semibold text-ink-900">Awarded, awaiting a work order</h2>
          </div>
          <ul className="divide-y divide-ink-100">
            {awardedTenders.map(t => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <span className="font-mono text-[13px] font-semibold text-ink-900">{t.tenderNo}</span>
                  <span className="ml-2 text-[13px] text-ink-600">{t.title}</span>
                  <div className="text-[12px] text-ink-500">
                    Awarded to {t.bids[0]?.vendor.companyName ?? "—"}
                  </div>
                </div>
                <ButtonLink href={`/purchase-orders/new?tender=${t.id}`} variant="primary">
                  Issue work order <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card pad={false}>
        <FilterBar
          basePath="/purchase-orders"
          current={sp}
          searchPlaceholder="Search by work order number or vendor…"
          filters={[{ key: "status", label: "Status", options: PO_STATUS.map(s => ({ value: s, label: enumLabel(s) })) }]}
        />
        <Table>
          <thead>
            <tr>
              <Th width="170px">Work order</Th>
              <Th>Vendor</Th>
              <Th>Source</Th>
              <Th align="right">Lines</Th>
              <Th align="right">Value</Th>
              <Th>Issued</Th>
              <Th>Delivery due</Th>
              <Th align="center">GRN</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 ? (
              <EmptyRow colSpan={9}>No work orders match these filters.</EmptyRow>
            ) : pos.map(p => {
              const due = p.deliveryDueAt ? daysFromNow(p.deliveryDueAt) : null;
              const late = due !== null && due < 0 && p.grns.length === 0;
              return (
                <Tr key={p.id}>
                  <LinkCell href={`/purchase-orders/${p.id}`} mono>{p.poNo}</LinkCell>
                  <Td className="max-w-[200px] truncate">{p.vendor.companyName}</Td>
                  <Td className="whitespace-nowrap font-mono text-[12px] text-ink-600">
                    {p.tender?.tenderNo ?? p.requisition?.requisitionNo ?? "Direct"}
                  </Td>
                  <Td align="right" className="text-ink-600">{p.lines.length}</Td>
                  <Td align="right"><Money value={num(p.totalAmount)} /></Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDate(p.issuedAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {p.deliveryDueAt ? (
                      <span className={late ? "font-semibold text-danger-600" : "text-ink-600"}>
                        {formatDate(p.deliveryDueAt)}
                      </span>
                    ) : "—"}
                  </Td>
                  <Td align="center">
                    {p.grns.length > 0
                      ? <Pill tone="success">{p.grns.length}</Pill>
                      : <span className="text-[12.5px] text-ink-400">—</span>}
                  </Td>
                  <Td><Pill status={p.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
