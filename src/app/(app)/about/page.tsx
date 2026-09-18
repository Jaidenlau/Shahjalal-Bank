import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULES } from "@/lib/modules";
import { PageHeader, Card, CardHeader, Pill, Icon, Note, Stat, Table, Th, Td, Tr } from "@/components/ui";
import { BrandLockup, JvCredit } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Module coverage and build honesty.
 *
 * This page exists so nobody has to guess what is deep and what is furnished.
 * If the bank's IT division asks "which of the 25 are actually working", the
 * answer is on a screen rather than in someone's memory, and it is the same
 * answer whoever is asked.
 */

type Depth = "working" | "register" | "production";

interface Coverage {
  no: number;
  name: string;
  depth: Depth;
  href?: string;
  note: string;
}

const COVERAGE: Coverage[] = [
  { no: 1, name: "Core Platform", depth: "working", href: "/admin/workflows",
    note: "Master data, users and roles, the workflow engine, notifications, audit trail and dashboards. Everything else runs on it." },
  { no: 2, name: "Requisition Management", depth: "working", href: "/requisitions",
    note: "All four requisition types, stock check with store/purchase routing, CAPEX/OPEX and GL tagging, maker-checker approval." },
  { no: 3, name: "e-Procurement Management", depth: "working", href: "/tenders",
    note: "Method selection, committee configuration, document preparation, approval before publication, two-envelope opening, comparative statement, work order with quantity matching." },
  { no: 4, name: "Repair and Maintenance Management", depth: "register", href: "/assets",
    note: "Asset register with depreciation, specification and location, and work order history." },
  { no: 5, name: "e-Auction Management", depth: "register", href: "/auctions",
    note: "Auction lots with anonymous bidding and timed closing. Fee collection depends on the Bank's payment service provider." },
  { no: 6, name: "Vendor Enlistment Portal", depth: "working", href: "/vendors",
    note: "Registration, document verification, enlistment approval, licence expiry tracking, and vendor self-service through the external portal." },
  { no: 7, name: "Tender / Bid Submission Module", depth: "working", href: "/vendor",
    note: "In the external vendor portal: tender visibility, document download, intention to bid, and two-part sealed submission." },
  { no: 8, name: "Electronic Dashboard — Tender status", depth: "working", href: "/dashboards?view=tender",
    note: "Every field named in Annexure-B, with filters and summary statistics." },
  { no: 9, name: "Electronic Dashboard — Requisition status", depth: "working", href: "/dashboards?view=requisition",
    note: "Initiator, maker and checker, category and sub-category, CAPEX/OPEX, GL and cost centre tagging." },
  { no: 10, name: "Electronic Dashboard — Work order status", depth: "working", href: "/dashboards?view=work-order",
    note: "Work order traced back through tender to requisition, with dates and values." },
  { no: 11, name: "Dispatch Management", depth: "register", href: "/dispatch",
    note: "Gate pass, dispatch, delivery confirmation, proof of delivery, and delay and damage reporting." },
  { no: 12, name: "Building Management System", depth: "register", href: "/building",
    note: "Utility consumption and preventive maintenance schedules. Direct hardware integration depends on existing site equipment." },
  { no: 13, name: "Interior and Civil Works Management", depth: "register", href: "/civil-works",
    note: "Projects with BOQ value, contractor, site progress and defect liability period." },
  { no: 14, name: "Medical Supplies Management", depth: "register", href: "/medical",
    note: "Medical inventory with batch and expiry. Prescription records need additional privacy handling." },
  { no: 15, name: "Insurance Management", depth: "register", href: "/insurance",
    note: "Vehicle, locker, vault, property and fidelity cover, with renewals and claims." },
  { no: 16, name: "Transport Management", depth: "register", href: "/transport",
    note: "Vehicle register, fuel and trip logs, and tax token, fitness and insurance expiry tracking." },
  { no: 17, name: "Visitor Management", depth: "register", href: "/visitors",
    note: "Registration, appointments, host, badge issue, in/out times and blacklist." },
  { no: 18, name: "Canteen Management", depth: "register", href: "/canteen",
    note: "Pre-orders by serving slot. Payment collection depends on the Bank's payment service provider." },
  { no: 19, name: "Warehouse Management", depth: "register", href: "/warehouses",
    note: "Multiple stores with capacity, holding and value." },
  { no: 20, name: "Contract Management", depth: "register", href: "/contracts",
    note: "Register with validity, performance security, retention money, SLA terms and expiry reminders." },
  { no: 21, name: "Inventory Management", depth: "working", href: "/grn",
    note: "Goods receipt against a work order, full or partial, accepted and rejected quantities, challan, stock movement and initiator notification." },
  { no: 22, name: "Invoicing and Payment", depth: "working", href: "/invoices",
    note: "Invoice entry, three-way match, VAT and AIT computation, security money retention, approval workflow, payment and budget consumption." },
  { no: 23, name: "Reports", depth: "working", href: "/reports",
    note: "Pre-built reports across the named dimensions, plus a self-service builder with CSV export." },
  { no: 24, name: "Administrator and Other Functional", depth: "working", href: "/admin/users",
    note: "User management, the role and permission matrix, and work order amendment." },
  { no: 25, name: "Audit Trail Log", depth: "working", href: "/admin/audit",
    note: "Append-only, hash-chained activity log with field-level diffs and end-to-end integrity verification." },
];

