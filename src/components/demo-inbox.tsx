"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { useEmails } from "@/lib/hooks";
import type { DemoEmail } from "@/lib/types";

/**
 * Every email the app "sends" shows up here instead of a real inbox.
 * In production these go out through Resend.
 */
export function DemoInbox() {
  const emails = useEmails() ?? [];
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<DemoEmail | null>(null);
  const unread = emails.filter((e) => !e.read).length;

  const openEmail = (e: DemoEmail) => {
    setCurrent(e);
    if (!e.read) void getDb().emails.update(e.id, { read: true });
  };

  return (
    <div className="fixed bottom-20 left-4 z-50 lg:bottom-4 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="Demo inbox"
          className="animate-rise mb-3 flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_50px_-12px_rgba(31,26,46,0.35)] ring-1 ring-line"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-base font-semibold">Demo inbox</p>
              <p className="text-xs text-ink-3">Emails the app sends land here, not in a real inbox.</p>
            </div>
            <button
              onClick={() => (current ? setCurrent(null) : setOpen(false))}
              className="rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-mist"
            >
              {current ? "Back" : "Close"}
            </button>
          </div>
          <div className="overflow-y-auto">
            {current ? (
              <article className="space-y-3 p-4 text-[15px]">
                <p className="text-xs text-ink-3">To {current.to}</p>
                <h3 className="font-display text-lg font-semibold leading-snug">{current.subject}</h3>
                {current.lines.map((l, i) => (
                  <p key={i} className="text-ink-2">
                    {l}
                  </p>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  {current.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-dark"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </article>
            ) : emails.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-3">
                No emails yet. Book an appointment and the confirmation appears here.
              </p>
            ) : (
              <ul>
                {emails.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => openEmail(e)}
                      className="flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left hover:bg-paper"
                    >
                      <span
                        className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.read ? "bg-transparent" : "bg-accent")}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.subject}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {e.to} · {new Date(e.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-contrast px-4 py-2.5 text-sm font-medium text-on-contrast shadow-lg hover:bg-contrast-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        Demo inbox
        {unread > 0 && (
          <span className="rounded-full bg-glow px-1.5 text-xs font-semibold text-ink">{unread}</span>
        )}
      </button>
    </div>
  );
}
