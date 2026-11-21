"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { useBusiness } from "@/lib/hooks";
import { signOut, useSession } from "@/lib/session";
import { resetDemo } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import { addDaysKey, dateKey, fmtDateKey, fmtTime, todayKey, zonedToUtc } from "@/lib/time";
import { Avatar, Button } from "@/components/ui";
import { TeamCalendar } from "./team-calendar";
import { BookingDrawer } from "./booking-drawer";
import type { Booking } from "@/lib/types";

const noopSubscribe = () => () => {};

export function Dashboard({ slug, initialCode = null }: { slug: string; initialCode?: string | null }) {
  const router = useRouter();
  const session = useSession();
  const business = useBusiness(slug);
  const [day, setDay] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(initialCode);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (mounted && !session) router.replace("/app");
  }, [mounted, session, router]);

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
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-lg font-bold">
              Slotly
            </Link>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <span className="hidden font-medium sm:block">{business.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/b/${business.slug}`}
              target="_blank"
              className="hidden rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-mist md:block"
            >
              Open booking page
            </Link>
            <span className="flex items-center gap-2 rounded-xl bg-mist py-1 pl-1 pr-3 text-sm">
              <Avatar
                name={session.name}
                color={session.staffId ? data.staff.find((s) => s.id === session.staffId)?.color ?? "#4d4763" : "#1f1a2e"}
                size={28}
              />
              <span>
                {session.name}
                <span className="text-ink-3"> · {session.role}</span>
              </span>
            </span>
            <Button
              variant="ghost"
              className="px-3 py-2 text-sm"
              onClick={() => {
                signOut();
                router.push("/app");
              }}
            >
              Switch role
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {session.role !== "staff" && (
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Appointments today" value={String(stats.today)} note={`${stats.todayLeft} still to come`} />
            <Stat label="Revenue, last 7 days" value={fmtMoney(stats.revenueWeek, business.currency)} note="Deposits and payments at visits" />
            <Stat label="Upcoming bookings" value={String(stats.upcoming)} note={`${fmtMoney(stats.deposits, business.currency)} in deposits held`} />
            <Stat label="No-show rate" value={`${stats.noShowRate}%`} note="Last 30 days" />
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
          <section className="min-w-0 rounded-2xl bg-white ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h1 className="font-display text-xl font-semibold">{fmtDateKey(date, "EEEE d MMMM")}</h1>
                <p className="text-xs text-ink-3">Live: new bookings appear without refreshing.</p>
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
            />
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
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
              <section className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
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
      </main>

      {openCode && <BookingDrawer code={openCode} onClose={() => setOpenCode(null)} />}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-ink-3">{note}</p>
    </div>
  );
}

function SourceTag({ source, status }: { source: Booking["source"]; status: Booking["status"] }) {
  if (status === "held") return <span className="rounded-full bg-glow-soft px-2 py-0.5 text-[11px] text-[#7a5a06]">Paying now</span>;
  if (status === "cancelled") return <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] text-bad">Cancelled</span>;
  const label = { web: "Online", ai: "AI chat", voice: "AI call", manual: "Front desk" }[source];
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px]", source === "ai" || source === "voice" ? "bg-violet-soft text-violet-dark" : "bg-mist text-ink-2")}>{label}</span>;
}
