import Link from "next/link";
import { requireVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, countdown, daysFromNow, relativeDays } from "@/lib/date";
import { Card, CardHeader, Pill, Money, Icon, Stat, Table, Th, Td, Tr, EmptyRow, Note } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorDashboard() {
  const user = await requireVendorUser();
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: user.vendorId! },
    include: { categories: true, documents: true },
  });

  const [openTenders, myBids] = await Promise.all([
    prisma.tender.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { closingAt: "asc" },
    }),
    prisma.bid.findMany({
      where: { vendorId: vendor.id },
      include: {
        tender: true,
        technicalPart: { select: { submittedAt: true, openedAt: true } },
        financialPart: { select: { submittedAt: true, openedAt: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  const awarded = myBids.filter(b => b.status === "AWARDED");
  const licenceDays = daysFromNow(vendor.tradeLicenseExpiry);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.015em] text-ink-950">{vendor.companyName}</h1>
        <p className="mt-1 text-[14px] text-ink-600">
          Enlisted vendor · {vendor.categories.map(c => c.category).join(", ")}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open tenders" value={openTenders.length} tone="success" href="/vendor/tenders"
          sub="Accepting bids now" />
        <Stat label="Your submissions" value={myBids.length} tone="info" />
        <Stat label="Awarded to you" value={awarded.length} tone={awarded.length ? "success" : "neutral"} />
        <Stat label="Enlistment" value={vendor.enlistmentStatus === "APPROVED" ? "Approved" : vendor.enlistmentStatus}
          tone={vendor.enlistmentStatus === "APPROVED" ? "success" : "warn"}
          sub={vendor.enlistedAt ? `Since ${formatDate(vendor.enlistedAt)}` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card pad={false}>
            <CardHeader
              title="Open tenders"
              subtitle="Published tenders matching enlisted vendors. Download the documents and submit before closing."
            />
            <Table>
              <thead>
                <tr>
                  <Th width="170px">Tender no.</Th><Th>Title</Th>
                  <Th align="center">Envelope</Th><Th>Closing</Th><Th align="right">Your status</Th>
                </tr>
              </thead>
              <tbody>
                {openTenders.length === 0 ? (
                  <EmptyRow colSpan={5}>No tenders are open for bidding at present.</EmptyRow>
                ) : openTenders.map(t => {
                  const mine = myBids.find(b => b.tenderId === t.id);
                  return (
                    <Tr key={t.id}>
                      <Td mono>
                        <Link href={`/vendor/tenders/${t.id}`} className="font-semibold text-ink-900 hover:underline">
                          {t.tenderNo}
                        </Link>
                      </Td>
                      <Td className="max-w-[280px] truncate">{t.title}</Td>
                      <Td align="center">
                        {t.envelopeSystem === "TWO"
                          ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-700"><Icon name="lock" className="h-3 w-3" /> Two</span>
                          : <span className="text-[12px] text-ink-500">Single</span>}
                      </Td>
                      <Td>
                        <span className="font-semibold text-ink-800">{countdown(t.closingAt)}</span>
                        <span className="block text-[11.5px] text-ink-500">{formatDate(t.closingAt)}</span>
                      </Td>
                      <Td align="right">
                        {!mine ? <Pill tone="neutral">Not started</Pill>
                          : mine.technicalPart?.submittedAt && mine.financialPart?.submittedAt
                          ? <Pill tone="success">Both parts submitted</Pill>
                          : mine.technicalPart?.submittedAt || mine.financialPart?.submittedAt
                          ? <Pill tone="warn">Partly submitted</Pill>
                          : <Pill tone="info">Intention registered</Pill>}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card pad={false}>
            <CardHeader title="Your bid history" subtitle="Status of every tender you have participated in" />
            <Table>
              <thead>
                <tr>
                  <Th width="170px">Tender no.</Th><Th>Title</Th>
                  <Th align="center">Technical</Th><Th align="center">Financial</Th><Th align="right">Outcome</Th>
                </tr>
              </thead>
              <tbody>
                {myBids.length === 0 ? (
                  <EmptyRow colSpan={5}>You have not submitted any bids yet.</EmptyRow>
                ) : myBids.map(b => (
                  <Tr key={b.id}>
                    <Td mono>
                      <Link href={`/vendor/tenders/${b.tenderId}`} className="font-semibold text-ink-900 hover:underline">
                        {b.tender.tenderNo}
                      </Link>
                    </Td>
                    <Td className="max-w-[240px] truncate">{b.tender.title}</Td>
                    <Td align="center">
                      {b.technicalPart?.submittedAt ? <Pill tone="success">Submitted</Pill> : <Pill tone="neutral">—</Pill>}
                    </Td>
                    <Td align="center">
                      {b.financialPart?.submittedAt ? (
                        b.financialPart.openedAt
                          ? <Pill tone="success">Opened</Pill>
                          : <Pill tone="sealed"><Icon name="lock" className="h-3 w-3" /> Sealed</Pill>
                      ) : <Pill tone="neutral">—</Pill>}
                    </Td>
                    <Td align="right">
                      {b.status === "AWARDED" ? <Pill tone="success">Awarded</Pill>
                        : b.status === "TECHNICAL_DISQUALIFIED" ? <Pill tone="danger">Not qualified</Pill>
                        : b.tender.status === "AWARDED" ? <Pill tone="neutral">Not selected</Pill>
                        : <Pill tone="info">Under process</Pill>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Company profile
            </div>
            <dl className="space-y-2.5 text-[13px]">
              {[
                ["Trade licence", vendor.tradeLicenseNo],
                ["Licence expiry", formatDate(vendor.tradeLicenseExpiry)],
                ["e-TIN", vendor.tin],
                ["BIN / VAT", vendor.bin],
                ["Contact", vendor.contactPerson],
                ["Phone", vendor.contactPhone],
                ["Documents on file", `${vendor.documents.length}`],
              ].map(([l, v]) => (
                <div key={l} className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1.5">
                  <dt className="shrink-0 text-ink-500">{l}</dt>
                  <dd className="truncate text-right font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/vendor/profile" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-800 hover:underline">
              Manage profile <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          </Card>

          <Note tone="info" title="How two-envelope tendering protects you">
            Your financial offer is sealed on submission. Nobody at the bank, including
            administrators, can read your price until the technical evaluation is complete and
            signed off. Technical merit is assessed without knowing what anyone asked for.
          </Note>
        </div>
      </div>
    </>
  );
}
