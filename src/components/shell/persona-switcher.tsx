"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchPersona } from "@/lib/session-actions";
import { Icon } from "@/components/ui";

export interface PersonaOption {
  id: string; fullName: string; role: string; designation: string; moduleCount: number;
}

/**
 * Presenter control for moving between users without retyping passwords.
 *
 * Labelled as a demonstration control on screen so it is never mistaken for a
 * product feature — a switch-user button with no password would be the first
 * thing a bank security reviewer objected to. Each switch writes an audit row.
 */
export function PersonaSwitcher({
  personas, currentId,
}: { personas: PersonaOption[]; currentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = personas.find(p => p.id === currentId);

  const choose = (id: string) => {
    setOpen(false);
    start(async () => {
      await switchPersona(id);
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className="flex items-center gap-2 rounded-[5px] border border-dashed border-ink-400 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
        title="Demonstration control: switch the signed-in user"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Switch user</span>
        <Icon name="chevronDown" className="h-3 w-3" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-30 mt-1.5 w-[300px] overflow-hidden rounded-[6px] border border-ink-200 bg-white shadow-[0_8px_28px_rgba(10,20,16,0.14)]">
            <div className="border-b border-ink-200 bg-ink-50 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-500">
                Demonstration control
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
                Switches the signed-in user without a password, for demonstration only.
                Each switch is written to the audit trail.
              </p>
            </div>
            <ul className="max-h-[400px] overflow-y-auto py-1">
              {personas.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      p.id === currentId ? "bg-brand-50" : "hover:bg-ink-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink-900">{p.fullName}</span>
                      <span className="block truncate text-[11.5px] text-ink-500">{p.role}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] font-semibold text-ink-600 tabular">{p.moduleCount}</span>
                      <span className="block text-[10px] uppercase tracking-wide text-ink-400">modules</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {current ? <span className="sr-only">Signed in as {current.fullName}</span> : null}
    </div>
  );
}
