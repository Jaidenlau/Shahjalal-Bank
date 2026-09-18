"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  publishTender, closeTender, completeTechnicalEvaluationAction, generateComparativeStatement,
} from "@/lib/tender-actions";
import { Icon, buttonClass, ButtonLink } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

/**
 * The action bar on a tender.
 *
 * Which actions appear follows the tender's actual state, so the sequence on
 * stage is: close, open the technical envelopes, evaluate, complete the
 * evaluation — and only then does anything financial become available.
 */
export function TenderActions({
  tenderId, status, canEvaluate, canCreate, bidCount, openedCount, evaluatedCount, unlocked, hasComparative,
}: {
  tenderId: string; status: string; canEvaluate: boolean; canCreate: boolean;
  bidCount: number; openedCount: number; evaluatedCount: number;
  unlocked: boolean; hasComparative: boolean;
}) {
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
      if (res.ok) { setSuccess(res.message ?? "Done."); router.refresh(); }
      else setRefusal(res);
    });
  };

  const allEvaluated = bidCount > 0 && evaluatedCount === bidCount;
  const actions: React.ReactNode[] = [];

  if (canCreate && (status === "DRAFT" || status === "PENDING_APPROVAL")) {
    actions.push(
      <button key="pub" type="button" disabled={pending}
        onClick={() => run("pub", () => publishTender(tenderId))}
        className={buttonClass("primary")}>
        <Icon name="arrowRight" className="h-4 w-4" />
        {busy === "pub" ? "Publishing…" : "Publish to vendor portal"}
      </button>,
    );
  }

  if (canEvaluate && status === "PUBLISHED") {
    actions.push(
      <button key="close" type="button" disabled={pending}
        onClick={() => run("close", () => closeTender(tenderId))}
        className={buttonClass("primary")}>
        <Icon name="lock" className="h-4 w-4" />
        {busy === "close" ? "Closing…" : "Close tender to bids"}
      </button>,
    );
  }

  if (canEvaluate && ["CLOSED", "TECHNICAL_EVALUATION"].includes(status)) {
    actions.push(
      <ButtonLink key="eval" href={`/tenders/${tenderId}/evaluation`} variant={openedCount > 0 ? "primary" : "secondary"}>
        <Icon name="eye" className="h-4 w-4" />
        Technical evaluation ({evaluatedCount}/{bidCount})
      </ButtonLink>,
    );
  }

  if (canEvaluate && !unlocked && allEvaluated && ["CLOSED", "TECHNICAL_EVALUATION"].includes(status)) {
    actions.push(
      <button key="complete" type="button" disabled={pending}
        onClick={() => run("complete", () => completeTechnicalEvaluationAction(tenderId))}
        className={buttonClass("primary", "border-gold-600 bg-gold-600 hover:bg-gold-700")}>
        <Icon name="unlock" className="h-4 w-4" />
        {busy === "complete" ? "Completing…" : "Complete technical evaluation and unseal financials"}
      </button>,
    );
  }

  if (canEvaluate && unlocked && !hasComparative) {
    actions.push(
      <button key="cs" type="button" disabled={pending}
        onClick={() => run("cs", () => generateComparativeStatement(tenderId))}
        className={buttonClass("primary")}>
        <Icon name="chart" className="h-4 w-4" />
        {busy === "cs" ? "Generating…" : "Generate comparative statement"}
      </button>,
    );
  }

  if (unlocked && hasComparative) {
    actions.push(
      <ButtonLink key="cs-view" href={`/tenders/${tenderId}/comparative-statement`} variant="primary">
        <Icon name="chart" className="h-4 w-4" /> Comparative statement
      </ButtonLink>,
    );
  }

  if (!actions.length && !refusal && !success) return null;

  return (
    <div className="space-y-3">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}
      {actions.length ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
