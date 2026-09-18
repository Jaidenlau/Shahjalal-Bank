"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_GROUPS, type ModuleDef, type ModuleGroup } from "@/lib/modules";
import { Icon, type IconName } from "@/components/ui";
import { VertexMark } from "@/components/brand";

/**
 * Navigation, filtered server-side by permission.
 *
 * The filtering is not cosmetic: the same permission set that decides what
 * appears here is what the mutations check. Switching from the junior officer
 * to the administrator visibly grows this list, which is a one-second proof of
 * role-based access control and costs nothing to show.
 */

const GROUP_ICON: Record<ModuleGroup, IconName> = {
  Procurement: "file",
  "Inventory & Assets": "box",
  Facilities: "building",
  Finance: "chart",
  Administration: "settings",
};

export function Sidebar({
  modules, roleName, visibleCount, totalCount,
}: { modules: ModuleDef[]; roleName: string; visibleCount: number; totalCount: number }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/requisitions/approvals") return pathname === href;
    if (href === "/requisitions") return pathname === href || /^\/requisitions\/(?!approvals)/.test(pathname);
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="flex h-full w-[248px] shrink-0 flex-col border-r border-ink-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-3.5">
        <VertexMark className="h-6 w-6 text-brand-600" />
        <div className="leading-tight">
          <div className="text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
            Vertex<span className="font-light"> ERP</span>
          </div>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink-400">
            Shahjalal Islami Bank
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <Link
          href="/"
          className={`mb-3 flex items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-[13.5px] font-semibold transition-colors ${
            pathname === "/" ? "bg-brand-700 text-white" : "text-ink-700 hover:bg-ink-100"
          }`}
        >
          <Icon name="chart" className="h-4 w-4" />
          Dashboard
        </Link>

        {MODULE_GROUPS.map(group => {
          const inGroup = modules.filter(m => m.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink-400">
                <Icon name={GROUP_ICON[group]} className="h-3 w-3" />
                {group}
              </div>
              <ul className="space-y-px">
                {inGroup.map(m => {
                  const active = isActive(m.href);
                  return (
                    <li key={m.href}>
                      <Link
                        href={m.href}
                        title={m.blurb}
                        className={`flex items-center justify-between gap-2 rounded-[5px] px-2.5 py-[7px] text-[13px] transition-colors ${
                          active
                            ? "bg-brand-100 font-semibold text-brand-800"
                            : "text-ink-700 hover:bg-ink-100"
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Makes the RBAC point without a word being said. Counted as areas
          rather than modules: several Annexure-B modules surface as more than
          one navigation entry, and a couple surface in the vendor portal
          instead, so an area count is the honest number here. The module-by-
          module mapping lives on /about. */}
      <div className="border-t border-ink-200 px-4 py-2.5">
        <Link href="/about" className="block text-[11px] leading-snug text-ink-500 hover:text-ink-700">
          <span className="font-semibold text-ink-700 tabular">
            {visibleCount} of {totalCount}
          </span>{" "}
          areas visible to
          <br />
          <span className="font-medium text-ink-700">{roleName}</span>
        </Link>
      </div>
    </nav>
  );
}
