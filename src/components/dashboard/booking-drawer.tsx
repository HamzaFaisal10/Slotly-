"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { useBookingByCode } from "@/lib/hooks";
import { BookingError, cancelBooking, setVisitStatus } from "@/lib/bookings";
import { fmtMoney } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/time";
import { Avatar, Badge, Button } from "@/components/ui";

const STATUS = {
  held: ["Held, paying now", "glow"],
  confirmed: ["Confirmed", "ok"],
  arrived: ["Checked in", "violet"],
  completed: ["Completed", "neutral"],
  cancelled: ["Cancelled", "bad"],
  no_show: ["No-show", "bad"],
  expired: ["Hold expired", "neutral"],
} as const;

export function BookingDrawer({ code, onClose }: { code: string; onClose: () => void }) {
  const data = useBookingByCode(code);
  const history = useLiveQuery(
    () => (data ? getDb().activity.where("bookingId").equals(data.booking.id).sortBy("at") : []),
    [data?.booking.id],
  );
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!data) return null;
  const { booking, business, service, staff, customer, addons } = data;
  const tz = business.timeZone;
  const [label, tone] = STATUS[booking.status];

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof BookingError ? e.message : "That didn't work. Try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Booking ${booking.code}`}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-ink-3">{booking.code}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{service.name}</h2>
            {addons.length > 0 && <p className="text-sm text-ink-2">+ {addons.map((a) => a!.name).join(", ")}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-mist">
            Close
          </button>
        </div>

        <div className="mt-3">
          <Badge tone={tone}>{label}</Badge>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-3">When</dt>
            <dd>
              {fmtDate(booking.startsAt, tz, "EEE d MMM")}, {fmtTime(booking.startsAt, tz)} to {fmtTime(booking.endsAt, tz)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-3">With</dt>
            <dd className="flex items-center gap-2">
              <Avatar name={staff.name} color={staff.color} size={22} />
              {staff.name}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Paid</dt>
            <dd>
              {fmtMoney(booking.paidCents, business.currency)} of {fmtMoney(booking.totalCents, business.currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Booked</dt>
            <dd>{{ web: "Online", ai: "AI receptionist (chat)", voice: "AI receptionist (call)", manual: "Front desk" }[booking.source]}</dd>
          </div>
        </dl>

        {customer && (
          <section className="mt-6 rounded-2xl bg-paper p-4 text-sm ring-1 ring-line">
            <p className="font-medium">{customer.name}</p>
            <p className="text-ink-2">{customer.email}</p>
            <p className="text-ink-2">{customer.phone}</p>
            {customer.noShowCount > 0 && (
              <p className="mt-2 text-bad">
                {customer.noShowCount} no-show{customer.noShowCount > 1 ? "s" : ""} before
              </p>
            )}
            {customer.notes && <p className="mt-2 rounded-lg bg-glow-soft px-3 py-2 text-[#5c4405]">{customer.notes}</p>}
            {booking.note && <p className="mt-2 text-ink-2">Note: {booking.note}</p>}
          </section>
        )}

        {error && <p className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {booking.status === "confirmed" && (
            <Button onClick={() => run(() => setVisitStatus(booking.code, "arrived"))}>Mark arrived</Button>
          )}
          {["confirmed", "arrived"].includes(booking.status) && (
            <Button variant="secondary" onClick={() => run(() => setVisitStatus(booking.code, "completed"))}>
              Done, take {fmtMoney(booking.totalCents - booking.paidCents, business.currency)}
            </Button>
          )}
          {booking.status === "confirmed" && booking.startsAt < now && (
            <Button variant="secondary" onClick={() => run(() => setVisitStatus(booking.code, "no_show"))}>
              No-show
            </Button>
          )}
          {["confirmed", "arrived"].includes(booking.status) && (
            <Button
              variant="danger"
              onClick={() => run(() => cancelBooking(booking.code, "business", "Cancelled by the salon"))}
            >
              Cancel and refund
            </Button>
          )}
        </div>

        {history && history.length > 0 && (
          <section className="mt-8">
            <h3 className="text-sm font-medium text-ink-3">History</h3>
            <ol className="mt-2 space-y-2 border-l border-line pl-4 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium capitalize">{h.action.replace("_", " ")}</span>
                  <span className="text-ink-3">
                    {" "}
                    by {h.actor}, {fmtDate(h.at, tz, "d MMM")} {fmtTime(h.at, tz)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  );
}
