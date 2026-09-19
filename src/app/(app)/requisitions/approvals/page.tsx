import { requireUser } from "@/lib/auth";
import { approvalQueue, ownInFlight } from "@/lib/queries";
import { formatDateTime, ageInDays, addHours } from "@/lib/date";
import {
  Card, CardHeader, PageHeader, Pill, Money, Table, Th, Td, Tr,
  LinkCell, EmptyRow, Icon, Stat, Note, ButtonLink,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The approver's queue.
 *
 * Deliberately excludes anything the viewer raised themselves. Maker-checker
 * means they can never action those, so listing them in a queue called
 * "awaiting your approval" would be a lie the system tells its own users.
 * They appear in a separate, clearly labelled section instead.
 */
export default async function ApprovalsPage() {
  const user = await requireUser();
  const [queue, inFlight] = await Promise.all([approvalQueue(user), ownInFlight(user)]);

  const overdue = queue.filter(q => new Date() > addHours(q.startedAt, q.escalationHours));

  return (
    <>
      <PageHeader
        eyebrow="Module 1 — Task and Notification Management"
        title="My approvals"
        subtitle="Documents currently waiting on a step your roles can action. Items you raised yourself are listed separately, because maker-checker means you cannot action them."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting your action" value={queue.length} tone={queue.length ? "warn" : "neutral"} />
        <Stat label="Past escalation window" value={overdue.length} tone={overdue.length ? "danger" : "neutral"}
          sub={overdue.length ? "Escalation due" : "All within window"} />
        <Stat label="Raised by you, in approval" value={inFlight.length} tone="info" sub="You cannot action these" />
        <Stat label="Value in your queue"
          value={<Money value={queue.reduce((s, q) => s + q.value, 0)} compact />} tone="neutral" />
      </div>

      <div className="space-y-5">
        <Card pad={false}>
          <CardHeader
            title="Awaiting your approval"
            subtitle={`${queue.length} item${queue.length === 1 ? "" : "s"} you can action now`}
          />
          <Table>
            <thead>
              <tr>
                <Th width="170px">Reference</Th>
                <Th>Title</Th>
                <Th>Raised by</Th>
                <Th>Context</Th>
                <Th align="right">Value</Th>
                <Th>Step</Th>
                <Th>Workflow</Th>
                <Th align="right">Waiting</Th>
                <Th width="150px" align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <EmptyRow colSpan={9}>
                  Nothing is waiting on you. Items you raised yourself never appear here.
                </EmptyRow>
              ) : queue.map(q => {
                const late = new Date() > addHours(q.startedAt, q.escalationHours);
                return (
                  <Tr key={q.instanceId}>
                    <LinkCell href={q.href} mono>{q.reference}</LinkCell>
                    <Td className="max-w-[280px] truncate">{q.title}</Td>
                    <Td className="whitespace-nowrap">
                      {q.raisedBy}
                      {q.raisedByRole ? (
                        <span className="block text-[11.5px] text-ink-500">{q.raisedByRole}</span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{q.context}</Td>
                    <Td align="right"><Money value={q.value} /></Td>
                    <Td>
                      <span className="text-[12.5px] text-ink-700">{q.stepName}</span>
                      <span className="block text-[11.5px] text-ink-400">Step {q.stepSequence}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-ink-600">
                      {q.workflow}
                      <span className="block text-[11.5px] text-ink-400">Version {q.version}</span>
                    </Td>
                    <Td align="right">
                      {late ? (
                        <Pill tone="danger">{ageInDays(q.startedAt)}d · escalate</Pill>
                      ) : (
                        <span className="text-ink-600 tabular">{ageInDays(q.startedAt)}d</span>
                      )}
                    </Td>
                    <Td align="right">
                      <ButtonLink href={q.href} variant="primary" className="px-3 py-1.5 text-[12.5px]">
                        Review &amp; approve
                        <Icon name="arrowRight" className="h-3.5 w-3.5" />
                      </ButtonLink>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        {inFlight.length > 0 ? (
          <Card pad={false}>
            <CardHeader
              title="Raised by you"
              subtitle="In approval with someone else — maker-checker prevents you actioning your own documents"
            />
            <Table>
              <thead>
                <tr>
                  <Th width="170px">Reference</Th><Th>Title</Th>
                  <Th align="right">Value</Th><Th>Current step</Th>
                  <Th>Waiting on</Th><Th align="right">Age</Th>
                </tr>
              </thead>
              <tbody>
                {inFlight.map(f => (
                  <Tr key={f.instanceId}>
                    <LinkCell href={f.href} mono>{f.reference}</LinkCell>
                    <Td className="max-w-[300px] truncate">{f.title}</Td>
                    <Td align="right"><Money value={f.value} /></Td>
                    <Td className="text-[12.5px] text-ink-600">{f.stepName}</Td>
                    <Td><Pill tone="warn">{f.waitingOn}</Pill></Td>
                    <Td align="right" className="text-ink-600 tabular">{ageInDays(f.startedAt)}d</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        <Note tone="info" title="Escalation">
          Each workflow step carries an escalation window configured in the workflow builder.
          Items past their window are flagged here. In production the middleware tier also
          issues an email and SMS reminder to the role holders and their supervisor.
        </Note>
      </div>
    </>
  );
}
