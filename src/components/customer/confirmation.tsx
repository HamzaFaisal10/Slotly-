"use client";

import { useBookingByCode } from "@/lib/hooks";
import { fmtDuration, fmtMoney } from "@/lib/money";
import { fmtDate, fmtTime, zoneLabel } from "@/lib/time";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar-links";
import { Avatar, Button, ButtonLink } from "@/components/ui";
import { NotFound } from "./not-found";

export function Confirmation({ code }: { code: string }) {
  const data = useBookingByCode(code);
  if (data === undefined) return null;
  if (!data) return <NotFound what="booking" />;
  const { booking, business, service, staff, addons } = data;
  const tz = business.timeZone;
  const due = booking.totalCents - booking.paidCents;

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <div className="animate-rise">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
        <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight">You&apos;re booked.</h1>
        <p className="mt-2 text-ink-2">
          A confirmation is in your Demo inbox. Booking number <span className="font-medium text-ink">{booking.code}</span>.
        </p>
      </div>

      <div className="mt-8 rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div className="flex items-center gap-3">
          <Avatar name={staff.name} color={staff.color} size={44} />
          <div>
            <p className="font-medium">{service.name}{addons.length ? ` + ${addons.map((a) => a.name).join(", ")}` : ""}</p>
            <p className="text-sm text-ink-3">with {staff.name}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-3">When</dt>
            <dd className="mt-0.5 font-medium">
              {fmtDate(booking.startsAt, tz, "EEEE d MMMM")}
              <br />
              {fmtTime(booking.startsAt, tz)} ({zoneLabel(tz)})
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Where</dt>
            <dd className="mt-0.5 font-medium">
              {business.name}
              <br />
              <span className="font-normal text-ink-2">{business.address}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Paid today</dt>
            <dd className="mt-0.5 font-medium">{fmtMoney(booking.paidCents, business.currency)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Due at the visit</dt>
            <dd className="mt-0.5 font-medium">{fmtMoney(due, business.currency)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-3">{fmtDuration((booking.endsAt - booking.startsAt) / 60000)} appointment</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href={googleCalendarUrl(booking, business, service, staff)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-xl bg-surface px-4 py-2.5 text-[15px] font-medium ring-1 ring-line hover:ring-ink-3"
        >
          Add to Google Calendar
        </a>
        <Button variant="secondary" onClick={() => downloadIcs(booking, business, service, staff)}>
          Download .ics
        </Button>
        <ButtonLink href={`/booking/${booking.code}`} variant="ghost">
          Reschedule or cancel
        </ButtonLink>
      </div>
    </main>
  );
}
