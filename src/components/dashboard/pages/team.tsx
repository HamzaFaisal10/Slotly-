"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, uid } from "@/lib/db";
import { isBlocking } from "@/lib/slots";
import { addDaysKey, fmtDate, fmtTime, todayKey, zonedToUtc } from "@/lib/time";
import { Avatar, Button, Field, inputClass } from "@/components/ui";
import { PageTitle, ShellPage } from "../app-shell";
import type { Business, Staff } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const to12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
};

export function TeamPage({ slug }: { slug: string }) {
  return <ShellPage slug={slug} active="team">{(b) => <Team business={b} />}</ShellPage>;
}

function Team({ business }: { business: Business }) {
  const tz = business.timeZone;
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [staff, timeOff, services] = await Promise.all([
      db.staff.where("businessId").equals(business.id).toArray(),
      db.timeOff.toArray(),
      db.services.where("businessId").equals(business.id).toArray(),
    ]);
    return { staff, timeOff: timeOff.filter((t) => t.endsAt > Date.now()).sort((a, b) => a.startsAt - b.startsAt), services };
  }, [business.id]);
  const [offFor, setOffFor] = useState<Staff | null>(null);
  if (!data) return null;

  return (
    <>
      <PageTitle title="Team" sub="Working hours, breaks, services and time off. The booking page only offers times when someone is in." />
      <div className="grid gap-4 lg:grid-cols-2">
        {data.staff.map((m) => (
          <section key={m.id} className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} color={m.color} size={44} />
                <div>
                  <h2 className="font-medium">{m.name}</h2>
                  <p className="text-sm text-ink-3">{m.title}</p>
                </div>
              </div>
              <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setOffFor(m)}>
                Add time off
              </Button>
            </div>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {ORDER.map((d) => {
                  const h = m.hours.find((x) => x.weekday === d);
                  return (
                    <tr key={d} className="border-b border-line/60 last:border-0">
                      <td className="w-14 py-1.5 text-ink-3">{DAYS[d]}</td>
                      <td className="py-1.5">{h ? `${to12(h.start)} to ${to12(h.end)}` : <span className="text-ink-3">Off</span>}</td>
                      <td className="py-1.5 text-right text-xs text-ink-3">{h?.breakStart ? `Break ${to12(h.breakStart)}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-ink-2">
              {data.services.filter((s) => m.serviceIds.includes(s.id) && !s.archivedAt).map((s) => s.name).join(", ")}
            </p>
            {data.timeOff.filter((t) => t.staffId === m.id).length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {data.timeOff
                  .filter((t) => t.staffId === m.id)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-lg bg-mist px-3 py-1.5">
                      <span>
                        {t.reason || "Time off"}: {fmtDate(t.startsAt, tz, "EEE d MMM")}, {fmtTime(t.startsAt, tz)} to {fmtTime(t.endsAt, tz)}
                      </span>
                      <button onClick={() => getDb().timeOff.delete(t.id)} className="text-xs text-ink-3 hover:text-bad">
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {offFor && <TimeOffForm business={business} staff={offFor} onClose={() => setOffFor(null)} />}
    </>
  );
}

function TimeOffForm({ business, staff, onClose }: { business: Business; staff: Staff; onClose: () => void }) {
  const tz = business.timeZone;
  const [f, setF] = useState({ date: addDaysKey(todayKey(tz), 1), from: "09:00", to: "19:00", reason: "" });
  const [clash, setClash] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = zonedToUtc(f.date, f.from, tz);
    const endsAt = zonedToUtc(f.date, f.to, tz);
    if (endsAt <= startsAt) return setClash("The end must be after the start.");
    const db = getDb();
    const affected = await db.bookings
      .where("staffId")
      .equals(staff.id)
      .filter((b) => isBlocking(b, Date.now()) && b.startsAt < endsAt && startsAt < b.endsAt)
      .count();
    await db.timeOff.add({ id: uid("off"), staffId: staff.id, startsAt, endsAt, reason: f.reason.trim() });
    // Existing bookings are never deleted; they stay on the calendar for the front desk to move.
    if (affected) setClash(`Saved. ${affected} booking${affected > 1 ? "s" : ""} in that time stay on the calendar for you to move.`);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} noValidate className="animate-rise w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl" aria-label="Time off">
        <h2 className="font-display text-2xl font-semibold">Time off for {staff.name.split(" ")[0]}</h2>
        <Field label="Date">
          <input type="date" className={inputClass} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="time" className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="time" className={inputClass} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <input className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
        {clash && <p className="rounded-xl bg-glow-soft px-3 py-2 text-sm text-[#5c4405]">{clash}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {clash ? "Done" : "Cancel"}
          </Button>
          {!clash && <Button type="submit">Save time off</Button>}
        </div>
      </form>
    </div>
  );
}
