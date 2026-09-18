import { requireVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, daysFromNow } from "@/lib/date";
import { Card, CardHeader, Pill, Icon, Table, Th, Td, Tr, Note, Field } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorProfile() {
  const user = await requireVendorUser();
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: user.vendorId! },
    include: { categories: true, documents: { orderBy: { uploadedAt: "desc" } } },
  });

  const licenceDays = daysFromNow(vendor.tradeLicenseExpiry);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.015em] text-ink-950">Company profile</h1>
        <p className="mt-1 text-[14px] text-ink-600">
          Your enlistment record with Shahjalal Islami Bank PLC.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card pad={false}>
            <CardHeader
              title={vendor.companyName}
              subtitle={`Enlisted ${vendor.enlistedAt ? formatDate(vendor.enlistedAt) : "—"}`}
              action={<Pill status={vendor.enlistmentStatus} />}
            />
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Trade licence number" mono>{vendor.tradeLicenseNo}</Field>
              <Field label="Trade licence expiry">
                <span className={licenceDays < 45 ? "font-semibold text-warn-700" : ""}>
                  {formatDate(vendor.tradeLicenseExpiry)}
                  {licenceDays < 45 ? ` — ${licenceDays} days` : ""}
                </span>
              </Field>
              <Field label="e-TIN" mono>{vendor.tin}</Field>
              <Field label="BIN / VAT registration" mono>{vendor.bin}</Field>
              <Field label="Income tax return submitted">
                {vendor.incomeTaxSubmittedAt ? formatDate(vendor.incomeTaxSubmittedAt) : "Not recorded"}
              </Field>
              <Field label="Contact person">{vendor.contactPerson}</Field>
              <Field label="Phone">{vendor.contactPhone}</Field>
              <Field label="Email">{vendor.contactEmail}</Field>
              <div className="sm:col-span-2">
                <Field label="Registered address">{vendor.address}</Field>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-500">
                  Enlisted categories
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {vendor.categories.map(c => (
                    <span key={c.id} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-700">
                      {c.category}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </Card>

          <Card pad={false}>
            <CardHeader
              title="Documents on file"
              subtitle="Verified by the Common Services Division during enlistment"
            />
            <Table>
              <thead>
                <tr><Th>Document</Th><Th>File</Th><Th>Uploaded</Th><Th>Verification</Th></tr>
              </thead>
              <tbody>
                {vendor.documents.map(d => (
                  <Tr key={d.id}>
                    <Td className="font-medium">{d.docType}</Td>
                    <Td mono className="text-ink-600">
                      {d.fileName}
                      <span className="ml-2 text-ink-400">{(d.fileSize / 1024).toFixed(0)} KB</span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDate(d.uploadedAt)}</Td>
                    <Td>
                      {d.verifiedAt ? (
                        <span className="text-[12.5px] text-brand-700">
                          Verified {formatDate(d.verifiedAt)}
                          <span className="block text-[11.5px] text-ink-500">by {d.verifiedBy}</span>
                        </span>
                      ) : <Pill tone="warn">Awaiting verification</Pill>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-5">
          {licenceDays < 45 ? (
            <Note tone={licenceDays < 0 ? "danger" : "warn"} title="Trade licence renewal">
              {licenceDays < 0
                ? "Your trade licence has expired. You cannot participate in tenders until a renewed certificate is uploaded and verified."
                : `Your trade licence expires in ${licenceDays} days. Upload the renewed certificate before it lapses to remain eligible for tender participation.`}
            </Note>
          ) : (
            <Note tone="success" title="Enlistment in good standing">
              Your trade licence is valid until {formatDate(vendor.tradeLicenseExpiry)} and your
              documents are verified.
            </Note>
          )}

          <Card>
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-600">
              Changing your details
            </div>
            <p className="text-[13px] leading-relaxed text-ink-600">
              Amendments to your company name, trade licence, tax registration or enlisted
              categories are submitted for approval by the Common Services Division rather than
              applied directly. A profile change request follows the same maker-checker path as
              any other material change in the system.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
