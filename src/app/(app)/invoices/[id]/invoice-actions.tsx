"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runThreeWayMatch, actOnInvoice, processPayment } from "@/lib/receipt-actions";
import { Card, Icon, buttonClass } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

export function InvoiceActions({
  invoiceId, status, matchStatus, canEvaluate, canApprove, workflowOpen, stepName, requiredRole,
}: {
  invoiceId: string; status: string; matchStatus: string;
  canEvaluate: boolean; canApprove: boolean; workflowOpen: boolean;
  stepName: string; requiredRole: string;
}) {
  const [comments, setComments] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string } & Refusal>) => {
    setRefusal(null); setSuccess(null); setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) { setSuccess(res.message ?? "Done."); setComments(""); router.refresh(); }
      else setRefusal(res);
    });
  };

  const showApproval = workflowOpen && canApprove;
  const showPayment = status === "APPROVED" && canApprove;
  const showRematch = canEvaluate;

  if (!showApproval && !showPayment && !showRematch && !refusal && !success) return null;

  return (
    <div className="space-y-3">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

      {showApproval ? (
        <Card pad={false} className="border-brand-500/40">
          <div className="border-b border-brand-500/25 bg-brand-50 px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink-900">Action required</h2>
            <p className="mt-0.5 text-[13px] text-ink-600">
              Step {stepName} — requires <strong className="font-semibold">{requiredRole}</strong>.
            </p>
          </div>
          <div className="space-y-3 p-5">
            <textarea
              rows={2} value={comments} onChange={e => setComments(e.target.value)}
              placeholder="Verified against the work order and goods receipt note."
              className="w-full resize-y rounded-[5px] border border-ink-300 px-3 py-2 text-[13.5px]"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending}
                onClick={() => run("ok", () => actOnInvoice(invoiceId, "APPROVED", comments))}
                className={buttonClass("primary")}>
                <Icon name="check" className="h-4 w-4" />
                {busy === "ok" ? "Working…" : "Approve"}
              </button>
              <button type="button" disabled={pending}
                onClick={() => run("ret", () => actOnInvoice(invoiceId, "RETURNED", comments))}
                className={buttonClass("secondary")}>
                <Icon name="arrowLeft" className="h-4 w-4" /> Return to vendor
              </button>
              <button type="button" disabled={pending}
                onClick={() => run("rej", () => actOnInvoice(invoiceId, "REJECTED", comments))}
                className={buttonClass("danger")}>
                <Icon name="x" className="h-4 w-4" /> Dispute
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {showPayment || showRematch ? (
        <div className="flex flex-wrap items-center gap-2">
          {showPayment ? (
            <button type="button" disabled={pending}
              onClick={() => run("pay", () => processPayment(invoiceId))}
              className={buttonClass("primary")}>
              <Icon name="check" className="h-4 w-4" />
              {busy === "pay" ? "Processing…" : "Process payment"}
            </button>
          ) : null}
          {showRematch ? (
            <button type="button" disabled={pending}
              onClick={() => run("match", () => runThreeWayMatch(invoiceId))}
              className={buttonClass("secondary")}>
              <Icon name="refresh" className={`h-4 w-4 ${busy === "match" ? "animate-spin" : ""}`} />
              {busy === "match" ? "Matching…" : "Re-run three-way match"}
            </button>
          ) : null}
          {matchStatus === "MISMATCH" ? (
            <span className="text-[12.5px] text-danger-700">
              Payment is blocked while the match fails.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
