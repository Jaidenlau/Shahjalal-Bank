"use client";

import { Icon } from "./ui";

/** Documents like the comparative statement and the work order go to the
    committee on paper, so printing is a real requirement rather than a nicety. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center justify-center gap-2 rounded-[5px] border border-ink-300 bg-white px-3.5 py-[7px] text-[13.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-50"
    >
      <Icon name="print" className="h-4 w-4" /> {label}
    </button>
  );
}
