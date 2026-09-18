"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openTechnicalEnvelope, openFinancialEnvelopeAction } from "@/lib/tender-actions";
import { formatDateTime } from "@/lib/date";
import { Card, CardHeader, Pill, Money, Icon, buttonClass, Note } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

export interface BidRow {
  id: string;
  vendorId: string;
  vendorName: string;
  contactPerson: string;
  tradeLicenseNo: string;
  status: string;
  submittedAt: string | null;
  technicalScore: number | null;
  evaluationComments: string | null;
  technical: {
    openedAt: string | null;
    content: string | null;
    documentCount: number;
    documents: Array<{ fileName: string; fileSize: number }>;
  } | null;
  financial:
    | { sealed: true; digest: string; documentCount: number; submittedAt: string | null }
    | { sealed: false; totalAmount: number; lineItems: Array<{ itemCode: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>; openedAt: string | null; submittedAt: string | null }
    | null;
}

/**
 * The bids tab.
 *
 * The two-envelope control is the reason this screen exists. Each bid shows two
 * envelopes side by side. The technical envelope opens. The financial envelope
 * is rendered as physically sealed — hatched, locked, with a digest instead of
 * an amount — and its button is LIVE. Pressing it produces a refusal from the
 * data access layer.
 *
 * Disabling the button would be easier. It would also let a sceptical reviewer
 * conclude the interface is simply hiding a value it already has. The whole
 * point is that the value was never read.
 */
export function BidsPanel({
  tenderId, tenderNo, tenderStatus, bids, unlocked, canEvaluate,
}: {
  tenderId: string; tenderNo: string; tenderStatus: string;
  bids: BidRow[]; unlocked: boolean; canEvaluate: boolean;
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

  const beforeClose = tenderStatus === "PUBLISHED";

  return (
    <div className="space-y-4">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

      {beforeClose ? (
        <Note tone="info" title="Tender is still open">
          Bid count only. No envelope, technical or financial, can be opened before the tender closes.
        </Note>
      ) : null}

      {bids.map(b => (
        <Card key={b.id} pad={false}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2.5">
                {b.vendorName}
                <Pill status={b.status} />
                {b.technicalScore !== null ? (
                  <span className="text-[12px] font-normal text-ink-500">
                    Technical score {b.technicalScore}/100
                  </span>
                ) : null}
              </span>
            }
            subtitle={
              <>
                {b.contactPerson} · Trade licence {b.tradeLicenseNo}
                {b.submittedAt ? <> · Submitted {formatDateTime(b.submittedAt)}</> : null}
              </>
            }
          />

          <div className="grid gap-px bg-ink-200 md:grid-cols-2">
            {/* --- Technical envelope ------------------------------------- */}
            <div className="bg-white p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                  <Icon name={b.technical?.openedAt ? "unlock" : "lock"} className="h-4 w-4 text-ink-500" />
                  Technical offer
                </span>
                {b.technical?.openedAt ? (
                  <Pill tone="success">Opened</Pill>
                ) : (
                  <Pill tone="neutral">Unopened</Pill>
                )}
              </div>

              {b.technical?.openedAt ? (
                <>
                  <div className="mb-2 text-[11.5px] text-ink-500">
                    Opened {formatDateTime(b.technical.openedAt)}
                  </div>
                  <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[5px] border border-ink-200 bg-ink-50 p-3 font-sans text-[12.5px] leading-relaxed text-ink-700">
                    {b.technical.content}
                  </pre>
                  {b.technical.documents.length > 0 ? (
                    <ul className="mt-2.5 space-y-1">
                      {b.technical.documents.map(d => (
                        <li key={d.fileName} className="flex items-center gap-2 text-[12px] text-ink-600">
                          <Icon name="file" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                          <span className="truncate font-mono">{d.fileName}</span>
                          <span className="ml-auto shrink-0 text-ink-400">{(d.fileSize / 1024).toFixed(0)} KB</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="hatch rounded-[5px] border border-dashed border-ink-300 px-4 py-6 text-center">
                    <Icon name="lock" className="mx-auto h-5 w-5 text-ink-400" />
                    <div className="mt-1.5 text-[12.5px] font-medium text-ink-600">
                      Sealed — {b.technical?.documentCount ?? 0} document{b.technical?.documentCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  {canEvaluate && !beforeClose ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(`t-${b.id}`, () => openTechnicalEnvelope(b.id))}
                      className={buttonClass("secondary", "mt-2.5 w-full")}
                    >
                      <Icon name="unlock" className="h-4 w-4" />
                      {busy === `t-${b.id}` ? "Opening…" : "Open technical envelope"}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {/* --- Financial envelope ------------------------------------- */}
            <div className={`p-4 ${b.financial?.sealed ? "bg-gold-50" : "bg-white"}`}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                  <Icon
                    name={b.financial && !b.financial.sealed ? "unlock" : "lock"}
                    className={`h-4 w-4 ${b.financial?.sealed ? "text-gold-600" : "text-ink-500"}`}
                  />
                  Financial offer
                </span>
                {b.financial?.sealed
                  ? <Pill tone="sealed">Sealed</Pill>
                  : <Pill tone="success">Open</Pill>}
              </div>

              {b.financial && !b.financial.sealed ? (
                <>
                  <div className="rounded-[5px] border border-brand-500/30 bg-brand-50 px-4 py-3 text-center">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Quoted total</div>
                    <div className="mt-0.5 text-[24px] font-bold leading-none text-ink-950">
                      <Money value={b.financial.totalAmount} />
                    </div>
                  </div>
                  {b.financial.lineItems.length > 0 ? (
                    <table className="mt-2.5 w-full text-[12px]">
                      <thead>
                        <tr className="text-ink-500">
                          <th className="py-1 text-left font-medium">Item</th>
                          <th className="py-1 text-right font-medium">Qty</th>
                          <th className="py-1 text-right font-medium">Unit</th>
                          <th className="py-1 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.financial.lineItems.map(li => (
                          <tr key={li.itemCode} className="border-t border-ink-100">
                            <td className="py-1.5 pr-2">{li.itemName}</td>
                            <td className="py-1.5 text-right tabular">{li.quantity}</td>
                            <td className="py-1.5 text-right tabular"><Money value={li.unitPrice} /></td>
                            <td className="py-1.5 text-right font-semibold tabular"><Money value={li.lineTotal} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {b.financial.openedAt ? (
                    <div className="mt-2 text-[11.5px] text-ink-500">
                      Opened {formatDateTime(b.financial.openedAt)}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="hatch rounded-[5px] border-2 border-dashed border-gold-500/50 px-4 py-6 text-center">
                    <Icon name="lock" className="mx-auto h-6 w-6 text-gold-600" />
                    <div className="mt-2 font-mono text-[15px] font-bold tracking-[0.1em] text-gold-700">
                      ৳ ▪▪,▪▪,▪▪▪
                    </div>
                    <div className="mt-1.5 text-[12px] font-medium text-gold-700">
                      Envelope {b.financial?.sealed ? b.financial.digest : "—"} ·{" "}
                      {b.financial?.sealed ? b.financial.documentCount : 0} document
                      {b.financial?.sealed && b.financial.documentCount === 1 ? "" : "s"}
                    </div>
                    <p className="mx-auto mt-2 max-w-[260px] text-[11.5px] leading-snug text-ink-600">
                      Not readable by any user, including administrators, until the technical
                      evaluation is completed and signed off.
                    </p>
                  </div>
                  {canEvaluate && !beforeClose ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(`f-${b.id}`, () => openFinancialEnvelopeAction(b.id))}
                      className={buttonClass("secondary", "mt-2.5 w-full border-gold-500/50 text-gold-700 hover:bg-gold-100")}
                    >
                      <Icon name="unlock" className="h-4 w-4" />
                      {busy === `f-${b.id}` ? "Attempting…" : "Open financial envelope"}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {b.evaluationComments ? (
            <div className="border-t border-ink-200 bg-ink-50 px-4 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                Evaluation
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-700">{b.evaluationComments}</p>
            </div>
          ) : null}
        </Card>
      ))}

      {bids.length === 0 ? (
        <Card><p className="text-[13.5px] text-ink-500">No bids have been received for this tender.</p></Card>
      ) : null}
    </div>
  );
}
