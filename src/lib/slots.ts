import type { Booking, Business, Service, ServiceAddon, Staff, TimeOff } from "./types";
import { BLOCKING_STATUSES } from "./types";
import { addDaysKey, clockToMin, todayKey, weekdayOf, zonedToUtc } from "./time";

/**
 * The slot engine. One function decides what can be booked; the booking page,
 * the receptionist and the dashboard all call it (in production this is the
 * `available_slots` Postgres function).
 *
 * 1. Start from each staff member's hours for the date, inside opening hours.
 * 2. Remove closed dates, breaks and time off.
 * 3. Remove existing bookings and live holds, widened by buffers.
 * 4. Step through what is left; keep a start only if the whole service fits.
 * 5. Drop starts sooner than the minimum notice or past the booking window.
 */

export interface Slot {
  start: number;
  end: number;
  staffIds: string[];
}

export interface SlotQuery {
  business: Business;
  service: Service;
  addons?: ServiceAddon[];
  staff: Staff[];
  date: string; // YYYY-MM-DD in the business's time zone
  bookings: Booking[];
  timeOff: TimeOff[];
  now?: number;
  /** Ignore this booking (used when rescheduling it) */
  excludeBookingId?: string;
}

interface Interval {
  start: number;
  end: number;
}

export function isBlocking(b: Booking, now: number): boolean {
  if (!BLOCKING_STATUSES.includes(b.status)) return false;
  if (b.status === "held" && (b.holdExpiresAt ?? 0) <= now) return false;
  return true;
}

export function serviceMinutes(service: Service, addons: ServiceAddon[] = []): number {
  return service.durationMin + addons.reduce((s, a) => s + a.durationMin, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function isClosed(business: Business, date: string): boolean {
  if (business.closedDates.some((c) => c.date === date)) return true;
  return !business.hours.some((h) => h.weekday === weekdayOf(date));
}

export function availableSlots(q: SlotQuery): Slot[] {
  const now = q.now ?? Date.now();
  const { business, service, date } = q;
  const tz = business.timeZone;
  const { minNoticeMin, windowDays, slotStepMin } = business.rules;

  if (isClosed(business, date)) return [];
  if (date > addDaysKey(todayKey(tz, now), windowDays)) return [];

  const open = business.hours.find((h) => h.weekday === weekdayOf(date))!;
  const duration = serviceMinutes(service, q.addons);
  const before = service.bufferBeforeMin * 60000;
  const after = service.bufferAfterMin * 60000;
  const earliest = now + minNoticeMin * 60000;

  const byStart = new Map<number, Slot>();

  for (const member of q.staff) {
    if (!member.active || !member.serviceIds.includes(service.id)) continue;
    const hours = member.hours.find((h) => h.weekday === weekdayOf(date));
    if (!hours) continue;

    const startMin = Math.max(clockToMin(hours.start), clockToMin(open.opens));
    const endMin = Math.min(clockToMin(hours.end), clockToMin(open.closes));
    if (endMin <= startMin) continue;
    const windowEnd = zonedToUtc(date, clock(endMin), tz);

    const busy: Interval[] = [];
    if (hours.breakStart && hours.breakEnd) {
      busy.push({
        start: zonedToUtc(date, hours.breakStart, tz),
        end: zonedToUtc(date, hours.breakEnd, tz),
      });
    }
    for (const t of q.timeOff) if (t.staffId === member.id) busy.push({ start: t.startsAt, end: t.endsAt });
    for (const b of q.bookings) {
      if (b.staffId !== member.id || b.id === q.excludeBookingId || !isBlocking(b, now)) continue;
      busy.push({ start: b.blockStart, end: b.blockEnd });
    }

    // Step in wall-clock minutes so daylight-saving days stay correct.
    for (let m = startMin; m + duration <= endMin; m += slotStepMin) {
      const start = zonedToUtc(date, clock(m), tz);
      const end = start + duration * 60000;
      if (end > windowEnd || start < earliest) continue;
      const blockStart = start - before;
      const blockEnd = end + after;
      if (busy.some((i) => blockStart < i.end && i.start < blockEnd)) continue;
      const slot = byStart.get(start) ?? { start, end, staffIds: [] };
      slot.staffIds.push(member.id);
      byStart.set(start, slot);
    }
  }

  return [...byStart.values()].sort((a, b) => a.start - b.start);
}
