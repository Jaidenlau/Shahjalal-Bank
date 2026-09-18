import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill, Card, CardHeader, Table, Th, Td, Tr, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function BuildingPage() {
  const user = await requireUser();
  assertCan(user, "BUILDING", "VIEW");

  const [utilities, schedules] = await Promise.all([
    prisma.buildingUtility.findMany({ orderBy: { readingDate: "desc" } }),
    prisma.preventiveMaintenanceSchedule.findMany({ orderBy: { nextDueAt: "asc" } }),
  ]);

  const overdue = schedules.filter(s => daysFromNow(s.nextDueAt) < 0);

  const columns: Array<Column<(typeof utilities)[number]>> = [
    { header: "Site", cell: u => <span className="font-medium text-ink-900">{u.site}</span> },
    { header: "Utility", align: "center", cell: u => (
      <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-700">{u.utilityType}</span>
    ) },
    { header: "Meter", mono: true, className: "text-ink-600", cell: u => u.meterNo ?? "—" },
    { header: "Reading date", className: "whitespace-nowrap text-ink-600", cell: u => formatDate(u.readingDate) },
    { header: "Consumption", align: "right", className: "text-ink-600", cell: u => u.consumption.toLocaleString("en-US") },
    { header: "Cost", align: "right", cell: u => <Money value={num(u.costAmount)} /> },
    { header: "Provider", className: "text-ink-600", cell: u => u.vendorName ?? "—" },
    { header: "Status", cell: u => <Pill status={u.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 12 — Building Management System"
      title="Building management"
      subtitle="Utility consumption by site, preventive maintenance schedules and facility status."
      stats={[
        { label: "Sites monitored", value: new Set(utilities.map(u => u.site)).size },
        { label: "Utility readings", value: utilities.length },
        { label: "Maintenance scheduled", value: schedules.length, tone: "info" },
        { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "success" },
      ]}
      columns={columns}
      rows={utilities}
    >
      <div className="mb-5">
        <Note
          tone="neutral"
          title="Hardware integration"
          reference="Annexure-B module 12 — electricity/water/generator/lift/HVAC: Need Customization; CCTV status: Workaround Available"
        >
          Direct integration with building management hardware depends on the protocol and API
          support of the equipment already installed at each site, and was answered honestly in
          our proposal as requiring customisation rather than complied. Readings here are
          recorded through the interface rather than polled from a controller.
        </Note>
      </div>

      <Card pad={false} className="mb-5">
        <CardHeader
          title="Preventive maintenance schedule"
          subtitle={`${schedules.length} scheduled items${overdue.length ? `, ${overdue.length} overdue` : ""}`}
        />
        <Table>
          <thead>
            <tr>
              <Th width="130px">Schedule</Th><Th>Site</Th><Th>Equipment</Th>
              <Th align="center">Frequency</Th><Th>Last serviced</Th><Th>Next due</Th>
              <Th>Assigned to</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => {
              const d = daysFromNow(s.nextDueAt);
              return (
                <Tr key={s.id}>
                  <Td mono className="text-ink-600">{s.scheduleNo}</Td>
                  <Td className="text-ink-700">{s.site}</Td>
                  <Td className="font-medium text-ink-900">{s.equipment}</Td>
                  <Td align="center" className="text-ink-600">{s.frequency.replace(/_/g, " ").toLowerCase()}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{s.lastServicedAt ? formatDate(s.lastServicedAt) : "—"}</Td>
                  <Td className="whitespace-nowrap">
                    <span className={d < 0 ? "font-semibold text-danger-600" : d < 14 ? "text-warn-700" : "text-ink-600"}>
                      {formatDate(s.nextDueAt)}
                    </span>
                  </Td>
                  <Td className="text-ink-600">{s.assignedVendor ?? "—"}</Td>
                  <Td><Pill status={s.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </Register>
  );
}