const CUSTOMISATION = [
  ["Payment gateway integration", "Modules 3, 5, 6, 7, 18 and 24", "Depends on the payment service provider the Bank selects."],
  ["Real-time cross-vendor price comparison", "Module 2", "Requires live or periodically synced vendor price feeds."],
  ["Building management hardware integration", "Module 12", "Depends on the protocol and API support of equipment already installed at each site."],
  ["CCTV operational status reporting", "Module 12", "Answered as workaround available; depends on the existing CCTV system's API."],
  ["Medical prescription records", "Module 14", "Needs additional data-privacy controls configured during implementation."],
  ["Spare parts history granularity", "Module 22", "To be finalised against the Bank's asset categorisation."],
];

export default async function AboutPage() {
  await requireUser();
  const [auditCount, tables] = await Promise.all([
    prisma.auditLog.count(),
    Promise.all([
      prisma.requisition.count(), prisma.tender.count(), prisma.bid.count(),
      prisma.purchaseOrder.count(), prisma.invoice.count(), prisma.vendor.count(),
    ]),
  ]);

  const working = COVERAGE.filter(c => c.depth === "working").length;
  const registers = COVERAGE.filter(c => c.depth === "register").length;

  return (
    <>
      <PageHeader
        eyebrow="About this build"
        title="Module coverage"
        subtitle="What is running end to end in this build, what is present as a working register, and what was flagged in our proposal as needing customisation. The same answer whoever is asked."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Modules covered" value={`${COVERAGE.length} of 25`} tone="success" />
        <Stat label="Running end to end" value={working} tone="success" />
        <Stat label="Working registers" value={registers} tone="info" />
        <Stat label="Audit records" value={auditCount.toLocaleString("en-US")} />
      </div>

      <div className="mb-5">
        <Note tone="warn" title="What this build is">
          A working demonstration of the platform proposed for Shahjalal Islami Bank PLC. The
          workflow engine, permission model, two-envelope control and audit trail are real and
          enforced. The deployment is deliberately condensed to a single node so it is portable
          and runs without a network; the production design is the three-tier architecture in the
          technical proposal. It is not running in production anywhere, and no connector on the
          integrations screen is live.
        </Note>
      </div>

      <Card pad={false} className="mb-5">
        <CardHeader
          title="All 25 modules"
          subtitle="Annexure-B scope, mapped to where each one lives in this build"
        />
        <Table>
          <thead>
            <tr>
              <Th width="54px" align="center">No.</Th>
              <Th>Module</Th>
              <Th width="150px">In this build</Th>
              <Th>What is present</Th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map(c => (
              <Tr key={`${c.no}-${c.name}`}>
                <Td align="center" className="font-mono text-ink-500">{c.no}</Td>
                <Td>
                  {c.href ? (
                    <Link href={c.href} className="font-semibold text-brand-700 hover:underline">{c.name}</Link>
                  ) : (
                    <span className="font-semibold text-ink-900">{c.name}</span>
                  )}
                </Td>
                <Td>
                  {c.depth === "working"
                    ? <Pill tone="success">Running end to end</Pill>
                    : <Pill tone="info">Working register</Pill>}
                </Td>
                <Td className="max-w-[520px] text-[12.5px] leading-snug text-ink-600">{c.note}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card pad={false} className="mb-5">
        <CardHeader
          title="Flagged in our proposal as needing customisation"
          subtitle="Answered honestly in Annexure-B as needing customisation rather than complied. Unchanged here."
        />
        <Table>
          <thead>
            <tr><Th>Item</Th><Th width="220px">Where</Th><Th>Why</Th></tr>
          </thead>
          <tbody>
            {CUSTOMISATION.map(([item, where, why]) => (
              <Tr key={item}>
                <Td className="font-medium text-ink-900">{item}</Td>
                <Td className="text-ink-600">{where}</Td>
                <Td className="max-w-[460px] text-[12.5px] leading-snug text-ink-600">{why}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
            Controls you can test
          </div>
          <ul className="space-y-2.5">
            {[
              ["Maker-checker", "Open a requisition you raised and press approve. The system refuses, whatever roles you hold.", "/requisitions"],
              ["Two-envelope seal", "Open a closed tender and try to open a financial envelope before technical evaluation completes.", "/tenders"],
              ["Quantity matching", "Raise a work order for more than the requisition approved.", "/purchase-orders"],
              ["Configurable routing", "Change an approval threshold and watch the route redraw before you save.", "/admin/workflows"],
              ["Tamper-evident audit", "Verify the whole chain, then expand any record to see the bytes that were hashed.", "/admin/audit"],
            ].map(([title, how, href]) => (
              <li key={title} className="flex items-start gap-2.5">
                <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <Link href={href} className="text-[13.5px] font-semibold text-brand-700 hover:underline">{title}</Link>
                  <p className="text-[12.5px] leading-snug text-ink-600">{how}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
            Data in this build
          </div>
          <dl className="space-y-2 text-[13.5px]">
            {[
              ["Requisitions", tables[0]], ["Tenders", tables[1]], ["Bids", tables[2]],
              ["Work orders", tables[3]], ["Invoices", tables[4]], ["Vendors", tables[5]],
              ["Audit records", auditCount],
            ].map(([l, v]) => (
              <div key={l as string} className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1.5">
                <dt className="text-ink-600">{l as string}</dt>
                <dd className="font-semibold text-ink-900 tabular">{(v as number).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
            Seeded data represents six months of operation and is deterministic: the same database
            is produced on every reset, so a rehearsal and the demonstration are identical.
          </p>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 pt-5">
        <BrandLockup size="sm" className="text-ink-900" />
        <span className="text-[12px] text-ink-500"><JvCredit /></span>
      </div>
    </>
  );
}
