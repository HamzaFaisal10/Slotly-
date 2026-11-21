"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { useBookingByCode } from "@/lib/hooks";
import { availableSlots, isClosed } from "@/lib/slots";
import { BookingError, cancelBooking, cancelTerms, rescheduleBooking } from "@/lib/bookings";
import { fmtMoney } from "@/lib/money";
import { addDaysKey, fmtDate, fmtDateKey, fmtTime, todayKey, zoneLabel } from "@/lib/time";
import { Avatar, Badge, Button, Field, inputClass } from "@/components/ui";
import { NotFound } from "./not-found";

const STATUS: Record<string, { label: string; tone: "ok" | "bad" | "neutral" | "glow" | "violet" }> = {
  confirmed: { label: "Confirmed", tone: "ok" },
  held: { label: "Awaiting payment", tone: "glow" },
  arrived: { label: "Checked in", tone: "violet" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "bad" },
  no_show: { label: "Missed", tone: "bad" },
  expired: { label: "Not completed", tone: "neutral" },
};

/** Reached from the link in every email. No login: the booking code is the key. */
export function ManageBooking({ code }: { code: string }) {
  const data = useBookingByCode(code);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [message, setMessage] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  if (data === undefined) return null;
  if (!data) return <NotFound what="booking" />;
  const { booking, business, service, staff } = data;
  const tz = business.timeZone;
  const status = STATUS[booking.status];
  const open = booking.status === "confirmed" && booking.startsAt > now;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href={`/b/${business.slug}`} className="font-display text-lg font-semibold">
        {business.name}
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{service.name}</h1>
          <p className="mt-1 text-ink-2">
            {fmtDate(booking.startsAt, tz, "EEEE d MMMM")} at {fmtTime(booking.startsAt, tz)} ({zoneLabel(tz)})
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
        <Avatar name={staff.name} color={staff.color} />
        <div className="text-sm">
          <p className="font-medium">With {staff.name}</p>
          <p className="text-ink-3">
            Booking {booking.code} · Paid {fmtMoney(booking.paidCents, business.currency)} of{" "}
            {fmtMoney(booking.totalCents, business.currency)}
          </p>
        </div>
      </div>

      {message && <p className="mt-5 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">{message}</p>}

      {open && mode === "view" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => { setMode("move"); setMessage(null); }}>Reschedule</Button>
          <Button variant="danger" onClick={() => { setMode("cancel"); setMessage(null); }}>
            Cancel booking
          </Button>
        </div>
      )}

      {open && mode === "move" && (
        <Reschedule
          code={booking.code}
          onCancel={() => setMode("view")}
          onDone={(when) => {
            setMode("view");
            setMessage(`Moved to ${when}. A new confirmation is in your Demo inbox.`);
          }}
          data={data}
        />
      )}

      {open && mode === "cancel" && (
        <CancelPanel
          code={booking.code}
          terms={cancelTerms(booking, business.policy.freeCancelHours, "customer")}
          currency={business.currency}
          freeHours={business.policy.freeCancelHours}
          onBack={() => setMode("view")}
          onDone={(m) => {
            setMode("view");
            setMessage(m);
          }}
        />
      )}

      {!open && booking.status !== "cancelled" && (
        <p className="mt-6 text-sm text-ink-3">This booking can no longer be changed online. Call {business.phone}.</p>
      )}
    </main>
  );
}

function Reschedule({
  code,
  data,
  onCancel,
  onDone,
}: {
  code: string;
  data: NonNullable<ReturnType<typeof useBookingByCode>>;
  onCancel: () => void;
  onDone: (when: string) => void;
}) {
  const { booking, business, service, addons } = data;
  const tz = business.timeZone;
  const today = todayKey(tz);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysKey(today, i)), [today]);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byDay = useLiveQuery(async () => {
    const db = getDb();
    const [bookings, timeOff, staff] = await Promise.all([
      db.bookings.toArray(),
      db.timeOff.toArray(),
      db.staff.where("businessId").equals(business.id).toArray(),
    ]);
    const out: Record<string, ReturnType<typeof availableSlots>> = {};
    for (const d of days)
      out[d] = availableSlots({ business, service, addons, staff, date: d, bookings, timeOff, excludeBookingId: booking.id });
    return out;
  }, [business.id, service.id, booking.id, days]);

  const selected = date ?? days.find((d) => byDay?.[d]?.length) ?? today;
  const slots = byDay?.[selected] ?? [];

  const move = async (start: number) => {
    setError(null);
    try {
      const b = await rescheduleBooking(code, start, "any", "customer");
      onDone(`${fmtDate(b.startsAt, tz, "EEE d MMM")}, ${fmtTime(b.startsAt, tz)}`);
    } catch (e) {
      setError(e instanceof BookingError ? e.message : "Could not move the booking.");
    }
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Choose a new time</h2>
        <button onClick={onCancel} className="text-sm text-ink-3 hover:text-ink">
          Keep current time
        </button>
      </div>
      <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-2">
        <div className="flex gap-2">
          {days.map((d) => {
            const count = byDay?.[d]?.length ?? 0;
            return (
              <button
                key={d}
                disabled={!count}
                onClick={() => setDate(d)}
                className={clsx(
                  "flex w-[64px] shrink-0 flex-col items-center rounded-2xl py-2.5",
                  d === selected ? "bg-ink text-white" : count ? "bg-white ring-1 ring-line" : "text-ink-3/70 ring-1 ring-line/60",
                )}
              >
                <span className="text-xs">{fmtDateKey(d, "EEE")}</span>
                <span className="font-display text-xl font-semibold">{fmtDateKey(d, "d")}</span>
                <span className="text-[11px] opacity-70">{isClosed(business, d) ? "Closed" : count ? `${count}` : "Full"}</span>
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {slots.map((s) => (
          <button
            key={s.start}
            onClick={() => move(s.start)}
            className="rounded-xl bg-white py-2.5 font-medium ring-1 ring-line hover:bg-violet hover:text-white"
          >
            {fmtTime(s.start, tz)}
          </button>
        ))}
      </div>
    </section>
  );
}

function CancelPanel({
  code,
  terms,
  currency,
  freeHours,
  onBack,
  onDone,
}: {
  code: string;
  terms: ReturnType<typeof cancelTerms>;
  currency: string;
  freeHours: number;
  onBack: () => void;
  onDone: (m: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const r = await cancelBooking(code, "customer", reason);
    onDone(
      r.refundCents > 0
        ? `Cancelled. ${fmtMoney(r.refundCents, currency)} will be refunded to your card.`
        : r.keptCents > 0
          ? `Cancelled. The ${fmtMoney(r.keptCents, currency)} deposit was kept under the policy.`
          : "Cancelled.",
    );
  };
  return (
    <section className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-line">
      <h2 className="font-display text-xl font-semibold">Cancel this booking?</h2>
      <p className="mt-2 text-sm text-ink-2">
        {terms.free
          ? terms.refundCents > 0
            ? `You're more than ${freeHours} hours ahead, so your ${fmtMoney(terms.refundCents, currency)} is refunded in full.`
            : "Nothing was paid, so there is nothing to refund."
          : `It's less than ${freeHours} hours before your appointment, so the ${fmtMoney(terms.keptCents, currency)} deposit is kept.`}
      </p>
      <div className="mt-4">
        <Field label="Reason (optional)">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="danger" disabled={busy} onClick={confirm}>
          Cancel booking
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Keep booking
        </Button>
      </div>
    </section>
  );
}
