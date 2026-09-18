import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSION_MODULES, PERMISSION_ACTIONS, MODULES } from "@/lib/modules";
import {
  Card, CardHeader, PageHeader, Pill, Icon, Note, Stat,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The role-to-permission matrix.
 *
 * This is the actual grant table the mutations check, rendered. It is
 * deliberately not a mock-up of one: the ticks below are the rows in
 * RolePermission, and removing one would change what the corresponding user can
 * do on their next request.
 */
export default async function RolesPage() {
  const user = await requireUser();
  assertCan(user, "USER", "VIEW");

  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { rank: "asc" },
  });

  const has = (roleId: string, module: string, action: string) =>
    roles.find(r => r.id === roleId)!.permissions.some(
      p => p.permission.module === module && p.permission.action === action);

  const moduleLabel = (perm: string) =>
    MODULES.find(m => m.perm === perm)?.name ?? perm;

  return (
    <>
      <PageHeader
        eyebrow="Module 24 — Role Based Access Control"
        title="Permission matrix"
        subtitle="Parameterised to module and action level. This grid is the grant table the server checks on every mutation, not a summary of one."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Roles" value={roles.length} />
        <Stat label="Modules" value={PERMISSION_MODULES.length} />
        <Stat label="Actions per module" value={PERMISSION_ACTIONS.length} />
        <Stat label="Grants in force"
          value={roles.reduce((s, r) => s + r.permissions.length, 0)} tone="info" />
      </div>

      <div className="mb-5">
        <Note
          tone="neutral"
          title="Why the administrator column is not entirely ticked"
          reference="Annexure-A 6(a)(i) — audit trail as satisfactory to the bank"
        >
          The System Administrator holds every permission except write access to the audit trail.
          There is no such permission to grant, because there is no code path behind it. The claim
          in the bid is that audit records cannot be altered, and that has to be true of
          administrators too or it is not a control.
        </Note>
      </div>

      <Card pad={false}>
        <CardHeader
          title="Role definitions"
          subtitle="Rank determines seniority in approval tiers"
        />
        <ul className="divide-y divide-ink-100">
          {roles.map(r => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink-900">{r.name}</span>
                  <span className="font-mono text-[11.5px] text-ink-400">{r.code}</span>
                  {r.isSystemRole ? <Pill tone="info">System role</Pill> : null}
                </div>
                <p className="mt-0.5 max-w-3xl text-[12.5px] leading-snug text-ink-600">{r.description}</p>
              </div>
              <div className="flex shrink-0 gap-5 text-right">
                <div>
                  <div className="text-[15px] font-bold text-ink-900 tabular">{r._count.users}</div>
                  <div className="text-[11.5px] uppercase tracking-[0.05em] text-ink-500">users</div>
                </div>
                <div>
                  <div className="text-[15px] font-bold text-ink-900 tabular">{r.permissions.length}</div>
                  <div className="text-[11.5px] uppercase tracking-[0.05em] text-ink-500">grants</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card pad={false} className="mt-5">
        <CardHeader
          title="Module and action grid"
          subtitle="Each tick is a row in the grant table. Scroll horizontally for all roles."
        />
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-ink-200 bg-ink-50 px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-600">
                  Module / action
                </th>
                {roles.map(r => (
                  <th key={r.id} className="border-b border-ink-200 bg-ink-50 px-2 py-2 align-bottom">
                    <div className="mx-auto w-[22px] whitespace-nowrap text-left text-[11px] font-semibold text-ink-700"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                      {r.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map(m => (
                <>
                  <tr key={`${m}-head`}>
                    <td colSpan={roles.length + 1}
                      className="border-b border-ink-200 bg-ink-100 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-700">
                      {moduleLabel(m)}
                    </td>
                  </tr>
                  {PERMISSION_ACTIONS.map(a => (
                    <tr key={`${m}-${a}`}>
                      <td className="sticky left-0 z-10 border-b border-r border-ink-100 bg-white px-3 py-1 text-[11.5px] text-ink-600">
                        {a.charAt(0) + a.slice(1).toLowerCase()}
                      </td>
                      {roles.map(r => {
                        const on = has(r.id, m, a);
                        return (
                          <td key={r.id} className="border-b border-ink-100 px-2 py-1 text-center">
                            {on ? (
                              <Icon name="check" className="mx-auto h-3.5 w-3.5 text-brand-600" />
                            ) : (
                              <span className="mx-auto block h-1 w-1 rounded-full bg-ink-200" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
