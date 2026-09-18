import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BankMark, VertexMark, JvCredit } from "@/components/brand";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * The first screen the room sees. It has one job: look like a bank system
 * rather than a side project, and make the two identity classes obvious —
 * bank staff here, vendors somewhere else entirely.
 */
export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  const staff = await prisma.user.findMany({
    where: { userType: "INTERNAL" },
    include: { roles: { orderBy: { sequence: "asc" }, include: { role: true } }, branch: true },
    orderBy: { employeeId: "asc" },
  });

  // The six personas from the run of show, in the order the demo uses them.
  const order = ["Rezaul Karim", "Farhana Akter", "Shahidul Islam", "Tanvir Ahmed", "Nasrin Sultana", "Mizanur Rahman"];
  const personas = order
    .map(n => staff.find(s => s.fullName === n))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map(u => ({
      email: u.email,
      fullName: u.fullName,
      designation: u.designation,
      role: u.roles[0]?.role.name ?? "Officer",
      branch: u.branch?.name ?? "",
    }));

  return (
    <main className="flex min-h-screen bg-white">
      {/* Left: the bank. Deliberately the larger half — this reads as the
          bank's system, not a vendor's product page. */}
      <section className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-brand-900 px-10 py-8 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 78% 18%, #fff 0, transparent 42%), radial-gradient(circle at 12% 88%, #fff 0, transparent 38%)",
          }}
        />
        <div className="relative flex items-center gap-4">
          <BankMark className="h-14 w-14 text-brand-200" />
          <div className="leading-tight">
            <div className="text-[22px] font-bold tracking-[-0.01em]">Shahjalal Islami Bank PLC.</div>
            <div className="text-[13px] text-brand-200">Common Services Division</div>
          </div>
        </div>

        <div className="relative max-w-xl">
          <div className="mb-4 flex items-center gap-2.5 text-brand-300">
            <VertexMark className="h-6 w-6" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em]">Vertex ERP</span>
          </div>
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.025em]">
            One system for everything
            <br />
            Common Services runs.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-brand-100/80">
            Requisition to procurement to payment, with maker-checker on every material
            action, a tamper-evident audit trail, and approval routing your own
            administrators configure.
          </p>

          <dl className="mt-6 grid grid-cols-3 gap-6 border-t border-white/15 pt-5">
            {[
              ["25", "functional modules"],
              ["2", "identity classes"],
              ["100%", "actions audited"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-[26px] font-bold leading-none tabular">{v}</dt>
                <dd className="mt-1.5 text-[12px] uppercase tracking-[0.07em] text-brand-200/75">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative text-[12px] text-brand-200/65">
          <JvCredit />
        </div>
      </section>

      {/* Right: sign in. */}
      <section className="flex w-full flex-col justify-center overflow-y-auto px-6 py-8 lg:w-[48%] lg:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BankMark className="h-10 w-10 text-brand-700" />
            <div className="leading-tight">
              <div className="text-[16px] font-bold text-brand-800">Shahjalal Islami Bank PLC.</div>
              <div className="text-[12px] text-ink-500">Common Services Division</div>
            </div>
          </div>

          <h2 className="text-[22px] font-bold tracking-[-0.015em] text-ink-950">Sign in</h2>
          <p className="mt-1.5 text-[14px] text-ink-600">
            Bank staff access. Use your employee email address.
          </p>

          <LoginForm personas={personas} />

          <div className="mt-6 border-t border-ink-200 pt-4">
            <p className="text-[13px] text-ink-600">
              Are you a vendor or bidder?{" "}
              <Link href="/vendor/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                Use the vendor portal
              </Link>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
              Vendors are a separate class of user with their own permission model and no
              access to internal bank data.
            </p>
          </div>

          <p className="mt-5 text-[11.5px] leading-relaxed text-ink-400">
            In production this screen authenticates against the Bank&apos;s central Identity and
            Access Management system over API, so password policy and single sign-on stay
            centrally owned. This build runs local authentication so it is portable.
          </p>
        </div>
      </section>
    </main>
  );
}
