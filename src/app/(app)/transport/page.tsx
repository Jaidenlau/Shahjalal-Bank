import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { formatDate, daysFromNow } from "@/lib/date";
import { Money, Pill, Note } from "@/components/ui";
import { Register, type Column } from "@/components/register";

export const dynamic = "force-dynamic";

export default async function TransportPage() {
  const user = await requireUser();
  assertCan(user, "TRANSPORT", "VIEW");

  const vehicles = await prisma.vehicle.findMany({
    include: { trips: true, fuelLogs: true }, orderBy: { registrationNo: "asc" },
  });

  const expiring = vehicles.filter(v =>
    [v.taxTokenExpiry, v.fitnessExpiry, v.insuranceExpiry].some(d => {
      const n = daysFromNow(d); return n >= 0 && n <= 45;
    }));

  const expiryCell = (d: Date, label: string) => {
    const n = daysFromNow(d);
    return (
      <div className={n <= 45 ? "text-warn-700" : "text-ink-600"}>
        <span className="text-[11px] uppercase tracking-[0.04em] text-ink-400">{label}</span>
        <div className={`text-[12.5px] ${n <= 45 ? "font-semibold" : ""}`}>
          {formatDate(d)}{n <= 45 ? ` · ${n}d` : ""}
        </div>
      </div>
    );
  };

  const columns: Array<Column<(typeof vehicles)[number]>> = [
    { header: "Registration", mono: true, width: "190px", cell: v => (
      <>
        <div className="font-semibold text-ink-900">{v.registrationNo}</div>
        <div className="font-sans text-[11.5px] text-ink-500">{v.make} {v.model} · {v.year}</div>
      </>
    ) },
    { header: "Type", align: "center", className: "text-ink-600", cell: v => v.type },
    { header: "Assigned to", cell: v => (
      <>
        <div className="text-ink-800">{v.assignedTo ?? "Pool"}</div>
        <div className="text-[11.5px] text-ink-500">Driver: {v.driverName}</div>
      </>
    ) },
    { header: "Base", className: "text-ink-600", cell: v => v.branchName },
    { header: "Odometer", align: "right", className: "text-ink-600", cell: v => `${v.odometerKm.toLocaleString("en-US")} km` },
    { header: "Trips", align: "center", className: "text-ink-600", cell: v => v.trips.length },
    { header: "Fuel cost", align: "right", cell: v => <Money value={v.fuelLogs.reduce((s, f) => s + num(f.costAmount), 0)} /> },
    { header: "Expiries", width: "300px", cell: v => (
      <div className="flex gap-4">
        {expiryCell(v.taxTokenExpiry, "Tax token")}
        {expiryCell(v.fitnessExpiry, "Fitness")}
        {expiryCell(v.insuranceExpiry, "Insurance")}
      </div>
    ) },
    { header: "Status", cell: v => <Pill status={v.status} /> },
  ];

  return (
    <Register
      eyebrow="Module 16 — Transport Management"
      title="Transport"
      subtitle="Vehicle register with fuel and trip logs, driver assignment, and tax token, fitness and insurance expiry tracking."
      stats={[
        { label: "Vehicles", value: vehicles.length },
        { label: "Active", value: vehicles.filter(v => v.status === "ACTIVE").length, tone: "success" },
        { label: "Documents expiring", value: expiring.length, tone: expiring.length ? "warn" : "neutral", sub: "Within 45 days" },
        { label: "Fuel cost logged", value: <Money value={vehicles.flatMap(v => v.fuelLogs).reduce((s, f) => s + num(f.costAmount), 0)} compact /> },
      ]}
      columns={columns}
      rows={vehicles}
    >
      {expiring.length > 0 ? (
        <div className="mb-5">
          <Note tone="warn" title={`${expiring.length} vehicle${expiring.length === 1 ? "" : "s"} with paperwork expiring within 45 days`}>
            Tax token, fitness certificate and insurance expiry are tracked per vehicle, with
            notification from 45 days out. Driving on an expired tax token is an offence in
            Bangladesh, so this is a compliance control rather than a convenience.
          </Note>
        </div>
      ) : null}
    </Register>
  );
}
