import { redirect } from "next/navigation";
import { currentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULES } from "@/lib/modules";
import { relativeDays } from "@/lib/date";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import type { PersonaOption } from "@/components/shell/persona-switcher";

export const dynamic = "force-dynamic";

/**
 * The application shell.
 *
 * Navigation is filtered against the same permission set the mutations check,
 * so what a user can see and what a user can do never diverge. There is no
 * separate list of "menu items" to fall out of step.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const visible = MODULES.filter(m => can(user, m.perm, "VIEW"));

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  // The switcher lists the six personas the run of show uses, each labelled
  // with how many modules they can see — so the access difference is legible
  // before the switch, not only after it.
  const order = ["Rezaul Karim", "Farhana Akter", "Shahidul Islam", "Tanvir Ahmed", "Nasrin Sultana", "Mizanur Rahman"];
  const staff = await prisma.user.findMany({
    where: { userType: "INTERNAL", fullName: { in: order } },
    include: {
      roles: { orderBy: { sequence: "asc" }, include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });

  const personas: PersonaOption[] = order
    .map(name => staff.find(s => s.fullName === name))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map(u => {
      const perms = new Set<string>();
      for (const ur of u.roles) {
        for (const rp of ur.role.permissions) perms.add(`${rp.permission.module}:${rp.permission.action}`);
      }
      const roles = u.roles.map(r => r.role);
      return {
        id: u.id,
        fullName: u.fullName,
        designation: u.designation,
        role: roles[0]?.name ?? "Officer",
        moduleCount: MODULES.filter(m => perms.has(`${m.perm}:VIEW`)).length,
      };
    });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        modules={visible}
        roleName={user.roleNames[0] ?? "No role"}
        visibleCount={visible.length}
        totalCount={MODULES.length}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          fullName={user.fullName}
          designation={user.designation}
          roleNames={user.roleNames}
          branchName={user.branchName}
          departmentName={user.departmentName}
          currentId={user.id}
          personas={personas}
          notifications={notifications.map(n => ({
            id: n.id, title: n.title, body: n.body, link: n.link,
            isRead: n.isRead, when: relativeDays(n.createdAt),
          }))}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
