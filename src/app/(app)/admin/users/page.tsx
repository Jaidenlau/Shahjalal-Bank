import Link from "next/link";
import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/date";
import { MODULES } from "@/lib/modules";
import {
  Card, CardHeader, PageHeader, Pill, Table, Th, Td, Tr,
  EmptyRow, Icon, ButtonLink, Stat, Note,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser();
  assertCan(user, "USER", "VIEW");

  const users = await prisma.user.findMany({
    include: {
      department: { select: { code: true, name: true } },
      branch: { select: { name: true } },
      roles: {
        orderBy: { sequence: "asc" },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
      vendorUser: { include: { vendor: { select: { companyName: true } } } },
    },
    orderBy: [{ userType: "asc" }, { employeeId: "asc" }],
  });

  const internal = users.filter(u => u.userType === "INTERNAL");
  const vendors = users.filter(u => u.userType === "VENDOR");

  const moduleCount = (u: (typeof users)[number]) => {
    const perms = new Set<string>();
    for (const ur of u.roles) {
      for (const rp of ur.role.permissions) perms.add(`${rp.permission.module}:${rp.permission.action}`);
    }
    return MODULES.filter(m => perms.has(`${m.perm}:VIEW`)).length;
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 24 — Administrator and User Management"
        title="Users and roles"
        subtitle="Two distinct identity classes with entirely separate permission models: bank employees, and external vendors and bidders."
        actions={<ButtonLink href="/admin/roles" variant="primary">
          <Icon name="shield" className="h-4 w-4" /> Permission matrix
        </ButtonLink>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Internal users" value={internal.length} tone="info" sub="Bank employees" />
        <Stat label="External users" value={vendors.length} sub="Vendors and bidders" />
        <Stat label="Active" value={users.filter(u => u.isActive).length} tone="success" />
        <Stat label="Areas in the system" value={MODULES.length} />
      </div>

      <div className="mb-5">
        <Note
          tone="info"
          title="Two identity classes, not two user groups"
          reference="Annexure-A 3(d)(iv) — capability to manage both Internal Users (Employees) and External Users (Vendors)"
        >
          Vendors authenticate through a separate portal with a separate session, and no vendor
          role carries a single permission on an internal module. The separation is in the
          permission model itself rather than in what the interface chooses to show.
        </Note>
      </div>

      <div className="space-y-5">
        <Card pad={false}>
          <CardHeader title="Bank employees" subtitle={`${internal.length} internal users`} />
          <Table>
            <thead>
              <tr>
                <Th>Employee ID</Th><Th>Name</Th><Th>Designation</Th>
                <Th>Division</Th><Th>Branch</Th><Th>Roles</Th>
                <Th align="center">Areas visible</Th><Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {internal.map(u => (
                <Tr key={u.id}>
                  <Td mono className="text-ink-600">{u.employeeId}</Td>
                  <Td>
                    <div className="font-medium text-ink-900">{u.fullName}</div>
                    <div className="text-[11.5px] text-ink-500">{u.email}</div>
                  </Td>
                  <Td className="text-ink-600">{u.designation}</Td>
                  <Td mono className="text-[12px] text-ink-600">{u.department?.code ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{u.branch?.name ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r, i) => (
                        <Pill key={r.id} tone={i === 0 ? "info" : "neutral"}>{r.role.name}</Pill>
                      ))}
                    </div>
                  </Td>
                  <Td align="center" className="font-semibold tabular">{moduleCount(u)}</Td>
                  <Td align="center">
                    {u.isActive ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Disabled</Pill>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card pad={false}>
          <CardHeader
            title="External users"
            subtitle="Vendor and bidder logins — no access to internal modules"
          />
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th><Th>Representative</Th><Th>Company</Th>
                <Th>Email</Th><Th align="center">Internal areas visible</Th><Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(u => (
                <Tr key={u.id}>
                  <Td mono className="text-ink-600">{u.employeeId}</Td>
                  <Td className="font-medium">{u.fullName}</Td>
                  <Td>{u.vendorUser?.vendor.companyName ?? "—"}</Td>
                  <Td className="text-[12.5px] text-ink-600">{u.email}</Td>
                  <Td align="center">
                    <span className="font-semibold text-brand-700 tabular">{moduleCount(u)}</span>
                  </Td>
                  <Td align="center">
                    {u.isActive ? <Pill tone="success">Active</Pill> : <Pill tone="neutral">Disabled</Pill>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
