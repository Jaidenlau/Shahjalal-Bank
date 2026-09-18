import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num, formatBDT } from "@/lib/money";
import { formatDate, formatDateTime, ageInDays } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { chainForDocument } from "@/lib/workflow";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  Field, MetaItem, Icon, ButtonLink, Note,
} from "@/components/ui";
import { WorkflowChain } from "@/components/workflow-chain";
import { ApprovalPanel } from "./approval-panel";

export const dynamic = "force-dynamic";

export default async function RequisitionDetail({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, fullName: true, designation: true, employeeId: true } },
      department: true,
      branch: true,
      lines: { include: { item: { include: { category: true } } } },
      tenderLinks: { include: { tender: { select: { id: true, tenderNo: true, title: true, status: true } } } },
      purchaseOrders: { select: { id: true, poNo: true, status: true, totalAmount: true } },
    },
  });
  if (!req) notFound();

  const chain = await chainForDocument("REQUISITION", req.id);

  // Stock position at the time of viewing, for the store/purchase panel.
  const stock = await prisma.stockBalance.findMany({
    where: { itemId: { in: req.lines.map(l => l.itemId) } },
    include: { warehouse: { select: { name: true } } },
  });

  const isMaker = req.requestedBy.id === user.id;
  const currentStep = chain?.steps.find(s => s.state === "current");
  const holdsRole = currentStep ? user.roleIds.includes(currentStep.requiredRoleId) : false;
  const isOpen = chain?.instance.status === "IN_PROGRESS";

  // Two different reasons to show the approval panel.
  //
  // For a genuine approver: they hold the role this step requires and carry the
  // APPROVE permission, so the controls are live and will succeed.
  //
  // For the person who RAISED the document: the panel is shown deliberately,
  // labelled as a control demonstration, with the action worded as an attempt.
  // Maker-checker is checked ahead of the role check in the workflow engine, so
  // this is the control that fires, and the room sees it fire. Hiding the
  // button would be easier and would demonstrate nothing — the claim in the bid
  // is that the system refuses, not that the interface declines to offer.
  const canApproveHere = holdsRole && can(user, "REQUISITION", "APPROVE");
  const showApproval = Boolean(isOpen) && (canApproveHere || isMaker);

  const fromStore = req.lines.reduce((s, l) => s + l.quantityFromStore, 0);
  const toPurchase = req.lines.reduce((s, l) => s + l.quantityToPurchase, 0);
  const purchaseValue = req.lines.reduce((s, l) => s + l.quantityToPurchase * num(l.estimatedUnitPrice), 0);
  const storeValue = req.lines.reduce((s, l) => s + l.quantityFromStore * num(l.estimatedUnitPrice), 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/requisitions" className="hover:underline">
            <span className="inline-flex items-center gap-1">
              <Icon name="arrowLeft" className="h-3 w-3" /> Requisitions
            </span>
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[23px]">{req.requisitionNo}</span>
            <Pill status={req.status} />
          </span>
        }
        subtitle={req.title}
        meta={
          <>
            <MetaItem label="Raised by">{req.requestedBy.fullName}</MetaItem>
            <MetaItem label="Division">{req.department.code}</MetaItem>
            <MetaItem label="Branch">{req.branch.name}</MetaItem>
            <MetaItem label="Submitted">{formatDate(req.submittedAt ?? req.createdAt)}</MetaItem>
            <MetaItem label="Age">{ageInDays(req.createdAt)} days</MetaItem>
            <MetaItem label="Value"><Money value={num(req.totalEstimatedValue)} /></MetaItem>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* --- The approval control, including the maker-checker refusal --- */}
          {showApproval ? (
            <ApprovalPanel
              requisitionId={req.id}
              requisitionNo={req.requisitionNo}
              isMaker={isMaker}
              makerName={req.requestedBy.fullName}
              stepName={currentStep?.name ?? ""}
              requiredRole={currentStep?.requiredRoleName ?? ""}
              holdsRole={holdsRole}
              actorName={user.fullName}
            />
          ) : null}

          {/* --- Stock check outcome ---------------------------------------- */}
          {(fromStore > 0 || toPurchase > 0) ? (
            <Card pad={false}>
              <CardHeader
                title="Stock check"
                subtitle="Run automatically on submission, before anything was sent for approval"
              />
              <div className="grid gap-px bg-ink-200 sm:grid-cols-2">
                <div className="bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Icon name="box" className="h-4 w-4 text-info-600" />
                    <span className="text-[13px] font-semibold text-ink-900">Issue from store</span>
                  </div>
                  <div className="mt-2 text-[26px] font-bold leading-none text-ink-950 tabular">
                    {fromStore}
                    <span className="ml-1.5 text-[13px] font-normal text-ink-500">units</span>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-ink-600">
                    Already held. Value <Money value={storeValue} /> not spent.
                  </div>
                </div>
                <div className="bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Icon name="truck" className="h-4 w-4 text-warn-600" />
                    <span className="text-[13px] font-semibold text-ink-900">Route to purchase</span>
                  </div>
                  <div className="mt-2 text-[26px] font-bold leading-none text-ink-950 tabular">
                    {toPurchase}
                    <span className="ml-1.5 text-[13px] font-normal text-ink-500">units</span>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-ink-600">
                    To be procured. Value <Money value={purchaseValue} />.
                  </div>
                </div>
              </div>
              {toPurchase > 0 ? (
                <div className="border-t border-ink-200 bg-ink-50 px-4 py-2.5 text-[12.5px] text-ink-600">
                  Only the {toPurchase} units routed to purchase are authorised for a work order.
                  Anything issued from the store was never approved for procurement, and a
                  purchase order that exceeds this quantity will be refused.
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* --- Line items ------------------------------------------------- */}
          <Card pad={false}>
            <CardHeader title="Items" subtitle={`${req.lines.length} line${req.lines.length === 1 ? "" : "s"}`} />
            <Table>
              <thead>
                <tr>
                  <Th width="130px">Code</Th>
                  <Th>Item</Th>
                  <Th>Category</Th>
                  <Th align="center">CAPEX / OPEX</Th>
                  <Th align="center">GL</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Est. unit price</Th>
                  <Th align="right">Line total</Th>
                  <Th>Fulfilment</Th>
                </tr>
              </thead>
              <tbody>
                {req.lines.map(l => {
                  const bal = stock.filter(s => s.itemId === l.itemId);
                  const onHand = bal.reduce((s, b) => s + b.quantityOnHand, 0);
                  return (
                    <Tr key={l.id}>
                      <Td mono className="text-ink-600">{l.item.code}</Td>
                      <Td className="max-w-[260px]">
                        <div className="font-medium text-ink-900">{l.item.name}</div>
                        {l.remarks ? (
                          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{l.remarks}</div>
                        ) : null}
                      </Td>
                      <Td className="text-ink-600">{l.item.category.name}</Td>
                      <Td align="center">
                        <span className={`rounded-[3px] px-1.5 py-0.5 text-[11px] font-bold ${
                          l.item.capexOpex === "CAPEX" ? "bg-info-100 text-info-700" : "bg-ink-100 text-ink-600"
                        }`}>
                          {l.item.capexOpex}
                        </span>
                      </Td>
                      <Td align="center" mono className="text-ink-600">{l.item.glCode}</Td>
                      <Td align="right" className="font-semibold">{l.quantity}</Td>
                      <Td align="right"><Money value={num(l.estimatedUnitPrice)} /></Td>
                      <Td align="right" className="font-semibold">
                        <Money value={l.quantity * num(l.estimatedUnitPrice)} />
                      </Td>
                      <Td>
                        {l.quantityFromStore > 0 && l.quantityToPurchase > 0 ? (
                          <div className="space-y-1">
                            <Pill tone="info">{l.quantityFromStore} from store</Pill>
                            <Pill tone="warn">{l.quantityToPurchase} to purchase</Pill>
                          </div>
                        ) : (
                          <Pill status={l.fulfilmentRoute} />
                        )}
                        <div className="mt-1 text-[11px] text-ink-400">
                          {onHand} on hand
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-right text-[13px] font-semibold text-ink-700">
                    Total estimated value
                  </td>
                  <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-950">
                    <Money value={num(req.totalEstimatedValue)} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </Table>
          </Card>

          <Card>
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Justification
            </div>
            <p className="text-[14px] leading-relaxed text-ink-800">{req.justification}</p>
          </Card>

          {/* --- Downstream documents --------------------------------------- */}
          {req.tenderLinks.length > 0 || req.purchaseOrders.length > 0 ? (
            <Card pad={false}>
              <CardHeader title="Linked documents" subtitle="Everything downstream of this requisition" />
              <ul className="divide-y divide-ink-100">
                {req.tenderLinks.map(tl => (
                  <li key={tl.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Icon name="file" className="h-4 w-4 text-ink-400" />
                      <div>
                        <Link href={`/tenders/${tl.tender.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                          {tl.tender.tenderNo}
                        </Link>
                        <div className="text-[12.5px] text-ink-600">{tl.tender.title}</div>
                      </div>
                    </div>
                    <Pill status={tl.tender.status} />
                  </li>
                ))}
                {req.purchaseOrders.map(po => (
                  <li key={po.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Icon name="file" className="h-4 w-4 text-ink-400" />
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-[13px] font-semibold text-brand-700 hover:underline">
                        {po.poNo}
                      </Link>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money value={num(po.totalAmount)} />
                      <Pill status={po.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* --- Side: the approval chain ------------------------------------- */}
        <div className="space-y-5">
          <Card>
            {chain ? (
              <WorkflowChain
                steps={chain.steps}
                workflowName={chain.instance.definition.name}
                version={chain.instance.workflowVersion}
                status={chain.instance.status}
              />
            ) : (
              <p className="text-[13.5px] text-ink-500">
                This requisition has not entered an approval workflow.
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Details
            </div>
            <dl className="space-y-3">
              <Field label="Requisition type">{enumLabel(req.type)}</Field>
              <Field label="Cost centre" mono>{req.costCenterCode}</Field>
              <Field label="Division">{req.department.name}</Field>
              <Field label="Branch">{req.branch.name}</Field>
              <Field label="Initiator">
                {req.requestedBy.fullName}
                <span className="block text-[12px] text-ink-500">
                  {req.requestedBy.designation} · {req.requestedBy.employeeId}
                </span>
              </Field>
              <Field label="Created">{formatDateTime(req.createdAt)}</Field>
              {req.submittedAt ? <Field label="Submitted">{formatDateTime(req.submittedAt)}</Field> : null}
            </dl>
          </Card>

          {can(user, "AUDIT", "VIEW") ? (
            <Card>
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
                Audit
              </div>
              <p className="mb-3 text-[13px] leading-relaxed text-ink-600">
                Every action on this requisition is recorded in the append-only trail.
              </p>
              <ButtonLink href={`/admin/audit?entity=Requisition&id=${req.id}`}>
                <Icon name="shield" className="h-3.5 w-3.5" />
                View audit trail
              </ButtonLink>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
