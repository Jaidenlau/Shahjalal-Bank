import { redirect } from "next/navigation";
import Link from "next/link";
import { currentVendorUser } from "@/lib/auth";
import { BankMark } from "@/components/brand";
import { VendorLoginForm } from "./vendor-login-form";

export const dynamic = "force-dynamic";

export default async function VendorLoginPage() {
  if (await currentVendorUser()) redirect("/vendor");

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <BankMark className="mx-auto h-14 w-14 text-ink-400" />
          <h1 className="mt-4 text-[20px] font-bold text-white">Shahjalal Islami Bank PLC.</h1>
          <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            External Vendor Portal
          </p>
        </div>

        <div className="rounded-[6px] bg-white p-7 shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
          <h2 className="text-[19px] font-bold text-ink-950">Bidder sign in</h2>
          <p className="mt-1 text-[13px] text-ink-600">
            For enlisted vendors and bidders. Use the email registered against your company.
          </p>

          <VendorLoginForm />

          <div className="mt-6 border-t border-ink-200 pt-4 text-[12.5px] text-ink-600">
            <p>
              Not enlisted yet?{" "}
              <span className="font-semibold text-ink-800">Vendor enlistment</span> is handled by the
              Common Services Division. Contact procurement@sjiblbd.com.
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] text-ink-400">
          Bank staff should use the{" "}
          <Link href="/login" className="font-semibold text-ink-200 underline underline-offset-2">
            internal sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
