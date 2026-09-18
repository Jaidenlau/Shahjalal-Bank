"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { awardTender } from "@/lib/tender-actions";
import { Card, Icon, Money, buttonClass } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

/**
 * Award.
 *
 * Disqualified bidders are listed with a live button too. Pressing it produces
 * a refusal naming the disqualification — the system will not let price
 * override a technical finding, and that is worth showing rather than saying.
 */
export function AwardPanel({
  tenderId, candidates, blocked, canAward,
}: {
  tenderId: string;
  candidates: Array<{ bidId: string; vendorName: string; amount: number; rank: number | null }>;
  blocked: Array<{ bidId: string; vendorName: string; amount: number }>;
  canAward: boolean;
}) {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!canAward) return null;

  const award = (bidId: string) => {
    setRefusal(null); setSuccess(null); setBusy(bidId);
    start(async () => {
      const res = await awardTender(tenderId, bidId);
      setBusy(null);
      if (res.ok) { setSuccess(res.message ?? "Awarded."); router.refresh(); }
      else setRefusal(res);
    });
  };

  return (
    <div className="space-y-3">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

      <Card>
        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
          Award
        </div>
        <div className="space-y-2">
          {candidates.map(c => (
            <div key={c.bidId} className="flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-ink-200 px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                {c.rank ? (
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    c.rank === 1 ? "bg-brand-700 text-white" : "bg-ink-200 text-ink-700"
                  }`}>{c.rank}</span>
                ) : null}
                <span className="text-[14px] font-semibold text-ink-900">{c.vendorName}</span>
                <Money value={c.amount} className="text-ink-600" />
              </div>
              <button
                type="button" disabled={pending} onClick={() => award(c.bidId)}
                className={buttonClass(c.rank === 1 ? "primary" : "secondary")}
              >
                <Icon name="check" className="h-4 w-4" />
                {busy === c.bidId ? "Awarding…" : "Award"}
              </button>
            </div>
          ))}

          {blocked.map(b => (
            <div key={b.bidId} className="flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-danger-500/25 bg-danger-50/50 px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                <Icon name="x" className="h-4 w-4 text-danger-600" />
                <span className="text-[14px] font-semibold text-ink-700">{b.vendorName}</span>
                <Money value={b.amount} className="text-ink-500" />
                <span className="text-[12px] text-danger-700">Technically disqualified</span>
              </div>
              <button
                type="button" disabled={pending} onClick={() => award(b.bidId)}
                className={buttonClass("secondary")}
              >
                {busy === b.bidId ? "Attempting…" : "Attempt award"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
