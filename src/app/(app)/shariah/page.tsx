import Link from "next/link";
import { requireUser, assertCan, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DECISIONS, structureName } from "@/lib/shariah";
import { formatDate } from "@/lib/date";
import {
  PageHeader, Card, CardHeader, Pill, Note, Stat, Table, Th, Td, Tr, EmptyRow, SectionTitle,
} from "@/components/ui";
import { DecisionPanel, RescreenButton } from "./decision-panel";

export const dynamic = "force-dynamic";

/**
 * SHARIAH GOVERNANCE
 *
 * Beyond Annexure-B. The Bank's specification does not mention Shariah once,
 * because it was written by the IT Division as a general procurement
 * specification. Shahjalal Islami Bank PLC is nonetheless a Shariah-based bank
 * whose procurement is subject to its Shariah Supervisory Committee.
 *
 * The screen is built around one claim, and the claim has to survive contact
 * with the Committee itself: this system holds no fiqh and decides nothing.
 * It applies the Committee's own rules, and routes what they catch back to
 * the Committee for a human decision.
 */

const SEVERITY_TONE = { PROHIBITED: "danger", REVIEW: "warn" } as const;

export default async function ShariahPage() {
  const user = await requireUser();
  assertCan(user, "SHARIAH", "VIEW");

  const canDecide = user.roleCodes.includes("SHARIAH");

  const [rules, flags, reviews, vendors, canteen] = await Promise.all([
    prisma.shariahRule.findMany({ orderBy: { sequence: "asc" } }),
    prisma.shariahFlag.findMany({ include: { rule: true }, orderBy: { raisedAt: "desc" } }),
    prisma.shariahReview.findMany({ orderBy: { decidedAt: "desc" }, take: 12 }),
    prisma.vendor.findMany({ orderBy: { companyName: "asc" } }),
    prisma.canteenOrder.findMany({ orderBy: { orderedAt: "desc" } }),
  ]);

  const open = flags.filter(f => f.status === "OPEN");

  // One queue entry per document, carrying every rule that caught it.
  const queue = new Map<string, { documentType: string; documentId: string; documentLabel: string; flags: string[] }>();
  for (const f of open) {
    const key = `${f.documentType}:${f.documentId}`;
    const entry = queue.get(key) ?? {
      documentType: f.documentType, documentId: f.documentId,
      documentLabel: f.documentLabel, flags: [],
    };
    entry.flags.push(`${f.rule.code} ${f.rule.name}`);
    queue.set(key, entry);
  }
  const queueItems = [...queue.values()];

  // Halal certification position across canteen supply.
  const suppliers = new Map<string, { name: string; cert: string; expiry: Date | null; servings: number }>();
  for (const c of canteen) {
    const s = suppliers.get(c.supplierName) ?? {
      name: c.supplierName || "Not recorded", cert: c.halalCertNo, expiry: c.halalCertExpiry, servings: 0,
    };
    s.servings += 1;
    suppliers.set(c.supplierName, s);
  }

  const activeRules = rules.filter(r => r.isActive).length;

  return (
    <>
      <PageHeader
        eyebrow="Beyond Annexure-B"
        title="Shariah governance"
        subtitle="Procurement screened against the rules the Bank's Shariah Supervisory Committee maintains, with the Committee's decisions recorded against each vendor, contract and work order."
        actions={<RescreenButton />}
      />

      <div className="mb-5">
        <Note tone="sealed" title="What this module does, and what it deliberately does not do">
          Annexure-A and Annexure-B do not mention Shariah at any point. We have built this
          because Shahjalal Islami Bank PLC is a Shariah-based bank and its procurement is
          subject to its Shariah Supervisory Committee like everything else it does.
          <br /><br />
          <strong>This system contains no Shariah rulings of its own and makes none.</strong> It
          holds the rules the Bank&rsquo;s own Committee issues, each carrying the Committee
          minute that created it, applies them mechanically, and refers what they catch back to
          the Committee for a human decision. A flag is a question put to the Committee, never
          an answer given on its behalf. The rule set shipped here is illustrative and would be
          replaced by the Committee&rsquo;s own during implementation.
        </Note>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Committee rules active" value={`${activeRules} of ${rules.length}`} tone="info" />
        <Stat label="Awaiting Committee" value={queueItems.length} tone={queueItems.length ? "warn" : "success"} />
        <Stat label="Decisions recorded" value={reviews.length} tone="success" />
        <Stat label="Vendors screened" value={vendors.filter(v => v.shariahStatus !== "NOT_SCREENED").length} />
      </div>

      <SectionTitle hint="Only a member of the Committee can record a decision. The refusal for anyone else is enforced in the transaction, not the interface.">
        Committee queue
      </SectionTitle>
      <div className="mb-5">
        <DecisionPanel
          items={queueItems}
          canDecide={canDecide}
          actorName={user.fullName}
          actorRole={user.roleName}
        />
      </div>

      <Card pad={false} className="mb-5">
        <CardHeader
          title="Open flags"
          subtitle={`${open.length} document(s) caught by an active rule and not yet ruled on`}
        />
        <Table>
          <thead>
            <tr>
              <Th width="110px">Rule</Th>
              <Th width="120px">Document</Th>
              <Th>Caught</Th>
              <Th width="110px">Severity</Th>
              <Th width="110px">Raised</Th>
            </tr>
          </thead>
          <tbody>
            {open.length === 0 ? (
              <EmptyRow colSpan={5}>No open flags. Every flagged document has a Committee decision against it.</EmptyRow>
            ) : open.map(f => (
              <Tr key={f.id}>
                <Td mono>{f.rule.code}</Td>
                <Td>
                  <div className="font-medium text-ink-900">{f.documentLabel}</div>
                  <div className="text-[12px] text-ink-500">{f.documentType}</div>
                </Td>
                <Td>
                  <div className="text-ink-800">{f.rule.name}</div>
                  <div className="text-[12px] text-ink-500">{f.detail}</div>
                </Td>
                <Td><Pill tone={SEVERITY_TONE[f.severity as keyof typeof SEVERITY_TONE] ?? "warn"}>{f.severity}</Pill></Td>
                <Td>{formatDate(f.raisedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card pad={false} className="mb-5">
        <CardHeader
          title="Committee decisions"
          subtitle="Each decision names the member who made it and the minute it was recorded under"
        />
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th width="140px">Structure</Th>
              <Th width="190px">Decision</Th>
              <Th width="160px">Decided by</Th>
              <Th width="130px">Minute</Th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 ? (
              <EmptyRow colSpan={5}>No decisions recorded yet.</EmptyRow>
            ) : reviews.map(r => {
              const d = DECISIONS[r.decision] ?? { label: r.decision, tone: "muted" as const };
              return (
                <Tr key={r.id}>
                  <Td>
                    <div className="font-medium text-ink-900">{r.documentLabel}</div>
                    {r.conditions ? (
                      <div className="mt-0.5 text-[12px] text-warn-700">Conditions: {r.conditions}</div>
                    ) : null}
                  </Td>
                  <Td>{structureName(r.structure)}</Td>
                  <Td><Pill tone={d.tone === "muted" ? "neutral" : d.tone}>{d.label}</Pill></Td>
                  <Td>
                    <div>{r.decidedByName || "—"}</div>
                    <div className="text-[12px] text-ink-500">{r.decidedAt ? formatDate(r.decidedAt) : ""}</div>
                  </Td>
                  <Td mono>{r.reference}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card pad={false}>
          <CardHeader title="Vendor screening" subtitle="Position against the Committee's prohibited-category rules" />
          <Table>
            <thead>
              <tr><Th>Vendor</Th><Th width="150px">Position</Th><Th width="110px">Screened</Th></tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <Tr key={v.id}>
                  <Td>
                    <div className="font-medium text-ink-900">{v.companyName}</div>
                    {v.shariahNote ? <div className="text-[12px] text-ink-500">{v.shariahNote}</div> : null}
                  </Td>
                  <Td>
                    <Pill tone={
                      v.shariahStatus === "PERMITTED" ? "success"
                        : v.shariahStatus === "PROHIBITED" ? "danger"
                        : v.shariahStatus === "REVIEW_REQUIRED" ? "warn" : "neutral"
                    }>
                      {v.shariahStatus.replace(/_/g, " ")}
                    </Pill>
                  </Td>
                  <Td>{v.shariahScreenedAt ? formatDate(v.shariahScreenedAt) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card pad={false}>
          <CardHeader
            title="Canteen halal certification"
            subtitle="Module 18 supply, against rule SSC-PC-03"
          />
          <Table>
            <thead>
              <tr><Th>Supplier</Th><Th width="150px">Certificate</Th><Th width="120px">Expires</Th><Th width="80px" align="right">Servings</Th></tr>
            </thead>
            <tbody>
              {[...suppliers.values()].map(s => (
                <Tr key={s.name}>
                  <Td className="font-medium text-ink-900">{s.name}</Td>
                  <Td mono>
                    {s.cert ? s.cert : <Pill tone="danger">Not held</Pill>}
                  </Td>
                  <Td>{s.expiry ? formatDate(s.expiry) : "—"}</Td>
                  <Td align="right">{s.servings}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="border-t border-ink-200 px-5 py-3 text-[12.5px] text-ink-600">
            A caterer without current certification cannot be engaged for supply to Bank
            premises until the Committee has ruled.
          </div>
        </Card>
      </div>

      <Card pad={false}>
        <CardHeader
          title="The Committee's rule set"
          subtitle="Maintained by the Shariah Supervisory Committee. Each rule names the minute that created it."
          action={
            can(user, "SHARIAH", "CONFIGURE")
              ? <span className="text-[12.5px] text-ink-500">Editable by the Committee and the administrator</span>
              : undefined
          }
        />
        <Table>
          <thead>
            <tr>
              <Th width="100px">Code</Th>
              <Th>Rule</Th>
              <Th width="180px">Matches</Th>
              <Th width="110px">Disposition</Th>
              <Th width="150px">Committee minute</Th>
              <Th width="80px">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <Tr key={r.id}>
                <Td mono>{r.code}</Td>
                <Td>
                  <div className="font-medium text-ink-900">{r.name}</div>
                  <div className="text-[12px] leading-relaxed text-ink-600">{r.description}</div>
                </Td>
                <Td className="text-[12px] text-ink-600">{r.pattern}</Td>
                <Td>
                  <Pill tone={r.disposition === "PROHIBITED" ? "danger" : r.disposition === "PERMITTED" ? "success" : "warn"}>
                    {r.disposition}
                  </Pill>
                </Td>
                <Td className="text-[12.5px]">{r.reference}</Td>
                <Td><Pill tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Inactive"}</Pill></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <div className="border-t border-ink-200 px-5 py-3 text-[12.5px] text-ink-600">
          Every screening outcome traces to one of these rules, and every rule traces to a
          Committee minute. See the full trail on the{" "}
          <Link href="/admin/audit" className="font-medium text-brand-700 underline">audit screen</Link>.
        </div>
      </Card>
    </>
  );
}
