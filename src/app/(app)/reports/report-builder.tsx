"use client";

import { useState, useTransition, useEffect } from "react";
import { runReport, exportCsv, filterOptions, type ReportResult } from "@/lib/report-actions";
import type { EntityDef } from "@/lib/report-schema";
import { formatBDT } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { Card, CardHeader, Icon, Pill, buttonClass } from "@/components/ui";

export function ReportBuilder({
  entities, canExport,
}: { entities: EntityDef[]; canExport: boolean }) {
  const [entityKey, setEntityKey] = useState(entities[0]!.key);
  const entity = entities.find(e => e.key === entityKey)!;
  const [columns, setColumns] = useState<string[]>(entity.fields.slice(0, 6).map(f => f.key));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [pending, start] = useTransition();

  // Reset selections when the entity changes.
  useEffect(() => {
    setColumns(entity.fields.slice(0, 6).map(f => f.key));
    setFilters({});
    setResult(null);
    // Load real distinct values for each filterable field.
    Promise.all(
      entity.fields.filter(f => f.filterable).map(async f => [f.key, await filterOptions(entity.key, f.key)] as const),
    ).then(pairs => setOptions(Object.fromEntries(pairs))).catch(() => setOptions({}));
  }, [entityKey, entity]);

  const run = () => start(async () => setResult(await runReport(entityKey, columns, filters)));

  const download = () => start(async () => {
    const csv = await exportCsv(entityKey, columns, filters);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityKey}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const cell = (value: unknown, type: string) => {
    if (value === null || value === undefined || value === "") return <span className="text-ink-300">—</span>;
    if (type === "money") return <span className="tabular">{formatBDT(Number(value))}</span>;
    if (type === "date") return <span className="whitespace-nowrap">{formatDate(String(value))}</span>;
    if (type === "status") return <Pill status={String(value)} />;
    if (type === "number") return <span className="tabular">{String(value)}</span>;
    return String(value);
  };

  return (
    <Card pad={false} className="border-brand-500/30">
      <CardHeader
        className="bg-brand-50"
        title={<span className="flex items-center gap-2"><Icon name="settings" className="h-4 w-4 text-brand-700" /> Report builder</span>}
        subtitle="Pick an entity, choose columns, apply filters, run and export"
      />

      <div className="grid gap-5 border-b border-ink-200 p-5 lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
            1. Entity
          </label>
          <select
            value={entityKey} onChange={e => setEntityKey(e.target.value)}
            className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[14px] focus:border-brand-500"
          >
            {entities.map(e => <option key={e.key} value={e.key}>{e.label} — {e.module}</option>)}
          </select>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-500">{entity.description}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
            2. Columns ({columns.length} of {entity.fields.length})
          </label>
          <div className="max-h-[170px] space-y-0.5 overflow-y-auto rounded-[5px] border border-ink-300 p-2">
            {entity.fields.map(f => (
              <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-1.5 py-1 text-[13px] hover:bg-ink-50">
                <input
                  type="checkbox" checked={columns.includes(f.key)}
                  onChange={e => setColumns(c => e.target.checked ? [...c, f.key] : c.filter(x => x !== f.key))}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-ink-800">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
            3. Filters
          </label>
          <div className="space-y-2">
            {entity.fields.filter(f => f.filterable).map(f => (
              <div key={f.key}>
                <span className="mb-0.5 block text-[11.5px] text-ink-600">{f.label}</span>
                <select
                  value={filters[f.key] ?? ""}
                  onChange={e => setFilters(v => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  <option value="">All</option>
                  {(options[f.key] ?? []).map(o => (
                    <option key={o} value={o}>{f.type === "status" ? enumLabel(o) : o}</option>
                  ))}
                </select>
              </div>
            ))}
            {entity.fields.every(f => !f.filterable) ? (
              <p className="text-[12.5px] text-ink-500">No filters on this entity.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-50 px-5 py-3">
        <button type="button" onClick={run} disabled={pending || columns.length === 0}
          className={buttonClass("primary")}>
          <Icon name="chart" className="h-4 w-4" />
          {pending ? "Running…" : "Run report"}
        </button>
        {result && canExport ? (
          <button type="button" onClick={download} disabled={pending} className={buttonClass("secondary")}>
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </button>
        ) : null}
        {result && !canExport ? (
          <span className="text-[12.5px] text-ink-500">
            Your role permits viewing this report but not exporting it.
          </span>
        ) : null}
        {result ? (
          <span className="ml-auto text-[12.5px] text-ink-600">
            <strong className="font-semibold text-ink-900">{result.total}</strong> rows
            {result.filterSummary.length ? ` · ${result.filterSummary.join(" · ")}` : ""}
          </span>
        ) : null}
      </div>

      {result ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {result.columns.map(c => (
                  <th key={c.key} className={`border-b border-ink-200 bg-ink-50 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-600 ${
                    c.type === "money" || c.type === "number" ? "text-right" : "text-left"
                  }`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={result.columns.length} className="px-3 py-10 text-center text-ink-500">
                    No rows match these filters.
                  </td>
                </tr>
              ) : result.rows.slice(0, 200).map((r, i) => (
                <tr key={i} className="hover:bg-ink-50/70">
                  {result.columns.map(c => (
                    <td key={c.key} className={`border-b border-ink-100 px-3 py-2 ${
                      c.type === "money" || c.type === "number" ? "text-right" : "text-left"
                    }`}>
                      {cell(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {Object.keys(result.moneyTotals).length > 0 && result.rows.length > 0 ? (
              <tfoot>
                <tr>
                  {result.columns.map((c, i) => (
                    <td key={c.key} className="border-t-2 border-ink-300 px-3 py-2.5 text-right text-[13px] font-bold text-ink-950">
                      {i === 0 ? <span className="float-left font-semibold text-ink-700">Total</span> : null}
                      {c.type === "money" ? <span className="tabular">{formatBDT(result.moneyTotals[c.key] ?? 0)}</span> : null}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
          {result.rows.length > 200 ? (
            <div className="border-t border-ink-200 px-4 py-2.5 text-[12.5px] text-ink-500">
              Showing the first 200 of {result.total} rows. Export to CSV for the full set.
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-[13.5px] text-ink-500">
          Choose an entity and columns, then run the report.
        </p>
      )}
    </Card>
  );
}
