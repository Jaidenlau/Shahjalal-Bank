"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";

export interface NotificationItem {
  id: string; title: string; body: string; link: string | null; isRead: boolean; when: string;
}

/**
 * In-app notification centre.
 *
 * The bid commits to email and SMS notification through the middleware tier.
 * This build sends neither — the venue has no network and faking a sent email
 * would be a claim we could not stand behind — so notifications are delivered
 * here and the integration panel says exactly that.
 */
export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter(i => !i.isRead).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative rounded-[5px] p-1.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-danger-600 px-1 text-[9.5px] font-bold text-white tabular">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-30 mt-1.5 w-[380px] overflow-hidden rounded-[6px] border border-ink-200 bg-white shadow-[0_8px_28px_rgba(10,20,16,0.14)]">
            <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-ink-900">Notifications</span>
              <span className="text-[11.5px] text-ink-500">{unread} unread</span>
            </div>
            <ul className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-3.5 py-8 text-center text-[13px] text-ink-500">Nothing new.</li>
              ) : (
                items.map(n => {
                  const inner = (
                    <div className={`px-3.5 py-2.5 transition-colors hover:bg-ink-50 ${n.isRead ? "" : "bg-brand-50/50"}`}>
                      <div className="flex items-start gap-2">
                        {!n.isRead ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold leading-snug text-ink-900">{n.title}</div>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-600">{n.body}</p>
                          <div className="mt-1 text-[11px] text-ink-400">{n.when}</div>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => setOpen(false)} className="block">{inner}</Link>
                      ) : inner}
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t border-ink-200 bg-ink-50 px-3.5 py-2 text-[11.5px] text-ink-500">
              Email and SMS delivery route through the middleware tier in production.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
