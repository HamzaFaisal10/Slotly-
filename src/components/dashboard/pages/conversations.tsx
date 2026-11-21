"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { fmtDate, fmtTime } from "@/lib/time";
import { Badge, Button } from "@/components/ui";
import { PageTitle, ShellPage } from "../app-shell";
import type { Business } from "@/lib/types";

export function ConversationsPage({ slug }: { slug: string }) {
  return <ShellPage slug={slug} active="conversations">{(b) => <Conversations business={b} />}</ShellPage>;
}

function Conversations({ business }: { business: Business }) {
  const tz = business.timeZone;
  const conversations = useLiveQuery(
    () => getDb().conversations.where("businessId").equals(business.id).reverse().sortBy("updatedAt"),
    [business.id],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? conversations?.[0]?.id ?? null;
  const messages = useLiveQuery(
    async () => (current ? getDb().messages.where("conversationId").equals(current).sortBy("at") : []),
    [current],
  );
  const conv = conversations?.find((c) => c.id === current);
  const booking = useLiveQuery(async () => (conv?.bookingId ? getDb().bookings.get(conv.bookingId) : undefined), [conv?.bookingId]);

  if (!conversations) return null;

  return (
    <>
      <PageTitle
        title="Conversations"
        sub="Every chat and call with the AI receptionist, with the tools it used and the booking it made."
      />
      {conversations.length === 0 ? (
        <div className="rounded-2xl bg-surface p-10 text-center ring-1 ring-line">
          <p className="font-display text-xl font-semibold">No conversations yet</p>
          <p className="mt-2 text-ink-2">Open the booking page and chat with the receptionist. The conversation appears here live.</p>
          <Link href={`/b/${business.slug}`} target="_blank" className="mt-4 inline-block text-accent-dark underline-offset-2 hover:underline">
            Open the booking page
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-2xl bg-surface p-2 ring-1 ring-line">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className={clsx("w-full rounded-xl px-3 py-2.5 text-left", c.id === current ? "bg-accent-soft" : "hover:bg-paper")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.customerName || "Visitor"}</span>
                    <span className="shrink-0 text-xs text-ink-3">{fmtTime(c.updatedAt, tz)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={c.channel === "voice" ? "accent" : "neutral"}>{c.channel === "voice" ? "Call" : "Chat"}</Badge>
                    {c.needsHuman && <Badge tone="glow">Needs a person</Badge>}
                    {c.bookingId && <Badge tone="ok">Booking</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {conv && (
            <section className="flex max-h-[70vh] flex-col rounded-2xl bg-surface ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                <div>
                  <p className="font-medium">{conv.customerName || "Visitor"}</p>
                  <p className="text-xs text-ink-3">
                    {conv.channel === "voice" ? "Voice call" : "Chat"} started {fmtDate(conv.startedAt, tz, "EEE d MMM")} at {fmtTime(conv.startedAt, tz)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {booking && (
                    <Link href={`/app/${business.slug}/bookings/${booking.code}`} className="rounded-lg bg-mist px-3 py-1.5 text-sm hover:bg-line">
                      Booking {booking.code} · {booking.status.replace("_", " ")}
                    </Link>
                  )}
                  {conv.needsHuman && (
                    <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => getDb().conversations.update(conv.id, { needsHuman: false })}>
                      Mark handled
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages?.map((m) => (
                  <div key={m.id} className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                    <p
                      className={clsx(
                        "max-w-[80%] rounded-2xl px-4 py-2 text-[15px]",
                        m.role === "user" ? "bg-accent text-on-accent" : "bg-paper ring-1 ring-line",
                      )}
                    >
                      {m.text}
                    </p>
                    {m.actions?.map((a, i) => (
                      <code key={i} className="mt-1 max-w-[80%] rounded-lg bg-contrast px-2.5 py-1 text-[12px] text-on-contrast/80">
                        {a}
                      </code>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
