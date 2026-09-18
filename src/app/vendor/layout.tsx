import { redirect } from "next/navigation";
import Link from "next/link";
import { currentVendorUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { daysFromNow, formatDate } from "@/lib/date";
import { vendorSignOut } from "@/lib/session-actions";
import { Icon } from "@/components/ui";
import { BankMark } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * The vendor portal shell.
 *
 * Deliberately a different visual world from the internal application: dark
 * slate chrome instead of the bank's green, a different navigation shape, and
 * the words "External Vendor Portal" in the header. Vendors are a separate
 * identity class with their own permission model, and the difference should be
 * obvious from across a room the moment the screen changes.
 */
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  // The login page renders outside this shell.
  const user = await currentVendorUser();
  if (!user) return <>{children}</>;

  const vendor = user.vendorId
    ? await prisma.vendor.findUnique({ where: { id: user.vendorId }, include: { categories: true } })
    : null;

  const licenceDays = vendor ? daysFromNow(vendor.tradeLicenseExpiry) : 999;

  return (
    <div className="flex min-h-screen flex-col bg-ink-100">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-3">
          <Link href="/vendor" className="flex items-center gap-3">
            <BankMark className="h-9 w-9 text-ink-400" />
            <div className="leading-tight">
              <div className="text-[15px] font-bold">Shahjalal Islami Bank PLC.</div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                External Vendor Portal
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["/vendor", "Dashboard"],
              ["/vendor/tenders", "Tenders"],
              ["/vendor/profile", "Company profile"],
            ].map(([href, label]) => (
              <Link key={href} href={href}
                className="rounded-[5px] px-3 py-1.5 text-[13px] font-medium text-ink-300 transition-colors hover:bg-white/10 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[13px] font-semibold">{vendor?.companyName}</div>
              <div className="text-[11px] text-ink-400">{user.fullName}</div>
            </div>
            <form action={vendorSignOut}>
              <button type="submit" className="rounded-[5px] p-1.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-white" title="Sign out">
                <Icon name="logout" className="h-[17px] w-[17px]" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Standing reminder of the boundary. */}
      <div className="border-b border-ink-300 bg-ink-200">
        <div className="mx-auto max-w-[1180px] px-6 py-1.5 text-[11.5px] text-ink-600">
          <Icon name="shield" className="mr-1 inline h-3 w-3 align-[-2px]" />
          You are signed in to the external vendor portal. Vendors have no access to internal
          bank records, other bidders&apos; submissions, or evaluation outcomes before publication.
        </div>
      </div>

      {licenceDays < 45 && licenceDays > -9999 ? (
        <div className={`${licenceDays < 0 ? "bg-danger-600" : "bg-warn-600"} text-white`}>
          <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-6 py-2 text-[13px]">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            <span>
              Trade licence {vendor?.tradeLicenseNo}{" "}
              {licenceDays < 0
                ? <>expired on {formatDate(vendor!.tradeLicenseExpiry)}. You cannot submit bids until it is renewed.</>
                : <>expires in {licenceDays} days, on {formatDate(vendor!.tradeLicenseExpiry)}. Upload the renewal to remain eligible.</>}
            </span>
            <Link href="/vendor/profile" className="ml-auto shrink-0 font-semibold underline underline-offset-2">
              Update documents
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-7">{children}</main>

      <footer className="border-t border-ink-300 bg-white">
        <div className="mx-auto max-w-[1180px] px-6 py-3 text-[11.5px] text-ink-500">
          Shahjalal Islami Bank PLC · Common Services Division · Vendor enquiries:
          procurement@sjiblbd.com
        </div>
      </footer>
    </div>
  );
}
