"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { amendPurchaseOrder } from "@/lib/po-actions";
import { formatBDT, parseTakaToPoisha } from "@/lib/money";
import { Card, CardHeader, Icon, buttonClass } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

interface Line {
  itemId: string; itemCode: string; itemName: string;
  quantity: number; unitPrice: number; approvedQuantity: number;
}

/**
 * Amend an issued work order.
 *
 * Annexure-B module 24 (xxii) commits to amending quantities and rates on a
 * work order. The same validation runs, so an amendment cannot do what the
 * original issue was refused: quantities still cannot drift past the approval.
 */
export function AmendPanel({
  poId, requisitionNo, lines: initial,
}: { poId: string; requisitionNo: string; lines: Line[] }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(initial.map(l => [l.itemId, String(l.quantity)])),
  );
  const [price, setPrice] = useState<Record<string, string>>(
    Object.fromEntries(initial.map(l => [l.itemId, String(l.unitPrice / 100)])),
  );
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const current = initial.map(l => ({
    ...l,
    q: Math.max(0, parseInt(qty[l.itemId] ?? "0", 10) || 0),
    p: parseTakaToPoisha(price[l.itemId] ?? "0"),
  }));
  const total = current.reduce((s, l) => s + l.q * l.p, 0);
  const over = current.filter(l => l.q > l.approvedQuantity);

  const submit = () => {
    setRefusal(null); setSuccess(null);
    start(async () => {
      const res = await amendPurchaseOrder(poId, current.map(l => ({
        itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName,
        quantity: l.q, unitPrice: l.p,
      })));
      if (res.ok) { setSuccess(res.message ?? "Amended."); router.refresh(); }
      else setRefusal(res);
    });
  };

  return (
    <Card pad={false}>
      <CardHeader
        title="Amend work order"
        subtitle={`Quantities are revalidated against ${requisitionNo}`}
        action={
          <button type="button" onClick={() => setOpen(o => !o)} className={buttonClass("secondary")}>
            <Icon name={open ? "chevronDown" : "chevronRight"} className="h-3.5 w-3.5" />
            {open ? "Cancel" : "Amend"}
          </button>
        }
      />
      {open ? (
        <div className="space-y-3 p-5">
          {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
          {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-[11.5px] uppercase tracking-[0.05em] text-ink-500">
                <th className="py-1.5 text-left font-semibold">Item</th>
                <th className="py-1.5 text-right font-semibold">Approved</th>
                <th className="py-1.5 text-right font-semibold">Quantity</th>
                <th className="py-1.5 text-right font-semibold">Unit price (৳)</th>
                <th className="py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {current.map(l => (
                <tr key={l.itemId} className={l.q > l.approvedQuantity ? "bg-danger-50" : ""}>
                  <td className="border-b border-ink-100 py-2 pr-2">
                    <div className="font-medium text-ink-900">{l.itemName}</div>
                    <div className="font-mono text-[11px] text-ink-500">{l.itemCode}</div>
                  </td>
                  <td className="border-b border-ink-100 py-2 text-right font-semibold text-brand-700 tabular">
                    {l.approvedQuantity}
                  </td>
                  <td className="border-b border-ink-100 py-2 text-right">
                    <input
                      type="number" min={0} value={qty[l.itemId] ?? ""}
                      onChange={e => setQty(q => ({ ...q, [l.itemId]: e.target.value }))}
                      className={`w-20 rounded-[4px] border px-2 py-1 text-right text-[13px] tabular ${
                        l.q > l.approvedQuantity ? "border-danger-500 font-semibold text-danger-700" : "border-ink-300"
                      }`}
                    />
                  </td>
                  <td className="border-b border-ink-100 py-2 text-right">
                    <input
                      value={price[l.itemId] ?? ""}
                      onChange={e => setPrice(p => ({ ...p, [l.itemId]: e.target.value }))}
                      className="w-24 rounded-[4px] border border-ink-300 px-2 py-1 text-right text-[13px] tabular"
                    />
                  </td>
                  <td className="border-b border-ink-100 py-2 text-right font-semibold tabular">
                    {formatBDT(l.q * l.p)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-ink-600">
              New total <strong className="font-semibold text-ink-900">{formatBDT(total)}</strong>
              {over.length > 0 ? (
                <span className="ml-2 font-semibold text-danger-600">
                  {over.length} line{over.length === 1 ? "" : "s"} over the approved quantity
                </span>
              ) : null}
            </span>
            <button type="button" onClick={submit} disabled={pending} className={buttonClass("primary")}>
              {pending ? "Saving…" : "Save amendment"}
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
