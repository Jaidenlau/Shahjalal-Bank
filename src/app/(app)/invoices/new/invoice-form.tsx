"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "@/lib/receipt-actions";
import { formatBDT, parseTakaToPoisha, applyBp } from "@/lib/money";
import { Card, CardHeader, Icon, buttonClass, Note } from "@/components/ui";
import { ControlRefusal, type Refusal } from "@/components/control-refusal";

export interface InvoiceSourceLine {
  itemCode: string; itemName: string;
  orderedQuantity: number; receivedQuantity: number; acceptedQuantity: number;
  poUnitPrice: number;
}
export interface InvoiceSource {
  poId: string; poNo: string; grnId: string; grnNo: string;
  vendorName: string; suggestedVendorInvoiceNo: string;
  lines: InvoiceSourceLine[];
}

export function InvoiceForm({ source }: { source: InvoiceSource }) {
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState(source.suggestedVendorInvoiceNo);
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.itemCode, String(l.acceptedQuantity)])),
  );
  const [price, setPrice] = useState<Record<string, string>>(
    Object.fromEntries(source.lines.map(l => [l.itemCode, String(l.poUnitPrice / 100)])),
  );
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const rows = source.lines.map(l => ({
    ...l,
    q: Math.max(0, parseInt(qty[l.itemCode] ?? "0", 10) || 0),
    p: parseTakaToPoisha(price[l.itemCode] ?? "0"),
  }));

  const amount = rows.reduce((s, r) => s + r.q * r.p, 0);
  const vat = applyBp(amount, 1500);
  const ait = applyBp(amount, 300);
  const security = applyBp(amount, 500);
  const net = amount - ait - security;

  // Preview of what the match will conclude.
  const willFail = rows.some(r => r.q !== r.acceptedQuantity || r.p !== r.poUnitPrice);

  const submit = () => {
    setRefusal(null);
    const fd = new FormData();
    fd.set("poId", source.poId);
    fd.set("grnId", source.grnId);
    fd.set("vendorInvoiceNo", vendorInvoiceNo);
    fd.set("vatRateBp", "1500");
    fd.set("aitRateBp", "300");
    fd.set("securityBp", "500");
    fd.set("lines", JSON.stringify(rows.filter(r => r.q > 0).map(r => ({
      itemCode: r.itemCode, quantity: r.q, unitPrice: r.p,
    }))));
    start(async () => {
      const res = await createInvoice(fd);
      if (res.ok && res.redirectTo) router.push(res.redirectTo);
      else setRefusal(res);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}

        <Card pad={false}>
          <CardHeader title="Invoice details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label htmlFor="vin" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
                Vendor&apos;s own invoice number
              </label>
              <input
                id="vin" value={vendorInvoiceNo} onChange={e => setVendorInvoiceNo(e.target.value)}
                className="w-full rounded-[5px] border border-ink-300 px-3 py-2 font-mono text-[13.5px]"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">Matched against</span>
              <div className="rounded-[5px] border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-[12.5px] text-ink-700">
                {source.poNo} · {source.grnNo}
              </div>
            </div>
          </div>
        </Card>

        <Card pad={false}>
          <CardHeader
            title="Invoice lines"
            subtitle="Pre-filled from the accepted quantities. Editing away from them will fail the match."
          />
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Item", "Ordered", "Received", "Accepted", "Invoiced qty", "Unit price (৳)", "Line total"].map((h, i) => (
                  <th key={h} className={`border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const qMismatch = r.q !== r.acceptedQuantity;
                const pMismatch = r.p !== r.poUnitPrice;
                return (
                  <tr key={r.itemCode} className={qMismatch || pMismatch ? "bg-danger-50" : ""}>
                    <td className="border-b border-ink-100 px-3 py-2.5">
                      <div className="font-medium text-ink-900">{r.itemName}</div>
                      <div className="font-mono text-[11.5px] text-ink-500">{r.itemCode}</div>
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">{r.orderedQuantity}</td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 tabular">{r.receivedQuantity}</td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold text-brand-700 tabular">{r.acceptedQuantity}</td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                      <input
                        type="number" min={0} value={qty[r.itemCode] ?? ""}
                        onChange={e => setQty(v => ({ ...v, [r.itemCode]: e.target.value }))}
                        className={`w-20 rounded-[4px] border px-2 py-1 text-right text-[13.5px] tabular ${
                          qMismatch ? "border-danger-500 font-semibold text-danger-700" : "border-ink-300"
                        }`}
                      />
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                      <input
                        value={price[r.itemCode] ?? ""}
                        onChange={e => setPrice(v => ({ ...v, [r.itemCode]: e.target.value }))}
                        className={`w-28 rounded-[4px] border px-2 py-1 text-right text-[13.5px] tabular ${
                          pMismatch ? "border-danger-500 font-semibold text-danger-700" : "border-ink-300"
                        }`}
                      />
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular">
                      {formatBDT(r.q * r.p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={`border-t px-4 py-3 text-[13px] ${willFail ? "border-danger-500 bg-danger-50 text-danger-700" : "border-brand-500/30 bg-brand-50 text-brand-800"}`}>
            <Icon name={willFail ? "alert" : "check"} className="mr-1.5 inline h-4 w-4 align-[-3px]" />
            {willFail
              ? "As entered, the three-way match will fail. The invoice will be recorded and held from payment rather than routed for approval."
              : "As entered, the three-way match will pass and the invoice will route for payment approval."}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
            Payment computation
          </div>
          <dl className="space-y-2 text-[13.5px]">
            {[
              ["Invoice value", amount, ""],
              ["VAT 15% (borne by the Bank)", vat, "text-ink-500"],
              ["Less AIT 3%", -ait, "text-danger-700"],
              ["Less security money 5%", -security, "text-danger-700"],
            ].map(([l, v, cls]) => (
              <div key={l as string} className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">{l as string}</dt>
                <dd className={`font-medium tabular ${cls as string}`}>
                  {(v as number) < 0 ? "−" : ""}{formatBDT(Math.abs(v as number))}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 pt-2">
              <dt className="font-semibold text-ink-700">Net payable</dt>
              <dd className="text-[17px] font-bold text-ink-950 tabular">{formatBDT(net)}</dd>
            </div>
          </dl>

          <button
            type="button" onClick={submit} disabled={pending || amount <= 0 || !vendorInvoiceNo.trim()}
            className={buttonClass("primary", "mt-4 w-full py-2.5")}
          >
            {pending ? "Entering…" : "Enter invoice and run match"}
            {!pending ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
          </button>
        </Card>

        <Note tone="info" title="Budget control">
          On payment, consumption is posted against the cost centre and GL code carried on the
          purchased items, and the committed amount is released.
        </Note>
      </div>
    </div>
  );
}
