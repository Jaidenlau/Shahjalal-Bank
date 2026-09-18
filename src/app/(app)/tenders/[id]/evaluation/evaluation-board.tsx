"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { evaluateBid, openTechnicalEnvelope, completeTechnicalEvaluationAction } from "@/lib/tender-actions";
import { formatDateTime } from "@/lib/date";
import { Card, CardHeader, Pill, Icon, buttonClass } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

export interface EvalBid {
  id: string; vendorName: string; contactPerson: string; tradeLicenseNo: string;
  status: string; technicalScore: number | null; evaluationComments: string | null;
  openedAt: string | null; content: string | null;
  documents: Array<{ fileName: string; fileSize: number }>;
  documentCount: number;
}

/** The mandatory documents from the tender's eligibility section. */
const CHECKLIST = [
  "Technical offer in the prescribed format",
  "Authorised distributor certificate from the manufacturer",
  "Experience certificates from two corporate or financial-sector clients",
  "Trade licence, e-TIN and BIN/VAT registration",
];

export function EvaluationBoard({
  tenderId, bids, canEvaluate, unlocked, tenderStatus,
}: {
  tenderId: string; bids: EvalBid[]; canEvaluate: boolean; unlocked: boolean; tenderStatus: string;
}) {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
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

  const allEvaluated = bids.length > 0 && bids.every(b => b.status !== "SUBMITTED");

  return (
    <div className="space-y-4">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

      {bids.map(b => {
        const decided = b.status !== "SUBMITTED";
        const qualified = b.status === "TECHNICAL_QUALIFIED" || b.status === "AWARDED";
        // Whether the mandatory distributor certificate is present is
        // determined by the documents actually submitted, not by a flag.
        const hasDistributorCert = b.documents.some(d => /distributor/i.test(d.fileName));
        return (
          <Card key={b.id} pad={false} className={
            decided ? (qualified ? "border-brand-500/40" : "border-danger-500/40") : ""
          }>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2.5">
                  {b.vendorName}
                  <Pill status={b.status} />
                </span>
              }
              subtitle={`${b.contactPerson} · Trade licence ${b.tradeLicenseNo}`}
              action={b.technicalScore !== null ? (
                <div className="text-right">
                  <div className="text-[20px] font-bold leading-none text-ink-950 tabular">{b.technicalScore}</div>
                  <div className="text-[10.5px] uppercase tracking-[0.05em] text-ink-500">score</div>
                </div>
              ) : undefined}
            />

            {!b.openedAt ? (
              <div className="p-5">
                <div className="hatch rounded-[5px] border border-dashed border-ink-300 px-4 py-6 text-center">
                  <Icon name="lock" className="mx-auto h-5 w-5 text-ink-400" />
                  <div className="mt-1.5 text-[12.5px] font-medium text-ink-600">
                    Technical envelope sealed — {b.documentCount} documents
                  </div>
                </div>
                {canEvaluate && tenderStatus !== "PUBLISHED" ? (
                  <button
                    type="button" disabled={pending}
                    onClick={() => run(`o-${b.id}`, () => openTechnicalEnvelope(b.id))}
                    className={buttonClass("primary", "mt-3 w-full")}
                  >
                    <Icon name="unlock" className="h-4 w-4" />
                    {busy === `o-${b.id}` ? "Opening…" : "Open technical envelope"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="p-5">
                <div className="mb-3 text-[11.5px] text-ink-500">
                  Envelope opened {formatDateTime(b.openedAt)}
                </div>

                <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-[5px] border border-ink-200 bg-ink-50 p-3 font-sans text-[12.5px] leading-relaxed text-ink-700">
                  {b.content}
                </pre>

                {/* Mandatory document checklist, derived from what was actually
                    submitted. This is what the disqualification turns on. */}
                <div className="mt-3.5">
                  <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                    Mandatory documents
                  </div>
                  <ul className="space-y-1">
                    {CHECKLIST.map((c, i) => {
                      const present = i === 1 ? hasDistributorCert : b.documents.length > i;
                      return (
                        <li key={c} className="flex items-start gap-2 text-[12.5px]">
                          <Icon
                            name={present ? "check" : "x"}
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${present ? "text-brand-600" : "text-danger-600"}`}
                          />
                          <span className={present ? "text-ink-700" : "font-semibold text-danger-700"}>
                            {c}
                            {!present ? " — NOT SUBMITTED" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {b.documents.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {b.documents.map(d => (
                        <li key={d.fileName} className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                          <Icon name="file" className="h-3 w-3" />
                          <span className="font-mono">{d.fileName}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {decided ? (
                  <div className={`mt-3.5 rounded-[5px] border px-3.5 py-2.5 ${
                    qualified ? "border-brand-500/30 bg-brand-50" : "border-danger-500/30 bg-danger-50"
                  }`}>
                    <div className={`text-[12.5px] font-semibold ${qualified ? "text-brand-800" : "text-danger-700"}`}>
                      {qualified ? "Technically qualified" : "Technically disqualified"}
                    </div>
                    {b.evaluationComments ? (
                      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-700">{b.evaluationComments}</p>
                    ) : null}
                  </div>
                ) : canEvaluate ? (
                  <div className="mt-3.5 border-t border-ink-200 pt-3.5">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-28">
                        <label className="mb-1 block text-[12px] font-semibold text-ink-700">Score /100</label>
                        <input
                          type="number" min={0} max={100}
                          value={scores[b.id] ?? ""}
                          onChange={e => setScores(s => ({ ...s, [b.id]: e.target.value }))}
                          placeholder={hasDistributorCert ? "85" : "55"}
                          className="w-full rounded-[5px] border border-ink-300 px-2.5 py-1.5 text-[14px] focus:border-brand-500"
                        />
                      </div>
                      <div className="min-w-[240px] flex-1">
                        <label className="mb-1 block text-[12px] font-semibold text-ink-700">Committee finding</label>
                        <input
                          value={notes[b.id] ?? ""}
                          onChange={e => setNotes(n => ({ ...n, [b.id]: e.target.value }))}
                          placeholder={hasDistributorCert
                            ? "Technically responsive. Meets the specification in full."
                            : "No authorised distributor certificate submitted, as required by the eligibility criteria."}
                          className="w-full rounded-[5px] border border-ink-300 px-2.5 py-1.5 text-[13.5px] focus:border-brand-500"
                        />
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button" disabled={pending}
                        onClick={() => run(`q-${b.id}`, () => evaluateBid(
                          b.id, true, Number(scores[b.id] || 85),
                          notes[b.id] || "Technically responsive. Meets the specification in full.",
                        ))}
                        className={buttonClass("primary")}
                      >
                        <Icon name="check" className="h-4 w-4" /> Qualify
                      </button>
                      <button
                        type="button" disabled={pending}
                        onClick={() => run(`d-${b.id}`, () => evaluateBid(
                          b.id, false, Number(scores[b.id] || 55),
                          notes[b.id] || "Did not meet the mandatory eligibility criteria set out in the tender document.",
                        ))}
                        className={buttonClass("danger")}
                      >
                        <Icon name="x" className="h-4 w-4" /> Disqualify
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        );
      })}

      {canEvaluate && !unlocked && allEvaluated ? (
        <Card className="border-gold-500/50 bg-gold-50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-ink-900">
                All {bids.length} bids evaluated
              </h3>
              <p className="mt-0.5 text-[13px] text-ink-600">
                Completing the technical evaluation signs off the committee&apos;s findings and
                unseals the financial offers. This cannot be undone.
              </p>
            </div>
            <button
              type="button" disabled={pending}
              onClick={() => run("complete", () => completeTechnicalEvaluationAction(tenderId))}
              className={buttonClass("primary", "shrink-0 border-gold-600 bg-gold-600 hover:bg-gold-700")}
            >
              <Icon name="unlock" className="h-4 w-4" />
              {busy === "complete" ? "Completing…" : "Complete and unseal financials"}
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
