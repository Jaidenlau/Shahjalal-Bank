import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/date";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Field, MetaItem, Icon, ButtonLink, Note,
} from "@/components/ui";
import { BankLetterhead } from "@/components/brand";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function GrnDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const grn = await prisma.goodsReceiptNote.findUnique({
    where: { id },
    include: {
      po: {
        include: {
          vendor: true,
          lines: { include: { item: true } },
          requisition: { select: { id: true, requisitionNo: true, requestedBy: { select: { fullName: true } } } },
        },
      },
      receivedBy: { select: { fullName: true, designation: true } },
      lines: true,
      invoices: { select: { id: true, invoiceNo: true, status: true, matchStatus: true } },
    },
  });
  if (!grn) notFound();

  const rejected = grn.lines.reduce((s, l) => s + l.quantityRejected, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/grn" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Goods receipt
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[23px]">{grn.grnNo}</span>
            <Pill status={grn.status} />
          </span>
        }
        subtitle={`${grn.po.vendor.companyName} · against ${grn.po.poNo}`}
        actions={<PrintButton label="Print GRN" />}
        meta={
          <>
            <MetaItem label="Received">{formatDate(grn.receivedAt)}</MetaItem>
            <MetaItem label="Challan">{grn.deliveryChallanNo}</MetaItem>
            <MetaItem label="Received by">{grn.receivedBy.fullName}</MetaItem>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card pad={false} className="print-page">
            <div className="px-7 py-6">
              <BankLetterhead />
              <div className="mt-5 text-center">
                <h2 className="text-[17px] font-bold uppercase tracking-[0.06em] text-ink-950">
                  Goods Receipt Note
                </h2>
                <p className="mt-0.5 font-mono text-[13px] text-ink-600">{grn.grnNo}</p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5 border-y border-ink-200 py-3 text-[12.5px] sm:grid-cols-4">
                {[
                  ["Work order", grn.po.poNo],
                  ["Supplier", grn.po.vendor.companyName],
                  ["Delivery challan", grn.deliveryChallanNo],
                  ["Received on", formatDate(grn.receivedAt)],
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
                    <Th width="44px" align="center">#</Th>
                    <Th>Item</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Accepted</Th>
                    <Th align="right">Rejected</Th>
                    <Th>Remarks</Th>
                  </tr>
                </thead>
                <tbody>
                  {grn.lines.map((l, i) => {
                    const poLine = grn.po.lines.find(p => p.id === l.poLineId);
                    return (
                      <Tr key={l.id}>
                        <Td align="center" className="text-ink-500">{i + 1}</Td>
                        <Td>
                          <div className="font-medium text-ink-900">{poLine?.item.name ?? "—"}</div>
                          <div className="font-mono text-[11.5px] text-ink-500">{poLine?.item.code}</div>
                        </Td>
                        <Td align="right" className="text-ink-600 tabular">{poLine?.quantity ?? "—"}</Td>
                        <Td align="right" className="tabular">{l.quantityReceived}</Td>
                        <Td align="right" className="font-semibold text-brand-700 tabular">{l.quantityAccepted}</Td>
                        <Td align="right" className={`tabular ${l.quantityRejected ? "font-semibold text-danger-600" : "text-ink-400"}`}>
                          {l.quantityRejected}
                        </Td>
                        <Td className="max-w-[220px] text-[12.5px] text-ink-600">{l.remarks || "—"}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>

              {grn.remarks ? (
                <div className="mt-4 rounded-[5px] border border-ink-200 bg-ink-50 px-4 py-2.5 text-[12.5px] text-ink-700">
                  {grn.remarks}
                </div>
              ) : null}

              <div className="mt-8 grid grid-cols-3 gap-8">
                {[
                  ["Received by", `${grn.receivedBy.fullName} · ${grn.receivedBy.designation}`],
                  ["Inspected by", "Common Services Division"],
                  ["Delivered by", grn.po.vendor.companyName],
                ].map(([role, who]) => (
                  <div key={role}>
                    <div className="h-12 border-b border-ink-400" />
                    <div className="mt-1 text-[11.5px] font-medium text-ink-700">{role}</div>
                    <div className="text-[10.5px] text-ink-500">{who}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {rejected > 0 ? (
            <Note tone="warn" title={`${rejected} unit${rejected === 1 ? "" : "s"} rejected on inspection`}>
              Rejected quantities are not taken into stock and are excluded from what the vendor
              may invoice. The three-way match will fail if an invoice bills for them.
            </Note>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Traceability
            </div>
            <dl className="space-y-3">
              <Field label="Work order">
                <Link href={`/purchase-orders/${grn.po.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {grn.po.poNo}
                </Link>
              </Field>
              {grn.po.requisition ? (
                <Field label="Source requisition">
                  <Link href={`/requisitions/${grn.po.requisition.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {grn.po.requisition.requisitionNo}
                  </Link>
                  <span className="block text-[12px] text-ink-500">
                    Raised by {grn.po.requisition.requestedBy.fullName}, who was notified on receipt
                  </span>
                </Field>
              ) : null}
              <Field label="Supplier">{grn.po.vendor.companyName}</Field>
              <Field label="Recorded">{formatDateTime(grn.receivedAt)}</Field>
            </dl>
          </Card>

          {grn.invoices.length > 0 ? (
            <Card pad={false}>
              <CardHeader title="Invoices against this receipt" />
              <ul className="divide-y divide-ink-100">
                {grn.invoices.map(inv => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-[12.5px] font-semibold text-brand-700 hover:underline">
                      {inv.invoiceNo}
                    </Link>
                    <span className="flex items-center gap-2">
                      <Pill status={inv.matchStatus} />
                      <Pill status={inv.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
                Invoicing
              </div>
              <p className="mb-3 text-[13px] text-ink-600">
                Enter the vendor&apos;s invoice to run the three-way match against this receipt and
                the work order.
              </p>
              <ButtonLink href={`/invoices/new?po=${grn.po.id}&grn=${grn.id}`} variant="primary">
                <Icon name="file" className="h-4 w-4" /> Enter invoice
              </ButtonLink>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
