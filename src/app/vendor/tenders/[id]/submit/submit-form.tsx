"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitTechnicalOffer, submitFinancialOffer } from "@/lib/vendor-actions";
import { formatBDT, parseTakaToPoisha } from "@/lib/money";
import { formatDateTime } from "@/lib/date";
import { Card, CardHeader, Icon, Pill, Money, Note } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

export interface QuoteLine {
  itemCode: string; itemName: string; quantity: number;
  unitOfMeasure: string; specification: string;
}

const DOC_OPTIONS = [
  "technical-offer.pdf",
  "authorised-distributor-certificate.pdf",
  "experience-certificates.pdf",
  "trade-licence-and-tin.pdf",
  "bank-solvency-certificate.pdf",
];

/**
 * Bid submission.
 *
 * The two parts are presented as two physically separate submissions, each
 * with its own button, because that is what a two-envelope tender is. Nothing
 * about the financial panel is required to fill in the technical panel, and
 * either can be submitted without the other.
 */
export function SubmitBidForm({
  tenderId, tenderNo, specification, lines,
  existingTechnical, financialSubmittedAt,
}: {
  tenderId: string; tenderNo: string; specification: string; lines: QuoteLine[];
  existingTechnical: { content: string; submittedAt: string | null } | null;
  financialSubmittedAt: string | null;
}) {
  const [content, setContent] = useState(existingTechnical?.content ?? "");
  const [docs, setDocs] = useState<string[]>(DOC_OPTIONS.slice(0, 4));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const total = lines.reduce((s, l) => s + l.quantity * parseTakaToPoisha(prices[l.itemCode] ?? "0"), 0);

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string } & Refusal>) => {
    setRefusal(null); setSuccess(null); setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) { setSuccess(res.message ?? "Submitted."); router.refresh(); }
      else setRefusal(res);
    });
  };

  const submitTechnical = () => {
    const fd = new FormData();
    fd.set("content", content);
    fd.set("documents", JSON.stringify(docs));
    run("tech", () => submitTechnicalOffer(tenderId, fd));
  };

  const submitFinancial = () => {
    const fd = new FormData();
    fd.set("lines", JSON.stringify(lines.map(l => ({
      itemCode: l.itemCode, itemName: l.itemName, quantity: l.quantity,
      unitPrice: parseTakaToPoisha(prices[l.itemCode] ?? "0"),
    })).filter(l => l.unitPrice > 0)));
    run("fin", () => submitFinancialOffer(tenderId, fd));
  };

  return (
    <div className="space-y-5">
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

      <Note tone="info" title="Two separate sealed submissions">
        This tender uses the two-envelope system. Your technical offer and your financial offer
        are submitted independently and held separately. The bank opens technical offers first;
        your price stays sealed until the technical evaluation is complete and signed off.
      </Note>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------- TECHNICAL ------------------------- */}
        <Card pad={false} className="border-ink-300">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-[12px] font-bold text-white">1</span>
                Technical offer
              </span>
            }
            subtitle="Opened first, evaluated on merit alone"
            action={existingTechnical?.submittedAt ? <Pill tone="success">Submitted</Pill> : undefined}
          />
          <div className="space-y-4 p-5">
            {specification ? (
              <details className="rounded-[5px] border border-ink-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
                  <Icon name="file" className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                  Required specification
                </summary>
                <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap border-t border-ink-200 bg-ink-50 px-3 py-2.5 font-sans text-[12px] leading-relaxed text-ink-700">
                  {specification}
                </pre>
              </details>
            ) : null}

            <div>
              <label htmlFor="tech" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Technical narrative
              </label>
              <textarea
                id="tech" rows={9} value={content} onChange={e => setContent(e.target.value)}
                placeholder={"Offered model:\n\nWarranty:\nDelivery:\nAuthorised distributor certificate:\nExperience:"}
                className="w-full resize-y rounded-[5px] border border-ink-300 px-3 py-2 font-mono text-[12.5px] leading-relaxed focus:border-ink-700"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">Attached documents</span>
              <div className="space-y-1">
                {DOC_OPTIONS.map(d => (
                  <label key={d} className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-[12.5px] hover:bg-ink-50">
                    <input
                      type="checkbox" checked={docs.includes(d)}
                      onChange={e => setDocs(s => e.target.checked ? [...s, d] : s.filter(x => x !== d))}
                      className="h-3.5 w-3.5 accent-ink-800"
                    />
                    <Icon name="file" className="h-3.5 w-3.5 text-ink-400" />
                    <span className="font-mono text-ink-700">{d}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-ink-500">
                Documents are represented as records in this build; no file upload infrastructure runs here.
              </p>
            </div>

            <button
              type="button" disabled={pending || !content.trim()} onClick={submitTechnical}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-800 disabled:opacity-45"
            >
              <Icon name="lock" className="h-4 w-4" />
              {busy === "tech" ? "Submitting…" : existingTechnical?.submittedAt ? "Resubmit technical offer" : "Submit technical offer"}
            </button>
            {existingTechnical?.submittedAt ? (
              <p className="text-center text-[11.5px] text-ink-500">
                Last submitted {formatDateTime(existingTechnical.submittedAt)}
              </p>
            ) : null}
          </div>
        </Card>

        {/* ------------------------- FINANCIAL ------------------------- */}
        <Card pad={false} className="border-gold-500/50">
          <CardHeader
            className="bg-gold-50"
            title={
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-600 text-[12px] font-bold text-white">2</span>
                Financial offer
              </span>
            }
            subtitle="Sealed on submission until technical evaluation completes"
            action={financialSubmittedAt ? <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Sealed</Pill> : undefined}
          />
          <div className="space-y-4 p-5">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="py-1.5 text-left font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Unit price (৳)</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => {
                  const unit = parseTakaToPoisha(prices[l.itemCode] ?? "0");
                  return (
                    <tr key={l.itemCode} className="border-b border-ink-100">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-ink-900">{l.itemName}</div>
                        <div className="font-mono text-[11px] text-ink-500">{l.itemCode}</div>
                      </td>
                      <td className="py-2 text-right tabular">{l.quantity}</td>
                      <td className="py-2 text-right">
                        <input
                          value={prices[l.itemCode] ?? ""}
                          onChange={e => setPrices(p => ({ ...p, [l.itemCode]: e.target.value }))}
                          placeholder="0"
                          className="w-28 rounded-[4px] border border-ink-300 px-2 py-1 text-right text-[12.5px] tabular focus:border-gold-600"
                        />
                      </td>
                      <td className="py-2 text-right font-semibold tabular">
                        {unit > 0 ? formatBDT(unit * l.quantity) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2.5 text-right text-[13px] font-semibold text-ink-700">
                    Total quoted, excluding VAT
                  </td>
                  <td className="py-2.5 text-right text-[15px] font-bold text-ink-950 tabular">
                    {total > 0 ? formatBDT(total) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="rounded-[5px] border border-gold-500/40 bg-gold-50 px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                <p className="text-[12px] leading-relaxed text-gold-700">
                  On submission this offer is sealed. No bank user, including administrators,
                  can read the amount until the Technical Evaluation Committee completes and
                  signs off the technical evaluation of every bid received.
                </p>
              </div>
            </div>

            <button
              type="button" disabled={pending || total <= 0} onClick={submitFinancial}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-gold-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-gold-700 disabled:opacity-45"
            >
              <Icon name="lock" className="h-4 w-4" />
              {busy === "fin" ? "Sealing…" : financialSubmittedAt ? "Resubmit and reseal" : "Submit and seal financial offer"}
            </button>
            {financialSubmittedAt ? (
              <p className="text-center text-[11.5px] text-ink-500">
                Sealed {formatDateTime(financialSubmittedAt)}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
