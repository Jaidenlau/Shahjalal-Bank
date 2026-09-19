import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { runIntegrityScan, DETECTORS, THRESHOLDS } from "@/lib/integrity";
import type { DetectorCode, Severity } from "@/lib/integrity";
import { formatBDT } from "@/lib/money";
import { formatDateTime } from "@/lib/date";
import {
  PageHeader, Card, CardHeader, Pill, Note, Stat, Table, Th, Td, Tr, EmptyRow, SectionTitle, Icon,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * PROCUREMENT INTEGRITY
 *
 * Beyond Annexure-B. The Bank's specification asks the system to record
 * procurement; it never asks it to examine procurement. This is the only screen
 * in the build that can return money rather than save time, which makes it the
 * answer to "why are you not the cheapest bid".
 *
 * Tone matters more than the arithmetic here. Every finding is written as a
 * question with an innocent explanation available, because a tool that calls
 * the Bank's own staff fraudsters is a tool nobody will open twice.
 */

const SEV_TONE: Record<Severity, "danger" | "warn" | "info"> = {
  HIGH: "danger", MEDIUM: "warn", LOW: "info",
};

export default async function IntegrityPage() {
  const user = await requireUser();
  assertCan(user, "INTEGRITY", "VIEW");

  const report = await runIntegrityScan();
  const high = report.findings.filter(f => f.severity === "HIGH").length;

  return (
    <>
      <PageHeader
        eyebrow="Beyond Annexure-B"
        title="Procurement integrity"
        subtitle="Seven continuous tests over procurement the Bank already records. No new data capture, no extra work for anyone, no integration."
        meta={<span className="text-[12.5px] text-ink-500">Last run {formatDateTime(report.ranAt)}</span>}
      />

      <div className="mb-5">
        <Note tone="sealed" title="What this is, and the tone it is deliberately written in">
          Annexure-B asks this system to <em>record</em> procurement. It never asks it to
          <em> examine</em> procurement. These are the tests an internal audit function would run
          by hand over a spreadsheet twice a year, run continuously instead.
          <br /><br />
          <strong>Every finding here is a question, not an accusation.</strong> Each one has an
          innocent explanation available and the wording says so. Purchases get split for real
          operational reasons, a concentrated supplier may simply be the only competent one, and
          in a small market honest bids do land close together. The system&rsquo;s job is to put
          the question in front of a person with the evidence attached — not to decide.
        </Note>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open findings" value={report.findings.length} tone={report.findings.length ? "warn" : "success"} />
        <Stat label="High severity" value={high} tone={high ? "danger" : "success"} />
        <Stat label="Value under question" value={formatBDT(report.exposure)} tone="info"
          sub="Excludes concentration, which counts money already listed elsewhere" />
        <Stat label="Tests running" value={`${Object.keys(DETECTORS).length} of ${Object.keys(DETECTORS).length}`} tone="success" />
      </div>

      <SectionTitle hint="Highest severity first, then by value.">Findings</SectionTitle>

      <div className="mb-6 space-y-4">
        {report.findings.length === 0 ? (
          <Card>
            <div className="flex items-center gap-3 text-[13.5px] text-ink-600">
              <Icon name="check" className="h-5 w-5 text-brand-700" />
              No findings. Every test ran and none of them matched.
            </div>
          </Card>
        ) : report.findings.map((f, i) => {
          const def = DETECTORS[f.code as DetectorCode];
          return (
            <Card key={`${f.code}-${i}`} pad={false}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Pill tone={SEV_TONE[f.severity]}>{f.severity}</Pill>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                      {def.name}
                    </span>
                  </div>
                  <h2 className="text-[15px] font-semibold text-ink-900">{f.subject}</h2>
                </div>
                {f.amount ? (
                  <div className="shrink-0 text-right">
                    <div className="text-[11.5px] uppercase tracking-[0.06em] text-ink-500">Value</div>
                    <div className="text-[16px] font-bold text-ink-950">{formatBDT(f.amount)}</div>
                  </div>
                ) : null}
              </div>

              <div className="px-5 py-4">
                <p className="mb-3 max-w-4xl text-[13.5px] leading-relaxed text-ink-700">{f.detail}</p>

                <div className="mb-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  {f.evidence.map(e => (
                    <div key={e.label} className="border-b border-ink-100 pb-1.5">
                      <div className="text-[11px] uppercase tracking-[0.05em] text-ink-500">{e.label}</div>
                      <div className="text-[13px] font-medium text-ink-900">{e.value}</div>
                    </div>
                  ))}
                </div>

                {f.references.length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] uppercase tracking-[0.05em] text-ink-500">Documents</span>
                    {f.references.map(r => (
                      <span key={r} className="rounded-[4px] bg-ink-100 px-2 py-0.5 font-mono text-[12px] text-ink-700">{r}</span>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-[5px] bg-ink-50 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
                  <strong>Test:</strong> {def.question}{" "}
                  <strong>Threshold:</strong> {def.threshold}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card pad={false}>
        <CardHeader
          title="The seven tests"
          subtitle="Thresholds shown are defaults. In an implementation the Bank sets them against its own procurement policy."
        />
        <Table>
          <thead>
            <tr>
              <Th width="160px">Test</Th>
              <Th>What it asks</Th>
              <Th>Why a bank cares</Th>
              <Th width="210px">Threshold</Th>
              <Th width="70px" align="right">Found</Th>
            </tr>
          </thead>
          <tbody>
            {Object.values(DETECTORS).map(d => (
              <Tr key={d.code}>
                <Td className="font-medium text-ink-900">{d.name}</Td>
                <Td className="text-[12.5px] leading-snug text-ink-700">{d.question}</Td>
                <Td className="text-[12.5px] leading-snug text-ink-600">{d.matters}</Td>
                <Td className="text-[12px] leading-snug text-ink-600">{d.threshold}</Td>
                <Td align="right">
                  {report.counts[d.code] ? (
                    <Pill tone="warn">{report.counts[d.code]}</Pill>
                  ) : (
                    <span className="text-ink-400">0</span>
                  )}
                </Td>
              </Tr>
            ))}
            {Object.keys(DETECTORS).length === 0 ? <EmptyRow colSpan={5}>No tests configured.</EmptyRow> : null}
          </tbody>
        </Table>
        <div className="border-t border-ink-200 px-5 py-3 text-[12.5px] leading-relaxed text-ink-600">
          The approval-limit test runs at {formatBDT(THRESHOLDS.splitApprovalLimit)} over a{" "}
          {THRESHOLDS.splitWindowDays}-day window, matching the threshold configured in the{" "}
          <Link href="/admin/workflows" className="font-medium text-brand-700 underline">workflow builder</Link>.
          Change it there and this screen follows.
        </div>
      </Card>
    </>
  );
}
