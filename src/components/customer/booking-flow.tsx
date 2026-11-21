"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { useBusiness, useCatalog } from "@/lib/hooks";
import { availableSlots, isClosed, serviceMinutes, type Slot } from "@/lib/slots";
import { BookingError, confirmBooking, holdSlot, validateCustomer } from "@/lib/bookings";
import { depositFor, fmtDuration, fmtMoney } from "@/lib/money";
import { addDaysKey, fmtDate, fmtDateKey, fmtTime, minutesOfDay, todayKey, weekdayOf, zoneLabel } from "@/lib/time";
import { Avatar, Button, Field, inputClass } from "@/components/ui";
import { NotFound } from "./not-found";
import type { Business, Service, ServiceAddon, Staff } from "@/lib/types";

const STEPS = ["Service", "Team member", "Time", "Details and payment"] as const;

export function BookingFlow({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const business = useBusiness(slug);
  const catalog = useCatalog(business?.id);

  const serviceId = params.get("service");
  const addonIds = useMemo(() => (params.get("addons") ?? "").split(",").filter(Boolean), [params]);
  const staffId = params.get("staff");
  const holdId = params.get("hold");

  if (business === undefined || (business && !catalog)) return null;
  if (!business) return <NotFound />;
  const { services, addons, staff, categories } = catalog!;
  const service = services.find((s) => s.id === serviceId) ?? null;
  const chosenAddons = addons.filter((a) => a.serviceId === service?.id && addonIds.includes(a.id));
  const member = staff.find((s) => s.id === staffId) ?? null;

  const step = !service ? 0 : !staffId ? 1 : !holdId ? 2 : 3;

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`/b/${slug}/book?${q.toString()}`, { scroll: true });
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <Link href={`/b/${slug}`} className="font-display text-lg font-semibold">
          {business.name}
        </Link>
        <Link href={`/b/${slug}`} className="text-sm text-ink-3 hover:text-ink">
          Close
        </Link>
      </div>

      <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <span className={clsx("block h-1 rounded-full", i <= step ? "bg-violet" : "bg-line")} />
            <span
              className={clsx("mt-2 hidden text-xs sm:block", i === step ? "font-medium text-ink" : "text-ink-3")}
              aria-current={i === step ? "step" : undefined}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div key={step} className="animate-rise min-w-0">
          {step === 0 && (
            <ServiceStep
              business={business}
              categories={categories}
              services={services}
              onPick={(id) => go({ service: id, addons: null, staff: null, hold: null, date: null })}
            />
          )}
          {step === 1 && service && (
            <StaffStep
              service={service}
              business={business}
              addons={addons.filter((a) => a.serviceId === service.id)}
              chosenAddonIds={addonIds}
              staff={staff.filter((s) => s.serviceIds.includes(service.id))}
              onAddons={(ids) => go({ addons: ids.join(",") || null })}
              onPick={(id) => go({ staff: id })}
            />
          )}
          {step === 2 && service && (
            <TimeStep
              business={business}
              service={service}
              addons={chosenAddons}
              staff={staffId === "any" ? staff : staff.filter((s) => s.id === staffId)}
              allStaff={staff}
              date={params.get("date")}
              onDate={(d) => router.replace(`/b/${slug}/book?${withParam(params, "date", d)}`, { scroll: false })}
              onHeld={(id) => go({ hold: id })}
            />
          )}
          {step === 3 && holdId && (
            <DetailsStep
              business={business}
              holdId={holdId}
              onRestart={() => go({ hold: null })}
              onDone={(code) => router.replace(`/b/${slug}/book/done/${code}`)}
            />
          )}
        </div>

        <Summary
          business={business}
          service={service}
          addons={chosenAddons}
          member={member}
          anyStaff={staffId === "any"}
          holdId={holdId}
          staff={staff}
        />
      </div>
    </main>
  );
}

function withParam(params: URLSearchParams, key: string, value: string) {
  const q = new URLSearchParams(params.toString());
  q.set(key, value);
  return q.toString();
}

function StepTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-ink-2">{sub}</p>}
    </div>
  );
}

