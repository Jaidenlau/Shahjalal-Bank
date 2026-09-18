import Link from "next/link";
import { signOut } from "@/lib/session-actions";
import { Icon } from "@/components/ui";
import { NotificationBell, type NotificationItem } from "./notification-bell";
import { PersonaSwitcher, type PersonaOption } from "./persona-switcher";

export function Topbar({
  fullName, designation, roleNames, branchName, departmentName,
  notifications, personas, currentId,
}: {
  fullName: string; designation: string; roleNames: string[];
  branchName: string | null; departmentName: string | null;
  notifications: NotificationItem[]; personas: PersonaOption[]; currentId: string;
}) {
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="flex h-[54px] shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-white px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink-900">
            {departmentName ?? "Shahjalal Islami Bank PLC"}
          </div>
          <div className="truncate text-[11.5px] text-ink-500">
            {branchName ?? "Corporate Head Office"}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <PersonaSwitcher personas={personas} currentId={currentId} />

        <Link
          href="/about"
          className="hidden rounded-[5px] p-1.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 md:block"
          title="About this build"
        >
          <Icon name="shield" className="h-[18px] w-[18px]" />
        </Link>

        <NotificationBell items={notifications} />

        <div className="ml-1 flex items-center gap-2.5 border-l border-ink-200 pl-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[13px] font-semibold text-ink-900">{fullName}</div>
            <div className="text-[11.5px] text-ink-500">
              {roleNames[0]}
              {roleNames.length > 1 ? (
                <span className="text-ink-400"> +{roleNames.length - 1}</span>
              ) : null}
            </div>
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-[12px] font-bold text-white"
            title={`${fullName} — ${designation}`}
          >
            {initials}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-[5px] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-danger-600"
              title="Sign out"
            >
              <Icon name="logout" className="h-[17px] w-[17px]" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
