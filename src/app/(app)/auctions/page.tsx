import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDateTime, countdown } from "@/lib/date";
import { Money, Pill, Note, Card, CardHeader } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function AuctionsPage() {
  const user = await requireUser();
  assertCan(user, "AUCTION", "VIEW");

  const lots = await prisma.auctionLot.findMany({
    include: { bids: { orderBy: { amount: "desc" } } },
    orderBy: { endsAt: "desc" },
  });

  const open = lots.filter(l => l.status === "OPEN");

  const columns: Array<Column<(typeof lots)[number]>> = [
    { header: "Lot", mono: true, width: "160px", className: "text-ink-600", cell: l => l.lotNo },
    { header: "Description", cell: l => (
      <>
        <div className="font-medium text-ink-900">{l.title}</div>
        <div className="max-w-[320px] text-[11.5px] leading-snug text-ink-500">{l.description}</div>
      </>
    ) },
    { header: "Category", align: "center", cell: l => (
      <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">{l.category}</span>
    ) },
    { header: "Reserve", align: "right", cell: l => <Money value={num(l.reservePrice)} /> },
    { header: "Bids", align: "center", className: "text-ink-600", cell: l => l.bids.length },
    { header: "Highest bid", align: "right", cell: l => l.bids[0]
      ? (
        <>
          <span className="font-semibold"><Money value={num(l.bids[0].amount)} /></span>
          <div className="text-[11px] text-ink-400">{l.bids[0].bidderAlias}</div>
        </>
      )
      : <span className="text-ink-400">—</span> },
    { header: "Closes", className: "whitespace-nowrap", cell: l => l.status === "OPEN"
      ? <span className="font-semibold text-brand-700">{countdown(l.endsAt)}</span>
      : <span className="text-ink-500">{formatDateTime(l.endsAt)}</span> },
    { header: "Status", cell: l => <Pill status={l.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 5 — e-Auction Management"
      title="e-Auction"
      subtitle="Disposal of retired vehicles, furniture, IT equipment and electrical items by timed auction with anonymous bidding."
      stats={[
        { label: "Lots", value: lots.length },
        { label: "Open for bidding", value: open.length, tone: open.length ? "success" : "neutral" },
        { label: "Bids received", value: lots.reduce((s, l) => s + l.bids.length, 0), tone: "info" },
        { label: "Reserve value", value: <Money value={lots.reduce((s, l) => s + num(l.reservePrice), 0)} compact /> },
      ]}
      columns={columns}
      rows={lots}
    >
      <div className="mb-5">
        <Note
          tone="neutral"
          title="Anonymous bidding, and payment collection"
          reference="Annexure-B module 5 — auction fee and payment collection: Need Customization"
        >
          Bidders are identified by alias during an open auction so that no participant can see
          who they are bidding against. Auction fee, earnest money and payment collection depend
          on the payment service provider the Bank selects, and were answered in our proposal as
          requiring customisation.
        </Note>
      </div>
    </Register>
  );
}
