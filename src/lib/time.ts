import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import type { ClockTime, Weekday } from "./types";

/** UTC ms for a wall-clock date + time in a time zone (DST-safe). */
export function zonedToUtc(date: string, time: ClockTime, timeZone: string): number {
  return fromZonedTime(`${date}T${time}:00`, timeZone).getTime();
}

/** YYYY-MM-DD of an instant, in a time zone. */
export function dateKey(ms: number, timeZone: string): string {
  return formatInTimeZone(ms, timeZone, "yyyy-MM-dd");
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** Add days to a YYYY-MM-DD date. */
export function addDaysKey(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = addDays(new Date(Date.UTC(y, m - 1, d, 12)), days);
  return next.toISOString().slice(0, 10);
}

export function todayKey(timeZone: string, now = Date.now()): string {
  return dateKey(now, timeZone);
}

export function fmtTime(ms: number, timeZone: string): string {
  return formatInTimeZone(ms, timeZone, "h:mm a");
}

export function fmtDate(ms: number, timeZone: string, pattern = "EEE d MMM"): string {
  return formatInTimeZone(ms, timeZone, pattern);
}

export function fmtDateKey(date: string, pattern = "EEE d MMM"): string {
  const [y, m, d] = date.split("-").map(Number);
  return format(new Date(y, m - 1, d), pattern);
}

export function minutesOfDay(ms: number, timeZone: string): number {
  const z = toZonedTime(ms, timeZone);
  return z.getHours() * 60 + z.getMinutes();
}

export function clockToMin(t: ClockTime): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Friendly time-zone label, e.g. "Karachi time". */
export function zoneLabel(timeZone: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return `${city} time`;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
