"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { isBlocking } from "@/lib/slots";
import { clockToMin, dateKey, fmtTime, minutesOfDay, todayKey, weekdayOf } from "@/lib/time";
import { Avatar } from "@/components/ui";
import type { Booking, Business, Customer, Service, Staff, TimeOff } from "@/lib/types";

const HOUR_PX = 64;

/** Day view with one column per staff member. */
export function TeamCalendar({
  business,
  date,
  staff,
  bookings,
  timeOff,
  services,
  customers,
  onOpen,
}: {
  business: Business;
  date: string;
  staff: Staff[];
  bookings: Booking[];
  timeOff: TimeOff[];
  services: Service[];
  customers: Customer[];
  onOpen: (code: string) => void;
}) {
  const tz = business.timeZone;
  const open = business.hours.find((h) => h.weekday === weekdayOf(date));
  const closed = !open || business.closedDates.some((c) => c.date === date);
  const startMin = 8 * 60;
  const endMin = 20 * 60;
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin / 60 + i);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const isToday = date === todayKey(tz, now);
  const nowTop = ((minutesOfDay(now, tz) - startMin) / 60) * HOUR_PX;

  const y = (ms: number) => ((minutesOfDay(ms, tz) - startMin) / 60) * HOUR_PX;
  const yClock = (t: string) => ((clockToMin(t) - startMin) / 60) * HOUR_PX;

  const dayBookings = bookings.filter(
    (b) => dateKey(b.startsAt, tz) === date && (isBlocking(b, now) || b.status === "no_show"),
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-10 grid border-b border-line bg-white" style={{ gridTemplateColumns: `56px repeat(${staff.length}, minmax(150px, 1fr))` }}>
          <div />
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-l border-line px-3 py-2.5">
              <Avatar name={s.name} color={s.color} size={28} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="block text-xs text-ink-3">
                  {dayBookings.filter((b) => b.staffId === s.id).length} booked
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${staff.length}, minmax(150px, 1fr))` }}>
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-2 text-[11px] text-ink-3" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`}
              </span>
            ))}
          </div>

          {staff.map((s) => {
            const sh = s.hours.find((h) => h.weekday === weekdayOf(date));
            const off = timeOff.filter((t) => t.staffId === s.id && dateKey(t.startsAt, tz) === date);
            return (
              <div key={s.id} className="relative border-l border-line" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * HOUR_PX }} />
                ))}
                {(closed || !sh) && (
                  <div className="absolute inset-0 flex items-start justify-center bg-mist/70 pt-6 text-sm text-ink-3">
                    {closed ? "Closed" : "Day off"}
                  </div>
                )}
                {!closed && sh && (
                  <>
                    <Shade top={0} bottom={yClock(sh.start)} />
                    <Shade top={yClock(sh.end)} bottom={hours.length * HOUR_PX} />
                    {sh.breakStart && sh.breakEnd && (
                      <Shade top={yClock(sh.breakStart)} bottom={yClock(sh.breakEnd)} label="Break" />
                    )}
                    {off.map((t) => (
                      <Shade key={t.id} top={y(t.startsAt)} bottom={y(t.endsAt)} label={t.reason || "Time off"} />
                    ))}
                  </>
                )}
                {dayBookings
                  .filter((b) => b.staffId === s.id)
                  .map((b) => {
                    const top = y(b.startsAt);
                    const height = Math.max(22, y(b.endsAt) - top - 2);
                    const service = services.find((x) => x.id === b.serviceId);
                    const customer = customers.find((c) => c.id === b.customerId);
                    const held = b.status === "held";
                    const muted = b.status === "completed" || b.status === "no_show";
                    return (
                      <button
                        key={b.id}
                        onClick={() => onOpen(b.code)}
                        className={clsx(
                          "absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs leading-tight transition hover:brightness-110 focus-visible:z-10",
                          held ? "border-2 border-dashed border-glow bg-glow-soft text-[#5c4405]" : "text-white",
                          muted && "opacity-55",
                        )}
                        style={{ top, height, background: held ? undefined : s.color }}
                      >
                        <span className="block truncate font-semibold">
                          {held ? "Held, paying now" : customer?.name ?? "Customer"}
                          {b.status === "no_show" && " · No-show"}
                          {b.status === "arrived" && " · Here"}
                        </span>
                        {height > 34 && (
                          <span className="block truncate opacity-90">
                            {fmtTime(b.startsAt, tz)} {service?.name}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            );
          })}

          {isToday && nowTop > 0 && nowTop < hours.length * HOUR_PX && (
            <div className="pointer-events-none absolute left-14 right-0 z-10" style={{ top: nowTop }}>
              <div className="h-0.5 bg-bad" />
              <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-bad" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Shade({ top, bottom, label }: { top: number; bottom: number; label?: string }) {
  if (bottom <= top) return null;
  return (
    <div
      className="absolute inset-x-0 bg-[repeating-linear-gradient(135deg,#eeedf6,#eeedf6_6px,#f6f5fb_6px,#f6f5fb_12px)]"
      style={{ top, height: bottom - top }}
    >
      {label && bottom - top > 18 && <span className="block px-2 pt-0.5 text-[11px] text-ink-3">{label}</span>}
    </div>
  );
}
