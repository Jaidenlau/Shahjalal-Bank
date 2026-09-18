"use client";

import { useState } from "react";
import { Icon } from "./ui";

export interface Refusal {
  error?: string;
  control?: string;
  layer?: string;
  detail?: Record<string, string | number>;
  reference?: string;
}

const LAYER_TEXT: Record<string, string> = {
  MUTATION: "Enforced in the write path. The refusal happens inside the transaction that would have made the change, so there is no route around it.",
  DATA_ACCESS: "Enforced in the data access layer. The information is not read out of the database at all, rather than being read and then hidden.",
  WORKFLOW_ENGINE: "Enforced by the workflow engine against the rules configured for this document type.",
  PERMISSION: "Enforced server side against this user's roles. Interface controls are filtered to match, but the check that matters is this one.",
};

const LAYER_LABEL: Record<string, string> = {
  MUTATION: "Mutation",
  DATA_ACCESS: "Data access layer",
  WORKFLOW_ENGINE: "Workflow engine",
  PERMISSION: "Permission check",
};

/**
 * How a refused action is presented.
 *
 * Showing a control fire is more convincing than describing it, so this is
 * deliberately prominent rather than a toast that disappears. The expandable
 * panel names the control, the layer it is enforced at and the clause it comes
 * from — which is what a bank IT reviewer will want, without cluttering the
 * screen for everyone else.
 */
export function ControlRefusal({ refusal, onDismiss }: { refusal: Refusal; onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!refusal?.error) return null;

  const isControl = Boolean(refusal.control);
  const detail = refusal.detail ?? {};

  return (
    <div
      role="alert"
      className={`overflow-hidden rounded-[6px] border-2 ${
        isControl ? "border-danger-600 bg-danger-50" : "border-ink-300 bg-ink-50"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isControl ? "bg-danger-600 text-white" : "bg-ink-400 text-white"
        }`}>
          <Icon name={isControl ? "shield" : "alert"} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          {isControl ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-[3px] bg-danger-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
                Blocked by {refusal.control}
              </span>
              {refusal.layer ? (
                <span className="text-[11.5px] font-semibold text-danger-700">
                  {LAYER_LABEL[refusal.layer] ?? refusal.layer}
                </span>
              ) : null}
            </div>
          ) : null}

          <p className={`text-[14.5px] font-semibold leading-snug ${isControl ? "text-danger-700" : "text-ink-800"}`}>
            {refusal.error}
          </p>

          {Object.keys(detail).length > 0 ? (
            <dl className="mt-2.5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {Object.entries(detail).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-danger-500/15 py-0.5">
                  <dt className="text-[12px] text-danger-700/75">{humanise(k)}</dt>
                  <dd className="text-[12.5px] font-semibold text-danger-700 tabular">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {isControl ? (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-danger-700 underline-offset-2 hover:underline"
            >
              <Icon name={open ? "chevronDown" : "chevronRight"} className="h-3.5 w-3.5" />
              {open ? "Hide" : "Why was this blocked?"}
            </button>
          ) : null}

          {open ? (
            <div className="mt-2.5 rounded-[5px] border border-danger-500/25 bg-white px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-ink-700">
                {LAYER_TEXT[refusal.layer ?? ""] ?? ""}
              </p>
              {refusal.reference ? (
                <p className="mt-2 border-t border-ink-200 pt-2 text-[12px] text-ink-600">
                  <span className="font-semibold">Required by:</span> {refusal.reference}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {onDismiss ? (
          <button
            type="button" onClick={onDismiss}
            className={`shrink-0 rounded p-1 ${isControl ? "text-danger-600 hover:bg-danger-100" : "text-ink-500 hover:bg-ink-200"}`}
            aria-label="Dismiss"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SuccessBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-[6px] border border-brand-500/40 bg-brand-50 px-4 py-3">
      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
      <p className="flex-1 text-[14px] font-medium text-brand-800">{message}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 text-brand-700 hover:bg-brand-100">
          <Icon name="x" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function humanise(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, c => c.toUpperCase());
}
