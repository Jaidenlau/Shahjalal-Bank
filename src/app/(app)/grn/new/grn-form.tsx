"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordGoodsReceipt } from "@/lib/receipt-actions";
import { formatBDT } from "@/lib/money";
import { Card, CardHeader, Icon, Money, buttonClass, Note, Pill } from "@/components/ui";
import { ControlRefusal, type Refusal } from "@/components/control-refusal";

export interface GrnSourceLine {
  poLineId: string; itemCode: string; itemName: string; unitOfMeasure: string;
  ordered: number; alreadyReceived: number; outstanding: number; unitPrice: number;
}
export interface GrnSource {
  poId: string; poNo: string; vendorName: string; vendorInitials: string;
  deliveryDue: string | null; lines: GrnSourceLine[];
}

export function GrnForm({ source }: { source: GrnSource }) {
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.poLineId, String(l.outstanding)])),
  );
  const [rejected, setRejected] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.poLineId, "0"])),
  );
  const [challan, setChallan] = useState(`CH/${source.vendorInitials}/2026/${1000 + source.lines.length * 7}`);
  const [remarks, setRemarks] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const rows = source.lines.map(l => {
    const rec = Math.max(0, parseInt(received[l.poLineId] ?? "0", 10) || 0);
    const rej = Math.max(0, parseInt(rejected[l.poLineId] ?? "0", 10) || 0);
    return { ...l, rec, rej, acc: Math.max(0, rec - rej) };
  });

  const totalReceived = rows.reduce((s, r) => s + r.rec, 0);
  const totalAccepted = rows.reduce((s, r) => s + r.acc, 0);
  const isPartial = rows.some(r => r.alreadyReceived + r.rec < r.ordered);
  const anyOver = rows.some(r => r.rec > r.outstanding);

  const submit = () => {
    setRefusal(null);
    const fd = new FormData();
    fd.set("poId", source.poId);
    fd.set("challanNo", challan);
    fd.set("remarks", remarks);
    fd.set("lines", JSON.stringify(rows.filter(r => r.rec > 0).map(r => ({
      poLineId: r.poLineId, received: r.rec, accepted: r.acc, rejected: r.rej,
      remarks: r.rej > 0 ? "Rejected on inspection." : "",
    }))));
    start(async () => {
      const res = await recordGoodsReceipt(fd);
      if (res.ok && res.redirectTo) router.push(res.redirectTo);
      else setRefusal(res);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}

        <Card pad={false}>
          <CardHeader
            title="Quantities received"
            subtitle="Record what physically arrived, and how much of it passed inspection"
          />
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Item", "Ordered", "Already received", "Outstanding", "Received now", "Rejected", "Accepted"].map((h, i) => (
                  <th key={h} className={`border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.poLineId} className={r.rec > r.outstanding ? "bg-danger-50" : ""}>
                  <td className="border-b border-ink-100 px-3 py-2.5">
                    <div className="font-medium text-ink-900">{r.itemName}</div>
                    <div className="font-mono text-[11.5px] text-ink-500">{r.itemCode} · {r.unitOfMeasure}</div>
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">{r.ordered}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">{r.alreadyReceived}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold text-brand-700 tabular">{r.outstanding}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                    <input
                      type="number" min={0} value={received[r.poLineId] ?? ""}
                      onChange={e => setReceived(v => ({ ...v, [r.poLineId]: e.target.value }))}
                      className={`w-20 rounded-[4px] border px-2 py-1 text-right text-[13.5px] tabular ${
                        r.rec > r.outstanding ? "border-danger-500 font-semibold text-danger-700" : "border-ink-300"
                      }`}
                    />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                    <input
                      type="number" min={0} max={r.rec} value={rejected[r.poLineId] ?? "0"}
                      onChange={e => setRejected(v => ({ ...v, [r.poLineId]: e.target.value }))}
                      className="w-16 rounded-[4px] border border-ink-300 px-2 py-1 text-right text-[13.5px] tabular"
                    />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold text-brand-700 tabular">
                    {r.acc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {anyOver ? (
            <div className="border-t-2 border-danger-500 bg-danger-50 px-4 py-3 text-[13px] text-danger-700">
              <Icon name="alert" className="mr-1.5 inline h-4 w-4 align-[-3px]" />
              A quantity exceeds what remains outstanding on the work order. The receipt will be
              refused — cumulative delivery cannot exceed the ordered quantity.
            </div>
          ) : null}
        </Card>

        <Card pad={false}>
          <CardHeader title="Delivery details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label htmlFor="challan" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Delivery challan number
              </label>
              <input
                id="challan" value={challan} onChange={e => setChallan(e.target.value)}
                className="w-full rounded-[5px] border border-ink-300 px-3 py-2 font-mono text-[13.5px]"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="rem" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Remarks
              </label>
              <textarea
                id="rem" rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
                placeholder="Received in good order and condition."
                className="w-full resize-y rounded-[5px] border border-ink-300 px-3 py-2 text-[13.5px]"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">Summary</div>
          <dl className="space-y-2.5 text-[13.5px]">
            {[
              ["Work order", source.poNo],
              ["Supplier", source.vendorName],
              ["Delivery due", source.deliveryDue ?? "—"],
            ].map(([l, v]) => (
              <div key={l} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-ink-600">{l}</dt>
                <dd className="truncate text-right font-medium text-ink-900">{v}</dd>
              </div>
            ))}
            <div className="border-t border-ink-200 pt-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Units received</dt>
                <dd className="font-semibold text-ink-900 tabular">{totalReceived}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Units accepted</dt>
                <dd className="font-semibold text-brand-700 tabular">{totalAccepted}</dd>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Delivery</dt>
                <dd>{isPartial ? <Pill tone="warn">Partial</Pill> : <Pill tone="success">Full</Pill>}</dd>
              </div>
            </div>
          </dl>

          <button
            type="button" onClick={submit} disabled={pending || totalReceived === 0}
            className={buttonClass("primary", "mt-4 w-full py-2.5")}
          >
            {pending ? "Recording…" : "Record receipt"}
            {!pending ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
          </button>
        </Card>

        <Note tone="info" title="What happens on save">
          Accepted quantities are taken into the Central Store and the item&apos;s stock position
          updates immediately. The officer who raised the source requisition is notified that
          their goods have arrived.
        </Note>
      </div>
    </div>
  );
}
