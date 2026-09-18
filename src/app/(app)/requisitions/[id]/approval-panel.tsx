"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actOnRequisition } from "@/lib/requisition-actions";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";
import { Card, Icon, buttonClass } from "@/components/ui";

/**
 * The approval control on a requisition.
 *
 * When the viewer is the person who raised it, the Approve button is present
 * and ENABLED, and pressing it produces a refusal from the server. Hiding the
 * button would be easier and would prove nothing: the bid claims the system
 * blocks self-approval, and the only convincing demonstration of that is
 * watching it happen.
 */
export function ApprovalPanel({
  requisitionId, requisitionNo, isMaker, makerName, stepName, requiredRole, holdsRole, actorName,
}: {
  requisitionId: string; requisitionNo: string; isMaker: boolean; makerName: string;
  stepName: string; requiredRole: string; holdsRole: boolean; actorName: string;
}) {
  const [comments, setComments] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const act = (action: "APPROVED" | "REJECTED" | "RETURNED") => {
    setRefusal(null);
    setSuccess(null);
    start(async () => {
      const res = await actOnRequisition(requisitionId, action, comments.trim());
      if (res.ok) {
        setSuccess(res.message ?? "Done.");
        setComments("");
        router.refresh();
      } else {
        setRefusal(res);
      }
    });
  };

  return (
    <Card pad={false} className={isMaker ? "border-warn-500/50" : "border-brand-500/40"}>
      <div className={`flex items-start justify-between gap-4 border-b px-5 py-3.5 ${
        isMaker ? "border-warn-500/30 bg-warn-50" : "border-brand-500/25 bg-brand-50"
      }`}>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">
            {isMaker ? "You raised this requisition" : "Action required"}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-600">
            {isMaker ? (
              <>
                Maker-checker applies. This requisition must be actioned by{" "}
                <strong className="font-semibold">{requiredRole}</strong>, and the system will
                refuse your approval on a document you raised whatever roles you hold.
                The control is shown here so it can be seen working.
              </>
            ) : (
              <>
                Step {stepName} — requires <strong className="font-semibold">{requiredRole}</strong>.
                {holdsRole ? "" : " Your roles do not currently carry this step."}
              </>
            )}
          </p>
        </div>
        <Icon name={isMaker ? "shield" : "clock"} className={`mt-0.5 h-5 w-5 shrink-0 ${isMaker ? "text-warn-600" : "text-brand-600"}`} />
      </div>

      <div className="space-y-3 p-5">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
        {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

        <div>
          <label htmlFor="comments" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
            Comments {isMaker ? "" : <span className="font-normal text-ink-500">(recorded against your decision)</span>}
          </label>
          <textarea
            id="comments"
            rows={2}
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder={isMaker ? "" : "Approved. Requirement verified against the branch position."}
            className="w-full resize-y rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[13.5px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button" disabled={pending} onClick={() => act("APPROVED")}
            className={buttonClass("primary")}
          >
            <Icon name="check" className="h-4 w-4" />
            {pending ? "Working…" : isMaker ? "Attempt approval" : "Approve"}
          </button>
          {!isMaker ? (
            <>
              <button
                type="button" disabled={pending} onClick={() => act("RETURNED")}
                className={buttonClass("secondary")}
              >
                <Icon name="arrowLeft" className="h-4 w-4" />
                Return to initiator
              </button>
              <button
                type="button" disabled={pending} onClick={() => act("REJECTED")}
                className={buttonClass("danger")}
              >
                <Icon name="x" className="h-4 w-4" />
                Reject
              </button>
            </>
          ) : null}

          {isMaker ? (
            <span className="ml-auto text-[12.5px] text-ink-500">
              Signed in as {actorName}, who raised {requisitionNo}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
