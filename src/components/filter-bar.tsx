"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Icon } from "./ui";

export interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * List filters, driven through the query string.
 *
 * State lives in the URL rather than in component state so that a filtered view
 * can be linked to, reloaded, or recovered if the browser is refreshed
 * mid-demo — which matters more than it sounds when someone senior asks to
 * drive and lands somewhere unexpected.
 */
export function FilterBar({
  basePath, current, filters, searchPlaceholder = "Search…",
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  filters: FilterDef[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(current.q ?? "");

  useEffect(() => { setQ(current.q ?? ""); }, [current.q]);

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const activeCount = filters.filter(f => current[f.key]).length + (current.q ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-200 bg-ink-50/60 px-4 py-2.5">
      <form
        onSubmit={e => { e.preventDefault(); push("q", q.trim()); }}
        className="relative flex-1 min-w-[220px]"
      >
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-[5px] border border-ink-300 bg-white py-[6px] pl-8 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
        />
      </form>

      {filters.map(f => (
        <select
          key={f.key}
          value={current[f.key] ?? ""}
          onChange={e => push(f.key, e.target.value)}
          className="rounded-[5px] border border-ink-300 bg-white px-2.5 py-[6px] text-[13px] text-ink-800 focus:border-brand-500"
        >
          <option value="">All {f.label.toLowerCase()}</option>
          {f.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {activeCount > 0 ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="inline-flex items-center gap-1 rounded-[5px] border border-ink-300 bg-white px-2.5 py-[6px] text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
          Clear {activeCount}
        </button>
      ) : null}
    </div>
  );
}
