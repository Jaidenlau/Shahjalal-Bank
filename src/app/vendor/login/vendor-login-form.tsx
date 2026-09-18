"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { vendorSignIn } from "@/lib/session-actions";
import { Icon } from "@/components/ui";

const ACCOUNTS = [
  { email: "bids@rahimtraders.com.bd", company: "Rahim Traders Ltd" },
  { email: "bids@meghnatech.com.bd", company: "Meghna Technologies Ltd" },
  { email: "bids@bengaloffice.com.bd", company: "Bengal Office Solutions" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
      {!pending ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
    </button>
  );
}

export function VendorLoginForm() {
  const [state, action] = useActionState(vendorSignIn, undefined);
  const [email, setEmail] = useState(ACCOUNTS[0]!.email);

  return (
    <>
      <form action={action} className="mt-5 space-y-3.5">
        <div>
          <label htmlFor="v-email" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
            Registered email
          </label>
          <input
            id="v-email" name="email" type="email" required value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-[5px] border border-ink-300 px-3 py-2.5 text-[14px] focus:border-ink-700"
          />
        </div>
        <div>
          <label htmlFor="v-password" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
            Password
          </label>
          <input
            id="v-password" name="password" type="password" required defaultValue="Demo@2026"
            className="w-full rounded-[5px] border border-ink-300 px-3 py-2.5 text-[14px] focus:border-ink-700"
          />
        </div>
        {state?.error ? (
          <div className="flex items-start gap-2 rounded-[5px] border border-danger-500/40 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <Submit />
      </form>

      <div className="mt-5 rounded-[5px] border border-ink-200 bg-ink-50 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          Demonstration bidder accounts
        </div>
        <div className="space-y-0.5">
          {ACCOUNTS.map(a => (
            <button
              key={a.email} type="button" onClick={() => setEmail(a.email)}
              className={`flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                email === a.email ? "bg-ink-200 font-semibold" : "hover:bg-white"
              }`}
            >
              <span className="truncate text-ink-800">{a.company}</span>
              {email === a.email ? <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-ink-700" /> : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
