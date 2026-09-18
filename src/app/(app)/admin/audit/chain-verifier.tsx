"use client";

import { useState, useTransition } from "react";
import { verifyAuditChain, type VerifyResult } from "@/lib/audit-actions";
import { formatDateTime } from "@/lib/date";
import { Card, Icon, buttonClass } from "@/components/ui";

/**
 * Chain verification.
 *
 * "Tamper evident" is a claim in the bid. This turns it into something the room
 * can watch happen: every record's hash is recomputed and re-linked, and the
 * result reports how many were checked and how long it took. If a record had
 * been altered or removed, it would name the first one that fails.
 */
export function ChainVerifier({ totalRecords }: { totalRecords: number }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card pad={false} className={
      result ? (result.ok ? "border-brand-500/50" : "border-danger-500/60") : "border-ink-200"
    }>
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            result ? (result.ok ? "bg-brand-700 text-white" : "bg-danger-600 text-white") : "bg-ink-100 text-ink-500"
          }`}>
            <Icon name="shield" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink-900">Chain integrity</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-600">
              Each record carries a SHA-256 hash of its own content plus the hash of the record
              before it. Recomputing the chain end to end detects any edit, deletion or
              reordering, and names the first record that fails.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setResult(await verifyAuditChain()))}
          className={buttonClass("primary", "shrink-0 px-5 py-2.5 text-[14px]")}
        >
          <Icon name="shield" className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
          {pending ? "Verifying…" : `Verify all ${totalRecords.toLocaleString("en-US")} records`}
        </button>
      </div>

      {result ? (
        <div className={`border-t px-5 py-4 ${result.ok ? "border-brand-500/30 bg-brand-50" : "border-danger-500/40 bg-danger-50"}`}>
          <div className="flex items-start gap-3">
            <Icon
              name={result.ok ? "check" : "alert"}
              className={`mt-0.5 h-5 w-5 shrink-0 ${result.ok ? "text-brand-700" : "text-danger-600"}`}
            />
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-bold ${result.ok ? "text-brand-800" : "text-danger-700"}`}>
                {result.ok ? "Chain intact" : "Chain broken"}
              </div>
              <p className={`mt-0.5 text-[13.5px] leading-relaxed ${result.ok ? "text-brand-800" : "text-danger-700"}`}>
                {result.reason}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
                {[
                  ["Records checked", result.checked.toLocaleString("en-US")],
                  ["Verified in", `${result.durationMs} ms`],
                  ["Earliest", result.from ? formatDateTime(result.from) : "—"],
                  ["Latest", result.to ? formatDateTime(result.to) : "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt className="text-[11px] uppercase tracking-[0.05em] text-ink-500">{l}</dt>
                    <dd className={`text-[13.5px] font-semibold tabular ${result.ok ? "text-brand-800" : "text-danger-700"}`}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>

              {!result.ok && result.firstBrokenId ? (
                <div className="mt-3 rounded-[5px] border border-danger-500/40 bg-white px-3.5 py-2.5 text-[13px] text-danger-700">
                  First failure at record <strong className="font-mono font-bold">#{result.firstBrokenId}</strong>.
                  Every record from that point forward is no longer trustworthy.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