function ServiceStep({
  business,
  categories,
  services,
  onPick,
}: {
  business: Business;
  categories: { id: string; name: string }[];
  services: Service[];
  onPick: (id: string) => void;
}) {
  return (
    <section>
      <StepTitle>Choose a service</StepTitle>
      <div className="space-y-7">
        {categories.map((c) => (
          <div key={c.id}>
            <h2 className="mb-2 text-sm font-medium text-ink-3">{c.name}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {services
                .filter((s) => s.categoryId === c.id)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onPick(s.id)}
                    className="rounded-2xl bg-white p-4 text-left ring-1 ring-line transition hover:ring-2 hover:ring-violet"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{s.name}</span>
                      <span className="shrink-0 font-medium">{fmtMoney(s.priceCents, business.currency)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-ink-3">{fmtDuration(s.durationMin)}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StaffStep({
  business,
  service,
  addons,
  chosenAddonIds,
  staff,
  onAddons,
  onPick,
}: {
  business: Business;
  service: Service;
  addons: ServiceAddon[];
  chosenAddonIds: string[];
  staff: Staff[];
  onAddons: (ids: string[]) => void;
  onPick: (id: string) => void;
}) {
  return (
    <section>
      {addons.length > 0 && (
        <div className="mb-10">
          <StepTitle sub="Optional extras, added to the same appointment.">Add anything?</StepTitle>
          <div className="space-y-2">
            {addons.map((a) => {
              const on = chosenAddonIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={clsx(
                    "flex cursor-pointer items-center justify-between rounded-2xl bg-white p-4 ring-1",
                    on ? "ring-2 ring-violet" : "ring-line",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        onAddons(on ? chosenAddonIds.filter((x) => x !== a.id) : [...chosenAddonIds, a.id])
                      }
                      className="h-4 w-4 accent-violet"
                    />
                    <span>
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-sm text-ink-3">+{fmtDuration(a.durationMin)}</span>
                    </span>
                  </span>
                  <span className="font-medium">+{fmtMoney(a.priceCents, business.currency)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <StepTitle sub={`Who would you like for your ${service.name.toLowerCase()}?`}>Choose a team member</StepTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => onPick("any")}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-line hover:ring-2 hover:ring-violet"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist font-display text-lg font-semibold text-ink-2">
            ?
          </span>
          <span>
            <span className="block font-medium">Any available</span>
            <span className="text-sm text-ink-3">Shows the most free times</span>
          </span>
        </button>
        {staff.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-line hover:ring-2 hover:ring-violet"
          >
            <Avatar name={m.name} color={m.color} size={48} />
            <span>
              <span className="block font-medium">{m.name}</span>
              <span className="text-sm text-ink-3">{m.title}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TimeStep({
  business,
  service,
  addons,
  staff,
  allStaff,
  date,
  onDate,
  onHeld,
}: {
  business: Business;
  service: Service;
  addons: ServiceAddon[];
  staff: Staff[];
  allStaff: Staff[];
  date: string | null;
  onDate: (d: string) => void;
  onHeld: (bookingId: string) => void;
}) {
  const tz = business.timeZone;
  const today = todayKey(tz);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysKey(today, i)), [today]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addonKey = addons.map((a) => a.id).join(",");
  const staffKey = staff.map((s) => s.id).join(",");
  // Free slots for all 14 days, recomputed live when anyone books.
  const byDay = useLiveQuery(async () => {
    const db = getDb();
    const [bookings, timeOff] = await Promise.all([
      db.bookings.where("startsAt").between(Date.now() - 86400000, Date.now() + 16 * 86400000).toArray(),
      db.timeOff.toArray(),
    ]);
    const out: Record<string, Slot[]> = {};
    for (const d of days) out[d] = availableSlots({ business, service, addons, staff, date: d, bookings, timeOff });
    return out;
  }, [business, service, addonKey, staffKey, days]);

  const firstOpen = byDay ? days.find((d) => byDay[d].length) : undefined;
  const selected = date && days.includes(date) ? date : firstOpen ?? today;
  const slots = byDay?.[selected] ?? [];

  const groups = [
    { label: "Morning", items: slots.filter((s) => minutesOfDay(s.start, tz) < 720) },
    { label: "Afternoon", items: slots.filter((s) => minutesOfDay(s.start, tz) >= 720 && minutesOfDay(s.start, tz) < 1020) },
    { label: "Evening", items: slots.filter((s) => minutesOfDay(s.start, tz) >= 1020) },
  ].filter((g) => g.items.length);

  const pick = async (slot: Slot) => {
    setBusy(true);
    setError(null);
    try {
      const b = await holdSlot({
        businessId: business.id,
        serviceId: service.id,
        addonIds: addons.map((a) => a.id),
        staffId: staff.length === 1 ? staff[0].id : "any",
        startsAt: slot.start,
      });
      onHeld(b.id);
    } catch (e) {
      setError(e instanceof BookingError ? e.message : "Something went wrong. Try another time.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <StepTitle sub={`Times in ${zoneLabel(tz)}. ${fmtDuration(serviceMinutes(service, addons))} appointment.`}>
        Pick a time
      </StepTitle>

      <div className="-mx-5 overflow-x-auto px-5 pb-2" role="tablist" aria-label="Choose a day">
        <div className="flex gap-2">
          {days.map((d) => {
            const count = byDay?.[d]?.length ?? 0;
            const closed = isClosed(business, d);
            const off = !closed && !staff.some((m) => m.hours.some((h) => h.weekday === weekdayOf(d)));
            const active = d === selected;
            return (
              <button
                key={d}
                role="tab"
                aria-selected={active}
                disabled={!count}
                onClick={() => onDate(d)}
                className={clsx(
                  "flex w-[68px] shrink-0 flex-col items-center rounded-2xl py-3 transition",
                  active
                    ? "bg-ink text-white"
                    : count
                      ? "bg-white ring-1 ring-line hover:ring-ink-3"
                      : "bg-transparent text-ink-3/70 ring-1 ring-line/60",
                )}
              >
                <span className="text-xs">{fmtDateKey(d, "EEE")}</span>
                <span className="font-display text-2xl font-semibold leading-tight">{fmtDateKey(d, "d")}</span>
                <span className={clsx("text-[11px]", active ? "text-white/70" : "text-ink-3")}>
                  {closed ? "Closed" : off ? "Day off" : count ? `${count} free` : "Full"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6" aria-live="polite">
        <p className="mb-4 font-medium">{fmtDateKey(selected, "EEEE d MMMM")}</p>
        {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
        {!byDay ? null : groups.length === 0 ? (
          <p className="rounded-2xl bg-mist px-4 py-6 text-center text-ink-2">
            No free times this day. Try another day{staff.length === 1 ? " or choose Any available" : ""}.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.label}>
                <h2 className="mb-2 text-sm text-ink-3">{g.label}</h2>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {g.items.map((s) => (
                    <button
                      key={s.start}
                      disabled={busy}
                      onClick={() => pick(s)}
                      title={
                        staff.length > 1
                          ? `Free: ${s.staffIds.map((id) => allStaff.find((m) => m.id === id)?.name.split(" ")[0]).join(", ")}`
                          : undefined
                      }
                      className="rounded-xl bg-white py-2.5 text-[15px] font-medium ring-1 ring-line transition hover:bg-violet hover:text-white hover:ring-violet disabled:opacity-60"
                    >
                      {fmtTime(s.start, tz)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function useCountdown(until: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, (until ?? 0) - now);
  return { left, label: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` };
}

function DetailsStep({
  business,
  holdId,
  onRestart,
  onDone,
}: {
  business: Business;
  holdId: string;
  onRestart: () => void;
  onDone: (code: string) => void;
}) {
  const booking = useLiveQuery(() => getDb().bookings.get(holdId), [holdId]);
  const { left, label } = useCountdown(booking?.holdExpiresAt);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [card, setCard] = useState({ number: "4242 4242 4242 4242", exp: "12 / 30", cvc: "123" });
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const confirmedCode = booking?.status === "confirmed" ? booking.code : null;
  useEffect(() => {
    if (confirmedCode) onDone(confirmedCode);
  }, [confirmedCode, onDone]);

  if (booking === undefined) return null;
  if (!booking) return <p className="text-ink-2">This booking no longer exists.</p>;
  if (booking.status === "confirmed") return null;

  const expired = booking.status !== "held" || left <= 0;
  if (expired) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-line">
        <h1 className="font-display text-2xl font-semibold">Your held time was released</h1>
        <p className="mt-2 text-ink-2">
          We hold a time for {business.rules.holdMin} minutes while you pay. That time is now free for others.
        </p>
        <Button onClick={onRestart} className="mt-5">
          Pick another time
        </Button>
      </section>
    );
  }

  const deposit = booking.depositCents;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateCustomer(form);
    if (problem) return setError(problem);
    if (deposit > 0 && card.number.replace(/\s/g, "").length < 15) return setError("Enter a card number.");
    setError(null);
    setPaying(true);
    try {
      if (deposit > 0) await new Promise((r) => setTimeout(r, 1100)); // demo card processing
      const done = await confirmBooking(holdId, form, deposit > 0 ? { cardLast4: card.number.replace(/\s/g, "").slice(-4) } : null);
      onDone(done.code);
    } catch (err) {
      setError(err instanceof BookingError ? err.message : "Payment could not be completed. Try again.");
      setPaying(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section>
      <div className="mb-6 flex items-center gap-3 rounded-2xl bg-glow-soft px-4 py-3 text-sm text-[#5c4405]">
        <span className="font-display text-lg font-semibold tabular-nums">{label}</span>
        <span>This time is held for you while you finish booking.</span>
      </div>

      <StepTitle>Your details</StepTitle>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input className={inputClass} value={form.name} onChange={set("name")} autoComplete="name" />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" />
          </Field>
        </div>
        <Field label="Email" hint="Your confirmation and reminders go here (in this demo, to the Demo inbox).">
          <input className={inputClass} value={form.email} onChange={set("email")} autoComplete="email" type="email" />
        </Field>
        <Field label="Anything we should know? (optional)">
          <textarea className={clsx(inputClass, "min-h-20")} value={form.note} onChange={set("note")} />
        </Field>

        {deposit > 0 ? (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Pay deposit</h2>
              <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs text-ink-2">Demo payment, no money moves</span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_96px_80px] gap-3">
              <Field label="Card number">
                <input
                  className={clsx(inputClass, "tabular-nums")}
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value })}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
              <Field label="Expiry">
                <input className={inputClass} value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="CVC">
                <input className={inputClass} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} autoComplete="off" />
              </Field>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Test card filled in. With a real account this step is Stripe Checkout, and the booking confirms when
              Stripe reports the payment.
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-ink-2">No deposit for this service. You pay at the visit.</p>
        )}

        {error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

        <Button type="submit" disabled={paying} className="w-full py-3.5 text-base">
          {paying
            ? "Processing payment…"
            : deposit > 0
              ? `Pay ${fmtMoney(deposit, business.currency)} and book`
              : "Book appointment"}
        </Button>
        <p className="text-center text-xs text-ink-3">
          Free cancellation until {business.policy.freeCancelHours} hours before. After that the deposit is kept.
        </p>
      </form>
    </section>
  );
}

function Summary({
  business,
  service,
  addons,
  member,
  anyStaff,
  holdId,
  staff,
}: {
  business: Business;
  service: Service | null;
  addons: ServiceAddon[];
  member: Staff | null;
  anyStaff: boolean;
  holdId: string | null;
  staff: Staff[];
}) {
  const hold = useLiveQuery(() => (holdId ? getDb().bookings.get(holdId) : undefined), [holdId]);
  if (!service) return <aside className="hidden lg:block" />;
  const total = service.priceCents + addons.reduce((s, a) => s + a.priceCents, 0);
  const deposit = depositFor(service, total);
  const who = hold ? staff.find((s) => s.id === hold.staffId) : member;
  const tz = business.timeZone;

  return (
    <aside className="h-fit rounded-2xl bg-white p-5 ring-1 ring-line lg:sticky lg:top-6">
      <h2 className="font-display text-lg font-semibold">Your appointment</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <Row k="Service" v={service.name} />
        {addons.map((a) => (
          <Row key={a.id} k="Extra" v={a.name} />
        ))}
        <Row k="With" v={who ? who.name : anyStaff ? "Any available" : "Not chosen yet"} />
        {hold && <Row k="When" v={`${fmtDate(hold.startsAt, tz, "EEE d MMM")}, ${fmtTime(hold.startsAt, tz)}`} />}
        <Row k="Length" v={fmtDuration(serviceMinutes(service, addons))} />
      </dl>
      <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
        <Row k="Total" v={fmtMoney(total, business.currency)} strong />
        {deposit > 0 && (
          <>
            <Row k="Deposit today" v={fmtMoney(deposit, business.currency)} />
            <Row k="At the visit" v={fmtMoney(total - deposit, business.currency)} />
          </>
        )}
      </div>
    </aside>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className={clsx("text-right", strong && "font-semibold")}>{v}</dd>
    </div>
  );
}
