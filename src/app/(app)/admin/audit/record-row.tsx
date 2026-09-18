"use client";

import { useState, useTransition } from "react";
import { explainRecord } from "@/lib/audit-actions";
import { Icon, Pill } from "@/components/ui";

export interface AuditRecord {
  id: number;
  timestamp: string;
  timestampLabel: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityLabel: string;
  performedByName: string;
  performedByRole: string;
  ipAddress: string;
  hash: string;
  previousHash: string;
  diff: Array<{ field: string; before: string; after: string }>;
}

const ACTION_TONE = (action: string) => {
  if (/REJECT|DISQUALIF|FAILED|BLOCK/.test(action)) return "danger" as const;
  if (/APPROVE|QUALIFIED|PASSED|COMPLETED|PAID|AWARDED/.test(action)) return "success" as const;
  if (/OPENED|UNSEAL|SIGNED_IN|PUBLISHED/.test(action)) return "info" as const;
  if (/SEALED|SUBMITTED|VERSIONED/.test(action)) return "warn" as const;
  return "neutral" as const;
};

/**
 * One audit record, expandable.
 *
 * The expanded view shows the field-level diff and the cryptographic working:
 * the exact bytes that were hashed, the previous record's hash, and whether
 * recomputing produces the stored digest. That is the answer to "how do I know
 * the verification is real" — it can be checked by hand.
 */
export function RecordRow({ record }: { record: AuditRecord }) {
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState<Awaited<ReturnType<typeof explainRecord>> | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    setOpen(o => !o);
    if (!proof) start(async () => setProof(await explainRecord(record.id)));
  };

  return (
    <>
      <tr className="cursor-pointer transition-colors hover:bg-ink-50/70" onClick={toggle}>
        <td className="border-b border-ink-100 px-3 py-2 text-right font-mono text-[12px] text-ink-400">
          {record.id}
        </td>
        <td className="border-b border-ink-100 px-3 py-2 whitespace-nowrap text-[12.5px] text-ink-600">
          {record.timestampLabel}
        </td>
        <td className="border-b border-ink-100 px-3 py-2">
          <Pill tone={ACTION_TONE(record.action)}>{record.actionLabel}</Pill>
        </td>
        <td className="border-b border-ink-100 px-3 py-2">
          <span className="font-mono text-[12.5px] font-medium text-ink-800">{record.entityLabel}</span>
          <span className="ml-2 text-[11.5px] text-ink-400">{record.entityType}</span>
        </td>
        <td className="border-b border-ink-100 px-3 py-2 whitespace-nowrap text-[13px]">
          {record.performedByName}
        </td>
        <td className="border-b border-ink-100 px-3 py-2 whitespace-nowrap text-[12.5px] text-ink-600">
          {record.performedByRole}
        </td>
        <td className="border-b border-ink-100 px-3 py-2 font-mono text-[11.5px] text-ink-500">
          {record.ipAddress}
        </td>
        <td className="border-b border-ink-100 px-2 py-2 text-right">
          <Icon name={open ? "chevronDown" : "chevronRight"} className="h-3.5 w-3.5 text-ink-400" />
        </td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={8} className="border-b border-ink-200 bg-ink-50 px-5 py-4">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* What changed */}
              <div>
                <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-500">
                  What changed
                </div>
                {record.diff.length === 0 ? (
                  <p className="text-[13px] text-ink-500">
                    No field-level change recorded — this action registered an event rather than
                    altering a value.
                  </p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-500">
                        <th className="pb-1 text-left font-semibold">Field</th>
                        <th className="pb-1 text-left font-semibold">Before</th>
                        <th className="pb-1 text-left font-semibold">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.diff.map(d => (
                        <tr key={d.field} className="border-t border-ink-200">
                          <td className="py-1.5 pr-3 align-top font-medium text-ink-700">{d.field}</td>
                          <td className="py-1.5 pr-3 align-top text-danger-700">
                            <span className="break-words">{d.before}</span>
                          </td>
                          <td className="py-1.5 align-top text-brand-700">
                            <span className="break-words">{d.after}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Cryptographic working */}
              <div>
                <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-500">
                  Integrity proof
                </div>
                {pending || !proof ? (
                  <p className="text-[13px] text-ink-500">Recomputing…</p>
                ) : (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 rounded-[5px] px-3 py-2 text-[13px] font-semibold ${
                      proof.matches ? "bg-brand-100 text-brand-800" : "bg-danger-100 text-danger-700"
                    }`}>
                      <Icon name={proof.matches ? "check" : "alert"} className="h-4 w-4" />
                      {proof.matches
                        ? "Recomputed hash matches the stored value"
                        : "Recomputed hash does NOT match — this record has been altered"}
                    </div>

                    <dl className="space-y-1.5 text-[11.5px]">
                      <div>
                        <dt className="text-ink-500">Previous record hash</dt>
                        <dd className="break-all font-mono text-ink-700">{proof.previousHash}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">Hashed content</dt>
                        <dd className="max-h-[110px] overflow-y-auto break-all rounded-[4px] bg-white px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-600">
                          {proof.digestInput}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">SHA-256 of the above</dt>
                        <dd className="break-all font-mono font-semibold text-ink-900">{proof.recomputed}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">Stored on this record</dt>
                        <dd className="break-all font-mono text-ink-700">{proof.storedHash}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
