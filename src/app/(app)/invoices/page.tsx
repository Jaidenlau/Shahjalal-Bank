import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, ageInDays } from "@/lib/date";
import { INVOICE_STATUS, label as enumLabel } from "@/lib/enums";
import {
  Card, PageHeader, Pill, Money, Table, Th, Td, Tr, LinkCell,
  EmptyRow, Icon, ButtonLink, Stat,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.status) where.status = sp.status;
  if (sp.match) where.matchStatus = sp.match;
  if (sp.q) {
    where.OR = [
      { invoiceNo: { contains: sp.q } },
      { vendorInvoiceNo: { contains: sp.q } },
      { vendor: { companyName: { contains: sp.q } } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      vendor: { select: { companyName: true } },
      po: { select: { id: true, poNo: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const payable = invoices.filter(i => ["MATCHED", "APPROVED"].includes(i.status))
    .reduce((s, i) => s + num(i.netPayable), 0);
  const mismatches = invoices.filter(i => i.matchStatus === "MISMATCH").length;
  const paid = invoices.filter(i => i.status === "PAID").length;

  return (
    <>
      <PageHeader
        eyebrow="Module 22 — Invoicing and Payment"
        title="Invoices and payment"
        subtitle="Every invoice is matched against its work order and goods receipt on item, quantity and price before it can be approved for payment."
        actions={can(user, "INVOICE", "CREATE") ? (
          <ButtonLink href="/invoices/new" variant="primary">
            <Icon name="plus" className="h-4 w-4" /> Enter invoice
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoices" value={invoices.length} />
        <Stat label="Net payable" value={<Money value={payable} compact />} tone="warn"
          sub="Matched and approved" />
        <Stat label="Failed match" value={mismatches} tone={mismatches ? "danger" : "neutral"}
          sub={mismatches ? "Held from payment" : "None"} />
        <Stat label="Paid" value={paid} tone="success" />
      </div>

      <Card pad={false}>
        <FilterBar
          basePath="/invoices" current={sp}
          searchPlaceholder="Search by invoice number or vendor…"
          filters={[
            { key: "status", label: "Status", options: INVOICE_STATUS.map(s => ({ value: s, label: enumLabel(s) })) },
            { key: "match", label: "Match", options: [
              { value: "MATCHED", label: "Matched" },
              { value: "MISMATCH", label: "Mismatch" },
              { value: "NOT_RUN", label: "Not run" },
            ] },
          ]}
        />
        <Table>
          <thead>
            <tr>
              <Th width="170px">Invoice</Th>
              <Th>Vendor invoice</Th>
              <Th>Vendor</Th>
              <Th>Work order</Th>
              <Th align="right">Amount</Th>
              <Th align="right">VAT 15%</Th>
              <Th align="right">AIT 3%</Th>
              <Th align="right">Net payable</Th>
              <Th align="center">Match</Th>
              <Th>Status</Th>
              <Th align="right">Age</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <EmptyRow colSpan={11}>No invoices match these filters.</EmptyRow>
            ) : invoices.map(i => (
              <Tr key={i.id}>
                <LinkCell href={`/invoices/${i.id}`} mono>{i.invoiceNo}</LinkCell>
                <Td mono className="text-ink-600">{i.vendorInvoiceNo}</Td>
                <Td className="max-w-[170px] truncate">{i.vendor.companyName}</Td>
                <Td mono className="text-ink-600">{i.po.poNo}</Td>
                <Td align="right"><Money value={num(i.amount)} /></Td>
                <Td align="right" className="text-ink-600"><Money value={num(i.vatAmount)} /></Td>
                <Td align="right" className="text-danger-700">−<Money value={num(i.taxDeducted)} /></Td>
                <Td align="right" className="font-semibold"><Money value={num(i.netPayable)} /></Td>
                <Td align="center">
                  {i.matchStatus === "MATCHED" ? <Pill tone="success">Matched</Pill>
                    : i.matchStatus === "MISMATCH" ? <Pill tone="danger">Mismatch</Pill>
                    : <Pill tone="neutral">Not run</Pill>}
                </Td>
                <Td><Pill status={i.status} /></Td>
                <Td align="right" className="text-ink-500 tabular">{ageInDays(i.receivedAt)}d</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
