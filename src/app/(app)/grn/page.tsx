import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/date";
import {
  Card, PageHeader, Pill, Table, Th, Td, Tr, LinkCell,
  EmptyRow, Icon, ButtonLink, Stat,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GrnPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ grnNo: { contains: sp.q } }, { deliveryChallanNo: { contains: sp.q } }];

  const [grns, awaiting] = await Promise.all([
    prisma.goodsReceiptNote.findMany({
      where,
      include: {
        po: { include: { vendor: { select: { companyName: true } } } },
        receivedBy: { select: { fullName: true } },
        lines: true,
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } },
      include: { vendor: { select: { companyName: true } }, lines: true, grns: { include: { lines: true } } },
      orderBy: { deliveryDueAt: "asc" },
      take: 8,
    }),
  ]);

  const rejected = grns.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.quantityRejected, 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Module 21 — Inventory Management"
        title="Goods receipt"
        subtitle="Receipt against a work order, full or partial, with accepted and rejected quantities recorded per line. Accepted stock lands in the store and the requisition initiator is notified."
        actions={can(user, "GRN", "CREATE") ? (
          <ButtonLink href="/grn/new" variant="primary">
            <Icon name="plus" className="h-4 w-4" /> Record receipt
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receipt notes" value={grns.length} />
        <Stat label="Awaiting delivery" value={awaiting.length} tone={awaiting.length ? "warn" : "neutral"} />
        <Stat label="Partial deliveries" value={grns.filter(g => g.status === "PARTIAL").length} tone="warn" />
        <Stat label="Units rejected" value={rejected} tone={rejected ? "danger" : "neutral"}
          sub="On inspection" />
      </div>

      {awaiting.length > 0 && can(user, "GRN", "CREATE") ? (
        <Card pad={false} className="mb-5 border-warn-500/40">
          <div className="border-b border-warn-500/25 bg-warn-50 px-5 py-3">
            <h2 className="text-[14px] font-semibold text-ink-900">Work orders awaiting delivery</h2>
          </div>
          <ul className="divide-y divide-ink-100">
            {awaiting.map(po => {
              const ordered = po.lines.reduce((s, l) => s + l.quantity, 0);
              const received = po.grns.flatMap(g => g.lines).reduce((s, l) => s + l.quantityReceived, 0);
              return (
                <li key={po.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/purchase-orders/${po.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                      {po.poNo}
                    </Link>
                    <span className="ml-2 text-[13px] text-ink-700">{po.vendor.companyName}</span>
                    <div className="text-[12px] text-ink-500">
                      {received} of {ordered} units received
                      {po.deliveryDueAt ? ` · due ${formatDate(po.deliveryDueAt)}` : ""}
                    </div>
                  </div>
                  <ButtonLink href={`/grn/new?po=${po.id}`}>
                    <Icon name="box" className="h-3.5 w-3.5" /> Record receipt
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card pad={false}>
        <FilterBar
          basePath="/grn" current={sp}
          searchPlaceholder="Search by GRN or challan number…"
          filters={[{ key: "status", label: "Delivery", options: [
            { value: "FULL", label: "Full" }, { value: "PARTIAL", label: "Partial" },
          ] }]}
        />
        <Table>
          <thead>
            <tr>
              <Th width="170px">GRN</Th><Th>Work order</Th><Th>Vendor</Th>
              <Th>Challan</Th><Th>Received</Th><Th>By</Th>
              <Th align="right">Received</Th><Th align="right">Accepted</Th>
              <Th align="right">Rejected</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {grns.length === 0 ? (
              <EmptyRow colSpan={10}>No goods receipt notes match these filters.</EmptyRow>
            ) : grns.map(g => {
              const rec = g.lines.reduce((s, l) => s + l.quantityReceived, 0);
              const acc = g.lines.reduce((s, l) => s + l.quantityAccepted, 0);
              const rej = g.lines.reduce((s, l) => s + l.quantityRejected, 0);
              return (
                <Tr key={g.id}>
                  <LinkCell href={`/grn/${g.id}`} mono>{g.grnNo}</LinkCell>
                  <Td mono className="text-ink-600">{g.po.poNo}</Td>
                  <Td className="max-w-[180px] truncate">{g.po.vendor.companyName}</Td>
                  <Td mono className="text-ink-600">{g.deliveryChallanNo}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDate(g.receivedAt)}</Td>
                  <Td className="whitespace-nowrap">{g.receivedBy.fullName}</Td>
                  <Td align="right" className="tabular">{rec}</Td>
                  <Td align="right" className="font-semibold tabular text-brand-700">{acc}</Td>
                  <Td align="right" className={`tabular ${rej ? "font-semibold text-danger-600" : "text-ink-400"}`}>{rej}</Td>
                  <Td><Pill status={g.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
