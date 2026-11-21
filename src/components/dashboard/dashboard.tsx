"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { resetDemo } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import { addDaysKey, dateKey, fmtDateKey, fmtTime, todayKey, zonedToUtc } from "@/lib/time";
import { Button } from "@/components/ui";
import { AppShell, useAppSession } from "./app-shell";
import { TeamCalendar } from "./team-calendar";
import { BookingDrawer } from "./booking-drawer";
import { NewBookingDialog } from "./new-booking-dialog";
import { BookingError, rescheduleBooking } from "@/lib/bookings";
import type { Booking } from "@/lib/types";

export function Dashboard({ slug, initialCode = null }: { slug: string; initialCode?: string | null }) {
  const { mounted, session, business } = useAppSession(slug);
  const [day, setDay] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(initialCode);
  const [creating, setCreating] = useState<{ staffId: string; startsAt: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);


  const tz = business?.timeZone ?? "UTC";
  const today = todayKey(tz);
  const date = day ?? today;

  const data = useLiveQuery(async () => {
    if (!business) return undefined;
    const db = getDb();
    const [staff, services, customers, bookings, payments, timeOff] = await Promise.all([
      db.staff.where("businessId").equals(business.id).toArray(),
      db.services.where("businessId").equals(business.id).toArray(),
      db.customers.where("businessId").equals(business.id).toArray(),
      db.bookings.where("businessId").equals(business.id).toArray(),
      db.payments.where("businessId").equals(business.id).toArray(),
      db.timeOff.toArray(),
    ]);
    return { staff, services, customers, bookings, payments, timeOff };
  }, [business?.id]);

  const stats = useMemo(() => {
    if (!data || !business) return null;
    const dayStart = zonedToUtc(today, "00:00", tz);
    const weekStart = dayStart - 6 * 86400000;
    const todays = data.bookings.filter(
      (b) => dateKey(b.startsAt, tz) === today && ["confirmed", "arrived", "completed", "held"].includes(b.status),
    );
    const revenueWeek = data.payments.filter((p) => p.createdAt >= weekStart && p.createdAt <= now).reduce((s, p) => s + p.amountCents, 0);
    const last30 = data.bookings.filter((b) => b.startsAt < now && b.startsAt > now - 30 * 86400000);
    const finished = last30.filter((b) => ["completed", "no_show"].includes(b.status));
    const noShows = finished.filter((b) => b.status === "no_show").length;
    const upcoming = data.bookings.filter((b) => b.status === "confirmed" && b.startsAt > now);
    return {
      today: todays.length,
      todayLeft: todays.filter((b) => b.startsAt > now).length,
      revenueWeek,
      upcoming: upcoming.length,
      deposits: upcoming.reduce((s, b) => s + b.paidCents, 0),
      noShowRate: finished.length ? Math.round((noShows / finished.length) * 100) : 0,
    };
  }, [data, business, today, tz, now]);

  if (!mounted || !session || business === undefined || !data || !stats) return null;
  if (!business) return null;

  const visibleStaff = session.role === "staff" ? data.staff.filter((s) => s.id === session.staffId) : data.staff;
  const recent = [...data.bookings]
    .filter((b) => b.status !== "expired" && (session.role !== "staff" || b.staffId === session.staffId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  const name = (b: Booking) => data.customers.find((c) => c.id === b.customerId)?.name ?? "Walk-in hold";
  const svc = (b: Booking) => data.services.find((s) => s.id === b.serviceId)?.name ?? "";

  return (
    <AppShell business={business} session={session} active="calendar">
        {session.role !== "staff" && (
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Appointments today" value={String(stats.today)} note={`${stats.todayLeft} still to come`} />
            <Stat label="Revenue, last 7 days" value={fmtMoney(stats.revenueWeek, business.currency)} note="Deposits and payments at visits" />
            <Stat label="Upcoming bookings" value={String(stats.upcoming)} note={`${fmtMoney(stats.deposits, business.currency)} in deposits held`} />
            <Stat label="No-show rate" value={`${stats.noShowRate}%`} note="Last 30 days" />
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
          <section className="min-w-0 rounded-2xl bg-surface ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h1 className="font-display text-xl font-semibold">{fmtDateKey(date, "EEEE d MMMM")}</h1>
                <p className="text-xs text-ink-3">
                  Live: new bookings appear without refreshing.{session.role !== "staff" && " Drag to move, click an empty spot to add."}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setDay(addDaysKey(date, -1))} aria-label="Previous day">
                  ‹
                </Button>
                <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setDay(null)} disabled={date === today}>
                  Today
                </Button>
                <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setDay(addDaysKey(date, 1))} aria-label="Next day">
                  ›
                </Button>
              </div>
            </div>
            <TeamCalendar
              business={business}
              date={date}
              staff={visibleStaff}
              bookings={data.bookings}
              timeOff={data.timeOff}
              services={data.services}
              customers={data.customers}
              onOpen={setOpenCode}
              onMove={
                session.role === "staff"
                  ? undefined
                  : async (code, startsAt, staffId) => {
                      try {
                        const b = await rescheduleBooking(code, startsAt, staffId, "business");
                        const who = data.staff.find((m) => m.id === b.staffId)?.name.split(" ")[0];
                        setToast({ text: `Moved to ${fmtTime(b.startsAt, tz)} with ${who}. The customer was emailed.` });
                      } catch (e) {
                        setToast({ text: e instanceof BookingError ? `Can't move there: ${e.message}` : "Couldn't move the booking.", bad: true });
                      }
                    }
              }
              onCreate={session.role === "staff" ? undefined : (staffId, startsAt) => setCreating({ staffId, startsAt })}
            />
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-display text-lg font-semibold">Latest bookings</h2>
              <ul className="mt-3 space-y-1">
                {recent.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => setOpenCode(b.code)} className="w-full rounded-xl px-2 py-2 text-left hover:bg-paper">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name(b)}</span>
                        <SourceTag source={b.source} status={b.status} />
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {svc(b)}, {fmtDateKey(dateKey(b.startsAt, tz), "EEE d MMM")} {fmtTime(b.startsAt, tz)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {session.role === "owner" && (
              <section className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
                <h2 className="font-display text-lg font-semibold">Demo data</h2>
                <p className="mt-1 text-ink-2">Start over with a fresh copy of Lumen Studio, dated from today.</p>
                <Button
                  variant="secondary"
                  className="mt-3 text-sm"
                  onClick={async () => {
                    await resetDemo();
                    setDay(null);
                  }}
                >
                  Reset demo data
                </Button>
              </section>
            )}
          </aside>
        </div>

      {creating && (
        <NewBookingDialog
          business={business}
          staff={data.staff.find((m) => m.id === creating.staffId)!}
          services={data.services}
          startsAt={creating.startsAt}
          onClose={() => setCreating(null)}
          onDone={(text) => {
            setCreating(null);
            setToast({ text });
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          className={clsx(
            "animate-rise fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl",
            toast.bad ? "bg-bad text-on-contrast" : "bg-contrast text-on-contrast",
          )}
        >
          {toast.text}
        </div>
      )}
      {openCode && <BookingDrawer code={openCode} onClose={() => setOpenCode(null)} />}
    </AppShell>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-ink-3">{note}</p>
    </div>
  );
}

function SourceTag({ source, status }: { source: Booking["source"]; status: Booking["status"] }) {
  if (status === "held") return <span className="rounded-full bg-glow-soft px-2 py-0.5 text-[11px] text-glow-ink">Paying now</span>;
  if (status === "cancelled") return <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] text-bad">Cancelled</span>;
  const label = { web: "Online", ai: "AI chat", voice: "AI call", manual: "Front desk" }[source];
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px]", source === "ai" || source === "voice" ? "bg-accent-soft text-accent-dark" : "bg-mist text-ink-2")}>{label}</span>;
}
