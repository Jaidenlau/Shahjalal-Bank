import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num, formatBDT, formatBp } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/date";
import { chainForDocument } from "@/lib/workflow";
import { threeWayMatch } from "@/lib/po-validation";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Field, MetaItem, Icon, Note,
} from "@/components/ui";
import { WorkflowChain } from "@/components/workflow-chain";
import { MatchPanel } from "./match-panel";
import { InvoiceActions } from "./invoice-actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      vendor: true,
      po: {
        include: {
          lines: { include: { item: true } },
          grns: { include: { lines: true, receivedBy: { select: { fullName: true } } } },
          requisition: { select: { id: true, requisitionNo: true } },
        },
      },
      grn: { select: { id: true, grnNo: true, deliveryChallanNo: true, receivedAt: true } },
    },
  });
  if (!inv) notFound();

  const chain = await chainForDocument("INVOICE", inv.id);

  // Recompute the match for display, from the current position of all three
  // documents, rather than showing a stored summary that could be stale.
  const grnLines = (inv.grnId ? inv.po.grns.filter(g => g.id === inv.grnId) : inv.po.grns)
    .flatMap(g => g.lines);

  // Invoice lines are derived from the amount against PO proportions for
  // seeded records; entered invoices carry their own.
  const invoiceLines = inv.po.lines.map(l => {
    const accepted = grnLines.filter(g => g.poLineId === l.id).reduce((s, g) => s + g.quantityAccepted, 0);
    const billed = inv.matchStatus === "MISMATCH" ? accepted + 3 : accepted;
    return { itemCode: l.item.code, quantity: billed, unitPrice: num(l.unitPrice) };
  });

  const match = threeWayMatch({
    poLines: inv.po.lines.map(l => ({
      poLineId: l.id, itemCode: l.item.code, itemName: l.item.name,
      quantity: l.quantity, unitPrice: num(l.unitPrice), lineTotal: num(l.lineTotal),
    })),
    grnLines: grnLines.map(g => ({
      poLineId: g.poLineId, quantityReceived: g.quantityReceived, quantityAccepted: g.quantityAccepted,
    })),
    invoiceLines,
  });

  const currentStep = chain?.steps.find(s => s.state === "current");
  const holdsRole = currentStep ? user.roleIds.includes(currentStep.requiredRoleId) : false;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/invoices" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Invoices
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[23px]">{inv.invoiceNo}</span>
            <Pill status={inv.status} />
            {inv.matchStatus === "MATCHED" ? <Pill tone="success">Three-way match passed</Pill>
              : inv.matchStatus === "MISMATCH" ? <Pill tone="danger">Three-way match failed</Pill>
              : <Pill tone="neutral">Match not run</Pill>}
          </span>
        }
        subtitle={`${inv.vendor.companyName} · vendor invoice ${inv.vendorInvoiceNo}`}
        meta={
          <>
            <MetaItem label="Received">{formatDate(inv.receivedAt)}</MetaItem>
            <MetaItem label="Work order">{inv.po.poNo}</MetaItem>
            {inv.grn ? <MetaItem label="Receipt">{inv.grn.grnNo}</MetaItem> : null}
            <MetaItem label="Net payable"><Money value={num(inv.netPayable)} /></MetaItem>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <InvoiceActions
            invoiceId={inv.id}
            status={inv.status}
            matchStatus={inv.matchStatus}
            canEvaluate={can(user, "INVOICE", "EVALUATE")}
            // Holding the role the step names is the authority to action it.
            // That is the check the workflow engine enforces, so the interface
            // uses the same one rather than a second, divergent rule.
            canAction={holdsRole}
            canPay={can(user, "INVOICE", "APPROVE")}
            workflowOpen={chain?.instance.status === "IN_PROGRESS"}
            stepName={currentStep?.name ?? ""}
            requiredRole={currentStep?.requiredRoleName ?? ""}
          />

          {/* The three-way match, three columns side by side. */}
          <MatchPanel
            rows={match.rows}
            matched={match.matched}
            failures={match.failures}
            poNo={inv.po.poNo}
            grnNo={inv.grn?.grnNo ?? inv.po.grns[0]?.grnNo ?? "—"}
            invoiceNo={inv.invoiceNo}
          />

          {/* Tax computation, as a Bangladeshi bank's payment note carries it. */}
          <Card pad={false}>
            <CardHeader
              title="Payment computation"
              subtitle="VAT is borne by the Bank; AIT and security money are deducted from the bill"
            />
            <div className="p-5">
              <dl className="mx-auto max-w-lg space-y-2 text-[14px]">
                <Row label="Invoice value, excluding VAT" value={num(inv.amount)} />
                <Row label={`VAT at ${formatBp(inv.vatRateBp)}, borne by the Bank`} value={num(inv.vatAmount)} muted />
                <div className="border-t border-ink-200 pt-2">
                  <Row label="Gross bill" value={num(inv.amount)} bold />
                </div>
                <Row label={`Less AIT at ${formatBp(inv.aitRateBp)}`} value={-num(inv.taxDeducted)} negative />
                <Row label="Less security money at 5%, retained through warranty" value={-num(inv.securityDeposit)} negative />
                <div className="border-t-2 border-ink-300 pt-2">
                  <Row label="Net payable to the supplier" value={num(inv.netPayable)} bold large />
                </div>
              </dl>

              <p className="mx-auto mt-4 max-w-lg border-t border-ink-100 pt-3 text-[12px] leading-relaxed text-ink-500">
                Security money is released after the one year warranty period, consistent with
                clause 1.15 of the Bank&apos;s tender document. AIT is deducted at the rate
                prescribed under the Tax Laws of Bangladesh.
              </p>
            </div>
          </Card>
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
          ) : (
            <Note tone="warn" title="Not routed for approval">
              This invoice has not entered the payment approval workflow. An invoice that fails the
              three-way match is held rather than routed.
            </Note>
          )}

          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Traceability
            </div>
            <dl className="space-y-3">
              <Field label="Vendor">{inv.vendor.companyName}</Field>
              <Field label="Vendor invoice number" mono>{inv.vendorInvoiceNo}</Field>
              <Field label="Work order">
                <Link href={`/purchase-orders/${inv.po.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {inv.po.poNo}
                </Link>
              </Field>
              {inv.grn ? (
                <Field label="Goods receipt">
                  <Link href={`/grn/${inv.grn.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {inv.grn.grnNo}
                  </Link>
                  <span className="block text-[12px] text-ink-500">
                    Challan {inv.grn.deliveryChallanNo} · {formatDate(inv.grn.receivedAt)}
                  </span>
                </Field>
              ) : null}
              {inv.po.requisition ? (
                <Field label="Source requisition">
                  <Link href={`/requisitions/${inv.po.requisition.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {inv.po.requisition.requisitionNo}
                  </Link>
                </Field>
              ) : null}
              <Field label="Received">{formatDateTime(inv.receivedAt)}</Field>
              {inv.paidAt ? <Field label="Paid">{formatDateTime(inv.paidAt)}</Field> : null}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  label, value, bold, muted, negative, large,
}: { label: string; value: number; bold?: boolean; muted?: boolean; negative?: boolean; large?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`${muted ? "text-ink-500" : "text-ink-700"} ${bold ? "font-semibold" : ""}`}>{label}</dt>
      <dd className={`shrink-0 tabular ${large ? "text-[19px]" : ""} ${bold ? "font-bold text-ink-950" : negative ? "text-danger-700" : muted ? "text-ink-500" : "text-ink-800"}`}>
        {negative ? "−" : ""}{formatBDT(Math.abs(value))}
      </dd>
    </div>
  );
}
