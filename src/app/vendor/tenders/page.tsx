import Link from "next/link";
import { requireVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, countdown } from "@/lib/date";
import { label as enumLabel } from "@/lib/enums";
import { Card, CardHeader, Pill, Table, Th, Td, Tr, EmptyRow, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorTenders() {
  const user = await requireVendorUser();
  const tenders = await prisma.tender.findMany({
    where: { status: { in: ["PUBLISHED", "CLOSED", "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION", "AWARDED"] } },
    orderBy: [{ status: "asc" }, { closingAt: "asc" }],
  });
  const myBids = await prisma.bid.findMany({ where: { vendorId: user.vendorId! } });

  const open = tenders.filter(t => t.status === "PUBLISHED");
  const past = tenders.filter(t => t.status !== "PUBLISHED" && myBids.some(b => b.tenderId === t.id));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.015em] text-ink-950">Tenders</h1>
        <p className="mt-1 text-[14px] text-ink-600">
          Open invitations and the tenders you have participated in.
        </p>
      </div>

      <div className="space-y-5">
        <Card pad={false}>
          <CardHeader title="Open for bidding" subtitle={`${open.length} tender${open.length === 1 ? "" : "s"}`} />
          <Table>
            <thead>
              <tr>
                <Th width="170px">Tender no.</Th><Th>Title</Th><Th>Method</Th>
                <Th align="center">Envelope</Th><Th>Published</Th><Th>Closing</Th><Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {open.length === 0 ? (
                <EmptyRow colSpan={7}>No tenders are open for bidding at present.</EmptyRow>
              ) : open.map(t => (
                <Tr key={t.id}>
                  <Td mono>
                    <Link href={`/vendor/tenders/${t.id}`} className="font-semibold text-ink-900 hover:underline">
                      {t.tenderNo}
                    </Link>
                  </Td>
                  <Td className="max-w-[300px] truncate">{t.title}</Td>
                  <Td className="text-ink-600">{enumLabel(t.method)}</Td>
                  <Td align="center">
                    {t.envelopeSystem === "TWO"
                      ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-700"><Icon name="lock" className="h-3 w-3" /> Two</span>
                      : <span className="text-[12px] text-ink-500">Single</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDate(t.publishedAt)}</Td>
                  <Td className="whitespace-nowrap font-semibold text-ink-800">{countdown(t.closingAt)}</Td>
                  <Td align="right">
                    <Link href={`/vendor/tenders/${t.id}`}
                      className="inline-flex items-center gap-1 rounded-[5px] bg-ink-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800">
                      View <Icon name="arrowRight" className="h-3 w-3" />
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card pad={false}>
          <CardHeader title="Your past participation" />
          <Table>
            <thead>
              <tr><Th width="170px">Tender no.</Th><Th>Title</Th><Th>Status</Th><Th align="right">Your outcome</Th></tr>
            </thead>
            <tbody>
              {past.length === 0 ? (
                <EmptyRow colSpan={4}>No past tenders.</EmptyRow>
              ) : past.map(t => {
                const mine = myBids.find(b => b.tenderId === t.id)!;
                return (
                  <Tr key={t.id}>
                    <Td mono>
                      <Link href={`/vendor/tenders/${t.id}`} className="font-semibold text-ink-900 hover:underline">
                        {t.tenderNo}
                      </Link>
                    </Td>
                    <Td className="max-w-[320px] truncate">{t.title}</Td>
                    <Td><Pill status={t.status} /></Td>
                    <Td align="right">
                      {mine.status === "AWARDED" ? <Pill tone="success">Awarded</Pill>
                        : mine.status === "TECHNICAL_DISQUALIFIED" ? <Pill tone="danger">Not qualified</Pill>
                        : t.status === "AWARDED" ? <Pill tone="neutral">Not selected</Pill>
                        : <Pill tone="info">Under evaluation</Pill>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
