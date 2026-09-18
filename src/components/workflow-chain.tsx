import { formatDateTime } from "@/lib/date";
import { Icon } from "./ui";

export interface ChainStep {
  sequence: number;
  name: string;
  requiredRoleName: string;
  actionType: string;
  applies: boolean;
  skipReason: string | null;
  state: "done" | "current" | "pending" | "skipped";
  action?: {
    action: string;
    comments: string;
    actedAt: Date;
    actedBy: { fullName: string; designation: string };
  } | null;
}

/**
 * The approval chain on a document.
 *
 * Steps that did NOT apply are shown, greyed, with the reason they were
 * skipped. That is the difference between a progress bar and an explanation:
 * the room can see why a ৳ 17,77,500 requisition needed two approvals and not
 * three, without anyone narrating it.
 */
export function WorkflowChain({
  steps, workflowName, version, status,
}: {
  steps: ChainStep[]; workflowName: string; version: number; status: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-ink-200 pb-2.5">
        <div>
          <div className="text-[13px] font-semibold text-ink-900">{workflowName}</div>
          <div className="text-[11.5px] text-ink-500">
            Version {version} — pinned at submission
          </div>
        </div>
        <span className={`text-[11.5px] font-semibold ${
          status === "APPROVED" ? "text-brand-700"
          : status === "REJECTED" ? "text-danger-600"
          : status === "RETURNED" ? "text-warn-700" : "text-warn-700"
        }`}>
          {status === "IN_PROGRESS" ? "In progress" : status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
      </div>

      <ol className="relative space-y-0">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={s.sequence} className="relative flex gap-3 pb-4 last:pb-0">
              {/* connector */}
              {!last ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[11px] top-[22px] h-[calc(100%-16px)] w-px ${
                    s.state === "done" ? "bg-brand-400" : "bg-ink-200"
                  }`}
                />
              ) : null}

              <span className={`relative z-10 mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 ${
                s.state === "done" && s.action?.action === "APPROVED" ? "border-brand-600 bg-brand-600 text-white"
                : s.state === "done" && s.action?.action === "REJECTED" ? "border-danger-600 bg-danger-600 text-white"
                : s.state === "done" ? "border-warn-600 bg-warn-600 text-white"
                : s.state === "current" ? "border-warn-600 bg-white text-warn-700"
                : s.state === "skipped" ? "border-ink-200 bg-ink-100 text-ink-400"
                : "border-ink-300 bg-white text-ink-400"
              }`}>
                {s.state === "done" && s.action?.action === "APPROVED" ? <Icon name="check" className="h-3 w-3" />
                  : s.state === "done" && s.action?.action === "REJECTED" ? <Icon name="x" className="h-3 w-3" />
                  : s.state === "done" ? <Icon name="arrowLeft" className="h-3 w-3" />
                  : s.state === "current" ? <Icon name="clock" className="h-3 w-3" />
                  : s.state === "skipped" ? <Icon name="x" className="h-2.5 w-2.5" />
                  : <span className="text-[10.5px] font-bold">{s.sequence}</span>}
              </span>

              <div className={`min-w-0 flex-1 ${s.state === "skipped" ? "opacity-55" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={`text-[13.5px] font-semibold ${
                    s.state === "skipped" ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900"
                  }`}>
                    {s.name}
                  </span>
                  {s.state === "current" ? (
                    <span className="rounded-[3px] bg-warn-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-warn-700">
                      Pending
                    </span>
                  ) : null}
                </div>

                <div className="mt-0.5 text-[12px] text-ink-500">
                  {s.requiredRoleName}
                  {s.actionType !== "APPROVE" ? ` · ${s.actionType.toLowerCase()}` : ""}
                </div>

                {s.state === "skipped" && s.skipReason ? (
                  <div className="mt-1 rounded-[4px] bg-ink-100 px-2 py-1 text-[11.5px] leading-snug text-ink-600">
                    Not required: {s.skipReason}
                  </div>
                ) : null}

                {s.action ? (
                  <div className="mt-1.5 rounded-[4px] border border-ink-200 bg-ink-50 px-2.5 py-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
                      <span className="font-semibold text-ink-800">{s.action.actedBy.fullName}</span>
                      <span className="text-ink-500">{formatDateTime(s.action.actedAt)}</span>
                    </div>
                    <div className="text-[11.5px] text-ink-500">{s.action.actedBy.designation}</div>
                    {s.action.comments ? (
                      <p className="mt-1 border-t border-ink-200 pt-1 text-[12px] leading-snug text-ink-700">
                        “{s.action.comments}”
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
