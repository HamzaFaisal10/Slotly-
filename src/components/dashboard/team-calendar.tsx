"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { isBlocking } from "@/lib/slots";
import { clockToMin, dateKey, fmtTime, minutesOfDay, todayKey, weekdayOf, zonedToUtc } from "@/lib/time";
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
  onMove,
  onCreate,
}: {
  business: Business;
  date: string;
  staff: Staff[];
  bookings: Booking[];
  timeOff: TimeOff[];
  services: Service[];
  customers: Customer[];
  onOpen: (code: string) => void;
  /** Drag a booking to another time or person */
  onMove?: (code: string, startsAt: number, staffId: string) => void;
  /** Click an empty spot to add a booking */
  onCreate?: (staffId: string, startsAt: number) => void;
}) {
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Time the last drag ended; the browser fires a click right after it, which must not open "new booking". */
  const dragEndedAt = useRef(0);
  const [drag, setDrag] = useState<null | {
    code: string;
    staffId: string;
    top: number;
    height: number;
    color: string;
    label: string;
    moved: boolean;
  }>(null);
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
  const snap = (px: number) => Math.max(0, Math.round(((px / HOUR_PX) * 60) / 15) * 15);
  const toStart = (px: number) => {
    const m = startMin + snap(px);
    return zonedToUtc(date, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, tz);
  };
  const columnAt = (x: number) =>
    staff.find((m) => {
      const r = colRefs.current[m.id]?.getBoundingClientRect();
      return r && x >= r.left && x <= r.right;
    });

  const startDrag = (e: React.PointerEvent, b: Booking, top: number, height: number, color: string, label: string) => {
    if (!onMove || !["confirmed", "arrived"].includes(b.status)) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let current = { code: b.code, staffId: b.staffId, top, height, color, label, moved: false };
    setDrag(current);
    const move = (ev: PointerEvent) => {
      const moved = current.moved || Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 5;
      const col = columnAt(ev.clientX);
      const newTop = Math.max(0, top + (ev.clientY - startY));
      current = { ...current, moved, staffId: col?.id ?? current.staffId, top: (snap(newTop) / 60) * HOUR_PX };
      setDrag(current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      dragEndedAt.current = performance.now();
      if (!current.moved) onOpen(b.code);
      else if (current.staffId !== b.staffId || Math.abs(current.top - top) >= HOUR_PX / 4 - 1)
        onMove(b.code, toStart(current.top), current.staffId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

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
              <div
                key={s.id}
                ref={(el) => {
                  colRefs.current[s.id] = el;
                }}
                className={clsx("relative border-l border-line", onCreate && !closed && sh && "cursor-copy")}
                style={{ height: hours.length * HOUR_PX }}
                onClick={(e) => {
                  if (!onCreate || closed || !sh || e.target !== e.currentTarget) return;
                  if (performance.now() - dragEndedAt.current < 400) return;
                  const y0 = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onCreate(s.id, toStart(Math.floor(y0 / (HOUR_PX / 4)) * (HOUR_PX / 4)));
                }}
              >
                {hours.map((_, i) => (
                  <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-line/60" style={{ top: i * HOUR_PX }} />
                ))}
                {(closed || !sh) && (
                  <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-mist/70 pt-6 text-sm text-ink-3">
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
                        onClick={(e) => {
                          // Drag handling opens the drawer on a plain click for movable bookings.
                          if (!onMove || !["confirmed", "arrived"].includes(b.status) || e.detail === 0) onOpen(b.code);
                        }}
                        onPointerDown={(e) =>
                          startDrag(e, b, top, height, held ? "#f2c14e" : s.color, customer?.name ?? "Customer")
                        }
                        className={clsx(
                          "absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs leading-tight transition hover:brightness-110 focus-visible:z-10",
                          held ? "border-2 border-dashed border-glow bg-glow-soft text-[#5c4405]" : "text-white",
                          muted && "opacity-55",
                          onMove && ["confirmed", "arrived"].includes(b.status) && "cursor-grab touch-none",
                          drag?.code === b.code && drag.moved && "opacity-30",
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
                {drag?.moved && drag.staffId === s.id && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-20 rounded-lg px-2 py-1 text-xs font-semibold text-white shadow-xl ring-2 ring-white"
                    style={{ top: drag.top, height: drag.height, background: drag.color }}
                  >
                    {drag.label}
                    <span className="block font-normal opacity-90">{fmtTime(toStart(drag.top), tz)}</span>
                  </div>
                )}
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
      className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(135deg,#eeedf6,#eeedf6_6px,#f6f5fb_6px,#f6f5fb_12px)]"
      style={{ top, height: bottom - top }}
    >
      {label && bottom - top > 18 && <span className="block px-2 pt-0.5 text-[11px] text-ink-3">{label}</span>}
    </div>
  );
}
