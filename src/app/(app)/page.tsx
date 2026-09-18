import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { dashboardData, approvalQueue, ownInFlight } from "@/lib/queries";
import { formatDate, relativeDays, ageInDays, financialYear } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import {
  Card, CardHeader, PageHeader, Stat, Pill, Money, Table, Th, Td, Tr,
  LinkCell, EmptyRow, Icon, ButtonLink, Note,
} from "@/components/ui";
import { StatusBars, SpendBars, BudgetRing } from "@/components/charts";

export const dynamic = "force-dynamic";

/**
 * Role-aware landing page.
 *
 * A requisition initiator lands on their own activity and cannot see a single
 * approval control. An administrator lands on the division's whole position.
 * The difference is visible within a second of switching user, which is the
 * cheapest demonstration of role-based access control available.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const [data, queue, inFlight] = await Promise.all([
    dashboardData(user),
    can(user, "REQUISITION", "APPROVE") || can(user, "INVOICE", "APPROVE") || can(user, "TENDER", "APPROVE")
      ? approvalQueue(user) : Promise.resolve([]),
    ownInFlight(user),
  ]);

  const canApprove = queue.length > 0 || can(user, "REQUISITION", "APPROVE");
  const showBudget = can(user, "BUDGET", "VIEW");
  const showTenders = can(user, "TENDER", "VIEW");

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(new Date())} · Financial year ${financialYear()}`}
        title={`Good ${greeting()}, ${user.fullName.split(" ")[0]}`}
        subtitle={
          data.scope === "own"
            ? "Your requisitions and their current position."
            : data.scope === "department"
            ? "Common Services Division activity across the bank."
            : "Division-wide position across procurement, receipt and payment."
        }
      />

      {/* --- Tiles ---------------------------------------------------------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canApprove ? (
          <Stat
            label="Awaiting your approval" value={queue.length}
            tone={queue.length > 0 ? "warn" : "neutral"}
            href="/requisitions/approvals"
            sub={queue.length > 0 ? "Action required" : "Nothing in your queue"}
          />
        ) : (
          <Stat
            label="My requisitions" value={data.myRequisitions}
            tone="info" href="/requisitions" sub="Raised by you"
          />
        )}

        {showTenders ? (
          <Stat
            label="Tenders in progress" value={data.openTenders}
            tone="info" href="/tenders" sub="Published, closed or under evaluation"
          />
        ) : (
          <Stat
            label="In approval" value={inFlight.length}
            tone={inFlight.length ? "warn" : "neutral"} sub="Raised by you, with an approver"
          />
        )}

        {can(user, "INVOICE", "VIEW") ? (
          <Stat
            label="Invoices awaiting payment" value={data.invoicesAwaiting}
            tone="warn" href="/invoices" sub="Received through to approved"
          />
        ) : (
          <Stat
            label="Requisitions this month" value={data.recentRequisitions.length}
            tone="neutral" sub="Across your branch"
          />
        )}

        {showBudget ? (
          <Stat
            label="Budget consumed" value={<Money value={data.budget.consumed} compact />}
            tone={data.budget.consumed / Math.max(1, data.budget.allocated) > 0.8 ? "warn" : "success"}
            href="/budgets"
            sub={<>of <Money value={data.budget.allocated} compact /> allocated</>}
          />
        ) : (
          <Stat
            label="Items in catalogue" value="64" tone="neutral" href="/stock"
            sub="Across 8 categories" />
        )}
      </div>

      {/* --- The sealed tender, surfaced for whoever can act on it ---------- */}
      {showTenders && data.sealedTenders.length > 0 ? (
        <div className="mb-5">
          {data.sealedTenders.slice(0, 1).map(t => (
            <Note key={t.id} tone="sealed" title={
              <span className="flex items-center gap-2">
                <Icon name="lock" className="h-4 w-4" />
                Tender closed — financial offers sealed
              </span>
            }>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <Link href={`/tenders/${t.id}`} className="font-semibold underline underline-offset-2">
                    {t.tenderNo}
                  </Link>{" "}
                  — {t.title}. Closed {relativeDays(t.closedAt)} with {t.bidCount} bids.
                  Technical envelopes are ready for opening; financial offers remain sealed
                  until technical evaluation is signed off.
                </span>
                <ButtonLink href={`/tenders/${t.id}`} variant="secondary" className="shrink-0">
                  Open tender <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Note>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* --- Main column -------------------------------------------------- */}
        <div className="space-y-5 lg:col-span-2">
          {queue.length > 0 ? (
            <Card pad={false}>
              <CardHeader
                title="Your approval queue"
                subtitle="Items currently waiting on a step your roles can action"
                action={<ButtonLink href="/requisitions/approvals">View all</ButtonLink>}
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Title</Th>
                    <Th>Raised by</Th>
                    <Th align="right">Value</Th>
                    <Th>Step</Th>
                    <Th align="right">Waiting</Th>
                  </tr>
                </thead>
                <tbody>
                  {queue.slice(0, 5).map(q => (
                    <Tr key={q.instanceId}>
                      <LinkCell href={q.href} mono>{q.reference}</LinkCell>
                      <Td className="max-w-[240px] truncate">{q.title}</Td>
                      <Td>{q.raisedBy}</Td>
                      <Td align="right"><Money value={q.value} /></Td>
                      <Td>
                        <span className="text-[12.5px] text-ink-600">{q.stepName}</span>
                      </Td>
                      <Td align="right">
                        <span className={ageInDays(q.startedAt) > 2 ? "font-semibold text-warn-700" : "text-ink-600"}>
                          {ageInDays(q.startedAt)}d
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          {inFlight.length > 0 ? (
            <Card pad={false}>
              <CardHeader
                title="Raised by you, in approval"
                subtitle="You cannot action these yourself — maker-checker requires a different approver"
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th><Th>Title</Th><Th align="right">Value</Th>
                    <Th>Waiting on</Th><Th align="right">Age</Th>
                  </tr>
                </thead>
                <tbody>
                  {inFlight.slice(0, 5).map(f => (
                    <Tr key={f.instanceId}>
                      <LinkCell href={f.href} mono>{f.reference}</LinkCell>
                      <Td className="max-w-[260px] truncate">{f.title}</Td>
                      <Td align="right"><Money value={f.value} /></Td>
                      <Td><Pill tone="warn">{f.waitingOn}</Pill></Td>
                      <Td align="right" className="text-ink-600">{ageInDays(f.startedAt)}d</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          <Card pad={false}>
            <CardHeader
              title={data.scope === "own" ? "Your recent requisitions" : "Recent requisitions"}
              action={<ButtonLink href="/requisitions">View all</ButtonLink>}
            />
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th><Th>Title</Th>
                  {data.scope !== "own" ? <Th>Raised by</Th> : null}
                  <Th align="right">Value</Th><Th>Status</Th><Th align="right">Raised</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentRequisitions.length === 0 ? (
                  <EmptyRow colSpan={6}>No requisitions yet.</EmptyRow>
                ) : data.recentRequisitions.map(r => (
                  <Tr key={r.id}>
                    <LinkCell href={`/requisitions/${r.id}`} mono>{r.requisitionNo}</LinkCell>
                    <Td className="max-w-[260px] truncate" >{r.title}</Td>
                    {data.scope !== "own" ? <Td className="whitespace-nowrap">{r.requestedBy}</Td> : null}
                    <Td align="right"><Money value={r.value} /></Td>
                    <Td><Pill status={r.status} /></Td>
                    <Td align="right" className="whitespace-nowrap text-ink-500">{formatDate(r.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card pad={false}>
              <CardHeader title="Requisitions by status" />
              <div className="p-5">
                <StatusBars data={data.statusCounts} />
              </div>
            </Card>

            {showBudget ? (
              <Card pad={false}>
                <CardHeader title="Budget by division" subtitle={`Financial year ${financialYear()}`} />
                <div className="p-5">
                  <SpendBars data={data.byDepartment.slice(0, 6)} />
                </div>
              </Card>
            ) : (
              <Card pad={false}>
                <CardHeader title="Raise a requisition" />
                <div className="p-5">
                  <p className="text-[13.5px] leading-relaxed text-ink-600">
                    Select items from the catalogue and the system checks stock before
                    anything is sent for approval, so the bank does not buy what it
                    already holds.
                  </p>
                  <div className="mt-4">
                    <ButtonLink href="/requisitions/new" variant="primary">
                      <Icon name="plus" className="h-4 w-4" /> New requisition
                    </ButtonLink>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* --- Side column -------------------------------------------------- */}
        <div className="space-y-5">
          {showBudget ? (
            <Card>
              <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-600">
                Budget position
              </div>
              <div className="flex items-center gap-4">
                <BudgetRing
                  allocated={data.budget.allocated}
                  consumed={data.budget.consumed}
                  committed={data.budget.committed}
                />
                <dl className="min-w-0 flex-1 space-y-2 text-[12.5px]">
                  {[
                    ["Allocated", data.budget.allocated, "bg-ink-200"],
                    ["Consumed", data.budget.consumed, "bg-brand-600"],
                    ["Committed", data.budget.committed, "bg-gold-400"],
                    ["Remaining", data.budget.remaining, "bg-ink-100"],
                  ].map(([l, v, c]) => (
                    <div key={l as string} className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-ink-600">
                        <span className={`h-2 w-2 rounded-full ${c as string}`} />
                        {l as string}
                      </dt>
                      <dd className="font-semibold text-ink-900">
                        <Money value={v as number} compact />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          ) : null}

          <Card pad={false}>
            <CardHeader
              title="Recent activity"
              subtitle="From the audit trail"
              action={can(user, "AUDIT", "VIEW")
                ? <ButtonLink href="/admin/audit">Audit trail</ButtonLink> : undefined}
            />
            <ul className="divide-y divide-ink-100">
              {data.recentActivity.map(a => (
                <li key={a.id} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-ink-900">
                      {enumLabel(a.action)}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-400">{relativeDays(a.at)}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-600">{a.entityLabel}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-500">
                    {a.by} · {a.role}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function greeting(): string {
  // Asia/Dhaka is UTC+6.
  const h = (new Date().getUTCHours() + 6) % 24;
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
