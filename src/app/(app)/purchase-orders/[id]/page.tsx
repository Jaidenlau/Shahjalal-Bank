import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num, formatBDT, takaInWords } from "@/lib/money";
import { formatDate, formatDateTime, daysFromNow } from "@/lib/date";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Field, MetaItem, Icon, ButtonLink, Note,
} from "@/components/ui";
import { BankLetterhead } from "@/components/brand";
import { PrintButton } from "@/components/print-button";
import { AmendPanel } from "./amend-panel";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      tender: { select: { id: true, tenderNo: true, title: true } },
      requisition: {
        select: { id: true, requisitionNo: true, title: true },
      },
      issuedBy: { select: { fullName: true, designation: true } },
      lines: { include: { item: true } },
      grns: { include: { lines: true, receivedBy: { select: { fullName: true } } } },
      invoices: { select: { id: true, invoiceNo: true, status: true, netPayable: true } },
    },
  });
  if (!po) notFound();

  // The approved position, for the panel that shows the match.
  const reqLines = po.sourceRequisitionId
    ? await prisma.requisitionLine.findMany({
        where: { requisitionId: po.sourceRequisitionId },
        include: { item: true },
      })
    : [];

  const due = po.deliveryDueAt ? daysFromNow(po.deliveryDueAt) : null;
  const received = po.grns.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/purchase-orders" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Purchase orders
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[23px]">{po.poNo}</span>
            <Pill status={po.status} />
          </span>
        }
        subtitle={po.vendor.companyName}
        actions={<PrintButton label="Print work order" />}
        meta={
          <>
            <MetaItem label="Issued">{formatDate(po.issuedAt)}</MetaItem>
            <MetaItem label="Value"><Money value={num(po.totalAmount)} /></MetaItem>
            <MetaItem label="Delivery due">
              {po.deliveryDueAt ? (
                <span className={due !== null && due < 0 && !received ? "text-danger-600" : ""}>
                  {formatDate(po.deliveryDueAt)}
                </span>
              ) : "—"}
            </MetaItem>
            {po.tender ? <MetaItem label="Tender">{po.tender.tenderNo}</MetaItem> : null}
            {po.requisition ? <MetaItem label="Requisition">{po.requisition.requisitionNo}</MetaItem> : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* The printable work order. */}
          <Card pad={false} className="print-page">
            <div className="px-7 py-6">
              <BankLetterhead />
              <div className="mt-5 text-center">
                <h2 className="text-[17px] font-bold uppercase tracking-[0.06em] text-ink-950">Work Order</h2>
                <p className="mt-0.5 font-mono text-[13px] text-ink-600">{po.poNo}</p>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-500">To</div>
                  <div className="mt-0.5 text-[14px] font-semibold text-ink-900">{po.vendor.companyName}</div>
                  <div className="text-[12.5px] leading-snug text-ink-600">
                    {po.vendor.address}
                    <br />Attn: {po.vendor.contactPerson} · {po.vendor.contactPhone}
                    <br />Trade licence: {po.vendor.tradeLicenseNo}
                    <br />BIN: {po.vendor.bin}
                  </div>
                </div>
                <div className="sm:text-right">
                  <dl className="space-y-1 text-[12.5px]">
                    {[
                      ["Work order date", formatDate(po.issuedAt)],
                      ["Delivery due", po.deliveryDueAt ? formatDate(po.deliveryDueAt) : "—"],
                      ["Tender reference", po.tender?.tenderNo ?? "Direct purchase"],
                      ["Requisition reference", po.requisition?.requisitionNo ?? "—"],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <dt className="inline text-ink-500">{l}: </dt>
                        <dd className="inline font-medium text-ink-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

              <Table className="mt-5">
                <thead>
                  <tr>
                    <Th width="44px" align="center">#</Th>
                    <Th>Description</Th>
                    <Th align="center">Unit</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Unit price</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l, i) => (
                    <Tr key={l.id}>
                      <Td align="center" className="text-ink-500">{i + 1}</Td>
                      <Td>
                        <div className="font-medium text-ink-900">{l.item.name}</div>
                        <div className="font-mono text-[11.5px] text-ink-500">{l.item.code}</div>
                      </Td>
                      <Td align="center" className="text-ink-600">{l.item.unitOfMeasure}</Td>
                      <Td align="right" className="font-semibold">{l.quantity}</Td>
                      <Td align="right"><Money value={num(l.unitPrice)} /></Td>
                      <Td align="right" className="font-semibold"><Money value={num(l.lineTotal)} /></Td>
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-right text-[13px] font-semibold text-ink-700">
                      Total, excluding VAT
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-950">
                      <Money value={num(po.totalAmount)} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 text-right text-[12px] italic text-ink-600">
                      In words: {takaInWords(num(po.totalAmount))}
                    </td>
                  </tr>
                </tfoot>
              </Table>

              <div className="mt-5 rounded-[5px] border border-ink-200 bg-ink-50 px-4 py-3 text-[12px] leading-relaxed text-ink-700">
                <strong className="font-semibold">Terms.</strong> {po.deliveryTerms}{" "}
                Payment will be made after successful delivery and acceptance, subject to
                deduction of applicable VAT and AIT under prevailing government rules, and 5%
                security money retained until the end of the warranty period. A penalty of 1% of
                the work order value per week of delay applies, capped at 5%.
              </div>

              <div className="mt-8 grid grid-cols-2 gap-8">
                <div>
                  <div className="h-12 border-b border-ink-400" />
                  <div className="mt-1 text-[11.5px] font-medium text-ink-700">For the Bank</div>
                  <div className="text-[11.5px] text-ink-500">
                    {po.issuedBy?.fullName} · {po.issuedBy?.designation}
                  </div>
                </div>
                <div>
                  <div className="h-12 border-b border-ink-400" />
                  <div className="mt-1 text-[11.5px] font-medium text-ink-700">Accepted by the Supplier</div>
                  <div className="text-[11.5px] text-ink-500">{po.vendor.companyName}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Amendment, which runs the same validation. */}
          {can(user, "PO", "CREATE") && po.sourceRequisitionId && !["CLOSED", "CANCELLED"].includes(po.status) ? (
            <AmendPanel
              poId={po.id}
              requisitionNo={po.requisition?.requisitionNo ?? ""}
              lines={po.lines.map(l => {
                const rl = reqLines.find(r => r.itemId === l.itemId);
                return {
                  itemId: l.itemId, itemCode: l.item.code, itemName: l.item.name,
                  quantity: l.quantity, unitPrice: num(l.unitPrice),
                  approvedQuantity: rl?.quantityToPurchase ?? 0,
                };
              })}
            />
          ) : null}

          {po.grns.length > 0 ? (
            <Card pad={false}>
              <CardHeader title="Goods receipt" subtitle={`${po.grns.length} receipt note${po.grns.length === 1 ? "" : "s"}`} />
              <Table>
                <thead>
                  <tr><Th>GRN</Th><Th>Challan</Th><Th>Received</Th><Th>By</Th><Th align="right">Accepted</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {po.grns.map(g => (
                    <Tr key={g.id}>
                      <Td mono>
                        <Link href={`/grn/${g.id}`} className="font-semibold text-brand-700 hover:underline">{g.grnNo}</Link>
                      </Td>
                      <Td mono className="text-ink-600">{g.deliveryChallanNo}</Td>
                      <Td className="whitespace-nowrap text-ink-600">{formatDate(g.receivedAt)}</Td>
                      <Td className="whitespace-nowrap">{g.receivedBy.fullName}</Td>
                      <Td align="right" className="tabular">
                        {g.lines.reduce((s, l) => s + l.quantityAccepted, 0)}
                      </Td>
                      <Td><Pill status={g.status} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Traceability
            </div>
            <p className="mb-3 text-[13px] leading-relaxed text-ink-600">
              Every line on this work order was matched against the approved requisition before
              it could be issued.
            </p>
            <dl className="space-y-3">
              {po.requisition ? (
                <Field label="Source requisition">
                  <Link href={`/requisitions/${po.requisition.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {po.requisition.requisitionNo}
                  </Link>
                </Field>
              ) : null}
              {po.tender ? (
                <Field label="Source tender">
                  <Link href={`/tenders/${po.tender.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {po.tender.tenderNo}
                  </Link>
                </Field>
              ) : null}
              <Field label="Approval reference" mono>
                {po.approvalReference ? po.approvalReference.slice(-12) : "—"}
              </Field>
              <Field label="Issued by">
                {po.issuedBy?.fullName ?? "—"}
                <span className="block text-[12px] text-ink-500">{po.issuedBy?.designation}</span>
              </Field>
              <Field label="Issued at">{formatDateTime(po.issuedAt)}</Field>
            </dl>
          </Card>

          {po.invoices.length > 0 ? (
            <Card pad={false}>
              <CardHeader title="Invoices" />
              <ul className="divide-y divide-ink-100">
                {po.invoices.map(inv => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-[12.5px] font-semibold text-brand-700 hover:underline">
                      {inv.invoiceNo}
                    </Link>
                    <span className="flex items-center gap-2">
                      <Money value={num(inv.netPayable)} className="text-[12.5px]" />
                      <Pill status={inv.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {can(user, "GRN", "CREATE") && !received ? (
            <Card>
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
                Goods receipt
              </div>
              <p className="mb-3 text-[13px] text-ink-600">
                Record delivery against this work order when the goods arrive.
              </p>
              <ButtonLink href={`/grn/new?po=${po.id}`} variant="primary">
                <Icon name="box" className="h-4 w-4" /> Record receipt
              </ButtonLink>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
