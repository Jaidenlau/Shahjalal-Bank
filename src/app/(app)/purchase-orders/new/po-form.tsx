"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { issuePurchaseOrder } from "@/lib/po-actions";
import { formatBDT, parseTakaToPoisha } from "@/lib/money";
import { Card, CardHeader, Icon, Money, Pill, buttonClass, Note } from "@/components/ui";
import { ControlRefusal, type Refusal } from "@/components/control-refusal";

export interface PoSourceLine {
  itemId: string; itemCode: string; itemName: string; unitOfMeasure: string;
  approvedQuantity: number; requisitionedQuantity: number; fromStore: number; unitPrice: number;
}
export interface PoSource {
  tenderId: string; tenderNo: string; bidId: string;
  vendorId: string; vendorName: string;
  requisitionId: string; requisitionNo: string;
  lines: PoSourceLine[];
}

export function PoForm({ source }: { source: PoSource }) {
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.itemId, String(l.approvedQuantity)])),
  );
  const [price, setPrice] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.itemId, String(l.unitPrice / 100)])),
  );
  const [deliveryDays, setDeliveryDays] = useState("15");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const lines = useMemo(() => source.lines.map(l => ({
    ...l,
    quantity: Math.max(0, parseInt(qty[l.itemId] ?? "0", 10) || 0),
    price: parseTakaToPoisha(price[l.itemId] ?? "0"),
  })), [source.lines, qty, price]);

  const total = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  // The client shows the same position the server will enforce, but the server
  // is what decides. This is a preview, not the check.
  const overLines = lines.filter(l => l.quantity > l.approvedQuantity);

  const submit = () => {
    setRefusal(null);
    const fd = new FormData();
    fd.set("tenderId", source.tenderId);
    fd.set("bidId", source.bidId);
    fd.set("requisitionId", source.requisitionId);
    fd.set("vendorId", source.vendorId);
    fd.set("deliveryDays", deliveryDays);
    fd.set("lines", JSON.stringify(lines.filter(l => l.quantity > 0).map(l => ({
      itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName,
      quantity: l.quantity, unitPrice: l.price,
    }))));
    start(async () => {
      const res = await issuePurchaseOrder(fd);
      if (res.ok && res.redirectTo) router.push(res.redirectTo);
      else setRefusal(res);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}

        <Note tone="info" title="Every line is validated against the approved requisition">
          Quantities below are pre-populated from {source.requisitionNo}. Only what the stock
          check routed to purchase was authorised — anything already held in the store was never
          approved for procurement. Editing a quantity above the approved figure will be refused.
        </Note>

        <Card pad={false}>
          <CardHeader
            title="Work order lines"
            subtitle={`Priced from the winning bid on ${source.tenderNo}`}
          />
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Item", "Requisitioned", "From store", "Approved to purchase", "Order qty", "Unit price (৳)", "Line total"].map((h, i) => (
                  <th key={h} className={`border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(l => {
                const over = l.quantity > l.approvedQuantity;
                const under = l.quantity < l.approvedQuantity;
                return (
                  <tr key={l.itemId} className={over ? "bg-danger-50" : ""}>
                    <td className="border-b border-ink-100 px-3 py-2.5">
                      <div className="font-medium text-ink-900">{l.itemName}</div>
                      <div className="font-mono text-[11.5px] text-ink-500">{l.itemCode}</div>
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">
                      {l.requisitionedQuantity}
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">
                      {l.fromStore}
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                      <span className="font-semibold text-brand-700 tabular">{l.approvedQuantity}</span>
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                      <input
                        type="number" min={0}
                        value={qty[l.itemId] ?? ""}
                        onChange={e => setQty(q => ({ ...q, [l.itemId]: e.target.value }))}
                        className={`w-20 rounded-[4px] border px-2 py-1 text-right text-[13.5px] tabular focus:outline-none ${
                          over ? "border-danger-500 bg-white font-semibold text-danger-700" : "border-ink-300"
                        }`}
                      />
                      {over ? (
                        <div className="mt-0.5 text-[11px] font-semibold text-danger-600">
                          +{l.quantity - l.approvedQuantity} over
                        </div>
                      ) : under && l.quantity > 0 ? (
                        <div className="mt-0.5 text-[11px] text-ink-500">partial</div>
                      ) : null}
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                      <input
                        value={price[l.itemId] ?? ""}
                        onChange={e => setPrice(p => ({ ...p, [l.itemId]: e.target.value }))}
                        className="w-28 rounded-[4px] border border-ink-300 px-2 py-1 text-right text-[13.5px] tabular"
                      />
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular">
                      {formatBDT(l.quantity * l.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="px-3 py-3 text-right text-[13px] font-semibold text-ink-700">
                  Work order total
                </td>
                <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-950 tabular">
                  {formatBDT(total)}
                </td>
              </tr>
            </tfoot>
          </table>

          {overLines.length > 0 ? (
            <div className="border-t-2 border-danger-500 bg-danger-50 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
                <div className="text-[13px] text-danger-700">
                  <strong className="font-semibold">
                    {overLines.length} line{overLines.length === 1 ? "" : "s"} exceed the approved quantity.
                  </strong>{" "}
                  Issuing will be refused by the server. The check is not in this screen — it runs
                  inside the transaction that would create the work order.
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
            Work order
          </div>
          <dl className="space-y-2.5 text-[13.5px]">
            {[
              ["Vendor", source.vendorName],
              ["Source tender", source.tenderNo],
              ["Source requisition", source.requisitionNo],
              ["Lines", String(lines.filter(l => l.quantity > 0).length)],
            ].map(([l, v]) => (
              <div key={l} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-ink-600">{l}</dt>
                <dd className="truncate text-right font-medium text-ink-900">{v}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-ink-200 pt-2.5">
              <dt className="text-ink-600">Total</dt>
              <dd className="text-[16px] font-bold text-ink-950"><Money value={total} /></dd>
            </div>
          </dl>

          <div className="mt-4">
            <label htmlFor="dd" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
              Delivery within (working days)
            </label>
            <input
              id="dd" type="number" min={1} value={deliveryDays}
              onChange={e => setDeliveryDays(e.target.value)}
              className="w-full rounded-[5px] border border-ink-300 px-3 py-2 text-[14px]"
            />
          </div>

          <button
            type="button" onClick={submit} disabled={pending || total <= 0}
            className={buttonClass("primary", "mt-4 w-full py-2.5")}
          >
            {pending ? "Issuing…" : "Issue work order"}
            {!pending ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
          </button>
        </Card>
      </div>
    </div>
  );
}
