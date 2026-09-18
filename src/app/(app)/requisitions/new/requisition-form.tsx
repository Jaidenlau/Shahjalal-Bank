"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequisition } from "@/lib/requisition-actions";
import { formatBDT, parseTakaToPoisha } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { REQUISITION_TYPE, label as enumLabel } from "@/lib/enums";
import { Card, CardHeader, Icon, Money, Pill, buttonClass, Note } from "@/components/ui";
import { ControlRefusal, type Refusal } from "@/components/control-refusal";

export interface CatalogueItem {
  id: string; code: string; name: string; category: string; uom: string;
  capexOpex: string; glCode: string; reorderLevel: number; specification: string;
  onHand: number; inTransit: number; underPurchase: number;
  lastPurchasePrice: number; lastPurchaseDate: string | null;
}

interface Line { item: CatalogueItem; quantity: number; unitPrice: number; }

export function RequisitionForm({
  catalogue, departments, branches, defaultDepartmentId, defaultBranchId,
}: {
  catalogue: CatalogueItem[];
  departments: Array<{ id: string; code: string; name: string; costCenterCode: string }>;
  branches: Array<{ id: string; name: string }>;
  defaultDepartmentId: string; defaultBranchId: string;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("PRE_FACTO");
  const [justification, setJustification] = useState("");
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter(i => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, catalogue]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const dept = departments.find(d => d.id === departmentId);

  // The same split the server will compute, previewed as lines are added.
  const split = lines.reduce(
    (acc, l) => {
      const fromStore = Math.min(l.item.onHand, l.quantity);
      acc.fromStore += fromStore;
      acc.toPurchase += l.quantity - fromStore;
      acc.purchaseValue += (l.quantity - fromStore) * l.unitPrice;
      return acc;
    },
    { fromStore: 0, toPurchase: 0, purchaseValue: 0 },
  );

  const choose = (item: CatalogueItem) => {
    setSelected(item);
    setQuery("");
    setPrice(item.lastPurchasePrice ? String(item.lastPurchasePrice / 100) : "");
    setQty("1");
  };

  const addLine = () => {
    if (!selected) return;
    const q = Math.max(1, parseInt(qty, 10) || 1);
    const p = parseTakaToPoisha(price);
    if (p <= 0) return;
    setLines(l => [...l.filter(x => x.item.id !== selected.id), { item: selected, quantity: q, unitPrice: p }]);
    setSelected(null); setQty("1"); setPrice("");
  };

  const submit = () => {
    setRefusal(null);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("type", type);
    fd.set("justification", justification);
    fd.set("departmentId", departmentId);
    fd.set("branchId", branchId);
    fd.set("lines", JSON.stringify(lines.map(l => ({
      itemId: l.item.id, quantity: l.quantity, estimatedUnitPrice: l.unitPrice,
    }))));
    start(async () => {
      const res = await createRequisition(fd);
      if (res.ok && res.redirectTo) router.push(res.redirectTo);
      else setRefusal(res);
    });
  };

  const ready = title.trim() && justification.trim() && lines.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}

        <Card pad={false}>
          <CardHeader title="Requisition details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="title" className="mb-1.5 block text-[13px] font-semibold text-ink-800">Title</label>
              <input
                id="title" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Laptop replacement for branch operations staff"
                className="w-full rounded-[5px] border border-ink-300 px-3 py-2 text-[14px] focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="type" className="mb-1.5 block text-[13px] font-semibold text-ink-800">Requisition type</label>
              <select
                id="type" value={type} onChange={e => setType(e.target.value)}
                className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[14px] focus:border-brand-500"
              >
                {REQUISITION_TYPE.map(t => <option key={t} value={t}>{enumLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="branch" className="mb-1.5 block text-[13px] font-semibold text-ink-800">Branch</label>
              <select
                id="branch" value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[14px] focus:border-brand-500"
              >
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dept" className="mb-1.5 block text-[13px] font-semibold text-ink-800">Division</label>
              <select
                id="dept" value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[14px] focus:border-brand-500"
              >
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">Cost centre</span>
              <div className="rounded-[5px] border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-[13.5px] text-ink-700">
                {dept?.costCenterCode ?? "—"}
              </div>
            </div>
          </div>
        </Card>

        {/* --- Item picker ------------------------------------------------- */}
        <Card pad={false}>
          <CardHeader title="Items" subtitle="Search the catalogue by code, name or category" />
          <div className="border-b border-ink-200 p-5">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search 64 catalogue items — try “laptop”"
                className="w-full rounded-[5px] border border-ink-300 py-2.5 pl-9 pr-3 text-[14px] focus:border-brand-500"
              />
              {matches.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-[6px] border border-ink-200 bg-white shadow-[0_8px_28px_rgba(10,20,16,0.14)]">
                  {matches.map(m => (
                    <li key={m.id}>
                      <button
                        type="button" onClick={() => choose(m)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-ink-900">{m.name}</span>
                          <span className="block font-mono text-[11.5px] text-ink-500">{m.code} · {m.category}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block text-[12px] font-semibold ${m.onHand > 0 ? "text-brand-700" : "text-warn-700"}`}>
                            {m.onHand} in stock
                          </span>
                          <span className="block text-[11px] text-ink-500">{formatBDT(m.lastPurchasePrice)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* The panel that makes the system look like it knows things. */}
            {selected ? (
              <div className="mt-4 rounded-[6px] border border-brand-500/30 bg-brand-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink-900">{selected.name}</div>
                    <div className="font-mono text-[12px] text-ink-600">
                      {selected.code} · {selected.category} · {selected.capexOpex} · GL {selected.glCode}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} className="shrink-0 rounded p-1 text-ink-500 hover:bg-white">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>

                {selected.specification ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">{selected.specification}</p>
                ) : null}

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-brand-500/20 pt-3 sm:grid-cols-4">
                  {[
                    ["Current stock", `${selected.onHand} ${selected.uom}`, selected.onHand <= selected.reorderLevel ? "text-warn-700" : "text-ink-900"],
                    ["In transit", `${selected.inTransit}`, "text-ink-900"],
                    ["Under purchase", `${selected.underPurchase}`, "text-ink-900"],
                    ["Reorder level", `${selected.reorderLevel}`, "text-ink-900"],
                  ].map(([l, v, c]) => (
                    <div key={l}>
                      <dt className="text-[11px] uppercase tracking-[0.05em] text-ink-500">{l}</dt>
                      <dd className={`text-[14px] font-semibold tabular ${c}`}>{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-2 border-t border-brand-500/20 pt-2 text-[12.5px] text-ink-600">
                  Last purchased at <strong className="font-semibold text-ink-900">{formatBDT(selected.lastPurchasePrice)}</strong>
                  {selected.lastPurchaseDate ? <> on {formatDate(selected.lastPurchaseDate)}</> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-24">
                    <label className="mb-1 block text-[12px] font-semibold text-ink-700">Quantity</label>
                    <input
                      type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
                      className="w-full rounded-[5px] border border-ink-300 px-2.5 py-1.5 text-[14px] focus:border-brand-500"
                    />
                  </div>
                  <div className="w-40">
                    <label className="mb-1 block text-[12px] font-semibold text-ink-700">Est. unit price (৳)</label>
                    <input
                      value={price} onChange={e => setPrice(e.target.value)}
                      className="w-full rounded-[5px] border border-ink-300 px-2.5 py-1.5 text-[14px] focus:border-brand-500"
                    />
                  </div>
                  <button type="button" onClick={addLine} className={buttonClass("primary")}>
                    <Icon name="plus" className="h-4 w-4" /> Add line
                  </button>
                  {parseInt(qty, 10) > selected.onHand ? (
                    <span className="text-[12.5px] text-warn-700">
                      {selected.onHand > 0
                        ? `${selected.onHand} from store, ${parseInt(qty, 10) - selected.onHand} to purchase`
                        : "No stock — full quantity to purchase"}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-brand-700">Fully available from store</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {lines.length > 0 ? (
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">Item</th>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">Qty</th>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">Unit price</th>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">Line total</th>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">Fulfilment</th>
                  <th className="border-b border-ink-200 bg-ink-50 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map(l => {
                  const fromStore = Math.min(l.item.onHand, l.quantity);
                  const toPurchase = l.quantity - fromStore;
                  return (
                    <tr key={l.item.id}>
                      <td className="border-b border-ink-100 px-3 py-2.5">
                        <div className="font-medium text-ink-900">{l.item.name}</div>
                        <div className="font-mono text-[11.5px] text-ink-500">{l.item.code}</div>
                      </td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular">{l.quantity}</td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-right tabular"><Money value={l.unitPrice} /></td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold tabular"><Money value={l.quantity * l.unitPrice} /></td>
                      <td className="border-b border-ink-100 px-3 py-2.5">
                        {fromStore > 0 && toPurchase > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            <Pill tone="info">{fromStore} store</Pill>
                            <Pill tone="warn">{toPurchase} purchase</Pill>
                          </span>
                        ) : fromStore > 0 ? <Pill tone="info">From store</Pill> : <Pill tone="warn">To purchase</Pill>}
                      </td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setLines(ls => ls.filter(x => x.item.id !== l.item.id))}
                          className="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                          aria-label="Remove line"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-right text-[13px] font-semibold text-ink-700">Total estimated value</td>
                  <td className="px-3 py-3 text-right text-[15px] font-bold text-ink-950 tabular"><Money value={total} /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="px-5 py-8 text-center text-[13.5px] text-ink-500">
              No items added yet. Search the catalogue above.
            </div>
          )}
        </Card>

        <Card pad={false}>
          <CardHeader title="Justification" subtitle="Recorded against the requisition and visible to every approver" />
          <div className="p-5">
            <textarea
              rows={3} value={justification} onChange={e => setJustification(e.target.value)}
              placeholder="Existing units beyond 5 year replacement cycle, repeated hardware failures affecting counter operations."
              className="w-full resize-y rounded-[5px] border border-ink-300 px-3 py-2 text-[14px] focus:border-brand-500"
            />
          </div>
        </Card>
      </div>

      {/* --- Summary ------------------------------------------------------- */}
      <div className="space-y-5">
        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">Summary</div>
          <dl className="space-y-2.5 text-[13.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-600">Lines</dt>
              <dd className="font-semibold text-ink-900 tabular">{lines.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-600">Total value</dt>
              <dd className="font-semibold text-ink-900"><Money value={total} /></dd>
            </div>
            <div className="border-t border-ink-200 pt-2.5">
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                Projected stock check
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Issue from store</dt>
                <dd className="font-semibold text-info-700 tabular">{split.fromStore}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Route to purchase</dt>
                <dd className="font-semibold text-warn-700 tabular">{split.toPurchase}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <dt className="text-ink-600">Purchase value</dt>
                <dd className="font-semibold text-ink-900"><Money value={split.purchaseValue} /></dd>
              </div>
            </div>
          </dl>

          <button
            type="button" onClick={submit} disabled={!ready || pending}
            className={buttonClass("primary", "mt-4 w-full py-2.5")}
          >
            {pending ? "Submitting…" : "Submit for approval"}
            {!pending ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
          </button>
          {!ready ? (
            <p className="mt-2 text-[12px] text-ink-500">
              A title, a justification and at least one item are required.
            </p>
          ) : null}
        </Card>

        <Note tone="info" title="What happens on submission">
          The system checks stock, splits each line between store issue and purchase,
          checks the cost centre has budget, then routes the requisition through the
          approval workflow active for its value. You will not be able to approve it
          yourself.
        </Note>
      </div>
    </div>
  );
}
