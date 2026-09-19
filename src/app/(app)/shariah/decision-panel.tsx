"use client";

import { useState, useTransition } from "react";
import { decideAction, rescreenAction, type ActionResult } from "@/lib/shariah-actions";
import { STRUCTURES } from "@/lib/shariah-types";
import { Card, Icon, Note, buttonClass } from "@/components/ui";

/**
 * The Committee's decision panel.
 *
 * Shown to everyone who can see this screen, including people who cannot use
 * it. That is deliberate: the refusal a non-member gets when they press it is
 * the control, and a control nobody can see being enforced is a claim rather
 * than a demonstration.
 */
export function DecisionPanel({
  items, canDecide, actorName, actorRole,
}: {
  items: Array<{ documentType: string; documentId: string; documentLabel: string; flags: string[] }>;
  canDecide: boolean;
  actorName: string;
  actorRole: string;
}) {
  const [selected, setSelected] = useState(items[0]?.documentId ?? "");
  const [decision, setDecision] = useState<"APPROVED" | "APPROVED_WITH_CONDITIONS" | "REFERRED_BACK">("APPROVED");
  const [structure, setStructure] = useState("NOT_APPLICABLE");
  const [conditions, setConditions] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const item = items.find(i => i.documentId === selected);

  if (items.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-[13.5px] text-ink-600">
          <Icon name="check" className="h-5 w-5 text-brand-700" />
          Nothing is awaiting a Committee decision. Every flagged document has been ruled on.
        </div>
      </Card>
    );
  }

  return (
    <Card pad={false}>
      <div className="border-b border-ink-200 px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink-900">Record a Committee decision</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-600">
          The decision is recorded against the document permanently and written to the audit
          trail under the name of the member who made it.
        </p>
      </div>

      <form
        action={(fd: FormData) => start(async () => setResult(await decideAction(fd)))}
        className="space-y-4 px-5 py-4"
      >
        <input type="hidden" name="documentType" value={item?.documentType ?? ""} />
        <input type="hidden" name="documentId" value={item?.documentId ?? ""} />
        <input type="hidden" name="documentLabel" value={item?.documentLabel ?? ""} />

        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
            Document awaiting decision
          </label>
          <select
            value={selected}
            onChange={e => { setSelected(e.target.value); setResult(null); }}
            className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[13.5px]"
          >
            {items.map(i => (
              <option key={i.documentId} value={i.documentId}>
                {i.documentType} — {i.documentLabel}
              </option>
            ))}
          </select>
          {item ? (
            <p className="mt-1.5 text-[12.5px] text-ink-600">
              Raised by: {item.flags.join("; ")}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
              Contract structure
            </label>
            <select
              name="structure"
              value={structure}
              onChange={e => setStructure(e.target.value)}
              className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[13.5px]"
            >
              {STRUCTURES.filter(s => s.code !== "NOT_ASSESSED").map(s => (
                <option key={s.code} value={s.code}>{s.name} — {s.note}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
              Decision
            </label>
            <select
              name="decision"
              value={decision}
              onChange={e => setDecision(e.target.value as typeof decision)}
              className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[13.5px]"
            >
              <option value="APPROVED">Approved</option>
              <option value="APPROVED_WITH_CONDITIONS">Approved with conditions</option>
              <option value="REFERRED_BACK">Referred back</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
              Conditions {decision === "APPROVED_WITH_CONDITIONS" ? "(required)" : "(optional)"}
            </label>
            <input
              name="conditions"
              value={conditions}
              onChange={e => setConditions(e.target.value)}
              placeholder="What the supplier is bound to"
              className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 text-[13.5px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600">
              Committee minute reference
            </label>
            <input
              name="reference"
              defaultValue={`SSC/2026/${String(200 + items.length).padStart(4, "0")}`}
              className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2 font-mono text-[12.5px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" disabled={pending} className={buttonClass("primary", "px-5 py-2.5 text-[14px]")}>
            <Icon name="shield" className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
            {pending ? "Recording…" : canDecide ? "Record Committee decision" : "Attempt to record decision"}
          </button>
          {!canDecide ? (
            <span className="text-[12.5px] text-ink-600">
              You are signed in as {actorName} ({actorRole}), who does not sit on the Committee.
            </span>
          ) : null}
        </div>
      </form>

      {result ? (
        <div className="border-t border-ink-200 px-5 py-4" role="alert">
          <Note
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? "Decision recorded" : "Refused"}
            reference={result.control ? `Control: ${result.control} · Enforced at: ${result.layer}` : undefined}
          >
            {result.message}
          </Note>
        </div>
      ) : null}
    </Card>
  );
}

export function RescreenButton() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await rescreenAction()))}
        className={buttonClass("secondary", "px-4 py-2 text-[13.5px]")}
      >
        <Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
        {pending ? "Screening…" : "Re-run screening"}
      </button>
      {result ? <span className="text-[12.5px] text-ink-700" role="status">{result.message}</span> : null}
    </div>
  );
}
