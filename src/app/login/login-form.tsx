"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "@/lib/session-actions";
import { Icon, buttonClass } from "@/components/ui";

interface Persona {
  email: string; fullName: string; designation: string; role: string; branch: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "w-full py-2.5 text-[14px]")}>
      {pending ? "Signing in…" : "Sign in"}
      {!pending && <Icon name="arrowRight" className="h-4 w-4" />}
    </button>
  );
}

export function LoginForm({ personas }: { personas: Persona[] }) {
  const [state, action] = useActionState(signIn, undefined);
  const [email, setEmail] = useState(personas[0]?.email ?? "");
  const [password, setPassword] = useState("Demo@2026");

  return (
    <>
      <form action={action} className="mt-5 space-y-3.5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
            Email address
          </label>
          <input
            id="email" name="email" type="email" required autoComplete="username"
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
            placeholder="name@sjiblbd.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-ink-800">
            Password
          </label>
          <input
            id="password" name="password" type="password" required autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded-[5px] border border-ink-300 bg-white px-3 py-2.5 text-[14px] text-ink-900 focus:border-brand-500"
          />
        </div>

        {state?.error ? (
          <div className="flex items-start gap-2 rounded-[5px] border border-danger-500/40 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <SubmitButton />
      </form>

      {/* Presenter convenience. Labelled plainly so nobody in the room mistakes
          it for part of the product. */}
      <div className="mt-5 rounded-[6px] border border-ink-200 bg-ink-50 p-3">
        <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          <Icon name="user" className="h-3.5 w-3.5" />
          Demonstration accounts
        </div>
        <div className="grid grid-cols-2 gap-1">
          {personas.map(p => (
            <button
              key={p.email} type="button"
              onClick={() => { setEmail(p.email); setPassword("Demo@2026"); }}
              className={`flex items-center justify-between gap-3 rounded-[4px] px-2.5 py-1.5 text-left transition-colors ${
                email === p.email ? "bg-brand-100 ring-1 ring-brand-500/30" : "hover:bg-white"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-ink-900">{p.fullName}</span>
                <span className="block truncate text-[11px] text-ink-500">{p.role}</span>
              </span>
              {email === p.email ? <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-brand-600" /> : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
