"use client";

import { formatBDT } from "@/lib/money";
import { Card, CardHeader, Icon, Note } from "@/components/ui";
import type { ThreeWayRow } from "@/lib/po-validation";

/**
 * The three-way match.
 *
 * Purchase order, goods receipt and invoice presented as three columns so the
 * comparison is spatial rather than something the viewer has to hold in their
 * head. Agreeing fields are green, disagreeing ones red, and the failure is
 * stated in a sentence underneath rather than left to be inferred.
 */
export function MatchPanel({
  rows, matched, failures, poNo, grnNo, invoiceNo,
}: {
  rows: ThreeWayRow[]; matched: boolean; failures: string[];
  poNo: string; grnNo: string; invoiceNo: string;
}) {
  return (
    <Card pad={false} className={matched ? "border-brand-500/40" : "border-danger-500/50"}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon name={matched ? "check" : "alert"} className={`h-4 w-4 ${matched ? "text-brand-700" : "text-danger-600"}`} />
            Three-way match
          </span>
        }
        subtitle="Work order, goods receipt and invoice must agree on item, quantity and price"
        className={matched ? "bg-brand-50" : "bg-danger-50"}
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th rowSpan={2} className="border-b border-r border-ink-200 bg-ink-50 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
                Item
              </th>
              <th colSpan={2} className="border-b border-r border-ink-200 bg-info-50 px-3 py-1.5 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-info-700">
                Work order
                <span className="ml-1.5 font-mono text-[10.5px] font-normal">{poNo}</span>
              </th>
              <th colSpan={2} className="border-b border-r border-ink-200 bg-warn-50 px-3 py-1.5 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-warn-700">
                Goods receipt
                <span className="ml-1.5 font-mono text-[10.5px] font-normal">{grnNo}</span>
              </th>
              <th colSpan={2} className="border-b border-ink-200 bg-ink-100 px-3 py-1.5 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-700">
                Invoice
                <span className="ml-1.5 font-mono text-[10.5px] font-normal">{invoiceNo}</span>
              </th>
            </tr>
            <tr>
              {["Qty", "Unit price", "Received", "Accepted", "Qty", "Unit price"].map((h, i) => (
                <th key={h + i} className={`border-b border-ink-200 bg-ink-50 px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-500 ${
                  i === 1 || i === 3 ? "border-r" : ""
                }`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.itemCode}>
                <td className="border-b border-r border-ink-100 px-3 py-2.5">
                  <div className="font-medium text-ink-900">{r.itemName}</div>
                  <div className="font-mono text-[11px] text-ink-500">{r.itemCode}</div>
                </td>
                <td className="border-b border-ink-100 px-3 py-2.5 text-right tabular">{r.poQuantity}</td>
                <td className="border-b border-r border-ink-100 px-3 py-2.5 text-right tabular">{formatBDT(r.poUnitPrice)}</td>
                <td className="border-b border-ink-100 px-3 py-2.5 text-right tabular">{r.grnQuantityReceived}</td>
                <td className="border-b border-r border-ink-100 px-3 py-2.5 text-right font-semibold tabular">{r.grnQuantityAccepted}</td>
                <td className={`border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular ${
                  r.quantityMatches ? "bg-brand-50 text-brand-800" : "bg-danger-100 text-danger-700"
                }`}>
                  {r.invoiceQuantity}
                  <Icon name={r.quantityMatches ? "check" : "x"} className="ml-1 inline h-3 w-3 align-[-1px]" />
                </td>
                <td className={`border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular ${
                  r.priceMatches ? "bg-brand-50 text-brand-800" : "bg-danger-100 text-danger-700"
                }`}>
                  {formatBDT(r.invoiceUnitPrice)}
                  <Icon name={r.priceMatches ? "check" : "x"} className="ml-1 inline h-3 w-3 align-[-1px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`border-t px-5 py-3.5 ${matched ? "border-brand-500/30 bg-brand-50" : "border-danger-500/40 bg-danger-50"}`}>
        {matched ? (
          <div className="flex items-start gap-2.5">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
            <div className="text-[13.5px] text-brand-800">
              <strong className="font-semibold">Match passed.</strong> Every line agrees on item,
              quantity and price across all three documents. The invoice may proceed to payment
              approval.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
            <div className="min-w-0 text-[13.5px] text-danger-700">
              <strong className="font-semibold">Match failed.</strong> This invoice is held from
              payment until the discrepancy is resolved.
              <ul className="mt-1.5 space-y-1">
                {failures.map(f => (
                  <li key={f} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
